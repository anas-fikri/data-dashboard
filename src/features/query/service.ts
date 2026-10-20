/*
 * Query deklaratif mode bebas (T-009, alur B4): hanya pemilik dataset. Berbagi (T-016): widget
 * dashboard untuk pemilik/editor/viewer dashboard itu, spec bebas atas dataset dashboard
 * ({ dashboardId, spec }) untuk pemilik/editor saja; peran dibaca tanpa cache sebelum cache hasil atau
 * DuckDB, dan menentukan detail pesan + field cached/ms (lihat forRole). Dependensi diinjeksi (DB,
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
import type { DuckDBValue } from "@duckdb/node-api";
import type { ColumnSchema } from "@/features/ingest/infer";
import { QueryTimeoutError, type EngineResult } from "@/lib/duckdb/engine";
import {
  type AcquireOptions,
  type ParquetLease,
  type ParquetLeases,
} from "@/lib/duckdb/parquet-cache";
import { storedFilterColumns, type FilterSourceColumn } from "@/features/dashboards/filter-columns";
// Tipe saja: access.ts server-only + prisma, service ini juga dipakai test tanpa DB.
import type { DashboardAccess, DashboardAccessRole } from "@/features/sharing/access";
import {
  markerNames,
  matchSheet,
  missingMessage,
  remapConfig,
  type SheetInfo,
} from "@/features/widgets/remap";
import { parseWidgetConfig, type WidgetConfig } from "@/features/widgets/spec";
import { TABLE_PAGE_SIZE } from "@/features/widgets/spec";
import { resultKey, type ResultCache } from "./cache";
import {
  applyDashFilters,
  disallowedFilter,
  sourceFamilies,
  type DashClause,
  type DashValue,
} from "./filters";
import {
  bodySchema,
  dashboardBodySchema,
  resolveSpec,
  type OutColumn,
  type Plan,
  type QuerySpec,
} from "./spec";
import {
  buildPivotSql,
  buildPivotValuesSql,
  pivotOutTypes,
  shapePivot,
  type PivotData,
} from "./pivot";
import {
  sheetSource,
  sourceKeys,
  withSegments,
  type ParquetSource,
  type SegmentFile,
} from "./source";
import { buildSql, buildTotalsSql, type BuiltSql } from "./sql";
import { buildTableCount, buildTablePage } from "./table";
import {
  absentNames,
  widgetBodySchema,
  widgetPlan,
  type PivotShape,
  type WidgetPlan,
  type WidgetQueryBody,
} from "./widget";

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
  /** Grafik widget: jumlah kategori seluruhnya (sebelum batas N). */
  categories?: number;
  /** Grafik widget: total ukuran seluruh kategori (sebelum batas N); null bila semua kosong. */
  grandTotal?: number | null;
  /**
   * Filter dashboard (T-012) yang dilewati widget ini: nama kolom seperti dikirim klien (kolom tidak
   * ada/disembunyikan di sheet widget, kelompok tipenya beda dengan kolom sumber filter, atau tipe
   * nilainya tidak cocok).
   */
  skippedFilters?: string[];
  /**
   * Widget: nama tampil kolom yang dipakai widget dan kosong di versi data ini (kolom absent hasil
   * pemetaan T-014). Hanya ada bila tidak kosong; tidak ikut cache hasil.
   */
  absent?: string[];
  /** Widget pivot (T-686n): tabel tersusun; `rows` kosong. */
  pivot?: PivotData;
  /** Widget pivot mode pivotValues (T-f4a7): nilai unik satu field (maks. 500); `rows` kosong. */
  pivotValues?: { values: DashValue[]; truncated: boolean };
}

/** Halaman widget tabel: total baris (dengan filter) + nomor halaman. */
export interface TablePage extends QueryData {
  total: number;
  page: number;
  pageSize: number;
}

/** Nilai cache: hasil, daftar nilai slicer (T-012), atau penanda timeout (cache negatif). */
export type CachedQuery =
  QueryData | TablePage | { filterValues: DashValue[]; truncated: boolean } | { timeout: true };

/**
 * `cached`/`ms` hanya untuk pemilik (T-016): non-pemilik tidak bisa menebak apakah user lain baru saja
 * menjalankan widget/filter yang sama (cache hasil lintas user). Klien tidak bergantung padanya.
 */
type Timing = { cached?: boolean; ms?: number };

export type QueryResult =
  ({ ok: true } & Timing & QueryData) | { ok: false; code: QueryCode; message: string };

export type WidgetQueryResult = QueryResult | ({ ok: true } & Timing & TablePage);

/**
 * Jawaban mode widget { widgetId, … }: setiap jawaban SETELAH widget lolos otorisasi — sukses maupun
 * gagal (INVALID urutan/filter, COLUMN_UNAVAILABLE, …) — membawa `widgetVersion` = versi pengaturan
 * widget yang dipakai server (Widget.updatedAt ISO, review T-016 DI-1/R2 CL-2). Beda dengan versi
 * salinan lokal klien → klien tidak menggambar data dengan tipe/format lama, dan error dari permintaan
 * yang disusun dari pengaturan lama (mis. urut kolom yang baru dihapus) menjadi "muat ulang". Gagal
 * sebelum otorisasi (body tidak valid, 404) tanpa versi.
 */
export type WidgetModeResult =
  | (Extract<WidgetQueryResult, { ok: false }> & { widgetVersion?: string })
  | (Extract<WidgetQueryResult, { ok: true }> & { widgetVersion: string });

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
    /** Manifest segmen sheet urut ordinal (T-037); tidak ada/≤ 1 → typedKey saja. */
    segments?: SegmentFile[];
  } | null>;
  /**
   * Sheet lama (versi mana pun dari dataset yang sama) + sheet versi aktif, untuk memetakan widget
   * setelah data diganti. Opsional (repo uji boleh tidak punya).
   */
  sheetHistory?(
    datasetId: string,
    activeVersionId: string,
    sheetId: string,
  ): Promise<{
    old: SheetInfo;
    oldSheetCount: number;
    /** Sheet versi aktif tanpa skema: skema target dibaca segar lewat sheet(). */
    active: Pick<SheetInfo, "id" | "name" | "aliasName" | "index">[];
  } | null>;
  /**
   * Widget di dashboard yang boleh dilihat user (T-016: pemilik, share user, atau share organisasi pada
   * DASHBOARD itu, bukan lewat dataset). null → 404, sama dengan widget yang tidak ada.
   */
  widget(
    userId: string,
    widgetId: string,
  ): Promise<{
    type: string;
    spec: unknown;
    /**
     * Versi pengaturan widget (Widget.updatedAt, review T-016 DI-1): dikirim sebagai `widgetVersion`
     * agar klien tahu spec yang dipakai server berbeda dari salinan lokalnya.
     */
    updatedAt: Date;
    datasetId: string;
    activeVersionId: string | null;
    /**
     * Peran peminta pada dashboard widget, dihitung di query yang sama (tanpa cache). Wajib: setiap
     * repo harus memutuskan peran (bentuk jawaban + pesan per peran, lihat forRole).
     */
    role: DashboardAccessRole;
    /**
     * Nama kolom yang hilang saat versi diaktifkan (T-013): pesan widget setelah sheet lama spec-nya
     * dihapus retensi, dan nama di balik penanda MISSING_COLUMN spec.
     */
    missingColumns?: string[];
    /** Dashboard widget (T-012): kolom filter tersimpan + kapan terakhir berubah. */
    dashboardId?: string;
    filterColumns?: unknown;
    dashboardUpdatedAt?: Date;
    /**
     * Jumlah schemaRevision sheet versi aktif (hanya naik): bagian kunci cache sumber filter, agar
     * kolom yang baru disembunyikan langsung tidak diizinkan lagi (review T-016 R3 SEC-1).
     */
    schemaStamp?: number;
  } | null>;
  /**
   * Sumber filter dashboard (T-012, D6): kolom filter tersimpan + dimensi grafik yang cross-filter-nya
   * aktif, dengan tipe di versi aktif (null = tidak ada/disembunyikan). Nama = daftar kolom yang boleh
   * difilter; tipe = kelompok tipe yang boleh dikenai filter bernama itu. Opsional (repo uji); tanpa
   * ini hanya nama kolom filter tersimpan yang diizinkan dan tidak ada filter dashboard yang berlaku.
   */
  filterSources?(dashboard: {
    dashboardId: string;
    activeVersionId: string | null;
    updatedAt?: Date;
    schemaStamp?: number;
  }): Promise<FilterSource[]>;
  /**
   * Dashboard yang boleh dilihat user (pemilik/editor/viewer, T-016) untuk daftar nilai slicer (T-012):
   * kolom filter tersimpan + sheet siap di versi aktif (tanpa skema; skema dibaca lewat sheet()).
   * null → 404.
   */
  filterSource?(
    userId: string,
    dashboardId: string,
  ): Promise<{
    datasetId: string;
    activeVersionId: string | null;
    filterColumns: unknown;
    sheets: { id: string; name: string }[];
    /**
     * Peran peminta, dihitung di query yang sama (tanpa cache): non-pemilik tidak bisa membedakan kolom
     * filter yang tidak tersedia dari nama lain (review T-016 R3 SEC-1). Wajib: setiap repo harus
     * memutuskan peran (seperti widget()).
     */
    role: DashboardAccessRole;
  } | null>;
  /**
   * Peran user pada dashboard + dataset/versi aktif dashboard itu (T-016, mode { dashboardId, spec }).
   * Satu query tanpa cache; null → 404. Opsional (repo uji); tanpa ini mode itu selalu 404.
   */
  dashboardAccess?(userId: string, dashboardId: string): Promise<DashboardAccess | null>;
}

/** Kolom sumber filter dashboard (lihat QueryRepo.filterSources). */
export type FilterSource = FilterSourceColumn;

export interface QueryDeps {
  repo: QueryRepo;
  parquet: {
    acquire(key: string, opts?: AcquireOptions): Promise<ParquetLease>;
    /** Sewa semua segmen dalam satu admission (T-037); tidak ada → acquire satu per satu. */
    acquireMany?(keys: string[], opts?: AcquireOptions): Promise<ParquetLeases>;
  };
  engine: {
    withSlot<T>(userId: string, fn: () => Promise<T>): Promise<T>;
    /** Jatah user terpisah dari slot global (mesin sungguhan); lihat runOnParquet. */
    withUser?<T>(userId: string, fn: (waitLeftMs: number) => Promise<T>): Promise<T>;
    withGlobal?<T>(fn: () => Promise<T>, waitMs?: number): Promise<T>;
    exec(
      sql: string,
      params: Record<string, DuckDBValue>,
      timeoutMs: number,
      signal?: AbortSignal,
    ): Promise<EngineResult>;
  };
  cache: ResultCache<CachedQuery> | null;
  timeoutMs: number;
  /** Lama menunggu file parquet disiapkan (default PREPARE_WAIT_MS). */
  prepareWaitMs?: number;
  /** Jam untuk preset tanggal filter dashboard (T-012); bisa diganti di test. */
  now?: () => Date;
  /**
   * Permintaan dibatalkan klien (slicer per ketikan): yang masih antre tidak menjalankan DuckDB, yang
   * sedang berjalan di-interrupt.
   */
  signal?: AbortSignal;
}

/** Hasil yang dikirim ke klien dibatasi (perkiraan byte di memori; lihat resultBytes). */
export const RESULT_MAX_BYTES = 5 * 1024 * 1024;
/** Lama cache negatif untuk spec yang timeout. */
export const TIMEOUT_CACHE_MS = 5 * 60 * 1000;
/** Lewat ini permintaan dijawab "data sedang disiapkan"; unduhan tetap berlanjut. */
export const PREPARE_WAIT_MS = 10_000;

export type QueryFailure = { ok: false; code: QueryCode; message: string };

export const fail = (code: QueryCode, message: string): QueryFailure => ({
  ok: false,
  code,
  message,
});

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

export const timeoutMessage = (ms: number) =>
  `Query melebihi ${Math.round(ms / 1000)} detik. Persempit filter (mis. rentang tanggal) atau kurangi dimensi, lalu coba lagi.`;

/**
 * Siapkan file parquet lokal (pembatas unduhan, tunggu ≤ prepareWaitMs) lalu jalankan satu query di
 * slot user; error sumber daya dipetakan ke kode yang sama untuk semua pemakai (query bebas, sampel
 * skema T-008). Error lain dilempar (500 di lapisan HTTP).
 */
export async function execOnParquet(
  userId: string,
  key: ParquetSource,
  deps: Pick<QueryDeps, "parquet" | "engine" | "timeoutMs" | "prepareWaitMs" | "signal">,
  build: (path: string) => BuiltSql,
): Promise<{ ok: true; out: EngineResult } | QueryFailure> {
  const r = await runOnParquet(userId, key, deps, (path, exec) => exec(build(path)));
  return r.ok ? { ok: true, out: r.value } : r;
}

/** Sewa file sumber: satu kunci (perilaku lama) atau semua segmen dalam satu admission. */
async function leaseSource(
  parquet: QueryDeps["parquet"],
  source: ParquetSource,
  opts: AcquireOptions,
): Promise<ParquetLeases> {
  if (typeof source === "string") {
    const l = await parquet.acquire(source, opts);
    return { paths: [l.path], release: () => l.release() };
  }
  const keys = sourceKeys(source);
  if (parquet.acquireMany) return parquet.acquireMany(keys, opts);
  const leases: ParquetLease[] = [];
  try {
    for (const k of keys) leases.push(await parquet.acquire(k, opts));
  } catch (e) {
    for (const l of leases) l.release();
    throw e;
  }
  return { paths: leases.map((l) => l.path), release: () => leases.forEach((l) => l.release()) };
}

/**
 * Pekerjaan DuckDB pada satu file parquet: jatah user dulu (permintaan yang antre tidak menyewa file —
 * review T-011 M2), lalu sewa file (unduhan tidak memegang slot global — T-009 N2), lalu slot global
 * selama `work` berjalan. `exec` boleh dipanggil beberapa kali berurutan; semuanya berbagi satu batas
 * waktu `timeoutMs` (bukan masing-masing).
 */
export async function runOnParquet<T>(
  userId: string,
  key: ParquetSource,
  deps: Pick<QueryDeps, "parquet" | "engine" | "timeoutMs" | "prepareWaitMs" | "signal">,
  work: (
    path: string,
    exec: (s: BuiltSql, maxMs?: number) => Promise<EngineResult>,
    /** Path lokal semua file sumber, urut sumber (jendela baris T-041 membaca per segmen). */
    paths: string[],
  ) => Promise<T>,
): Promise<{ ok: true; value: T } | QueryFailure> {
  const { engine, signal } = deps;
  // Mesin palsu di test hanya punya withSlot: jatah user + global sekaligus.
  const userGate = <R>(fn: (waitLeftMs: number) => Promise<R>) =>
    engine.withUser ? engine.withUser(userId, fn) : fn(Infinity);
  const globalGate = <R>(fn: () => Promise<R>, waitLeftMs: number) =>
    engine.withGlobal ? engine.withGlobal(fn, waitLeftMs) : engine.withSlot(userId, fn);
  try {
    const value = await userGate(async (waitLeftMs) => {
      signal?.throwIfAborted();
      const lease = await leaseSource(deps.parquet, key, {
        owner: userId,
        waitMs: deps.prepareWaitMs ?? PREPARE_WAIT_MS,
      });
      try {
        return await globalGate(() => {
          const deadline = Date.now() + deps.timeoutMs;
          const exec = (s: BuiltSql, maxMs = Infinity) => {
            signal?.throwIfAborted();
            const left = deadline - Date.now();
            if (left <= 0) throw new QueryTimeoutError();
            // Banyak segmen: read_parquet($path) diganti daftar/proyeksi (source.ts).
            const q =
              typeof key === "string" ? s : withSegments(s, key.files, lease.paths, key.schema);
            return engine.exec(q.sql, q.params, Math.min(left, maxMs), signal);
          };
          return work(lease.paths[0]!, exec, lease.paths);
        }, waitLeftMs);
      } finally {
        lease.release();
      }
    });
    return { ok: true, value };
  } catch (e) {
    // Klien sudah pergi: jawaban tidak dibaca, cukup tidak di-cache dan tidak dicatat sebagai error.
    if (signal?.aborted) return fail("QUERY_BUSY", "Permintaan dibatalkan.");
    // Dikenali dari `name`, bukan instanceof: mesin + cache parquet dibagi lewat globalThis, sedangkan
    // kelas galatnya bisa salinan modul lain (layer route /api/query vs RSC /render) — review T-018 R16-INT-1.
    switch (e instanceof Error ? e.name : "") {
      case "QueryTimeoutError":
        return fail("QUERY_TIMEOUT", timeoutMessage(deps.timeoutMs));
      case "QueryBusyError":
        return fail("QUERY_BUSY", "Sedang banyak query berjalan. Coba lagi sebentar lagi.");
      case "DownloadPendingError":
        return fail(
          "QUERY_BUSY",
          "Data sedang disiapkan untuk query pertama setelah diperbarui. Coba lagi dalam beberapa detik.",
        );
      case "CacheFullError":
        return fail(
          "QUERY_BUSY",
          "Data sedang disiapkan untuk query lain. Coba lagi sebentar lagi.",
        );
      case "ForgottenError":
        return fail("NOT_FOUND", "Dataset tidak ditemukan.");
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

const invalidSpec = (issue: { path: PropertyKey[]; message: string } | undefined) =>
  fail(
    "INVALID",
    `Spec query tidak valid${issue?.path.length ? ` (${issue.path.join(".")})` : ""}: ${issue?.message ?? "format salah"}.`,
  );

/** Query bebas { datasetId, spec } (T-009): pemilik dataset saja; lainnya NOT_FOUND (T-016 AC1). */
export async function runQuery(
  userId: string,
  body: unknown,
  deps: QueryDeps,
): Promise<QueryResult> {
  const t0 = Date.now();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return invalidSpec(parsed.error.issues[0]);
  const { datasetId, spec } = parsed.data;
  const ds = await deps.repo.ownedDataset(userId, datasetId);
  if (!ds) return fail("NOT_FOUND", "Dataset tidak ditemukan.");
  return runSpec(userId, { datasetId, activeVersionId: ds.activeVersionId }, spec, deps, t0);
}

/**
 * Mode editor { dashboardId, spec } (T-016, D6): pratinjau spec bebas atas dataset dashboard. Body
 * divalidasi dulu (400), lalu peran dibaca tanpa cache: pemilik/editor saja — viewer dan orang lain
 * NOT_FOUND (mode ini membaca kolom mana pun, bukan hanya kolom widget). Dataset + versi aktif dari
 * dashboard di server; sheet dicari di versi aktif itu saja, jadi sheet dataset lain → NOT_FOUND (AC6).
 * Jalur eksekusi, batas, dan kunci cache sama dengan query bebas.
 */
export async function runDashboardQuery(
  userId: string,
  body: unknown,
  deps: QueryDeps,
): Promise<QueryResult> {
  const t0 = Date.now();
  const parsed = dashboardBodySchema.safeParse(body);
  if (!parsed.success) return invalidSpec(parsed.error.issues[0]);
  const { dashboardId, spec } = parsed.data;
  const access = deps.repo.dashboardAccess
    ? await deps.repo.dashboardAccess(userId, dashboardId)
    : null;
  if (!access || (access.role !== "OWNER" && access.role !== "EDITOR")) {
    return fail("NOT_FOUND", "Dashboard tidak ditemukan.");
  }
  return forRole(access.role, await runSpec(userId, access, spec, deps, t0));
}

/** Spec bebas atas versi aktif dataset yang SUDAH diotorisasi pemanggil. */
async function runSpec(
  userId: string,
  ds: { datasetId: string; activeVersionId: string | null },
  spec: QuerySpec,
  deps: QueryDeps,
  t0: number,
): Promise<QueryResult> {
  if (!ds.activeVersionId) return fail("NOT_READY", "Data dataset ini belum siap.");
  const sheet = await deps.repo.sheet(ds.activeVersionId, spec.sheetId);
  if (!sheet) return fail("NOT_FOUND", "Sheet tidak ditemukan.");
  if (!sheet.typedKey || !sheet.schema) return fail("NOT_READY", "Sheet ini belum siap.");
  const resolved = resolveSpec(spec, sheet.schema);
  if (!resolved.ok) return fail("INVALID", resolved.message);

  const key = resultKey({
    datasetId: ds.datasetId,
    versionId: ds.activeVersionId,
    sheetId: spec.sheetId,
    schemaRevision: sheet.schemaRevision,
    spec,
  });
  const source = sourceOf({
    typedKey: sheet.typedKey,
    schema: sheet.schema,
    segments: sheet.segments,
  });
  return runAggPlan(userId, key, source, resolved.plan, deps, t0);
}

/** Sumber query sheet yang sudah siap (typedKey + skema ada): satu file atau daftar segmen. */
export const sourceOf = (sheet: {
  typedKey: string;
  schema: ColumnSchema[];
  segments?: SegmentFile[];
}): ParquetSource => sheetSource(sheet);

/** Pesan umum COLUMN_UNAVAILABLE untuk viewer (catatan T-011): tanpa nama kolom lama/tersembunyi. */
export const COLUMN_UNAVAILABLE_VIEWER = "Kolom yang dipakai widget ini tidak tersedia.";

/**
 * Hasil sesuai peran peminta (T-016), satu titik untuk semua jalur widget/dashboard: viewer mendapat
 * pesan umum untuk SEMUA varian COLUMN_UNAVAILABLE (nama kolom lama setelah ganti data atau kolom
 * tersembunyi tidak disebut; pemilik/editor tetap mendapat detail), dan cached/ms hanya untuk pemilik.
 * Aman terhadap cache: kegagalan tidak pernah di-cache dan cached/ms bukan bagian nilai cache.
 */
export function forRole<R extends WidgetQueryResult>(role: DashboardAccessRole, r: R): R {
  if (!r.ok) {
    // Deny by default: detail hanya untuk pemilik/editor yang eksplisit (peran tak dikenal = viewer).
    const detailed = role === "OWNER" || role === "EDITOR";
    return !detailed && r.code === "COLUMN_UNAVAILABLE"
      ? (fail("COLUMN_UNAVAILABLE", COLUMN_UNAVAILABLE_VIEWER) as R)
      : r;
  }
  if (role === "OWNER") return r;
  const { cached: _cached, ms: _ms, ...rest } = r;
  return rest as R;
}

const tooLarge = () =>
  fail(
    "RESULT_TOO_LARGE",
    "Hasil terlalu besar untuk ditampilkan. Kurangi limit atau dimensi, atau tambahkan filter.",
  );

/** Baris DuckDB → JSON dengan batas byte hasil (null bila terlalu besar). */
function toRows(raw: unknown[][], plan: Plan): { rows: unknown[][]; bytes: number } | null {
  return toTypedRows(
    raw,
    plan.columns.map((c) => c.type),
  );
}

function toTypedRows(
  raw: unknown[][],
  types: OutColumn["type"][],
): { rows: unknown[][]; bytes: number } | null {
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
  typedKey: ParquetSource,
  plan: Plan,
  deps: QueryDeps,
  t0: number,
): Promise<QueryResult> {
  const hit = deps.cache?.get(key);
  if (hit && "timeout" in hit) return fail("QUERY_TIMEOUT", timeoutMessage(deps.timeoutMs));
  if (hit && "rows" in hit) return { ok: true, ...hit, cached: true, ms: Date.now() - t0 };

  const r = await runOnParquet(userId, typedKey, deps, async (path, exec) => {
    const main = await exec(buildSql(plan, path));
    if (!plan.totals) return { main, totals: null, totalsFailed: false };
    // Total opsional: dibatasi TOTALS_MAX_MS; gagal/lewat waktu → grafik tetap tampil tanpa "M"/Lainnya.
    const sql = buildTotalsSql(plan, path);
    // exec bisa melempar sinkron (tenggat habis) — dibungkus agar tetap jadi "tanpa total".
    const totals = sql
      ? await Promise.resolve()
          .then(() => exec(sql, TOTALS_MAX_MS))
          .catch(() => null)
      : null;
    return { main, totals, totalsFailed: !!sql && !totals };
  });
  if (!r.ok) {
    if (r.code === "QUERY_TIMEOUT") deps.cache?.set(key, { timeout: true }, 64, TIMEOUT_CACHE_MS);
    return r;
  }
  const out = toRows(r.value.main.rows, plan);
  if (!out) return tooLarge();
  const data: QueryData = { columns: plan.columns, rows: out.rows };
  const t = r.value.totals?.rows[0];
  if (t) {
    data.categories = Number(toJson(t[0], "count"));
    const g = toJson(t[1], "decimal");
    data.grandTotal = g === null || g === undefined ? null : Number(g);
  }
  // Total gagal → di-cache sebentar saja: dicoba lagi tanpa menjalankan query utama di tiap muat.
  deps.cache?.set(
    key,
    data,
    out.bytes + (plan.totals ? 64 : 0),
    r.value.totalsFailed ? TOTALS_RETRY_MS : undefined,
  );
  return { ok: true, ...data, cached: false, ms: Date.now() - t0 };
}

/** Widget pivot (T-686n): cache hasil → satu query DuckDB (UNION ALL) → tabel tersusun → cache. */
async function runPivotPlan(
  userId: string,
  key: string,
  typedKey: ParquetSource,
  plan: Plan,
  shape: PivotShape,
  deps: QueryDeps,
  t0: number,
): Promise<QueryResult> {
  const hit = deps.cache?.get(key);
  if (hit && "timeout" in hit) return fail("QUERY_TIMEOUT", timeoutMessage(deps.timeoutMs));
  if (hit && "pivot" in hit) return { ok: true, ...hit, cached: true, ms: Date.now() - t0 };

  const r = await runOnParquet(userId, typedKey, deps, (path, exec) =>
    exec(buildPivotSql(plan, shape, path)),
  );
  if (!r.ok) {
    if (r.code === "QUERY_TIMEOUT") deps.cache?.set(key, { timeout: true }, 64, TIMEOUT_CACHE_MS);
    return r;
  }
  const out = toTypedRows(r.value.rows, pivotOutTypes(plan, shape));
  if (!out) return tooLarge();
  const data: QueryData = {
    columns: plan.columns,
    rows: [],
    pivot: shapePivot(out.rows, plan, shape),
  };
  deps.cache?.set(key, data, out.bytes);
  return { ok: true, ...data, cached: false, ms: Date.now() - t0 };
}

/** Nilai paling banyak di menu saring pivot (sama dengan batas nilai per saringan). */
export const PIVOT_VALUES_MAX = 500;

/** Menu saring pivot (T-f4a7): cache → nilai unik satu field → cache (bentuk cache nilai slicer). */
async function runPivotValues(
  userId: string,
  key: string,
  typedKey: ParquetSource,
  plan: Plan,
  shape: PivotShape,
  deps: QueryDeps,
  t0: number,
): Promise<QueryResult> {
  const dim = shape.list!;
  const d = plan.dimensions[dim]!;
  const done = (v: { values: DashValue[]; truncated: boolean }, cached: boolean): QueryResult => ({
    ok: true,
    columns: [plan.columns[dim]!],
    rows: [],
    pivotValues: v,
    cached,
    ms: Date.now() - t0,
  });
  const hit = deps.cache?.get(key);
  if (hit && "timeout" in hit) return fail("QUERY_TIMEOUT", timeoutMessage(deps.timeoutMs));
  if (hit && "filterValues" in hit) {
    return done({ values: hit.filterValues, truncated: hit.truncated }, true);
  }
  const r = await runOnParquet(userId, typedKey, deps, (path, exec) =>
    exec(buildPivotValuesSql(plan, shape, dim, PIVOT_VALUES_MAX, path)),
  );
  if (!r.ok) {
    if (r.code === "QUERY_TIMEOUT") deps.cache?.set(key, { timeout: true }, 64, TIMEOUT_CACHE_MS);
    return r;
  }
  // Tipe sama dengan label tabel pivot (pivotOutTypes): tanggal per grain tetap tanggal/waktu.
  const type = d.type === "text" ? "text" : d.type;
  const all = r.value.rows.map((row) => toJson(row[0], type) as DashValue);
  const v = { values: all.slice(0, PIVOT_VALUES_MAX), truncated: all.length > PIVOT_VALUES_MAX };
  deps.cache?.set(key, { filterValues: v.values, truncated: v.truncated }, rowBytes(v.values));
  return done(v, false);
}

/** Batas waktu query total grafik (opsional) — query kategori sangat banyak tidak menahan slot lama. */
export const TOTALS_MAX_MS = 5_000;
/** Umur cache hasil grafik yang totalnya gagal (dicoba lagi setelahnya). */
export const TOTALS_RETRY_MS = 30_000;

/**
 * Klien hanya mengirim filter yang tidak diizinkan bila daftar filternya basi (sanitize membuangnya saat
 * halaman dimuat), mis. pemilik baru menghapus kolom filter — versi widget tidak berubah karenanya,
 * jadi pesannya sendiri memberi petunjuk muat ulang (review T-016 R2 CL-2).
 */
const NOT_ALLOWED =
  "Filter tidak diizinkan untuk dashboard ini. Muat ulang halaman bila pengaturan dashboard baru diubah.";

/** Widget yang sudah lolos otorisasi repo (membawa peran peminta). */
export type AuthorizedWidget = NonNullable<Awaited<ReturnType<QueryRepo["widget"]>>>;

/**
 * Sumber filter dashboard widget ini (D6): kolom filter tersimpan + dimensi grafik cross-filter beserta
 * tipenya (dibaca sekali per dashboard lewat cache repo). Repo tanpa filterSources (uji): nama kolom
 * filter tersimpan saja, tanpa tipe.
 */
function dashboardSources(w: AuthorizedWidget, repo: QueryRepo): Promise<FilterSource[]> {
  if (w.dashboardId && repo.filterSources) {
    return repo.filterSources({
      dashboardId: w.dashboardId,
      activeVersionId: w.activeVersionId,
      updatedAt: w.dashboardUpdatedAt,
      schemaStamp: w.schemaStamp,
    });
  }
  return Promise.resolve(
    storedFilterColumns(w.filterColumns).map((f) => ({ name: f.column, type: null })),
  );
}

/**
 * Query widget (T-011): spec diambil dari widget di DB, bukan dari klien. KPI/grafik memakai
 * rencana agregat; tabel mengembalikan satu halaman 100 baris + total baris dengan filter yang sama.
 * Filter dashboard (T-012) dicocokkan lewat nama + kelompok tipe dengan sheet widget ini; yang tidak
 * berlaku dilewati dan dilaporkan di skippedFilters. Kolom filter hanya kolom yang diizinkan dashboard
 * (D6); lainnya INVALID tanpa query, untuk peran apa pun. `filters` posisional lama tidak diterima lagi
 * (body strict → INVALID). T-016: pemilik, editor, dan viewer dashboard widget itu; peran dibaca
 * bersama widget sebelum cache/DuckDB dan menentukan bentuk jawaban (forRole).
 */
export async function runWidgetQuery(
  userId: string,
  body: unknown,
  deps: QueryDeps,
): Promise<WidgetModeResult> {
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
  const r = forRole(w.role, await widgetResult(userId, w, parsed.data, deps, t0));
  // Versi spec yang benar-benar dipakai (dibaca bersama widget), bukan bagian nilai cache hasil; juga
  // di jawaban gagal agar klien bisa membedakan error dari pengaturan lokal yang basi (R2 CL-2).
  return { ...r, widgetVersion: w.updatedAt.toISOString() };
}

/**
 * Rencana widget siap dijalankan, tanpa DuckDB: dipakai bersama query widget (/api/query) dan job
 * ekspor (T-017) agar aturan filter, remap, dan rencana persis sama dengan yang tampil di layar.
 */
export interface ResolvedWidget {
  ok: true;
  /** Versi aktif dataset yang dipakai (kunci cache hasil). */
  versionId: string;
  config: Exclude<WidgetConfig, { type: "empty" }>;
  sheet: {
    typedKey: string;
    schemaRevision: number;
    schema: ColumnSchema[];
    /** Manifest segmen (T-037): ekspor mengunduh semua file sumber. */
    segments?: SegmentFile[];
  };
  planned: Extract<WidgetPlan, { ok: true }>;
  /** Filter dashboard yang berlaku (klausa kanonik) + nama yang dilewati. */
  dash: { clauses: DashClause[]; skipped: string[] };
  /** Nama tampil kolom kosong (absent, T-014) yang dipakai widget. */
  absent: string[];
}

/**
 * Bagian query widget setelah otorisasi dan sebelum cache/DuckDB (diekstrak dari widgetResult, T-017):
 * izin kolom filter (D6), konfigurasi, sheet aktif + remap setelah ganti data, rencana widget, filter
 * dashboard, dan kolom absent. Gagal → kegagalan mentah (bentuk per peran di forRole pemanggil).
 * `deps.now` = jam preset tanggal (job ekspor memakai waktu permintaan).
 */
export async function resolveWidget(
  w: AuthorizedWidget,
  body: Pick<
    WidgetQueryBody,
    "dashboardFilters" | "page" | "sort" | "pivotFilters" | "pivotValues"
  >,
  deps: Pick<QueryDeps, "repo" | "now">,
): Promise<ResolvedWidget | QueryFailure> {
  const dashFilters = body.dashboardFilters ?? [];
  const sources = dashFilters.length ? await dashboardSources(w, deps.repo) : [];
  // Non-pemilik: kolom filter tersimpan yang kini hilang/disembunyikan (tipe null) tidak diizinkan —
  // jawabannya sama dengan nama yang tidak pernah jadi kolom filter (NOT_ALLOWED + petunjuk muat
  // ulang), jadi nama yang tidak dikirim ke halaman mereka tidak bisa dikonfirmasi lewat tebakan
  // (review T-016 R3 SEC-1). Pemilik tetap mendapat skippedFilters. Repo tanpa tipe (uji tanpa
  // filterSources): semua nama tersimpan tetap diizinkan.
  const typed = Boolean(w.dashboardId && deps.repo.filterSources);
  const allowed = sources
    .filter((x) => x.type !== null || w.role === "OWNER" || !typed)
    .map((x) => x.name);
  if (disallowedFilter(dashFilters, allowed)) return fail("INVALID", NOT_ALLOWED);
  const cfg = parseWidgetConfig(w.type, w.spec);
  if (!cfg.ok) return fail("INVALID", cfg.message);
  if (cfg.config.type === "empty") return fail("INVALID", "Widget ini belum diatur.");
  let config = cfg.config;
  if (!w.activeVersionId) return fail("NOT_READY", "Data dataset ini belum siap.");
  let sheet = await deps.repo.sheet(w.activeVersionId, config.spec.sheetId);
  // Spec di sheet aktif dengan penanda MISSING_COLUMN (disimpan saat aktivasi, T-013): nama kolom lama
  // dari catatan aktivasi, tanpa SQL. Tanpa catatan nama → pesan umum widgetPlan (juga tanpa SQL).
  const marked = sheet?.schema ? markerNames(config, sheet.schema, w.missingColumns ?? []) : [];
  if (marked.length) return fail("COLUMN_UNAVAILABLE", missingMessage(marked));
  if (!sheet && deps.repo.sheetHistory) {
    // Data diganti (versi baru aktif): petakan sheet + kolom lewat nama ke versi aktif.
    const h = await deps.repo.sheetHistory(w.datasetId, w.activeVersionId, config.spec.sheetId);
    // Sheet lama sudah dihapus retensi: kolom yang hilang tercatat saat aktivasi (T-013).
    if (!h && w.missingColumns?.length) {
      return fail("COLUMN_UNAVAILABLE", missingMessage(w.missingColumns));
    }
    const target = h ? matchSheet(h.old, h.active, h.oldSheetCount) : null;
    const fresh = target ? await deps.repo.sheet(w.activeVersionId, target.id) : null;
    if (h && target && fresh?.schema) {
      // Skema aktif segar (bukan dari cache riwayat): ganti nama kolom di skema langsung berlaku.
      const moved = remapConfig(
        config,
        h.old,
        { ...target, schema: fresh.schema },
        w.missingColumns ?? [],
      );
      if (moved.missing.length) return fail("COLUMN_UNAVAILABLE", missingMessage(moved.missing));
      config = moved.config;
      sheet = fresh;
    }
  }
  if (!sheet) {
    return fail(
      "SHEET_UNAVAILABLE",
      "Sheet yang dipakai widget ini tidak ada di data aktif. Atur ulang widget.",
    );
  }
  if (!sheet.typedKey || !sheet.schema) return fail("NOT_READY", "Sheet ini belum siap.");
  const planned = widgetPlan(config, sheet.schema, body);
  if (!planned.ok) return fail(planned.code, planned.message);
  const dash = dashFilters.length
    ? applyDashFilters(
        dashFilters,
        sheet.schema,
        deps.now?.() ?? new Date(),
        sourceFamilies(sources),
      )
    : { clauses: [] as DashClause[], skipped: [] as string[] };
  return {
    ok: true,
    versionId: w.activeVersionId,
    config,
    sheet: {
      typedKey: sheet.typedKey,
      schemaRevision: sheet.schemaRevision,
      schema: sheet.schema,
      ...(sheet.segments ? { segments: sheet.segments } : {}),
    },
    planned,
    dash,
    absent: absentNames(config, sheet.schema),
  };
}

/** Sisa query widget setelah otorisasi (hasil mentah; bentuk per peran di forRole). */
async function widgetResult(
  userId: string,
  w: AuthorizedWidget,
  body: WidgetQueryBody,
  deps: QueryDeps,
  t0: number,
): Promise<WidgetQueryResult> {
  const resolved = await resolveWidget(w, body, deps);
  if (!resolved.ok) return resolved;
  const { versionId, config, sheet, planned, dash, absent } = resolved;
  // Klausa kanonik (unik, terurut, preset sudah jadi tanggal) masuk kunci cache; tanpa filter
  // dashboard kunci tetap sama dengan sebelum T-012.
  const dashKey = dash.clauses.length ? dash.clauses : undefined;
  // Catatan per permintaan (bukan bagian hasil yang di-cache): filter yang dilewati + kolom kosong.
  const withNotes = <R extends WidgetQueryResult>(r: R): R =>
    r.ok && (dash.skipped.length || absent.length)
      ? {
          ...r,
          ...(dash.skipped.length ? { skippedFilters: dash.skipped } : {}),
          ...(absent.length ? { absent } : {}),
        }
      : r;

  const keyParts = {
    datasetId: w.datasetId,
    versionId,
    sheetId: config.spec.sheetId,
    schemaRevision: sheet.schemaRevision,
  };
  if (planned.kind === "pivot" && planned.pivot.list !== undefined) {
    return withNotes(
      await runPivotValues(
        userId,
        resultKey({
          ...keyParts,
          spec: { pivotValues: planned.spec, shape: planned.pivot, dash: dashKey },
        }),
        sourceOf(sheet),
        { ...planned.plan, dash: dash.clauses },
        planned.pivot,
        deps,
        t0,
      ),
    );
  }
  if (planned.kind === "pivot") {
    return withNotes(
      await runPivotPlan(
        userId,
        resultKey({
          ...keyParts,
          spec: { pivot: planned.spec, shape: planned.pivot, dash: dashKey },
        }),
        sourceOf(sheet),
        { ...planned.plan, dash: dash.clauses },
        planned.pivot,
        deps,
        t0,
      ),
    );
  }
  if (planned.kind === "agg") {
    return withNotes(
      await runAggPlan(
        userId,
        // Kunci berbeda dari query bebas dengan spec sama: hasil grafik membawa total (review T-011).
        resultKey({
          ...keyParts,
          spec: planned.plan.totals
            ? { chart: planned.spec, dash: dashKey }
            : { ...planned.spec, dash: dashKey },
        }),
        sourceOf(sheet),
        { ...planned.plan, dash: dash.clauses },
        deps,
        t0,
      ),
    );
  }

  const { sort, page } = planned;
  const plan = { ...planned.plan, dash: dash.clauses };
  const key = resultKey({ ...keyParts, spec: { table: planned.spec, sort, page, dash: dashKey } });
  const hit = deps.cache?.get(key);
  if (hit && "timeout" in hit) return fail("QUERY_TIMEOUT", timeoutMessage(deps.timeoutMs));
  if (hit && "total" in hit) {
    return withNotes({ ok: true, ...hit, cached: true, ms: Date.now() - t0 });
  }
  // Total (dengan filter) tidak bergantung pada urutan/halaman: disimpan terpisah agar pindah halaman
  // hanya menjalankan query halaman.
  const countKey = resultKey({
    ...keyParts,
    spec: { tableCount: planned.spec.filters, dash: dashKey },
  });
  const countHit = deps.cache?.get(countKey);
  const knownTotal =
    countHit && "rows" in countHit ? Number(countHit.rows[0]?.[0] ?? 0) : undefined;

  const r = await runOnParquet(userId, sourceOf(sheet), deps, async (path, exec) => {
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
  return withNotes({ ok: true, ...data, cached: false, ms: Date.now() - t0 });
}
