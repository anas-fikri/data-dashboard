/*
 * Kolom filter dashboard (T-012, D6): Dashboard.filterColumns = [{ sheet, column }] dengan nama tampil
 * (bukan id sheet/posisi kolom, sehingga tetap berlaku setelah data diganti — dicocokkan lewat nama
 * seperti widgets/remap.ts). Pengguna dashboard hanya boleh memfilter kolom ini ditambah dimensi grafik
 * yang cross-filter-nya aktif. Murni (tanpa I/O) — dipakai server dan pengaturan dashboard di klien.
 */
import { z } from "zod";
import type { ColumnSchema, ColumnType } from "@/features/ingest/infer";
import { normName } from "@/features/widgets/remap";
import { CHART_TYPES, parseWidgetConfig } from "@/features/widgets/spec";

export const FILTER_COLUMNS_MAX = 8;

export const filterColumnSchema = z
  .object({ sheet: z.string().min(1).max(200), column: z.string().min(1).max(200) })
  .strict();
export type FilterColumn = z.infer<typeof filterColumnSchema>;

export interface FilterColumnView {
  /** Stabil antarversi data: nama sheet + "\u0000" + nama kolom, keduanya ternormalisasi. */
  key: string;
  sheet: string;
  column: string;
  type: ColumnType;
  /** Kolom ada dan tidak disembunyikan di versi data aktif. */
  available: boolean;
}

/** Sheet versi aktif (nama + skema) untuk mencocokkan kolom filter. */
export interface ActiveSheet {
  id: string;
  name: string;
  schema: ColumnSchema[] | null;
}

export const filterColumnKey = (sheet: string, column: string) =>
  `${normName(sheet)}\u0000${normName(column)}`;

/** Isi Dashboard.filterColumns dari DB, toleran: entri rusak/ganda dibuang, paling banyak 8. */
export function storedFilterColumns(json: unknown): FilterColumn[] {
  if (!Array.isArray(json)) return [];
  const out = new Map<string, FilterColumn>();
  for (const item of json) {
    const p = filterColumnSchema.safeParse(item);
    if (!p.success) continue;
    const key = filterColumnKey(p.data.sheet, p.data.column);
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

/** Tampilan kolom filter terhadap versi data aktif (nama terkini bila ketemu). */
export function filterColumnViews(
  stored: FilterColumn[],
  sheets: Pick<ActiveSheet, "name" | "schema">[],
): FilterColumnView[] {
  return stored.map((f) => {
    const sheet = sheetNamed(sheets, f.sheet);
    const col = sheet ? columnNamed(sheet.schema ?? [], f.column) : undefined;
    return {
      key: filterColumnKey(f.sheet, f.column),
      sheet: sheet?.name ?? f.sheet,
      column: col?.name ?? f.column,
      type: col?.type ?? "text",
      available: !!col && !col.hidden,
    };
  });
}

/**
 * Nama kolom dimensi grafik (batang/garis/pai) yang cross-filter-nya aktif, dari widget yang SUDAH
 * dipetakan ke versi aktif; kolom yang hilang/disembunyikan tidak ikut. Unik (ternormalisasi).
 */
export function crossFilterColumnsOf(
  widgets: { type: string; spec: unknown }[],
  sheets: Pick<ActiveSheet, "id" | "schema">[],
): string[] {
  const byId = new Map(sheets.map((s) => [s.id, s.schema ?? []]));
  const out = new Map<string, string>();
  for (const w of widgets) {
    if (!(CHART_TYPES as readonly string[]).includes(w.type)) continue;
    const c = parseWidgetConfig(w.type, w.spec);
    if (
      !c.ok ||
      c.config.type === "empty" ||
      c.config.type === "kpi" ||
      c.config.type === "table"
    ) {
      continue;
    }
    if (c.config.spec.crossFilter === false) continue;
    const pos = c.config.spec.dimension.column;
    const col = byId.get(c.config.spec.sheetId)?.find((x) => x.pos === pos);
    if (col && !col.hidden && !out.has(normName(col.name))) out.set(normName(col.name), col.name);
  }
  return [...out.values()];
}

export type CheckedFilterColumns =
  { ok: true; columns: FilterColumn[] } | { ok: false; message: string };

/**
 * Validasi daftar kolom filter dari pemilik: bentuk, ≤ 8, unik, dan setiap kolom ada serta tidak
 * disembunyikan di versi aktif. Yang disimpan adalah nama terkini dari skema.
 */
export function checkFilterColumns(
  input: unknown,
  sheets: Pick<ActiveSheet, "name" | "schema">[],
): CheckedFilterColumns {
  if (!Array.isArray(input)) return { ok: false, message: "Daftar kolom filter tidak valid." };
  if (input.length > FILTER_COLUMNS_MAX) {
    return { ok: false, message: `Maksimal ${FILTER_COLUMNS_MAX} kolom filter per dashboard.` };
  }
  const seen = new Set<string>();
  const columns: FilterColumn[] = [];
  for (const item of input) {
    const p = filterColumnSchema.safeParse(item);
    if (!p.success) return { ok: false, message: "Daftar kolom filter tidak valid." };
    const key = filterColumnKey(p.data.sheet, p.data.column);
    if (seen.has(key)) {
      return { ok: false, message: `Kolom "${p.data.column}" dipilih lebih dari sekali.` };
    }
    seen.add(key);
    const sheet = sheetNamed(sheets, p.data.sheet);
    if (!sheet) return { ok: false, message: `Sheet "${p.data.sheet}" tidak ada di data aktif.` };
    const col = columnNamed(sheet.schema ?? [], p.data.column);
    if (!col || col.hidden) {
      return {
        ok: false,
        message: `Kolom "${p.data.column}" tidak ada atau disembunyikan di sheet "${sheet.name}".`,
      };
    }
    columns.push({ sheet: sheet.name, column: col.name });
  }
  return { ok: true, columns };
}
