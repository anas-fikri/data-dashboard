/*
 * Query deklaratif mode bebas (T-009, alur B4): hanya pemilik dataset. Dependensi diinjeksi (DB,
 * cache parquet lokal, mesin DuckDB, cache hasil) agar bisa diuji tanpa layanan; perakitan produksi di
 * runtime.ts. Skema dibaca dari DB setiap permintaan (query berindeks, selalu sesuai revisi aktif),
 * bukan cache in-memory yang harus di-invalidate antarproses.
 */
import type { ColumnSchema } from "@/features/ingest/infer";
import { QueryBusyError, QueryTimeoutError, type EngineResult } from "@/lib/duckdb/engine";
import type { ParquetLease } from "@/lib/duckdb/parquet-cache";
import { cacheGet, cacheSet, resultKey, type ResultStore } from "./cache";
import { bodySchema, resolveSpec, type OutColumn } from "./spec";
import { buildSql } from "./sql";

export type QueryCode =
  "INVALID" | "NOT_FOUND" | "NOT_READY" | "QUERY_TIMEOUT" | "QUERY_BUSY" | "QUERY_FAILED";

export interface QueryData {
  columns: OutColumn[];
  rows: unknown[][];
}

export type QueryResult =
  | ({ ok: true; cached: boolean; ms: number } & QueryData)
  | { ok: false; code: QueryCode; message: string };

export interface QueryRepo {
  /** Dataset milik user (null bila tidak ada atau bukan pemilik → 404, tidak membocorkan keberadaan). */
  ownedDataset(
    userId: string,
    datasetId: string,
  ): Promise<{ activeVersionId: string | null } | null>;
  /** Sheet di versi itu saja (sheet dataset lain → null → 404). */
  sheet(
    versionId: string,
    sheetId: string,
  ): Promise<{
    typedKey: string | null;
    schemaRevision: number;
    schema: ColumnSchema[] | null;
  } | null>;
}

export interface QueryDeps {
  repo: QueryRepo;
  parquet: { acquire(key: string): Promise<ParquetLease> };
  engine: {
    run(
      userId: string,
      sql: string,
      params: Record<string, string | number | boolean>,
      timeoutMs: number,
    ): Promise<EngineResult>;
  };
  cache: ResultStore | null;
  timeoutMs: number;
}

const fail = (code: QueryCode, message: string): QueryResult => ({ ok: false, code, message });

const pad = (n: number) => String(n).padStart(2, "0");

/** Nilai DuckDB → JSON: BIGINT aman → number (selain itu teks), tanggal naive → teks ISO tanpa zona. */
function toJson(v: unknown, type: OutColumn["type"]): unknown {
  if (typeof v === "bigint") {
    return v <= BigInt(Number.MAX_SAFE_INTEGER) && v >= BigInt(Number.MIN_SAFE_INTEGER)
      ? Number(v)
      : v.toString();
  }
  if (v instanceof Date) {
    const d = `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
    if (type === "date") return d;
    return `${d}T${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}:${pad(v.getUTCSeconds())}`;
  }
  return v;
}

export async function runQuery(
  userId: string,
  body: unknown,
  deps: QueryDeps,
): Promise<QueryResult> {
  const t0 = Date.now();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(
      "INVALID",
      `Spec query tidak valid${issue?.path.length ? ` (${issue.path.join(".")})` : ""}: ${issue?.message ?? "format salah"}.`,
    );
  }
  const { datasetId, spec } = parsed.data;
  const ds = await deps.repo.ownedDataset(userId, datasetId);
  if (!ds) return fail("NOT_FOUND", "Dataset tidak ditemukan.");
  if (!ds.activeVersionId) return fail("NOT_READY", "Data dataset ini belum siap.");
  const sheet = await deps.repo.sheet(ds.activeVersionId, spec.sheetId);
  if (!sheet) return fail("NOT_FOUND", "Sheet tidak ditemukan.");
  if (!sheet.typedKey || !sheet.schema) return fail("NOT_READY", "Sheet ini belum siap.");
  const resolved = resolveSpec(spec, sheet.schema);
  if (!resolved.ok) return fail("INVALID", resolved.message);

  const key = resultKey({
    datasetId,
    versionId: ds.activeVersionId,
    sheetId: spec.sheetId,
    schemaRevision: sheet.schemaRevision,
    spec,
  });
  const hit = await cacheGet<QueryData>(deps.cache, key);
  if (hit) return { ok: true, ...hit, cached: true, ms: Date.now() - t0 };

  let lease: ParquetLease | null = null;
  try {
    lease = await deps.parquet.acquire(sheet.typedKey);
    const { sql, params } = buildSql(resolved.plan, lease.path);
    const res = await deps.engine.run(userId, sql, params, deps.timeoutMs);
    const types = resolved.plan.columns.map((c) => c.type);
    const data: QueryData = {
      columns: resolved.plan.columns,
      rows: res.rows.map((row) => row.map((v, i) => toJson(v, types[i]!))),
    };
    await cacheSet(deps.cache, key, data);
    return { ok: true, ...data, cached: false, ms: Date.now() - t0 };
  } catch (e) {
    if (e instanceof QueryTimeoutError) {
      return fail(
        "QUERY_TIMEOUT",
        `Query melebihi ${Math.round(deps.timeoutMs / 1000)} detik. Persempit filter (mis. rentang tanggal) atau kurangi dimensi, lalu coba lagi.`,
      );
    }
    if (e instanceof QueryBusyError) {
      return fail("QUERY_BUSY", "Sedang banyak query berjalan. Coba lagi sebentar lagi.");
    }
    throw e;
  } finally {
    lease?.release();
  }
}
