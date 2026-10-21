/*
 * Layanan jendela baris "Lihat data" (T-041): akses pemilik/editor, cek versi, lalu jendela baris atau
 * satu sel. Dependensi diinjeksi (repo + mesin query + cache parquet) agar bisa diuji tanpa layanan;
 * perakitan produksi di grid-http.ts. Body jawaban gagal tidak pernah memuat nama kolom/sheet.
 */
import type { ColumnSchema } from "@/features/ingest/infer";
import { periodLabel, type PeriodGrain } from "@/features/ingest/period";
import {
  buildGridCountSql,
  buildGridStatsSql,
  buildRawCellSql,
  buildSortedWindowSql,
  buildTypedCellSql,
  buildWindowSql,
  GRID_SEARCH_MAX_MS,
  GRID_VALUES_MAX_MS,
  isPlainWindow,
  planGrid,
  rawColumn,
  rowsBodySchema,
  statsBodySchema,
  valuesBodySchema,
  windowParts,
  type GridPlan,
} from "./grid";
import { resultKey, type ResultCache } from "./cache";
import { normalizeSearch, SLICER_CACHE_MAX_BYTES } from "./filter-values";
import type { DashValue } from "./filters";
import {
  fail,
  RESULT_MAX_BYTES,
  rowBytes,
  runOnParquet,
  toJson,
  type CachedQuery,
  type QueryDeps,
  type QueryFailure,
} from "./service";
import {
  orderChunkRows,
  orderKey,
  orderWindow,
  scheduleOrder,
  usesOrderCache,
  type GridOrder,
} from "./grid-order";
import type { OrderMeta } from "./order-cache";
import { buildFilterValuesSql, FILTER_VALUES_LIMIT } from "./sql";
import { sheetSource, type ParquetSource, type SegmentFile, type SourcePeriod } from "./source";

/** File typed di manifest + data segmennya (jumlah baris, raw, peta kolom, nama file sumber). */
export interface GridSegment extends SegmentFile {
  /** Baris data di file typed; null = file lama (belum diukur) → jalur umum. */
  dataRows: number | null;
  rowBase: number;
  maxSrcRow: number | null;
  rawKey: string;
  colMap: number[];
  fileName: string | null;
}

/**
 * Sheet periode: segmen diurutkan menurut awal periode (stabil, lalu ordinal) — satu segmen per periode,
 * baris di file urut `_row`, jadi urutan jalur 1 grid/ekspor = (_period, _row) (T-058).
 */
export const byPeriod = (segs: GridSegment[]): GridSegment[] =>
  segs
    .map((s, i) => ({ s, i }))
    .sort((a, b) => {
      const x = a.s.period?.start ?? "";
      const y = b.s.period?.start ?? "";
      return x < y ? -1 : x > y ? 1 : a.i - b.i;
    })
    .map(({ s }) => s);

/** Peran yang boleh membuka "Lihat data": pemilik dataset atau editor dashboard-nya. */
export type GridRole = "OWNER" | "EDITOR";

export interface GridSheet {
  versionId: string;
  versionStatus: string;
  activeVersionId: string | null;
  /** Peran peminta pada dataset sheet ini (null = tidak ada akses atau hanya viewer). */
  role: GridRole | null;
  /** Dataset sheet ini (AuditLog ekspor tampilan, T-046). */
  datasetId?: string;
  /** "<dataset> - <sheet>" untuk nama file ekspor tampilan (T-046). */
  title?: string;
  typedKey: string | null;
  rawKey: string;
  fileName: string | null;
  schemaRevision: number;
  schema: ColumnSchema[] | null;
  /** Urut manifest; sheet periode: urut awal periode (= urutan (_period, _row) jalur 1). */
  segments: GridSegment[];
  /** Sheet periode (T-058): kolom periode + satuan (label sumber sel, pemilih periode). */
  period?: (SourcePeriod & { grain: PeriodGrain }) | null;
}

export interface GridRepo {
  /** Sheet + peran peminta (satu kali baca, tanpa cache); null = sheet tidak ada. */
  sheet(userId: string, sheetId: string): Promise<GridSheet | null>;
}

/**
 * `cache` (T-042): cache hasil bersama, HANYA untuk count (total/filteredTotal) — blok baris tidak pernah
 * masuk (G-6 §3.4 isolasi beban).
 */
export type GridDeps = Omit<QueryDeps, "repo" | "cache"> & {
  repo: GridRepo;
  cache?: ResultCache<CachedQuery> | null;
  /** Cache urutan (T-062): jalur urut/cari membaca permutasi + potongan terurut; null = mati. */
  order?: GridOrder | null;
};

/**
 * Count jalur urut/saring di cache hasil: kunci = sheet + versi + revisi skema + saringan + cari +
 * periode terpilih (T-058).
 */
function countKey(sheetId: string, sheet: GridSheet, plan: GridPlan, period: string[]) {
  return resultKey({
    datasetId: "grid-count",
    versionId: sheet.versionId,
    sheetId,
    schemaRevision: sheet.schemaRevision,
    spec: { clauses: plan.clauses, search: plan.search, ...(period.length ? { period } : {}) },
  });
}

/** Kunci periode terpilih yang baku (unik, terurut) untuk kunci cache. */
const periodKeys = (keys: string[] | undefined): string[] => [...new Set(keys ?? [])].sort();

/**
 * Pemilih periode "Lihat data" (T-058): batasi manifest ke periode terpilih (satu segmen = satu periode
 * per sheet, jadi tanpa WHERE dan total = baris periode di metadata). Kosong = semua. Sheet non-periode
 * atau kunci yang tidak ada di manifest → INVALID tanpa query.
 */
export function scopePeriods<S extends GridSheet>(
  sheet: S,
  keys: string[] | undefined,
): { ok: true; sheet: S } | GridFailure {
  if (!keys?.length) return { ok: true, sheet };
  if (!sheet.period) return invalid("Sheet ini tidak menyimpan data per periode.");
  const want = new Set(keys);
  const segments = sheet.segments.filter((s) => s.period && want.has(s.period.key));
  if (new Set(segments.map((s) => s.period!.key)).size !== want.size) {
    return invalid("Periode yang dipilih tidak ada di data ini. Muat ulang halaman.");
  }
  return { ok: true, sheet: { ...sheet, segments } };
}

/**
 * Versi non-aktif yang boleh dipratinjau pemiliknya (G-6 §3.4). Status AWAITING_CONFIRM datang bersama
 * unggahan periode (Bagian B); sampai ada, tidak ada versi non-aktif yang lolos.
 */
export const PREVIEW_STATUSES: readonly string[] = ["AWAITING_CONFIRM"];

export type GridCode = "FORBIDDEN" | "VERSION_CHANGED" | QueryFailure["code"];
export type GridFailure = {
  ok: false;
  code: GridCode;
  message: string;
  activeVersionId?: string | null;
};

const forbidden = (): GridFailure => ({
  ok: false,
  code: "FORBIDDEN",
  message: "Anda tidak punya akses ke data ini.",
});
const invalid = (message = "Permintaan tidak valid."): GridFailure => ({
  ok: false,
  code: "INVALID",
  message,
});

export interface GridRow {
  /** Nomor baris di tampilan (1-based). */
  n: number;
  _row: number;
  cells: unknown[];
  /** Indeks sel (dalam `cols`) yang teksnya dipotong. */
  cut: number[];
}

export interface GridRows {
  ok: true;
  versionId: string;
  schemaRevision: number;
  total: number;
  filteredTotal: number;
  rows: GridRow[];
}

/**
 * Akses + versi: pemilik/editor saja (viewer, pengguna asing, dan sheet tak dikenal → FORBIDDEN yang
 * sama). versionId harus versi sheet dan versi aktif; pengecualian: pemilik pada versi pratinjau.
 */
export async function authorizeGrid(
  userId: string,
  sheetId: string,
  versionId: string,
  repo: GridRepo,
): Promise<{ ok: true; sheet: GridSheet & { schema: ColumnSchema[] } } | GridFailure> {
  const sheet = await repo.sheet(userId, sheetId);
  if (!sheet || !sheet.role) return forbidden();
  const preview =
    sheet.role === "OWNER" &&
    sheet.versionId === versionId &&
    PREVIEW_STATUSES.includes(sheet.versionStatus);
  const current = sheet.versionId === versionId && versionId === sheet.activeVersionId;
  if (!current && !preview) {
    return {
      ok: false,
      code: "VERSION_CHANGED",
      message: "Data sudah diperbarui. Muat ulang untuk melihat versi terbaru.",
      activeVersionId: sheet.activeVersionId,
    };
  }
  if (!sheet.typedKey || !sheet.schema) {
    return { ok: false, code: "NOT_READY", message: "Data sheet ini belum siap." };
  }
  if (!uniqueRowSpace(sheet.segments)) {
    return { ok: false, code: "QUERY_FAILED", message: "Data sheet ini tidak bisa ditampilkan." };
  }
  return { ok: true, sheet: { ...sheet, schema: sheet.schema } };
}

/**
 * `_row` unik per sheet hanya bila rentang segmen tidak bertumpuk: segmen legacy (`_row` = baris fisik,
 * rowBase 0) hanya ada satu per sheet (migrasi T-036, ordinal 0), segmen baru punya rowBase unik dari
 * rowHighWater (≥ 2^31 − 1 untuk lineage hasil migrasi). Manifest yang melanggar ditolak, bukan dibaca
 * dengan `_row` ganda (jendela berurut dan GET …/cell bisa salah file).
 */
export function uniqueRowSpace(segs: GridSegment[]): boolean {
  const bases = segs.map((s) => (s.legacyRow ? 0 : s.rowBase));
  return new Set(bases).size === bases.length;
}

/** Satu-satunya segmen yang bisa memuat `_row` ini: rowBase terbesar di bawahnya (rentang disjoint). */
export function segmentForRow(segs: GridSegment[], row: number): GridSegment | null {
  let best: GridSegment | null = null;
  for (const s of segs) {
    const base = s.legacyRow ? 0 : s.rowBase;
    if (row <= base || (s.maxSrcRow !== null && row > base + s.maxSrcRow)) continue;
    if (!best || base > (best.legacyRow ? 0 : best.rowBase)) best = s;
  }
  return best;
}

export const asFiles = (segs: GridSegment[]): SegmentFile[] =>
  segs.map(({ typedKey, legacyRow, columns, period }) => ({
    typedKey,
    legacyRow,
    columns,
    ...(period ? { period } : {}),
  }));

/** Sumber jalur 2 (urut/saring/cari): sheet periode membawa `_period` (urutan, T-058). */
export function sourceFor(sheet: GridSheet & { schema: ColumnSchema[] }, segs: GridSegment[]) {
  return sheetSource({
    typedKey: sheet.typedKey!,
    schema: sheet.schema,
    segments: asFiles(segs),
    period: sheet.period ? { column: sheet.period.column } : null,
  });
}

/** Baris DuckDB (`_row`, v0, [k0], v1, …) → GridRow. */
function toRows(plan: GridPlan, rows: unknown[][], start: number): GridRow[] | null {
  let bytes = 0;
  const out: GridRow[] = [];
  for (const [i, r] of rows.entries()) {
    let k = 1;
    const cells: unknown[] = [];
    const cut: number[] = [];
    plan.cols.forEach((c, j) => {
      cells.push(toJson(r[k++], c.type));
      if (c.type === "text" && r[k++] === true) cut.push(j);
    });
    bytes += rowBytes(cells);
    if (bytes > RESULT_MAX_BYTES) return null;
    out.push({ n: start + i + 1, _row: Number(r[0]), cells, cut });
  }
  return out;
}

const tooLarge = () =>
  fail("RESULT_TOO_LARGE", "Blok baris terlalu besar. Kurangi jumlah baris atau kolom.");

/** Pesan batas waktu jalur urut/saring/cari (T-044 AC3–4): sebut penyebab yang bisa ditindak. */
export const SORT_TIMEOUT_MESSAGE = "Pengurutan ini terlalu berat; saring data dulu.";
export const SEARCH_TIMEOUT_MESSAGE =
  "Pencarian melewati 10 detik. Persempit kata yang dicari atau saring data dulu.";
export const FILTER_TIMEOUT_MESSAGE =
  "Saringan ini terlalu berat untuk dihitung. Persempit saringan lalu coba lagi.";

function timeoutFor(plan: GridPlan, f: QueryFailure): QueryFailure {
  if (f.code !== "QUERY_TIMEOUT") return f;
  const message = plan.search
    ? SEARCH_TIMEOUT_MESSAGE
    : plan.sort.length
      ? SORT_TIMEOUT_MESSAGE
      : FILTER_TIMEOUT_MESSAGE;
  return { ...f, message };
}

/** POST /api/sheets/:sheetId/rows. */
export async function runGridRows(
  userId: string,
  sheetId: string,
  body: unknown,
  deps: GridDeps,
): Promise<GridRows | GridFailure> {
  const parsed = rowsBodySchema.safeParse(body);
  if (!parsed.success) return invalid();
  const auth = await authorizeGrid(userId, sheetId, parsed.data.versionId, deps.repo);
  // Versi/revisi berganti (T-062 AC2): entri cache urutan sheet ini yang lama dibuang.
  if (!auth.ok) {
    if (auth.code === "VERSION_CHANGED") deps.order?.cache.invalidate(sheetId, null);
    return auth;
  }
  deps.order?.cache.invalidate(sheetId, auth.sheet.versionId, auth.sheet.schemaRevision);
  const scoped = scopePeriods(auth.sheet, parsed.data.period);
  if (!scoped.ok) return scoped;
  const { sheet } = scoped;
  const period = periodKeys(parsed.data.period);
  const planned = planGrid(
    parsed.data,
    sheet.schema,
    (deps.now ?? (() => new Date()))(),
    !!sheet.period,
  );
  if (!planned.ok) return invalid(planned.message);
  const { plan } = planned;
  const segs = sheet.segments;
  const counts = segs.map((s) => s.dataRows);
  const known = segs.length > 0 && counts.every((n): n is number => n !== null);
  const total = known ? counts.reduce((a, b) => a + b, 0) : null;
  const head = {
    ok: true as const,
    versionId: sheet.versionId,
    schemaRevision: sheet.schemaRevision,
  };

  if (known && isPlainWindow(plan)) {
    // Jalur 1: hanya segmen yang beririsan disewa.
    const parts = windowParts(counts, plan.rowStart, plan.rowCount);
    if (parts.length === 0) return { ...head, total: total!, filteredTotal: total!, rows: [] };
    const used = parts.map((p) => segs[p.seg]!);
    const key: ParquetSource =
      used.length === 1 ? used[0]!.typedKey : { files: asFiles(used), schema: sheet.schema };
    const r = await runOnParquet(userId, key, deps, (_p, exec, paths) =>
      exec(
        buildWindowSql(
          parts.map((p, k) => ({ ...p, seg: k })),
          asFiles(used),
          paths,
          plan.cols,
        ),
      ),
    );
    if (!r.ok) return r;
    const rows = toRows(plan, r.value.rows, plan.rowStart);
    if (!rows) return tooLarge();
    return { ...head, total: total!, filteredTotal: total!, rows };
  }

  // Jalur 2: urut/saring/cari (atau jumlah baris segmen belum diketahui).
  // Cari dibatasi GRID_SEARCH_MAX_MS (AC3); urut/saring memakai batas query biasa (QUERY_TIMEOUT_MS).
  const limited = plan.search
    ? { ...deps, timeoutMs: Math.min(deps.timeoutMs, GRID_SEARCH_MAX_MS) }
    : deps;
  const source = sourceFor(sheet, segs);
  const cached = deps.order && usesOrderCache(plan) ? deps.order : null;
  const meta: OrderMeta = {
    sheetId,
    versionId: sheet.versionId,
    schemaRevision: sheet.schemaRevision,
    typedKeys: segs.map((s) => s.typedKey),
  };
  const okey = cached ? orderKey(meta, plan, period) : null;
  if (cached && okey) {
    const w = await orderWindow(userId, okey, plan, source, cached, limited);
    if (w && !w.ok) return timeoutFor(plan, w);
    if (w) {
      const rows = toRows(plan, w.rows, plan.rowStart);
      if (!rows) return tooLarge();
      return { ...head, total: w.total, filteredTotal: w.filteredTotal, rows };
    }
  }
  const filtered = !isPlainWindow(plan);
  const ck = deps.cache ? countKey(sheetId, sheet, plan, period) : null;
  const hit = ck ? deps.cache!.get(ck) : null;
  const known2 = hit && "gridCount" in hit ? hit.gridCount : null;
  const r = await runOnParquet(userId, source, limited, async (path, exec) => {
    const out = await exec(buildSortedWindowSql(plan, path));
    if (known2) return { out, ...known2 };
    const n = await exec(buildGridCountSql(filtered ? plan : null, path));
    const all =
      total ?? (filtered ? Number((await exec(buildGridCountSql(null, path))).rows[0]![0]) : null);
    const filteredTotal = Number(n.rows[0]![0]);
    return { out, filteredTotal, total: all ?? filteredTotal };
  });
  if (!r.ok) return timeoutFor(plan, r);
  const { total: t, filteredTotal } = r.value;
  // Hanya count yang di-cache (beberapa puluh byte); blok baris tidak.
  if (ck && !known2) deps.cache!.set(ck, { gridCount: { total: t, filteredTotal } }, 64);
  // Blok berikutnya dari cache urutan: permutasi dibangun di belakang (tidak ditunggu).
  if (cached && okey) {
    const visible = sheet.schema.filter((c) => !c.hidden).length;
    scheduleOrder(
      okey,
      meta,
      plan,
      source,
      { filteredTotal, total: t },
      cached.chunkRows ?? orderChunkRows(visible),
      cached,
    );
  }
  const rows = toRows(plan, r.value.out.rows, plan.rowStart);
  if (!rows) return tooLarge();
  return { ...head, total: t, filteredTotal, rows };
}

export interface GridCell {
  ok: true;
  versionId: string;
  _row: number;
  pos: number;
  /** Nilai typed penuh (teks ≤ 32.767 karakter, batas ingest). */
  value: unknown;
  /** Isi asli dari file bila sel gagal dibaca sebagai tipenya (typed NULL, raw berisi); selain itu null. */
  raw: string | null;
  castFailed: boolean;
  source: { fileName: string | null; srcRow: number; period: string | null };
}

const ROW_PARAM = /^\d{1,15}$/;
const POS_PARAM = /^\d{1,6}$/;

/** GET /api/sheets/:sheetId/cell?versionId&row&pos — `row` = `_row` (identitas baris, bukan nomor tampil). */
export async function runGridCell(
  userId: string,
  sheetId: string,
  q: { versionId: string | null; row: string | null; pos: string | null },
  deps: GridDeps,
): Promise<GridCell | GridFailure> {
  if (
    !q.versionId ||
    !/^[a-z0-9]{20,32}$/.test(q.versionId) ||
    !ROW_PARAM.test(q.row ?? "") ||
    !POS_PARAM.test(q.pos ?? "")
  ) {
    return invalid();
  }
  const row = Number(q.row);
  const pos = Number(q.pos);
  const auth = await authorizeGrid(userId, sheetId, q.versionId, deps.repo);
  if (!auth.ok) return auth;
  const { sheet } = auth;
  const col = sheet.schema.find((c) => c.pos === pos && !c.hidden);
  if (!col) return invalid("Kolom yang diminta tidak tersedia.");
  // Sheet tanpa manifest: satu typed + raw sheet (peta kolom identitas).
  const segs: GridSegment[] = sheet.segments.length
    ? sheet.segments
    : [
        {
          typedKey: sheet.typedKey!,
          legacyRow: true,
          columns: [],
          dataRows: null,
          rowBase: 0,
          maxSrcRow: null,
          rawKey: sheet.rawKey,
          colMap: [],
          fileName: sheet.fileName,
        },
      ];
  // Segmen baru: _row = rowBase + baris fisik; legacy: _row = fisik. Paling banyak satu file disewa.
  const found = segmentForRow(segs, row);
  for (const seg of found ? [found] : []) {
    const t = await runOnParquet(userId, seg.typedKey, deps, (path, exec) =>
      exec(buildTypedCellSql(seg, col, path, row)),
    );
    if (!t.ok) return t;
    const hit = t.value.rows[0];
    if (!hit) continue;
    const srcRow = Number(hit[0]);
    const value = toJson(hit[1], col.type);
    let raw: string | null = null;
    const rc = rawColumn(seg.colMap, pos);
    // Kolom yang tidak ada di file typed segmen ini = NULL sah, bukan gagal cast.
    const inFile = seg.columns.length === 0 || seg.columns.includes(pos);
    if (value === null && rc > 0 && inFile) {
      const r = await runOnParquet(userId, seg.rawKey, deps, (path, exec) =>
        exec(buildRawCellSql(rc, path, srcRow)),
      );
      if (!r.ok) return r;
      const v = r.value.rows[0]?.[0];
      raw = typeof v === "string" && v.trim() !== "" ? v : null;
    }
    return {
      ok: true,
      versionId: sheet.versionId,
      _row: row,
      pos,
      value,
      raw,
      castFailed: raw !== null,
      source: {
        fileName: seg.fileName,
        srcRow,
        period:
          sheet.period && seg.period ? periodLabel(sheet.period.grain, seg.period.start) : null,
      },
    };
  }
  return { ok: false, code: "NOT_FOUND", message: "Baris tidak ditemukan." };
}

export interface GridValues {
  ok: true;
  versionId: string;
  values: DashValue[];
  truncated: boolean;
}

/**
 * POST /api/sheets/:sheetId/values (T-044): nilai unik satu kolom terlihat untuk menu saring (≤ 1.000 +
 * penanda terpotong, cari tidak peka besar/kecil dan aksen) — SQL yang sama dengan slicer dashboard.
 * Akses dan versi sama dengan jendela baris; batas waktu GRID_VALUES_MAX_MS. Daftar kecil di-cache
 * (kunci memuat versi + revisi skema + kata cari baku) seperti ringkasan; blok baris tetap tidak.
 */
export async function runGridValues(
  userId: string,
  sheetId: string,
  body: unknown,
  deps: GridDeps,
): Promise<GridValues | GridFailure> {
  const parsed = valuesBodySchema.safeParse(body);
  if (!parsed.success) return invalid();
  const auth = await authorizeGrid(userId, sheetId, parsed.data.versionId, deps.repo);
  if (!auth.ok) return auth;
  const scoped = scopePeriods(auth.sheet, parsed.data.period);
  if (!scoped.ok) return scoped;
  const { sheet } = scoped;
  const col = sheet.schema.find((c) => c.pos === parsed.data.pos && !c.hidden);
  if (!col) return invalid("Kolom yang diminta tidak tersedia.");
  const q = normalizeSearch(parsed.data.q);
  const period = periodKeys(parsed.data.period);
  const key = deps.cache
    ? resultKey({
        datasetId: "grid-values",
        versionId: sheet.versionId,
        sheetId,
        schemaRevision: sheet.schemaRevision,
        spec: { filterValues: `c${col.pos}`, q, ...(period.length ? { period } : {}) },
      })
    : null;
  const hit = key ? deps.cache!.get(key) : null;
  const head = { ok: true as const, versionId: sheet.versionId };
  if (hit && "filterValues" in hit) {
    return { ...head, values: hit.filterValues, truncated: hit.truncated };
  }
  const limited = { ...deps, timeoutMs: Math.min(deps.timeoutMs, GRID_VALUES_MAX_MS) };
  const r = await runOnParquet(userId, sourceFor(sheet, sheet.segments), limited, (path, exec) =>
    exec(buildFilterValuesSql({ col: `c${col.pos}`, type: col.type, float: col.float }, q, path)),
  );
  if (!r.ok) {
    return r.code === "QUERY_TIMEOUT"
      ? { ...r, message: "Daftar nilai terlalu berat. Ketik kata untuk mempersempit." }
      : r;
  }
  const all = r.value.rows.map((row) => toJson(row[0], col.type) as DashValue);
  const truncated = all.length > FILTER_VALUES_LIMIT;
  const values = all.slice(0, FILTER_VALUES_LIMIT);
  const bytes = values.reduce<number>((n, v) => n + rowBytes([v]), 64);
  if (key && bytes <= SLICER_CACHE_MAX_BYTES) {
    deps.cache!.set(key, { filterValues: values, truncated }, bytes);
  }
  return { ...head, values, truncated };
}

export interface GridStats {
  ok: true;
  versionId: string;
  /** Sel terisi (KPI "Jumlah terisi"). */
  count: number;
  /** coalesce(sum, 0) seperti KPI "Total"; tipe = tipe kolom. */
  sum: number | null;
  avg: number | null;
  min: number | null;
  max: number | null;
}

const NUMERIC_TYPES: readonly string[] = ["integer", "decimal", "duration"];
export const STATS_TIMEOUT_MESSAGE =
  "Ringkasan kolom terlalu berat dihitung. Persempit saringan lalu coba lagi.";

/**
 * POST /api/sheets/:sheetId/stats (T-045 AC4): Jumlah, Rata-rata, Min, Maks, Hitung satu kolom angka
 * terlihat atas SELURUH baris tersaring (bukan blok yang dimuat), dengan ekspresi agregat widget KPI.
 * Akses/versi sama dengan jendela baris; ringkasan kecil di-cache (kunci: versi + revisi + saringan +
 * cari), blok baris tetap tidak.
 */
export async function runGridStats(
  userId: string,
  sheetId: string,
  body: unknown,
  deps: GridDeps,
): Promise<GridStats | GridFailure> {
  const parsed = statsBodySchema.safeParse(body);
  if (!parsed.success) return invalid();
  const auth = await authorizeGrid(userId, sheetId, parsed.data.versionId, deps.repo);
  if (!auth.ok) return auth;
  const scoped = scopePeriods(auth.sheet, parsed.data.period);
  if (!scoped.ok) return scoped;
  const { sheet } = scoped;
  const { pos, filters, search } = parsed.data;
  const period = periodKeys(parsed.data.period);
  const planned = planGrid(
    { versionId: parsed.data.versionId, rowStart: 0, rowCount: 1, cols: [pos], filters, search },
    sheet.schema,
    (deps.now ?? (() => new Date()))(),
  );
  if (!planned.ok) return invalid(planned.message);
  const col = planned.plan.cols[0]!;
  if (!NUMERIC_TYPES.includes(col.type)) return invalid("Ringkasan hanya untuk kolom angka.");
  const key = deps.cache
    ? resultKey({
        datasetId: "grid-stats",
        versionId: sheet.versionId,
        sheetId,
        schemaRevision: sheet.schemaRevision,
        spec: {
          stats: col.pos,
          clauses: planned.plan.clauses,
          search: planned.plan.search,
          ...(period.length ? { period } : {}),
        },
      })
    : null;
  const head = { ok: true as const, versionId: sheet.versionId };
  const hit = key ? deps.cache!.get(key) : null;
  if (hit && "gridStats" in hit) return { ...head, ...hit.gridStats };
  const limited = planned.plan.search
    ? { ...deps, timeoutMs: Math.min(deps.timeoutMs, GRID_SEARCH_MAX_MS) }
    : deps;
  const r = await runOnParquet(userId, sourceFor(sheet, sheet.segments), limited, (path, exec) =>
    exec(buildGridStatsSql(planned.plan, col, path)),
  );
  if (!r.ok) return r.code === "QUERY_TIMEOUT" ? { ...r, message: STATS_TIMEOUT_MESSAGE } : r;
  const row = r.value.rows[0] ?? [];
  const num = (v: unknown, type: Parameters<typeof toJson>[1]) => {
    const j = toJson(v, type);
    return j === null || j === undefined ? null : Number(j);
  };
  // avg bilangan bulat = desimal (sama dengan kolom keluaran KPI).
  const stats = {
    count: num(row[0], "count") ?? 0,
    sum: num(row[1], col.type),
    avg: num(row[2], col.type === "integer" ? "decimal" : col.type),
    min: num(row[3], col.type),
    max: num(row[4], col.type),
  };
  if (key) deps.cache!.set(key, { gridStats: stats }, 128);
  return { ...head, ...stats };
}
