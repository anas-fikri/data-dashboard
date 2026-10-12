/*
 * Query deklaratif mode bebas (T-009, alur B4): hanya pemilik dataset. Dependensi diinjeksi (DB,
 * cache parquet lokal, mesin DuckDB, cache hasil) agar bisa diuji tanpa layanan; perakitan produksi di
 * runtime.ts. Skema dibaca dari DB setiap permintaan (query berindeks, selalu sesuai revisi aktif),
 * bukan cache in-memory yang harus di-invalidate antarproses.
 *
 * Batas sumber daya (review T-009): slot user dipegang selama menyiapkan file + query (F3); hasil
 * > RESULT_MAX_BYTES ditolak sebelum diserialisasi (F4); timeout di-cache negatif sebentar agar spec
 * mahal yang sama tidak bisa diulang gratis (F2).
 */
import type { ColumnSchema } from "@/features/ingest/infer";
import { QueryBusyError, QueryTimeoutError, type EngineResult } from "@/lib/duckdb/engine";
import { CacheFullError, type ParquetLease } from "@/lib/duckdb/parquet-cache";
import { resultKey, type ResultCache } from "./cache";
import { bodySchema, resolveSpec, type OutColumn } from "./spec";
import { buildSql } from "./sql";

export type QueryCode =
  | "INVALID"
  | "NOT_FOUND"
  | "NOT_READY"
  | "QUERY_TIMEOUT"
  | "QUERY_BUSY"
  | "QUERY_TOO_HEAVY"
  | "RESULT_TOO_LARGE"
  | "QUERY_FAILED";

export interface QueryData {
  columns: OutColumn[];
  rows: unknown[][];
}

/** Nilai cache: hasil, atau penanda timeout (cache negatif). */
export type CachedQuery = QueryData | { timeout: true };

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
    withSlot<T>(userId: string, fn: () => Promise<T>): Promise<T>;
    exec(
      sql: string,
      params: Record<string, string | number | boolean>,
      timeoutMs: number,
    ): Promise<EngineResult>;
  };
  cache: ResultCache<CachedQuery> | null;
  timeoutMs: number;
}

/** Hasil yang dikirim ke klien dibatasi (perkiraan byte di memori; lihat sizeOf). */
export const RESULT_MAX_BYTES = 5 * 1024 * 1024;
/** Lama cache negatif untuk spec yang timeout. */
export const TIMEOUT_CACHE_MS = 5 * 60 * 1000;

const fail = (code: QueryCode, message: string): QueryResult => ({ ok: false, code, message });

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Nilai DuckDB → JSON. BIGINT/HUGEINT selalu number agar satu kolom bertipe sama (presisi penuh sampai
 * ± 9 × 10^15; jumlah di atas itu dibulatkan — cukup untuk dashboard). Tanggal naive → teks ISO tanpa zona.
 */
function toJson(v: unknown, type: OutColumn["type"]): unknown {
  if (typeof v === "bigint") return Number(v);
  if (v instanceof Date) {
    const d = `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
    if (type === "date") return d;
    return `${d}T${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}:${pad(v.getUTCSeconds())}`;
  }
  return v;
}

/** Perkiraan byte nilai di memori/JSON (string UTF-16 + overhead), tanpa serialisasi. */
function sizeOf(v: unknown): number {
  return typeof v === "string" ? 8 + v.length * 2 : 8;
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
  const timeoutMessage = `Query melebihi ${Math.round(deps.timeoutMs / 1000)} detik. Persempit filter (mis. rentang tanggal) atau kurangi dimensi, lalu coba lagi.`;
  const hit = deps.cache?.get(key);
  if (hit && "timeout" in hit) return fail("QUERY_TIMEOUT", timeoutMessage);
  if (hit) return { ok: true, ...hit, cached: true, ms: Date.now() - t0 };

  const typedKey = sheet.typedKey;
  try {
    const out = await deps.engine.withSlot(userId, async () => {
      const lease = await deps.parquet.acquire(typedKey);
      try {
        const { sql, params } = buildSql(resolved.plan, lease.path);
        return await deps.engine.exec(sql, params, deps.timeoutMs);
      } finally {
        lease.release();
      }
    });
    const types = resolved.plan.columns.map((c) => c.type);
    let bytes = 0;
    const rows: unknown[][] = [];
    for (const row of out.rows) {
      const r = row.map((v, i) => toJson(v, types[i]!));
      for (const v of r) bytes += sizeOf(v);
      if (bytes > RESULT_MAX_BYTES) {
        return fail(
          "RESULT_TOO_LARGE",
          "Hasil terlalu besar untuk ditampilkan. Kurangi limit atau dimensi, atau tambahkan filter.",
        );
      }
      rows.push(r);
    }
    const data: QueryData = { columns: resolved.plan.columns, rows };
    deps.cache?.set(key, data, bytes);
    return { ok: true, ...data, cached: false, ms: Date.now() - t0 };
  } catch (e) {
    if (e instanceof QueryTimeoutError) {
      deps.cache?.set(key, { timeout: true }, 64, TIMEOUT_CACHE_MS);
      return fail("QUERY_TIMEOUT", timeoutMessage);
    }
    if (e instanceof QueryBusyError) {
      return fail("QUERY_BUSY", "Sedang banyak query berjalan. Coba lagi sebentar lagi.");
    }
    if (e instanceof CacheFullError) {
      return fail("QUERY_BUSY", "Data sedang disiapkan untuk query lain. Coba lagi sebentar lagi.");
    }
    if (/Out of Memory Error/i.test(e instanceof Error ? e.message : String(e))) {
      return fail(
        "QUERY_TOO_HEAVY",
        "Query terlalu berat untuk diproses. Kurangi dimensi atau ukuran 'jumlah unik', atau tambahkan filter.",
      );
    }
    throw e;
  }
}
