/*
 * Bentuk tabel widget pivot (T-tcjp), satu sumber untuk layar, cetak PDF, dan ekspor CSV/XLSX: header
 * (label kolom pemisah, mis. "Jan 2026", lalu Total), baris kelompok/subtotal, baris terdalam, baris
 * Total, dan catatan bila baris/kolom melewati batas tampilan. Nilai tetap mentah (angka) + tipenya;
 * teks dibentuk pemakai (formatCell / XLSX angka). Murni.
 */
import type { PivotFieldRole } from "@/features/query/filters";
import type { PivotCell, PivotData } from "@/features/query/pivot";
import { AUTO_FORMAT, formatCell, formatNumber, type ValueType } from "./format";

/** Nilai mentah sebuah label + field-nya (filter silang dari label, T-f4a7). */
export interface PivotPick {
  field: PivotFieldRole;
  raw: unknown;
}

export interface PivotHeadCell {
  label: string;
  /** Lebar dalam kolom data (banyak nilai per periode). */
  span: number;
  total?: boolean;
  pick?: PivotPick;
}

export interface PivotBodyRow {
  kind: "group" | "leaf" | "total";
  /** Label baris (sudah teks); kelompok = label kelompok pertama. */
  label: string;
  depth: 0 | 1;
  /** Satu nilai per kolom data, urut header; null = tidak ada data. Kelompok tanpa subtotal: []. */
  values: unknown[];
  /** Label baris/kelompok (bukan Total). */
  pick?: PivotPick;
}

export interface PivotField {
  role: PivotFieldRole;
  label: string;
  type: ValueType;
  grain?: string;
}

export interface PivotTableModel {
  /** Judul kolom baris, mis. "Cabang › Layanan". */
  rowHeader: string;
  /** Field pivot (baris 1, baris 2, kolom pemisah) untuk menu saring dan filter silang. */
  fields: PivotField[];
  /** Baris header pertama bila ada pemisah kolom; null bila tanpa pemisah. */
  columnHeads: PivotHeadCell[] | null;
  /** Header kolom data terdalam (label nilai, atau label periode bila hanya satu nilai). */
  valueHeads: { label: string; type: ValueType; total: boolean; pick?: PivotPick }[];
  rows: PivotBodyRow[];
  total: PivotBodyRow | null;
  /** "Menampilkan 200 dari 1.000 baris …" bila ada yang tidak tampil; null bila semua tampil. */
  note: string | null;
  /** "Disaring — Cabang: Bandung, Jakarta; …" bila ada saringan pivot; null bila tidak ada. */
  filterNote: string | null;
}

const count = (n: number) => formatNumber(n, { style: "number", decimals: 0 });
const label = (v: unknown, f: { type: ValueType; grain?: string }) =>
  formatCell(v, f.type, AUTO_FORMAT, f.grain);
/** Nilai saringan yang disebut di catatan; sisanya "+N lainnya". */
const NOTE_VALUES = 3;

/** Catatan saringan pivot (Saring tersimpan + saringan pembaca), teks sama di layar dan PDF. */
export function pivotFilterNote(p: Pick<PivotData, "filters">): string | null {
  const parts = (p.filters ?? []).map((f) => {
    const vs = f.values.slice(0, NOTE_VALUES).map((v) => label(v, f));
    const more =
      f.values.length > NOTE_VALUES ? ` +${count(f.values.length - NOTE_VALUES)} lainnya` : "";
    const how = f.op === "not_in" ? "kecuali " : "";
    return `${f.label}: ${how}${vs.join(", ")}${more}${f.saved ? " (pengaturan widget)" : ""}`;
  });
  return parts.length ? `Disaring — ${parts.join("; ")}.` : null;
}

export function pivotTable(p: PivotData): PivotTableModel {
  const nv = p.values.length;
  const split = !!p.columnField;
  const withTotal = !!p.rowTotals;
  const colLabels = split ? p.columns.map((c) => label(c, p.columnField!)) : [];
  const colPick = (i: number): PivotPick => ({ field: "column", raw: p.columns[i] });

  let columnHeads: PivotHeadCell[] | null = null;
  let valueHeads: PivotTableModel["valueHeads"];
  if (!split) {
    valueHeads = p.values.map((v) => ({ label: v.label, type: v.type, total: false }));
  } else if (nv === 1) {
    // Satu nilai: header langsung periode, kolom kanan = nama nilai (mis. "Total No.").
    const v = p.values[0]!;
    valueHeads = [
      ...colLabels.map((l, i) => ({ label: l, type: v.type, total: false, pick: colPick(i) })),
      ...(withTotal ? [{ label: v.label, type: v.type, total: true }] : []),
    ];
  } else {
    columnHeads = [
      ...colLabels.map((l, i) => ({ label: l, span: nv, pick: colPick(i) })),
      ...(withTotal ? [{ label: "Total", span: nv, total: true }] : []),
    ];
    valueHeads = [...colLabels, ...(withTotal ? ["Total"] : [])].flatMap((_, i, all) =>
      p.values.map((v) => ({
        label: v.label,
        type: v.type,
        total: withTotal && i === all.length - 1,
      })),
    );
  }

  const flat = (cells: PivotCell[], tot: PivotCell | undefined | null, hasTotal: boolean) => [
    ...cells.flatMap((c) => Array.from({ length: nv }, (_, m) => c?.[m] ?? null)),
    ...(hasTotal ? Array.from({ length: nv }, (_, m) => tot?.[m] ?? null) : []),
  ];

  const rows: PivotBodyRow[] = [];
  const two = p.rowFields.length === 2;
  let lastGroup: number | null = null;
  p.rows.forEach((r, ri) => {
    if (two && r.group !== null && r.group !== lastGroup) {
      lastGroup = r.group;
      const g = r.group;
      rows.push({
        kind: "group",
        label: label(p.groups[g], p.rowFields[0]!),
        depth: 0,
        values: p.subtotals
          ? flat(p.subtotals[g] ?? [], p.subtotalTotals?.[g], !!p.subtotalTotals)
          : [],
        pick: { field: "row0", raw: p.groups[g] },
      });
    }
    rows.push({
      kind: "leaf",
      label: label(r.labels[two ? 1 : 0], p.rowFields[two ? 1 : 0]!),
      depth: two ? 1 : 0,
      values: flat(p.cells[ri] ?? [], p.rowTotals?.[ri], withTotal),
      pick: { field: two ? "row1" : "row0", raw: r.labels[two ? 1 : 0] },
    });
  });

  const total: PivotBodyRow | null = p.grandTotal
    ? {
        kind: "total",
        label: "Total",
        depth: 0,
        values: split
          ? flat(p.columnTotals ?? [], p.grandTotal, withTotal)
          : flat([p.grandTotal], null, false),
      }
    : null;

  const parts: string[] = [];
  if (p.rowCount > p.rows.length) {
    parts.push(`${count(p.rows.length)} dari ${count(p.rowCount)} baris`);
  }
  if (p.columnCount > p.columns.length) {
    parts.push(`${count(p.columns.length)} dari ${count(p.columnCount)} kolom`);
  }
  const note = parts.length
    ? `Menampilkan ${parts.join(" dan ")}. Persempit dengan filter; total tetap mencakup semua data.`
    : null;

  const fields: PivotField[] = [
    ...p.rowFields.map((f, i) => ({ role: i ? "row1" : "row0", ...f }) as PivotField),
    ...(p.columnField ? [{ role: "column" as const, ...p.columnField }] : []),
  ];
  return {
    rowHeader: p.rowFields.map((f) => f.label).join(" › "),
    fields,
    columnHeads,
    valueHeads,
    rows,
    total,
    note,
    filterNote: pivotFilterNote(p),
  };
}

/** Nama tiap kolom data untuk keterangan, mis. "Jan 2026" atau "Jan 2026 · Total No." (banyak nilai). */
export function columnNames(m: PivotTableModel): string[] {
  if (!m.columnHeads) return m.valueHeads.map((h) => h.label);
  const outer = m.columnHeads.flatMap((h) => Array<string>(h.span).fill(h.label));
  return m.valueHeads.map((h, i) => `${outer[i]} · ${h.label}`);
}

/** Model dengan `k` kolom data pertama saja (cetak: kolom yang tidak muat dibuang utuh). */
export function keepColumns(m: PivotTableModel, k: number): PivotTableModel {
  if (k >= m.valueHeads.length) return m;
  const cut = (r: PivotBodyRow) => ({ ...r, values: r.values.slice(0, k) });
  let left = k;
  const columnHeads =
    m.columnHeads?.flatMap((h) => {
      const span = Math.min(h.span, left);
      left -= span;
      return span ? [{ ...h, span }] : [];
    }) ?? null;
  return {
    ...m,
    columnHeads,
    valueHeads: m.valueHeads.slice(0, k),
    rows: m.rows.map(cut),
    total: m.total && cut(m.total),
  };
}
