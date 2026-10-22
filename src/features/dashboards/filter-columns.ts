/*
 * Kolom filter dashboard (T-012, D6): Dashboard.filterColumns = [{ sheet, column }] dengan nama tampil
 * (bukan id sheet/posisi kolom, sehingga tetap berlaku setelah data diganti — dicocokkan lewat nama
 * seperti widgets/remap.ts). Pengguna dashboard hanya boleh memfilter kolom ini ditambah dimensi grafik
 * yang cross-filter-nya aktif. Satu nama kolom = satu kontrol filter: nama yang sama dari sheet lain
 * ditolak. Murni (tanpa I/O) — dipakai server dan pengaturan dashboard di klien.
 * Filter bawaan (T-vb7q): entri boleh membawa `default` (bentuk filter yang sama dengan
 * dashboardFilters /api/query) yang aktif saat dashboard dibuka tanpa ?f=. Tanpa migrasi (JSON).
 */
import { z } from "zod";
import type { ColumnSchema, ColumnType } from "@/features/ingest/infer";
import { dashFilterSchema, typeFamily, type DashFilter } from "@/features/query/filters";
import { normName } from "@/features/widgets/remap";
import { crossFilterPositions, parseWidgetConfig } from "@/features/widgets/spec";

export const FILTER_COLUMNS_MAX = 8;

/** Nilai terpilih maksimum filter bawaan (bawaan disimpan di baris Dashboard, bukan di URL). */
export const DEFAULT_VALUES_MAX = 100;

export const filterColumnSchema = z
  .object({
    sheet: z.string().min(1).max(200),
    column: z.string().min(1).max(200),
    default: dashFilterSchema.optional(),
  })
  .strict();
export type FilterColumn = z.infer<typeof filterColumnSchema>;

export interface FilterColumnView {
  /** Stabil antarversi data: nama sheet + "\u0000" + nama kolom, keduanya ternormalisasi. */
  key: string;
  sheet: string;
  column: string;
  /** Tipe di versi aktif; "text" (netral) bila tidak tersedia. */
  type: ColumnType;
  /** Kolom ada dan tidak disembunyikan di versi data aktif. */
  available: boolean;
  /** Kolom sistem Periode (T-058): preset "Periode terbaru" ditawarkan. */
  period?: true;
  /** Filter bawaan (T-vb7q), kolomnya = nama `column` di atas. */
  default?: DashFilter;
}

/** Kolom sumber filter dashboard + tipenya di versi aktif (null = tidak ada/disembunyikan). */
export interface FilterSourceColumn {
  name: string;
  type: ColumnType | null;
}

/** Sheet versi aktif (nama + skema) untuk mencocokkan kolom filter. */
export interface ActiveSheet {
  id: string;
  name: string;
  schema: ColumnSchema[] | null;
}

export const filterColumnKey = (sheet: string, column: string) =>
  `${normName(sheet)}\u0000${normName(column)}`;

/**
 * Isi Dashboard.filterColumns dari DB, toleran: entri rusak dibuang, nama kolom yang sudah ada (dari
 * sheet mana pun) dibuang — satu kontrol per nama —, paling banyak 8.
 */
export function storedFilterColumns(json: unknown): FilterColumn[] {
  if (!Array.isArray(json)) return [];
  const out = new Map<string, FilterColumn>();
  for (const item of json) {
    // Bawaan rusak tidak membuang kolomnya: kolom tetap, tanpa bawaan.
    const full = filterColumnSchema.safeParse(item);
    const p = full.success
      ? full
      : filterColumnSchema.safeParse({ ...(item as object), default: undefined });
    if (!p.success) continue;
    const key = normName(p.data.column);
    if (!out.has(key)) out.set(key, p.data);
  }
  return [...out.values()].slice(0, FILTER_COLUMNS_MAX);
}

const sheetNamed = <S extends { name: string }>(sheets: S[], name: string) =>
  sheets.find((s) => normName(s.name) === normName(name));

/** Kolom bernama itu di skema; yang tidak disembunyikan didahulukan. */
export function columnNamed(schema: ColumnSchema[], name: string): ColumnSchema | undefined {
  const same = schema.filter((c) => normName(c.name) === normName(name));
  return same.find((c) => !c.hidden) ?? same[0];
}

/** Kolom filter tersimpan yang tersedia (ada, tidak disembunyikan) di versi aktif, bila ada. */
function availableColumn(
  f: FilterColumn,
  sheets: Pick<ActiveSheet, "name" | "schema">[],
): { sheet: string; col: ColumnSchema } | null {
  const sheet = sheetNamed(sheets, f.sheet);
  const col = sheet ? columnNamed(sheet.schema ?? [], f.column) : undefined;
  return sheet && col && !col.hidden ? { sheet: sheet.name, col } : null;
}

/**
 * Tampilan kolom filter terhadap versi data aktif: nama terkini + tipe bila tersedia; bila tidak
 * (hilang/disembunyikan) nama tersimpan + tipe netral — tidak membawa metadata kolom tersembunyi.
 */
export function filterColumnViews(
  stored: FilterColumn[],
  sheets: Pick<ActiveSheet, "name" | "schema">[],
): FilterColumnView[] {
  return stored.map((f) => {
    const a = availableColumn(f, sheets);
    return {
      key: filterColumnKey(f.sheet, f.column),
      sheet: a?.sheet ?? f.sheet,
      column: a?.col.name ?? f.column,
      type: a?.col.type ?? "text",
      available: !!a,
      ...(a?.col.system === "period" ? { period: true as const } : {}),
      ...(f.default ? { default: { ...f.default, column: a?.col.name ?? f.column } } : {}),
    };
  });
}

/**
 * Simpanan non-pemilik (editor, T-k2ec): editor tidak pernah menerima kolom filter tersimpan yang kini
 * hilang/disembunyikan (namanya tidak dikirim), jadi kolom itu dipertahankan di belakang pilihan editor —
 * kecuali namanya sudah dipilih — agar tidak terhapus diam-diam saat kolomnya ditampilkan lagi.
 * Melebihi batas → pesan galat.
 */
export function keepUnavailable(
  chosen: FilterColumn[],
  stored: FilterColumn[],
  sheets: Pick<ActiveSheet, "name" | "schema">[],
): { ok: true; columns: FilterColumn[] } | { ok: false; message: string } {
  const names = new Set(chosen.map((c) => normName(c.column)));
  const kept = stored.filter((f) => !availableColumn(f, sheets) && !names.has(normName(f.column)));
  if (chosen.length + kept.length > FILTER_COLUMNS_MAX) {
    return {
      ok: false,
      message: `Maksimal ${FILTER_COLUMNS_MAX} kolom filter per dashboard, termasuk ${kept.length} kolom yang sedang tidak tersedia di data terbaru (hanya pemilik dataset yang bisa menghapusnya).`,
    };
  }
  return { ok: true, columns: [...chosen, ...kept] };
}

/**
 * Kolom dimensi grafik (batang/garis/pai) dan field baris/kolom pivot (T-f4a7) yang cross-filter-nya
 * aktif, dari widget yang SUDAH dipetakan ke versi aktif; kolom yang hilang/disembunyikan tidak ikut.
 */
function crossFilterDims(
  widgets: { type: string; spec: unknown }[],
  sheets: Pick<ActiveSheet, "id" | "schema">[],
): ColumnSchema[] {
  const byId = new Map(sheets.map((s) => [s.id, s.schema ?? []]));
  const out: ColumnSchema[] = [];
  for (const w of widgets) {
    const c = parseWidgetConfig(w.type, w.spec);
    if (!c.ok || c.config.type === "empty") continue;
    const schema = byId.get(c.config.spec.sheetId);
    for (const pos of crossFilterPositions(c.config)) {
      const col = schema?.find((x) => x.pos === pos);
      if (col && !col.hidden) out.push(col);
    }
  }
  return out;
}

/** Nama kolom dimensi grafik cross-filter aktif, unik (ternormalisasi). */
export function crossFilterColumnsOf(
  widgets: { type: string; spec: unknown }[],
  sheets: Pick<ActiveSheet, "id" | "schema">[],
): string[] {
  const out = new Map<string, string>();
  for (const col of crossFilterDims(widgets, sheets)) {
    if (!out.has(normName(col.name))) out.set(normName(col.name), col.name);
  }
  return [...out.values()];
}

/**
 * Sumber filter dashboard untuk query widget (D6 + kecocokan tipe): kolom filter tersimpan (tipe null
 * bila tidak tersedia — namanya tetap diizinkan, filternya dilewati) dan dimensi grafik cross-filter.
 */
export function filterSourcesOf(
  stored: FilterColumn[],
  widgets: { type: string; spec: unknown }[],
  sheets: ActiveSheet[],
): FilterSourceColumn[] {
  const own = stored.map((f) => ({
    name: f.column,
    type: availableColumn(f, sheets)?.col.type ?? null,
  }));
  const cross = crossFilterDims(widgets, sheets).map((c) => ({ name: c.name, type: c.type }));
  return [...own, ...cross];
}

/**
 * Peringatan dialog share (T-016, catatan review T-012): kolom filter tersimpan yang tersedia dan dimensi
 * grafik cross-filter yang juga ada — nama ternormalisasi sama, tidak disembunyikan, kelompok tipe sama
 * (aturan applyDashFilters) — di LEBIH DARI SATU sheet: sheet yang dipakai widget ditambah sheet sumber
 * kolom filter itu sendiri. Widget harus sudah dipetakan ke versi aktif; `sheets` = sheet versi aktif.
 */
export function overlappingFilterColumns(
  stored: FilterColumn[],
  widgets: { type: string; spec: unknown }[],
  sheets: ActiveSheet[],
): string[] {
  const used = new Set(
    widgets.flatMap((w) => {
      const c = parseWidgetConfig(w.type, w.spec);
      return c.ok && c.config.type !== "empty" ? [c.config.spec.sheetId] : [];
    }),
  );
  const sources = [
    ...stored.flatMap((f) => {
      const a = availableColumn(f, sheets);
      return a ? [{ col: a.col, home: sheetNamed(sheets, f.sheet)?.id }] : [];
    }),
    ...crossFilterDims(widgets, sheets).map((col) => ({ col, home: undefined })),
  ];
  const out = new Map<string, string>();
  for (const { col, home } of sources) {
    const key = normName(col.name);
    if (out.has(key)) continue;
    const family = typeFamily(col.type);
    const hits = sheets.filter(
      (s) =>
        (used.has(s.id) || s.id === home) &&
        (s.schema ?? []).some(
          (c) => !c.hidden && normName(c.name) === key && typeFamily(c.type) === family,
        ),
    ).length;
    if (hits > 1) out.set(key, col.name);
  }
  return [...out.values()];
}

export type CheckedFilterColumns =
  { ok: true; columns: FilterColumn[] } | { ok: false; message: string };

/**
 * Validasi daftar kolom filter dari pemilik/editor: bentuk, ≤ 8, nama kolom unik (juga antar-sheet: satu
 * kontrol per nama), dan setiap kolom ada serta tidak disembunyikan di versi aktif. Yang disimpan
 * adalah nama terkini dari skema.
 */
export function checkFilterColumns(
  input: unknown,
  sheets: Pick<ActiveSheet, "name" | "schema">[],
): CheckedFilterColumns {
  if (!Array.isArray(input)) return { ok: false, message: "Daftar kolom filter tidak valid." };
  if (input.length > FILTER_COLUMNS_MAX) {
    return { ok: false, message: `Maksimal ${FILTER_COLUMNS_MAX} kolom filter per dashboard.` };
  }
  const seen = new Map<string, string>();
  const columns: FilterColumn[] = [];
  for (const item of input) {
    const p = filterColumnSchema.safeParse(item);
    if (!p.success) return { ok: false, message: "Daftar kolom filter tidak valid." };
    const key = normName(p.data.column);
    const before = seen.get(key);
    if (before !== undefined) {
      return {
        ok: false,
        message:
          normName(before) === normName(p.data.sheet)
            ? `Kolom "${p.data.column}" dipilih lebih dari sekali.`
            : `Kolom "${p.data.column}" sudah dipilih dari sheet "${before}". Satu nama kolom hanya bisa menjadi satu filter.`,
      };
    }
    seen.set(key, p.data.sheet);
    const sheet = sheetNamed(sheets, p.data.sheet);
    if (!sheet) return { ok: false, message: `Sheet "${p.data.sheet}" tidak ada di data aktif.` };
    const col = columnNamed(sheet.schema ?? [], p.data.column);
    if (!col || col.hidden) {
      return {
        ok: false,
        message: `Kolom "${p.data.column}" tidak ada atau disembunyikan di sheet "${sheet.name}".`,
      };
    }
    const d = p.data.default;
    if (d && (d.op === "in" || d.op === "not_in") && d.values.length > DEFAULT_VALUES_MAX) {
      return {
        ok: false,
        message: `Filter bawaan kolom "${col.name}" paling banyak ${DEFAULT_VALUES_MAX} nilai terpilih.`,
      };
    }
    if (d && !defaultFits(d, col)) {
      return {
        ok: false,
        message: `Filter bawaan kolom "${col.name}" tidak cocok dengan kolomnya.`,
      };
    }
    columns.push({
      sheet: sheet.name,
      column: col.name,
      ...(d ? { default: { ...d, column: col.name } } : {}),
    });
  }
  return { ok: true, columns };
}

/**
 * Filter bawaan cocok dengan kolomnya — aturan yang sama dengan kontrol bilah filter (filter-model
 * `fits`): teks/boolean = pilih nilai, tanggal = rentang tanggal atau preset (Periode terbaru
 * hanya kolom sistem Periode), angka = rentang angka. Nama kolom harus kolom itu sendiri.
 */
function defaultFits(f: DashFilter, col: ColumnSchema): boolean {
  if (normName(f.column) !== normName(col.name)) return false;
  const family = typeFamily(col.type);
  if (f.op === "in" || f.op === "not_in") {
    return family !== "number" && family !== "time";
  }
  if (f.op === "preset") {
    return family === "time" && (f.preset !== "latest_period" || col.system === "period");
  }
  const bounds = [f.gte, f.lte, f.lt].filter((b) => b !== undefined);
  if (family === "number") return bounds.every((b) => typeof b === "number");
  return family === "time" && bounds.every((b) => typeof b === "string");
}
