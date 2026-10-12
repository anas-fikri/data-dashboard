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
import { parseWidgetConfig } from "@/features/widgets/spec";
import { TABLE_PAGE_SIZE } from "@/features/widgets/spec";
import { resultKey, type ResultCache } from "./cache";
import { bodySchema, resolveSpec, type OutColumn, type Plan } from "./spec";
import { buildSql, type BuiltSql } from "./sql";
import { buildTableCount, buildTablePage } from "./table";
import { widgetBodySchema, widgetPlan } from "./widget";

export type QueryCode =
  | "INVALID"
  | "NOT_FOUND"
  | "NOT_READY"
  | "QUERY_TIMEOUT"
  | "QUERY_BUSY"
  | "QUERY_TOO_HEAVY"
  | "RESULT_TOO_LARGE"
  | "QUERY_FAILED"
  /** Widget merujuk kolom yang disembunyikan/hilang (T-011): pesan di widget itu saja. */
  | "COLUMN_UNAVAILABLE"
  /** Sheet widget tidak ada di versi data aktif (mis. setelah ganti data, T-013). */
  | "SHEET_UNAVAILABLE";

export interface QueryData {
  columns: OutColumn[];
  rows: unknown[][];
}

/** Halaman widget tabel: total baris (dengan filter) + nomor halaman. */
export interface TablePage extends QueryData {
  total: number;
  page: number;
  pageSize: number;
}

/** Nilai cache: hasil, atau penanda timeout (cache negatif). */
export type CachedQuery = QueryData | TablePage | { timeout: true };

export type QueryResult =
  | ({ ok: true; cached: boolean; ms: number } & QueryData)
  | { ok: false; code: QueryCode; message: string };

export type WidgetQueryResult =
  QueryResult | ({ ok: true; cached: boolean; ms: number } & TablePage);

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
  /** Widget di dashboard milik user (null → 404, sama dengan widget yang tidak ada). */
  widget(
    userId: string,
    widgetId: string,
  ): Promise<{
    type: string;
    spec: unknown;
    datasetId: string;
    activeVersionId: string | null;
  } | null>;
}

export interface QueryDeps {
  repo: QueryRepo;
  parquet: { acquire(key: string, opts?: AcquireOptions): Promise<ParquetLease> };
  engine: {
    withSlot<T>(userId: string, fn: () => Promise<T>): Promise<T>;
    /** Jatah user terpisah dari slot global (mesin sungguhan); lihat runOnParquet. */
    withUser?<T>(userId: string, fn: (waitLeftMs: number) => Promise<T>): Promise<T>;
    withGlobal?<T>(fn: () => Promise<T>, waitMs?: number): Promise<T>;
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
  build: (path: string) => BuiltSql,
): Promise<{ ok: true; out: EngineResult } | QueryFailure> {
  const r = await runOnParquet(userId, key, deps, (path, exec) => exec(build(path)));
  return r.ok ? { ok: true, out: r.value } : r;
}

/**
 * Pekerjaan DuckDB pada satu file parquet: jatah user dulu (permintaan yang antre tidak menyewa file —
 * review T-011 M2), lalu sewa file (unduhan tidak memegang slot global — T-009 N2), lalu slot global
 * selama `work` berjalan. `exec` boleh dipanggil beberapa kali berurutan; semuanya berbagi satu batas
 * waktu `timeoutMs` (bukan masing-masing).
 */
export async function runOnParquet<T>(
  userId: string,
  key: string,
  deps: Pick<QueryDeps, "parquet" | "engine" | "timeoutMs" | "prepareWaitMs">,
  work: (path: string, exec: (s: BuiltSql) => Promise<EngineResult>) => Promise<T>,
): Promise<{ ok: true; value: T } | QueryFailure> {
  const engine = deps.engine;
  // Mesin palsu di test hanya punya withSlot: jatah user + global sekaligus.
  const userGate = <R>(fn: (waitLeftMs: number) => Promise<R>) =>
    engine.withUser ? engine.withUser(userId, fn) : fn(Infinity);
  const globalGate = <R>(fn: () => Promise<R>, waitLeftMs: number) =>
    engine.withGlobal ? engine.withGlobal(fn, waitLeftMs) : engine.withSlot(userId, fn);
  try {
    const value = await userGate(async (waitLeftMs) => {
      const lease = await deps.parquet.acquire(key, {
        owner: userId,
        waitMs: deps.prepareWaitMs ?? PREPARE_WAIT_MS,
      });
      try {
        return await globalGate(() => {
          const deadline = Date.now() + deps.timeoutMs;
          const exec = (s: BuiltSql) => {
            const left = deadline - Date.now();
            if (left <= 0) throw new QueryTimeoutError();
            return engine.exec(s.sql, s.params, left);
          };
          return work(lease.path, exec);
        }, waitLeftMs);
      } finally {
        lease.release();
      }
    });
    return { ok: true, value };
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
  return runAggPlan(userId, key, sheet.typedKey, resolved.plan, deps, t0);
}

const tooLarge = () =>
  fail(
    "RESULT_TOO_LARGE",
    "Hasil terlalu besar untuk ditampilkan. Kurangi limit atau dimensi, atau tambahkan filter.",
  );

/** Baris DuckDB → JSON dengan batas byte hasil (null bila terlalu besar). */
function toRows(raw: unknown[][], plan: Plan): { rows: unknown[][]; bytes: number } | null {
  const types = plan.columns.map((c) => c.type);
  let bytes = 0;
  const rows: unknown[][] = [];
  for (const row of raw) {
    const v = row.map((x, i) => toJson(x, types[i]!));
    bytes += rowBytes(v);
    if (bytes > RESULT_MAX_BYTES) return null;
    rows.push(v);
  }
  return { rows, bytes };
}

/** Rencana agregat (query bebas dan widget KPI/grafik): cache hasil → DuckDB → cache. */
async function runAggPlan(
  userId: string,
  key: string,
  typedKey: string,
  plan: Plan,
  deps: QueryDeps,
  t0: number,
): Promise<QueryResult> {
  const hit = deps.cache?.get(key);
  if (hit && "timeout" in hit) return fail("QUERY_TIMEOUT", timeoutMessage(deps.timeoutMs));
  if (hit)
    return { ok: true, columns: hit.columns, rows: hit.rows, cached: true, ms: Date.now() - t0 };

  const r = await execOnParquet(userId, typedKey, deps, (path) => buildSql(plan, path));
  if (!r.ok) {
    if (r.code === "QUERY_TIMEOUT") deps.cache?.set(key, { timeout: true }, 64, TIMEOUT_CACHE_MS);
    return r;
  }
  const out = toRows(r.out.rows, plan);
  if (!out) return tooLarge();
  const data: QueryData = { columns: plan.columns, rows: out.rows };
  deps.cache?.set(key, data, out.bytes);
  return { ok: true, ...data, cached: false, ms: Date.now() - t0 };
}

/**
 * Query widget (T-011): spec diambil dari widget milik user, bukan dari klien. KPI/grafik memakai
 * rencana agregat; tabel mengembalikan satu halaman 100 baris + total baris dengan filter yang sama.
 */
export async function runWidgetQuery(
  userId: string,
  body: unknown,
  deps: QueryDeps,
): Promise<WidgetQueryResult> {
  const t0 = Date.now();
  const parsed = widgetBodySchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(
      "INVALID",
      `Permintaan widget tidak valid${issue?.path.length ? ` (${issue.path.join(".")})` : ""}: ${issue?.message ?? "format salah"}.`,
    );
  }
  const w = await deps.repo.widget(userId, parsed.data.widgetId);
  if (!w) return fail("NOT_FOUND", "Widget tidak ditemukan.");
  const cfg = parseWidgetConfig(w.type, w.spec);
  if (!cfg.ok) return fail("INVALID", cfg.message);
  if (cfg.config.type === "empty") return fail("INVALID", "Widget ini belum diatur.");
  const config = cfg.config;
  if (!w.activeVersionId) return fail("NOT_READY", "Data dataset ini belum siap.");
  const sheet = await deps.repo.sheet(w.activeVersionId, config.spec.sheetId);
  if (!sheet) {
    return fail(
      "SHEET_UNAVAILABLE",
      "Sheet yang dipakai widget ini tidak ada di data aktif. Atur ulang widget.",
    );
  }
  if (!sheet.typedKey || !sheet.schema) return fail("NOT_READY", "Sheet ini belum siap.");
  const planned = widgetPlan(config, sheet.schema, parsed.data);
  if (!planned.ok) return fail(planned.code, planned.message);

  const keyParts = {
    datasetId: w.datasetId,
    versionId: w.activeVersionId,
    sheetId: config.spec.sheetId,
    schemaRevision: sheet.schemaRevision,
  };
  if (planned.kind === "agg") {
    return runAggPlan(
      userId,
      resultKey({ ...keyParts, spec: planned.spec }),
      sheet.typedKey,
      planned.plan,
      deps,
      t0,
    );
  }

  const { plan, sort, page } = planned;
  const key = resultKey({ ...keyParts, spec: { table: planned.spec, sort, page } });
  const hit = deps.cache?.get(key);
  if (hit && "timeout" in hit) return fail("QUERY_TIMEOUT", timeoutMessage(deps.timeoutMs));
  if (hit && "total" in hit) return { ok: true, ...hit, cached: true, ms: Date.now() - t0 };
  // Total (dengan filter) tidak bergantung pada urutan/halaman: disimpan terpisah agar pindah halaman
  // hanya menjalankan query halaman.
  const countKey = resultKey({ ...keyParts, spec: { tableCount: planned.spec.filters } });
  const countHit = deps.cache?.get(countKey);
  const knownTotal =
    countHit && !("timeout" in countHit) ? Number(countHit.rows[0]?.[0] ?? 0) : undefined;

  const r = await runOnParquet(userId, sheet.typedKey, deps, async (path, exec) => {
    const total = knownTotal ?? Number((await exec(buildTableCount(plan, path))).rows[0]?.[0] ?? 0);
    // Halaman di luar data dijepit ke halaman terakhir — tidak ada OFFSET mahal tanpa hasil (M1).
    const at = Math.min(page, Math.max(0, Math.ceil(total / TABLE_PAGE_SIZE) - 1));
    const rows = total ? (await exec(buildTablePage(plan, sort, at, path))).rows : [];
    return { total, page: at, rows };
  });
  if (!r.ok) {
    if (r.code === "QUERY_TIMEOUT") deps.cache?.set(key, { timeout: true }, 64, TIMEOUT_CACHE_MS);
    return r;
  }
  const out = toRows(r.value.rows, plan);
  if (!out) return tooLarge();
  if (knownTotal === undefined) {
    deps.cache?.set(countKey, { columns: [], rows: [[r.value.total]] }, 128);
  }
  const data: TablePage = {
    columns: plan.columns,
    rows: out.rows,
    total: r.value.total,
    page: r.value.page,
    pageSize: TABLE_PAGE_SIZE,
  };
  deps.cache?.set(key, data, out.bytes + 64);
  return { ok: true, ...data, cached: false, ms: Date.now() - t0 };
}
