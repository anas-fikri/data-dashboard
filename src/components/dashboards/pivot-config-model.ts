import { valuesText } from "@/components/dashboards/filters/filter-text";
import type { SourceSheet } from "@/features/dashboards/service";
import type { ColumnType } from "@/features/ingest/infer";
import type { Grain } from "@/features/query/spec";
import {
  MISSING_COLUMN,
  PIVOT_ROWS_MAX,
  PIVOT_VALUES_MAX,
  pivotSubtotalLevels,
  type NumberFormat,
  type PivotSpec,
  type WidgetConfig,
  valueColumns,
} from "@/features/widgets/spec";

/*
 * Model panel widget pivot (T-tcjp). Nilai awal langsung berguna, seperti contoh pengguna: baris = kolom
 * teks pertama (mis. customer), dipisahkan per bulan bila sheet punya kolom tanggal, isi = Total kolom
 * angka pertama, urut nilai terbesar, dengan Total. Ringkasan kalimat menjelaskan bentuk tabel dalam
 * bahasa sehari-hari. Murni.
 */
type Column = SourceSheet["columns"][number];
type Dimension = PivotSpec["rows"][number];
type Measure = PivotSpec["values"][number];

const TEMPORAL: ColumnType[] = ["date", "timestamp"];
const NUMERIC: ColumnType[] = ["integer", "decimal", "duration"];

/** Dimensi untuk kolom ini: tanggal dikelompokkan per bulan (paling umum untuk laporan). */
export const dimensionFor = (c: Column): Dimension =>
  TEMPORAL.includes(c.type)
    ? // Kolom sistem Periode (T-058): satuan periodenya.
      { column: c.pos, timeGrain: c.period ?? "month" }
    : { column: c.pos };

/** Pilihan kolom baris: teks dulu (kategori), lalu tanggal, lalu sisanya. */
function rowCandidates(cols: Column[]): Column[] {
  const rank = (c: Column) =>
    c.type === "text" ? 0 : TEMPORAL.includes(c.type) ? 1 : NUMERIC.includes(c.type) ? 3 : 2;
  return [...cols].sort((a, b) => rank(a) - rank(b) || a.pos - b.pos);
}

export function defaultPivot(
  sheetId: string,
  cols: Column[],
  prev: WidgetConfig,
  measure: Measure,
  format: NumberFormat,
): PivotSpec | null {
  const has = (pos: number) => cols.some((c) => c.pos === pos);
  // Pivot yang diingat di sheet yang sama: kolom yang masih ada dipertahankan.
  if (prev.type === "pivot" && prev.spec.sheetId === sheetId) {
    const { column, ...rest } = prev.spec;
    const rows = rest.rows.filter((d) => has(d.column));
    const values = rest.values.filter((m) => valueColumns(m).every(has));
    if (rows.length) {
      return {
        ...rest,
        rows,
        ...(column && has(column.column) ? { column } : {}),
        values: values.length ? values : [measure],
        format,
      };
    }
  }
  // Dari grafik: kategori grafik jadi baris pertama.
  const fromChart =
    prev.type === "bar" || prev.type === "line" || prev.type === "pie"
      ? cols.find((c) => c.pos === prev.spec.dimension.column)
      : undefined;
  const row = fromChart ?? rowCandidates(cols)[0];
  if (!row) return null;
  const date = cols.find((c) => TEMPORAL.includes(c.type) && c.pos !== row.pos);
  // Pivot baru: label menyaring widget lain (seperti grafik), kecuali grafik asalnya mematikannya.
  const chartOff =
    (prev.type === "bar" || prev.type === "line" || prev.type === "pie") &&
    prev.spec.crossFilter === false;
  return {
    sheetId,
    rows: [dimensionFor(row)],
    ...(date ? { column: dimensionFor(date) } : {}),
    values: [measure],
    sort: "value_desc",
    format,
    totals: true,
    subtotals: true,
    ...(chartOff ? {} : { crossFilter: true }),
  };
}

/** Kolom baris berikutnya untuk "Tambah rincian": teks lain yang belum dipakai, lalu sisanya. */
export function nextRowColumn(spec: PivotSpec, cols: Column[]): Column | undefined {
  const used = new Set([...spec.rows, ...(spec.column ? [spec.column] : [])].map((d) => d.column));
  return rowCandidates(cols).find((c) => !used.has(c.pos));
}

/**
 * Kolom untuk "Pisahkan per": tanggal dulu (per bulan, bila belum jadi baris per bulan), lalu kolom
 * teks yang belum dipakai — pilihan awal tidak langsung dobel.
 */
export function splitColumn(spec: PivotSpec, cols: Column[]): Column | undefined {
  const used = new Set(spec.rows.map((d) => d.column));
  const taken = new Set(spec.rows.map(dimKey));
  return (
    cols.find((c) => TEMPORAL.includes(c.type) && !taken.has(dimKey(dimensionFor(c)))) ??
    cols.find((c) => c.type === "text" && !used.has(c.pos))
  );
}

const dimKey = (d: Dimension) => `${d.column}:${d.timeGrain ?? ""}`;

/**
 * Isian yang mengulang kolom + rentang waktu yang sudah dipakai di atasnya (server menolaknya): "row1"
 * … "row3" (rincian = baris di atasnya) atau "column" (pemisah = salah satu baris). null bila tidak ada.
 */
export function duplicateField(spec: PivotSpec): `row${1 | 2 | 3}` | "column" | null {
  // Kolom hilang (penanda MISSING_COLUMN) diberi tahu MissingNotice, bukan sebagai dobel.
  const same = (a: Dimension, b: Dimension) =>
    a.column !== MISSING_COLUMN && dimKey(a) === dimKey(b);
  const i = spec.rows.findIndex((r, i) => i > 0 && spec.rows.slice(0, i).some((u) => same(u, r)));
  if (i > 0) return `row${i as 1 | 2 | 3}`;
  if (spec.column && spec.rows.some((r) => same(r, spec.column!))) return "column";
  return null;
}

/**
 * Ganti daftar baris dengan subtotal yang tetap masuk akal (T-070): level induk baru ikut sakelar
 * Subtotal yang ada; baris ≤ 2 kolom kembali ke bentuk 1.0.0 (`subtotals` saja); semua level aktif →
 * tanpa `subtotalLevels`.
 */
export function withRows(spec: PivotSpec, rows: PivotSpec["rows"]): PivotSpec {
  // Sakelar mengikuti field-nya, bukan posisinya: hapus baris tengah tidak menggeser subtotal.
  const on = new Set(pivotSubtotalLevels(spec).map((l) => spec.rows[l - 1]!));
  const parents = new Set(spec.rows.slice(0, -1));
  const levels = Array.from({ length: rows.length - 1 }, (_, i) => i + 1).filter((l) => {
    const d = rows[l - 1]!;
    return parents.has(d) ? on.has(d) : spec.subtotals;
  });
  return withSubtotals({ ...spec, rows }, levels);
}

/** Spec dengan level subtotal `levels` (1-based) dalam bentuk paling ringkas. */
function withSubtotals(spec: PivotSpec, levels: number[]): PivotSpec {
  const { subtotalLevels: _l, ...rest } = spec;
  const parents = spec.rows.length - 1;
  // Baris 1 kolom: tidak ada kelompok — sakelar disimpan apa adanya (dipakai lagi saat dirinci).
  if (parents < 1) return rest;
  if (levels.length === parents) return { ...rest, subtotals: true };
  if (!levels.length) return { ...rest, subtotals: false };
  return { ...rest, subtotals: true, subtotalLevels: levels };
}

/** Sakelar "Subtotal per …" satu level induk (1-based). */
export function toggleSubtotal(spec: PivotSpec, level: number, on: boolean): PivotSpec {
  const cur = pivotSubtotalLevels(spec).filter((l) => l !== level);
  return withSubtotals(
    spec,
    (on ? [...cur, level] : cur).sort((a, b) => a - b),
  );
}

export const DUPLICATE_TEXT =
  "Kolom ini sudah dipakai di atas dengan rentang waktu yang sama — pilih kolom atau rentang waktu lain.";

/** Nilai untuk "Tambah nilai": Total kolom angka yang belum dipakai, selain itu Jumlah baris. */
export function defaultMeasureFor(spec: PivotSpec, cols: Column[]): Measure {
  const used = new Set(spec.values.flatMap(valueColumns));
  const num = cols.find((c) => NUMERIC.includes(c.type) && !used.has(c.pos));
  return num ? { agg: "sum", column: num.pos } : { agg: "count" };
}

export const canAddRow = (spec: PivotSpec) => spec.rows.length < PIVOT_ROWS_MAX;
export const canAddValue = (spec: PivotSpec) => spec.values.length < PIVOT_VALUES_MAX;

const GRAIN_TEXT: Record<Grain, string> = {
  day: "per hari",
  week: "per minggu",
  month: "per bulan",
  quarter: "per kuartal",
  year: "per tahun",
};

/** "Tanggal (per bulan)" — nama kolom + pengelompokan waktunya. */
export function dimensionText(d: Dimension, cols: Column[]): string {
  const name = cols.find((c) => c.pos === d.column)?.name ?? "kolom tidak tersedia";
  return d.timeGrain ? `${name} (${GRAIN_TEXT[d.timeGrain]})` : name;
}

/**
 * Ringkasan bentuk tabel untuk panel, dalam potongan (teks biasa + nama yang ditebalkan), mis.
 * "Satu baris per Customer, dirinci per Layanan, satu kolom per Tanggal (per bulan), berisi Total No.,
 * dengan kolom dan baris Total, hanya Darat (Layanan)." — bagian Saring ikut disebut (T-rrn1).
 */
export function pivotSummary(
  spec: PivotSpec,
  cols: Column[],
  valueLabel: (m: Measure) => string,
): { text: string; strong?: boolean }[] {
  const out: { text: string; strong?: boolean }[] = [{ text: "Satu baris per " }];
  out.push({ text: dimensionText(spec.rows[0]!, cols), strong: true });
  spec.rows.slice(1).forEach((d, i) => {
    out.push(
      { text: i ? ", lalu per " : ", dirinci per " },
      { text: dimensionText(d, cols), strong: true },
    );
  });
  if (spec.column) {
    out.push(
      { text: ", satu kolom per " },
      { text: dimensionText(spec.column, cols), strong: true },
    );
  }
  out.push({ text: ", berisi " });
  spec.values.forEach((m, i) => {
    if (i) out.push({ text: i === spec.values.length - 1 ? " dan " : ", " });
    out.push({ text: valueLabel(m), strong: true });
  });
  if (spec.totals)
    out.push({ text: spec.column ? ", dengan kolom dan baris Total" : ", dengan baris Total" });
  const subs = pivotSubtotalLevels(spec);
  if (subs.length) {
    out.push(
      spec.rows.length > 2 && subs.length < spec.rows.length - 1
        ? {
            text: ` serta subtotal per ${subs.map((l) => dimensionText(spec.rows[l - 1]!, cols)).join(" dan ")}`,
          }
        : { text: " serta subtotal per kelompok" },
    );
  }
  for (const f of spec.filters ?? []) {
    if (f.column === MISSING_COLUMN) continue;
    const col = cols.find((c) => c.pos === f.column);
    out.push(
      { text: f.op === "in" ? ", hanya " : ", tanpa " },
      { text: valuesText(f.values, col?.type), strong: true },
      { text: ` (${col?.name ?? "kolom tidak tersedia"})` },
    );
  }
  out.push({ text: "." });
  return out;
}
