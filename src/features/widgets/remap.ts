/*
 * Widget setelah data diganti (T-011, temuan verifikasi): setiap unggahan baru membuat versi baru
 * dengan id sheet baru dan langsung aktif, sehingga spec widget (sheetId + posisi kolom) menunjuk ke
 * versi lama. Di sini spec dipetakan ke versi aktif saat dibaca: sheet lewat nama (atau satu-satunya
 * sheet bila versi lama JUGA hanya punya satu sheet — CSV/nama file berubah), kolom lewat nama di skema
 * lama → posisi di skema baru (tidak peka besar/kecil dan spasi). Kolom yang tidak ketemu diberi posisi
 * MISSING_COLUMN (tidak pernah ada di skema): query memberi pesan "kolom tidak ada di data terbaru"
 * dengan nama lamanya dan panel menandainya untuk dipilih ulang. Pemetaan disimpan permanen saat user
 * menyimpan pengaturan widget; T-013/T-014 memindahkannya ke saat aktivasi versi. Murni.
 */
import type { ColumnSchema } from "@/features/ingest/infer";
import { MISSING_COLUMN, type WidgetConfig } from "./spec";

export { MISSING_COLUMN };

export interface SheetInfo {
  id: string;
  name: string;
  index: number;
  schema: ColumnSchema[];
}

type Configured = Exclude<WidgetConfig, { type: "empty" }>;

const key = (s: string) => s.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Sheet pengganti di versi aktif, atau null bila tidak bisa ditentukan dengan aman. Fallback "satu-
 * satunya sheet" hanya bila versi lama juga satu sheet — sheet yang dihapus dari workbook tidak boleh
 * diam-diam menunjuk sheet lain (angka salah dengan judul lama).
 */
export function matchSheet(
  old: SheetInfo,
  active: SheetInfo[],
  oldSheetCount: number,
): SheetInfo | null {
  const byName = active.filter((s) => key(s.name) === key(old.name));
  if (byName.length === 1) return byName[0]!;
  if (byName.length === 0 && active.length === 1 && oldSheetCount === 1) return active[0]!;
  return null;
}

export interface Remapped {
  config: Configured;
  /** Nama kolom lama yang tidak ditemukan di versi aktif. */
  missing: string[];
}

export function remapConfig(config: Configured, old: SheetInfo, target: SheetInfo): Remapped {
  const oldName = new Map(old.schema.map((c) => [c.pos, c.name]));
  const newPos = new Map<string, number>();
  for (const c of target.schema) if (!newPos.has(key(c.name))) newPos.set(key(c.name), c.pos);
  const missing: string[] = [];
  const pos = (p: number): number => {
    const name = oldName.get(p);
    const found = name === undefined ? undefined : newPos.get(key(name));
    if (found !== undefined) return found;
    const label = name ?? `kolom ${p}`;
    if (!missing.includes(label)) missing.push(label);
    return MISSING_COLUMN;
  };
  const mapMeasure = <M extends { column?: number }>(m: M): M =>
    m.column === undefined ? m : { ...m, column: pos(m.column) };

  switch (config.type) {
    case "kpi":
      return {
        config: {
          ...config,
          spec: { ...config.spec, sheetId: target.id, measure: mapMeasure(config.spec.measure) },
        },
        missing,
      };
    case "table": {
      const mapped = config.spec.columns.map(pos);
      // Kolom tabel harus unik: semua yang hilang diwakili satu penanda.
      const columns = [
        ...mapped.filter((p) => p !== MISSING_COLUMN),
        ...(mapped.includes(MISSING_COLUMN) ? [MISSING_COLUMN] : []),
      ];
      const formatColumns = config.spec.formatColumns
        ?.map(pos)
        .filter((p) => p !== MISSING_COLUMN && columns.includes(p));
      return {
        config: {
          ...config,
          spec: {
            ...config.spec,
            sheetId: target.id,
            columns,
            ...(formatColumns ? { formatColumns } : {}),
          },
        },
        missing,
      };
    }
    default:
      return {
        config: {
          ...config,
          spec: {
            ...config.spec,
            sheetId: target.id,
            dimension: { ...config.spec.dimension, column: pos(config.spec.dimension.column) },
            measure: mapMeasure(config.spec.measure),
          },
        },
        missing,
      };
  }
}

/** Pesan widget untuk kolom yang hilang setelah data diganti (nama lama disebut). */
export function missingMessage(names: string[]): string {
  const list = names.map((n) => `"${n}"`).join(", ");
  return `Kolom ${list} tidak ada di data terbaru (dihapus atau diganti namanya). Atur ulang widget lewat tombol pengaturan.`;
}
