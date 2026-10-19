/*
 * Nilai slicer dashboard (T-012, B4): DISTINCT satu kolom filter dashboard dari sheet versi aktif, paling
 * banyak 1000 (+ penanda terpotong), dengan pencarian di server. Pemilik, editor, dan viewer dashboard
 * (T-016, dicek repo.filterSource tanpa cache sebelum cache/DuckDB); lainnya NOT_FOUND, sama dengan
 * dashboard yang tidak ada. Pesan kolom tidak tersedia tidak menyebut nama; bagi non-pemilik kolom filter
 * tersimpan yang tidak tersedia dijawab sama dengan nama yang bukan kolom filter (review T-016 R3
 * SEC-1). Berjalan di jatah query user yang sama dengan
 * widget (runOnParquet) dan di-cache seperti hasil query (kunci memuat versi + schemaRevision + kata
 * cari ternormalisasi; hasil > SLICER_CACHE_MAX_BYTES tidak di-cache). Permintaan yang dibatalkan klien
 * (ketikan berikutnya) tidak menjalankan DuckDB bila masih antre. Kata cari dan nilai tidak pernah
 * masuk log.
 */
import { z } from "zod";
import type { ColumnType } from "@/features/ingest/infer";
import { columnNamed, storedFilterColumns } from "@/features/dashboards/filter-columns";
import { normName } from "@/features/widgets/remap";
import { resultKey } from "./cache";
import type { DashValue } from "./filters";
import {
  fail,
  rowBytes,
  runOnParquet,
  sourceOf,
  timeoutMessage,
  TIMEOUT_CACHE_MS,
  toJson,
  type QueryDeps,
  type QueryFailure,
} from "./service";
import {
  FILTER_MONTHS_LIMIT,
  FILTER_VALUES_LIMIT,
  buildFilterMonthsSql,
  buildFilterValuesSql,
} from "./sql";

export const filterValuesBodySchema = z
  .object({
    /** Nama kolom filter dashboard (Dashboard.filterColumns). */
    column: z.string().min(1).max(200),
    /** Kata cari (mengandung); kosong = tanpa pencarian. */
    q: z.string().max(100).optional(),
    /** Sheet kolom filter, bila nama kolom yang sama dipilih dari lebih dari satu sheet. */
    sheet: z.string().min(1).max(200).optional(),
    /** Kolom tanggal: bulan yang ada di data ("YYYY-MM", terbaru dulu) untuk pilihan periode (T-9gs1). */
    months: z.literal(true).optional(),
  })
  .strict();

export type FilterValuesResult =
  { ok: true; type: ColumnType; values: DashValue[]; truncated: boolean } | QueryFailure;

/** Batas waktu satu daftar nilai (ketikan berikutnya membatalkan yang lama di klien). */
export const FILTER_VALUES_MAX_MS = 10_000;
/**
 * Daftar nilai lebih besar dari ini (perkiraan heap, rowBytes) tidak di-cache: 1000 teks panjang ≈ 2 MB
 * per entri akan mengusir hasil widget semua user dari cache bersama (review keamanan T-012).
 */
export const SLICER_CACHE_MAX_BYTES = 256 * 1024;

/**
 * Kata cari → bentuk baku untuk kunci cache DAN SQL (NFC, huruf kecil, tanpa aksen), sehingga "Jak",
 * "JAK", dan "Ják" berbagi satu entri dan hasilnya pasti sama. Kosong → null (tanpa pencarian).
 */
export function normalizeSearch(q: string | undefined): string | null {
  const s = (q ?? "")
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .normalize("NFC")
    .toLowerCase()
    .trim();
  return s || null;
}

const ID = /^[a-z0-9]{20,32}$/;

export async function runFilterValues(
  userId: string,
  dashboardId: string,
  body: unknown,
  deps: QueryDeps,
  signal?: AbortSignal,
): Promise<FilterValuesResult> {
  const parsed = filterValuesBodySchema.safeParse(body);
  if (!parsed.success) return fail("INVALID", "Permintaan nilai filter tidak valid.");
  if (!ID.test(dashboardId) || !deps.repo.filterSource) {
    return fail("NOT_FOUND", "Dashboard tidak ditemukan.");
  }
  const src = await deps.repo.filterSource(userId, dashboardId);
  if (!src) return fail("NOT_FOUND", "Dashboard tidak ditemukan.");
  const { column, sheet: sheetName } = parsed.data;
  const entry = storedFilterColumns(src.filterColumns).find(
    (f) =>
      normName(f.column) === normName(column) &&
      (sheetName === undefined || normName(f.sheet) === normName(sheetName)),
  );
  // Petunjuk muat ulang untuk SEMUA pemanggil, seperti NOT_ALLOWED query widget: kolom yang baru
  // dikeluarkan dari pengaturan atau disembunyikan saat halaman terbuka dijawab sama dengan nama asing
  // (review T-016 R4 CC-1).
  const notFilter = () =>
    fail(
      "INVALID",
      "Kolom ini bukan kolom filter dashboard. Muat ulang halaman bila pengaturan dashboard baru diubah.",
    );
  if (!entry) return notFilter();
  // Non-pemilik tidak menerima nama kolom filter yang tidak tersedia di versi aktif (getDashboard):
  // kolom hilang/disembunyikan, sheet belum siap, atau dataset tanpa data dijawab persis seperti nama
  // yang bukan kolom filter, sehingga tebakan nama tidak terkonfirmasi (review T-016 R3 SEC-1).
  // Pemilik tetap mendapat pesan rinci untuk diperbaiki.
  const owner = src.role === "OWNER";
  if (!src.activeVersionId) {
    return owner ? fail("NOT_READY", "Data dataset ini belum siap.") : notFilter();
  }
  const target = src.sheets.find((s) => normName(s.name) === normName(entry.sheet));
  const sheet = target ? await deps.repo.sheet(src.activeVersionId, target.id) : null;
  const col = sheet?.schema ? columnNamed(sheet.schema, entry.column) : undefined;
  if (!target || !sheet || !sheet.typedKey || !col || col.hidden) {
    if (!owner) return notFilter();
    return sheet && !sheet.typedKey
      ? fail("NOT_READY", "Sheet ini belum siap.")
      : fail("COLUMN_UNAVAILABLE", "Kolom filter ini tidak ada atau disembunyikan di data aktif.");
  }

  const months = parsed.data.months === true;
  if (months && col.type !== "date" && col.type !== "timestamp") {
    return fail("INVALID", "Pilihan periode hanya untuk kolom tanggal.");
  }
  const q = months ? null : normalizeSearch(parsed.data.q);
  // Batas waktu lebih pendek dari query widget (pesan timeout ikut menyebut batas ini).
  const limited = { ...deps, timeoutMs: Math.min(deps.timeoutMs, FILTER_VALUES_MAX_MS), signal };
  const key = resultKey({
    datasetId: src.datasetId,
    versionId: src.activeVersionId,
    sheetId: target.id,
    schemaRevision: sheet.schemaRevision,
    spec: { filterValues: `c${col.pos}`, q, ...(months ? { months } : {}) },
  });
  const hit = deps.cache?.get(key);
  if (hit && "timeout" in hit) return fail("QUERY_TIMEOUT", timeoutMessage(limited.timeoutMs));
  if (hit && "filterValues" in hit) {
    return { ok: true, type: col.type, values: hit.filterValues, truncated: hit.truncated };
  }

  const source = sourceOf({
    typedKey: sheet.typedKey,
    // col ditemukan di skema → skema ada.
    schema: sheet.schema ?? [],
    segments: sheet.segments,
  });
  const r = await runOnParquet(userId, source, limited, (path, exec) =>
    exec(
      months
        ? buildFilterMonthsSql(`c${col.pos}`, path)
        : buildFilterValuesSql({ col: `c${col.pos}`, type: col.type, float: col.float }, q, path),
    ),
  );
  if (!r.ok) {
    if (r.code === "QUERY_TIMEOUT") deps.cache?.set(key, { timeout: true }, 64, TIMEOUT_CACHE_MS);
    return r;
  }
  const all = r.value.rows.map((row) => toJson(row[0], col.type) as DashValue);
  const limit = months ? FILTER_MONTHS_LIMIT : FILTER_VALUES_LIMIT;
  const truncated = all.length > limit;
  const values = all.slice(0, limit);
  const bytes = values.reduce<number>((n, v) => n + rowBytes([v]), 64);
  if (bytes <= SLICER_CACHE_MAX_BYTES)
    deps.cache?.set(key, { filterValues: values, truncated }, bytes);
  return { ok: true, type: col.type, values, truncated };
}
