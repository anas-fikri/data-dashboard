/*
 * Widget setelah data diganti (T-011, temuan verifikasi): setiap unggahan baru membuat versi baru
 * dengan id sheet baru dan langsung aktif, sehingga spec widget (sheetId + posisi kolom) menunjuk ke
 * versi lama. Di sini spec dipetakan ke versi aktif saat dibaca: sheet lewat nama (atau satu-satunya
 * sheet untuk CSV/workbook satu sheet), kolom lewat nama di skema lama → posisi di skema baru (tidak
 * peka besar/kecil dan spasi). Kolom yang tidak ketemu diberi posisi 0 → "kolom tidak tersedia".
 * Pemetaan disimpan permanen saat user menyimpan pengaturan widget; T-013/T-014 memindahkannya ke
 * saat aktivasi versi. Murni.
 */
import type { ColumnSchema } from "@/features/ingest/infer";
import type { WidgetConfig } from "./spec";

export interface SheetInfo {
  id: string;
  name: string;
  index: number;
  schema: ColumnSchema[];
}

type Configured = Exclude<WidgetConfig, { type: "empty" }>;

const key = (s: string) => s.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();

/** Sheet pengganti di versi aktif, atau null bila tidak bisa ditentukan dengan aman. */
export function matchSheet(old: SheetInfo, active: SheetInfo[]): SheetInfo | null {
  const byName = active.filter((s) => key(s.name) === key(old.name));
  if (byName.length === 1) return byName[0]!;
  // CSV / workbook satu sheet: nama sheet bisa berubah (nama file), isinya tetap satu sheet.
  if (active.length === 1 && byName.length === 0) return active[0]!;
  return null;
}

export function remapConfig(config: Configured, old: SheetInfo, target: SheetInfo): Configured {
  const oldName = new Map(old.schema.map((c) => [c.pos, key(c.name)]));
  const newPos = new Map<string, number>();
  for (const c of target.schema) if (!newPos.has(key(c.name))) newPos.set(key(c.name), c.pos);
  const pos = (p: number): number => {
    const n = oldName.get(p);
    return n === undefined ? 0 : (newPos.get(n) ?? 0);
  };
  switch (config.type) {
    case "kpi":
      return {
        ...config,
        spec: {
          ...config.spec,
          sheetId: target.id,
          measure: config.spec.measure.column
            ? { ...config.spec.measure, column: pos(config.spec.measure.column) }
            : config.spec.measure,
        },
      };
    case "table": {
      const columns = config.spec.columns.map(pos);
      return {
        ...config,
        spec: {
          ...config.spec,
          sheetId: target.id,
          columns,
          ...(config.spec.formatColumns
            ? { formatColumns: config.spec.formatColumns.map(pos) }
            : {}),
        },
      };
    }
    default:
      return {
        ...config,
        spec: {
          ...config.spec,
          sheetId: target.id,
          dimension: { ...config.spec.dimension, column: pos(config.spec.dimension.column) },
          measure: config.spec.measure.column
            ? { ...config.spec.measure, column: pos(config.spec.measure.column) }
            : config.spec.measure,
        },
      };
  }
}
