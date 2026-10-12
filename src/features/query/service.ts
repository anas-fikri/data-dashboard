/*
 * Query deklaratif mode bebas (T-009, alur B4): hanya pemilik dataset. Dependensi diinjeksi (DB,
 * cache parquet lokal, mesin DuckDB, cache hasil) agar bisa diuji tanpa layanan; perakitan produksi di
 * runtime.ts. Skema dibaca dari DB setiap permintaan (query berindeks, selalu sesuai revisi aktif),
 * bukan cache in-memory yang harus di-invalidate antarproses.
 *
 * Batas sumber daya (review T-009):
 *  - menyiapkan file parquet memakai pembatas unduhan sendiri (global + per user) dan ditunggu paling
 *    lama PREPARE_WAIT_MS; slot query hanya dipegang selama DuckDB berjalan, sehingga unduhan besar
 *    tidak menahan query user lain (N2, menggantikan F3);
 *  - hasil > RESULT_MAX_BYTES ditolak sebelum diserialisasi (F4), diukur dengan perkiraan memori yang
 *    juga dipakai anggaran cache hasil (N1);
 *  - timeout di-cache negatif sebentar agar spec mahal yang sama tidak bisa diulang gratis (F2).
 */
import type { ColumnSchema } from "@/features/ingest/infer";
import { QueryBusyError, QueryTimeoutError, type EngineResult } from "@/lib/duckdb/engine";
import {
  CacheFullError,
  DownloadPendingError,
  ForgottenError,
  type AcquireOptions,
  type ParquetLease,
} from "@/lib/duckdb/parquet-cache";
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
  parquet: { acquire(key: string, opts?: AcquireOptions): Promise<ParquetLease> };
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
  /** Lama menunggu file parquet disiapkan (default PREPARE_WAIT_MS). */
  prepareWaitMs?: number;
}

/** Hasil yang dikirim ke klien dibatasi (perkiraan byte di memori; lihat resultBytes). */
export const RESULT_MAX_BYTES = 5 * 1024 * 1024;
/** Lama cache negatif untuk spec yang timeout. */
export const TIMEOUT_CACHE_MS = 5 * 60 * 1000;
/** Lewat ini permintaan dijawab "data sedang disiapkan"; unduhan tetap berlanjut. */
export const PREPARE_WAIT_MS = 10_000;

export type QueryFailure = { ok: false; code: QueryCode; message: string };

const fail = (code: QueryCode, message: string): QueryFailure => ({ ok: false, code, message });

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Nilai DuckDB → JSON. BIGINT/HUGEINT selalu number agar satu kolom bertipe sama (presisi penuh sampai
 * ± 9 × 10^15; jumlah di atas itu dibulatkan — cukup untuk dashboard). Tanggal naive → teks ISO tanpa zona.
 */
export function toJson(v: unknown, type: OutColumn["type"]): unknown {
  if (typeof v === "bigint") return Number(v);
  if (v instanceof Date) {
    const d = `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
    if (type === "date") return d;
    return `${d}T${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}:${pad(v.getUTCSeconds())}`;
  }
  return v;
}

/**
 * Perkiraan byte satu baris hasil di heap V8, tanpa serialisasi (review T-009 N1): larik baris ≈ 64 B,
 * angka ≈ 24 B (HeapNumber + slot), string ≈ 24 B + 2 B per karakter (batas atas UTF-16), lainnya 8 B
 * (slot). Nilai setelah toJson hanya string/angka/boolean/null. Diukur pada hasil DuckDB sungguhan
 * (getRowsJS + map, heap setelah GC), per baris: 13 angka 164–175 B (perkiraan 376); 3 teks
 * 40 karakter + 10 desimal 453 B (616); 1 teks 500 karakter 595 B (1.088) — tidak pernah di bawah.
 */
export function rowBytes(row: unknown[]): number {
  let n = 64;
  for (const v of row) {
    if (typeof v === "string") n += 24 + v.length * 2;
    else if (typeof v === "number") n += 24;
    else n += 8;
  }
  return n;
}

const timeoutMessage = (ms: number) =>
  `Query melebihi ${Math.round(ms / 1000)} detik. Persempit filter (mis. rentang tanggal) atau kurangi dimensi, lalu coba lagi.`;

/**
 * Siapkan file parquet lokal (pembatas unduhan, tunggu ≤ prepareWaitMs) lalu jalankan satu query di
 * slot user; error sumber daya dipetakan ke kode yang sama untuk semua pemakai (query bebas, sampel
 * skema T-008). Error lain dilempar (500 di lapisan HTTP).
 */
export async function execOnParquet(
  userId: string,
  key: string,
  deps: Pick<QueryDeps, "parquet" | "engine" | "timeoutMs" | "prepareWaitMs">,
  build: (path: string) => { sql: string; params: Record<string, string | number | boolean> },
): Promise<{ ok: true; out: EngineResult } | QueryFailure> {
  try {
    const lease = await deps.parquet.acquire(key, {
      owner: userId,
      waitMs: deps.prepareWaitMs ?? PREPARE_WAIT_MS,
    });
    try {
      const { sql, params } = build(lease.path);
      const out = await deps.engine.withSlot(userId, () =>
        deps.engine.exec(sql, params, deps.timeoutMs),
      );
      return { ok: true, out };
    } finally {
      lease.release();
    }
  } catch (e) {
    if (e instanceof QueryTimeoutError)
      return fail("QUERY_TIMEOUT", timeoutMessage(deps.timeoutMs));
    if (e instanceof QueryBusyError) {
      return fail("QUERY_BUSY", "Sedang banyak query berjalan. Coba lagi sebentar lagi.");
    }
    if (e instanceof DownloadPendingError) {
      return fail(
        "QUERY_BUSY",
        "Data sedang disiapkan untuk query pertama setelah diperbarui. Coba lagi dalam beberapa detik.",
      );
    }
    if (e instanceof CacheFullError) {
      return fail("QUERY_BUSY", "Data sedang disiapkan untuk query lain. Coba lagi sebentar lagi.");
    }
    if (e instanceof ForgottenError) return fail("NOT_FOUND", "Dataset tidak ditemukan.");
    if (/Out of Memory Error/i.test(e instanceof Error ? e.message : String(e))) {
      return fail(
        "QUERY_TOO_HEAVY",
        "Query terlalu berat untuk diproses. Kurangi dimensi atau ukuran 'jumlah unik', atau tambahkan filter.",
      );
    }
    throw e;
  }
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
  const hit = deps.cache?.get(key);
  if (hit && "timeout" in hit) return fail("QUERY_TIMEOUT", timeoutMessage(deps.timeoutMs));
  if (hit) return { ok: true, ...hit, cached: true, ms: Date.now() - t0 };

  const r = await execOnParquet(userId, sheet.typedKey, deps, (path) =>
    buildSql(resolved.plan, path),
  );
  if (!r.ok) {
    if (r.code === "QUERY_TIMEOUT") deps.cache?.set(key, { timeout: true }, 64, TIMEOUT_CACHE_MS);
    return r;
  }
  const types = resolved.plan.columns.map((c) => c.type);
  let bytes = 0;
  const rows: unknown[][] = [];
  for (const row of r.out.rows) {
    const v = row.map((x, i) => toJson(x, types[i]!));
    bytes += rowBytes(v);
    if (bytes > RESULT_MAX_BYTES) {
      return fail(
        "RESULT_TOO_LARGE",
        "Hasil terlalu besar untuk ditampilkan. Kurangi limit atau dimensi, atau tambahkan filter.",
      );
    }
    rows.push(v);
  }
  const data: QueryData = { columns: resolved.plan.columns, rows };
  deps.cache?.set(key, data, bytes);
  return { ok: true, ...data, cached: false, ms: Date.now() - t0 };
}
