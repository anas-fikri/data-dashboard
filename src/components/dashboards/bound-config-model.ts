import {
  effectiveConfig,
  isBoundType,
  type BoundType,
  type ChartDisplay,
  type PivotDisplay,
} from "@/features/widgets/bound";
import {
  SORT_DEFAULT,
  TOP_N_DEFAULT,
  TOP_N_MAX,
  isCalcValue,
  type PivotSpec,
} from "@/features/widgets/spec";
import { nameKeyOf } from "@/features/datasets/validation";
import { dimensionText } from "./pivot-config-model";
import { measureText, type SourceColumn } from "./widget-config-model";

/*
 * Model murni panel widget terikat pivot tersimpan dan halaman pivot tersimpan (T-074, rencana G-7
 * §3.3). Spec widget terikat = TAMPILAN saja (features/widgets/bound.ts); definisi milik pivot
 * tersimpan. Semua pilihan bawaan diperiksa dengan effectiveConfig yang sama dengan server, jadi panel
 * tidak menawarkan simpanan yang pasti ditolak.
 */

/** Ringkas pivot tersimpan yang dikirim server ke panel (SavedPivotView tanpa waktu). */
export interface SavedPivotOption {
  id: string;
  name: string;
  spec: PivotSpec;
  revision: number;
  canEdit: boolean;
}

/** Nilai yang bisa dipilih grafik/KPI: indeks + label "Nilai 2: Total Pendapatan". */
export function valueOptions(
  pivot: PivotSpec,
  columns: SourceColumn[],
): { value: string; label: string }[] {
  const name = (pos: number) => columns.find((c) => c.pos === pos)?.name ?? "kolom";
  return pivot.values.map((v, i) => ({
    value: String(i),
    label: `Nilai ${i + 1}: ${isCalcValue(v) ? v.label : measureText(v, name)}`,
  }));
}

/** Dimensi grafik: baris pertama pivot tersimpan atau kolom pemisahnya (bila ada). */
export function dimensionOptions(
  pivot: PivotSpec,
  columns: SourceColumn[],
): { value: ChartDisplay["dimension"]; label: string }[] {
  const out: { value: ChartDisplay["dimension"]; label: string }[] = [
    { value: "row", label: `Baris: ${dimensionText(pivot.rows[0]!, columns)}` },
  ];
  if (pivot.column) {
    out.push({ value: "column", label: `Pisahkan per: ${dimensionText(pivot.column, columns)}` });
  }
  return out;
}

/** Tampilan pivot dari spec pivot (simpan sebagai pivot tersimpan: tampilan widget tidak berubah). */
export function pivotDisplayOf(spec: PivotSpec): PivotDisplay {
  return {
    sort: spec.sort,
    totals: spec.totals,
    subtotals: spec.subtotals,
    ...(spec.subtotalLevels ? { subtotalLevels: spec.subtotalLevels } : {}),
    ...(spec.crossFilter !== undefined ? { crossFilter: spec.crossFilter } : {}),
  };
}

/**
 * Tampilan bawaan satu jenis atas pivot tersimpan. Grafik/KPI memilih nilai pertama yang sah untuk
 * jenis itu (mis. pai hanya Total/Jumlah); tanpa nilai yang sah → null (panel memberi tahu).
 * `keepFormat`: format tampilan sebelumnya ikut saat jenis berganti.
 */
export function defaultDisplay(
  type: BoundType,
  pivot: PivotSpec,
  keepFormat?: unknown,
): unknown | null {
  const format =
    keepFormat && typeof keepFormat === "object" ? { format: keepFormat } : ({} as object);
  const candidates: unknown[] = (() => {
    switch (type) {
      case "pivot":
        return [{ ...pivotDisplayOf(pivot), ...format }];
      case "table":
        return [{ sort: pivot.sort, totals: pivot.totals, ...format }];
      case "kpi":
        return pivot.values.map((_, value) => ({ value, ...format }));
      default:
        return pivot.values.map((_, value) => ({
          dimension: "row",
          value,
          sort: SORT_DEFAULT[type],
          topN: Math.min(TOP_N_DEFAULT[type], TOP_N_MAX[type]),
          ...format,
        }));
    }
  })();
  for (const c of candidates) {
    if (effectiveConfig(type, c, pivot).ok) return c;
    // Format lama tidak sah untuk jenis ini: coba tanpa format.
    if (keepFormat && c && typeof c === "object") {
      const { format: _f, ...bare } = c as { format?: unknown };
      if (effectiveConfig(type, bare, pivot).ok) return bare;
    }
  }
  return null;
}

/** Jenis widget yang sedang dipakai boleh terikat (semua kecuali "empty"). */
export const boundTypeOf = (type: string): BoundType | null => (isBoundType(type) ? type : null);

/** "Dipakai di 3 widget pada 2 dashboard" / "Belum dipakai". */
export function usageText(u: { widgets: number; dashboards: number } | null): string {
  if (!u || u.widgets === 0) return "Belum dipakai";
  return `${u.widgets} widget, ${u.dashboards} dashboard`;
}

/** Kalimat dampak simpan (AC2): null bila tidak ada widget yang memakai. */
export function impactText(u: { widgets: number; dashboards: number } | null): string | null {
  if (!u || u.widgets === 0) return null;
  return `Perubahan berlaku di ${u.widgets} widget pada ${u.dashboards} dashboard.`;
}

/**
 * Nama salinan yang belum dipakai (aturan unik server: nameKeyOf): "X (salinan)", "X (salinan 2)", … dipotong
 * agar ≤ `max` karakter.
 */
export function copyName(name: string, taken: readonly string[], max = 80): string {
  const used = new Set(taken.map(nameKeyOf));
  for (let i = 1; i < 1000; i++) {
    const suffix = i === 1 ? " (salinan)" : ` (salinan ${i})`;
    const candidate = `${name.slice(0, Math.max(1, max - suffix.length)).trimEnd()}${suffix}`;
    if (!used.has(nameKeyOf(candidate))) return candidate;
  }
  return name.slice(0, max);
}
