/*
 * Bentuk tabel widget pivot (T-tcjp), satu sumber untuk layar, cetak PDF, dan ekspor CSV/XLSX: header
 * (label kolom pemisah, mis. "Jan 2026", lalu Total), baris kelompok/subtotal, baris terdalam, baris
 * Total, dan catatan bila baris/kolom melewati batas tampilan. Nilai tetap mentah (angka) + tipenya;
 * teks dibentuk pemakai (formatCell / XLSX angka). Murni.
 */
import type { PivotFieldRole } from "@/features/query/filters";
import type { PivotCell, PivotData } from "@/features/query/pivot";
import { AUTO_FORMAT, formatCell, formatNumber, type ValueType } from "./format";
import { PIVOT_COLUMNS_SHOWN, type NumberFormat, type ShowAs } from "./spec";

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
  /** Label baris (sudah teks); kelompok = label kelompok di levelnya. */
  label: string;
  /** Level baris (0 = baris pertama … 3 = baris keempat, T-070); kelompok = level induknya. */
  depth: 0 | 1 | 2 | 3;
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
  /** Field pivot (baris 1–4, kolom pemisah) untuk menu saring dan filter silang. */
  fields: PivotField[];
  /** Baris header pertama bila ada pemisah kolom; null bila tanpa pemisah. */
  columnHeads: PivotHeadCell[] | null;
  /**
   * Header kolom data terdalam (label nilai, atau label periode bila hanya satu nilai); `showAs`
   * nilai itu (T-067) menentukan format sel (persen 1 desimal).
   */
  valueHeads: {
    label: string;
    type: ValueType;
    total: boolean;
    pick?: PivotPick;
    showAs?: ShowAs;
    /** Format sendiri field terhitung (T-068); tanpa field ini = format widget. */
    format?: NumberFormat;
  }[];
  rows: PivotBodyRow[];
  total: PivotBodyRow | null;
  /**
   * "Menampilkan 200 dari 1.000 baris …" bila ada yang tidak tampil; anggaran sel (T-070): "Menampilkan
   * N dari M kolom — kurangi nilai atau tambah Saring; …". null bila semua tampil.
   */
  note: string | null;
  /** "Disaring — Cabang: Bandung, Jakarta; …" bila ada saringan pivot; null bila tidak ada. */
  filterNote: string | null;
}

const count = (n: number) => formatNumber(n, { style: "number", decimals: 0 });
/** Cara tampil + format sendiri nilai ikut ke header kolom datanya (nilai biasa: tanpa field). */
const as = (v: { showAs?: ShowAs; format?: NumberFormat }) => ({
  ...(v.showAs ? { showAs: v.showAs } : {}),
  ...(v.format ? { format: v.format } : {}),
});
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
    valueHeads = p.values.map((v) => ({ label: v.label, type: v.type, total: false, ...as(v) }));
  } else if (nv === 1) {
    // Satu nilai: header langsung periode, kolom kanan = nama nilai (mis. "Total No.").
    const v = p.values[0]!;
    valueHeads = [
      ...colLabels.map((l, i) => ({
        label: l,
        type: v.type,
        total: false,
        pick: colPick(i),
        ...as(v),
      })),
      ...(withTotal ? [{ label: v.label, type: v.type, total: true, ...as(v) }] : []),
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
        ...as(v),
      })),
    );
  }

  const flat = (cells: PivotCell[], tot: PivotCell | undefined | null, hasTotal: boolean) => [
    ...cells.flatMap((c) => Array.from({ length: nv }, (_, m) => c?.[m] ?? null)),
    ...(hasTotal ? Array.from({ length: nv }, (_, m) => tot?.[m] ?? null) : []),
  ];

  // Kelompok per level induk: baris 3–4 kolom dari `nest` (T-070), baris 2 kolom dari groups/subtotals.
  const n = p.rowFields.length;
  const levels: NonNullable<PivotData["nest"]>["levels"] =
    p.nest?.levels ??
    (n === 2 ? [{ labels: p.groups, subtotals: p.subtotals, totals: p.subtotalTotals }] : []);
  const pathOf = (ri: number): (number | null)[] =>
    p.nest?.paths[ri] ?? (n === 2 ? [p.rows[ri]!.group] : []);
  const rows: PivotBodyRow[] = [];
  let last: (number | null)[] = [];
  p.rows.forEach((r, ri) => {
    const path = pathOf(ri);
    // Kepala kelompok setiap level yang berganti (dan semua level di bawahnya), seperti Excel.
    let changed = false;
    path.forEach((g, l) => {
      changed ||= g !== last[l];
      if (!changed || g === null || g < 0) return;
      const lv = levels[l]!;
      rows.push({
        kind: "group",
        label: label(lv.labels[g], p.rowFields[l]!),
        depth: l as PivotBodyRow["depth"],
        values: lv.subtotals ? flat(lv.subtotals[g] ?? [], lv.totals?.[g], !!lv.totals) : [],
        pick: { field: `row${l}` as PivotFieldRole, raw: lv.labels[g] },
      });
    });
    last = path;
    const leaf = n - 1;
    rows.push({
      kind: "leaf",
      label: label(r.labels[leaf], p.rowFields[leaf]!),
      depth: leaf as PivotBodyRow["depth"],
      values: flat(p.cells[ri] ?? [], p.rowTotals?.[ri], withTotal),
      pick: { field: `row${leaf}` as PivotFieldRole, raw: r.labels[leaf] },
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
  // Anggaran sel (T-070): kolom dipangkas di bawah batas 40 karena banyak baris × nilai.
  const budgetCut = split && p.columns.length < Math.min(p.columnCount, PIVOT_COLUMNS_SHOWN);
  if (p.columnCount > p.columns.length) {
    parts.push(`${count(p.columns.length)} dari ${count(p.columnCount)} kolom`);
  }
  const shownText = `Menampilkan ${parts.join(" dan ")}`;
  const note = !parts.length
    ? null
    : budgetCut
      ? `${shownText} — kurangi nilai atau tambah Saring; total tetap mencakup semua baris dan kolom.`
      : `${shownText}. Persempit dengan filter; total tetap mencakup semua data.`;

  const fields: PivotField[] = [
    ...p.rowFields.map((f, i) => ({ role: `row${i}`, ...f }) as PivotField),
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
