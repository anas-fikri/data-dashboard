/*
 * Ekspor CSV/XLSX widget pivot (T-9bc2): query pivot yang sama dengan layar (buildPivotSql atas parquet
 * kerja, filter dashboard ikut) → PivotData → model tabel layar (pivotTable) → grid berbentuk tabel biasa
 * yang mudah disaring di Excel:
 *  - kolom label per kolom baris (2 kolom baris → "Customer", "Layanan"; label kelompok diulang di setiap
 *    baris rincian, baris subtotal berlabel "Subtotal"), lalu satu kolom per kolom data dengan nama header
 *    layar ("Jan 2026", "Total No.", atau "Jan 2026 · Total No." bila banyak nilai);
 *  - baris Total di bawah; catatan batas tampil (200 baris × 40 kolom) sebagai baris terakhir.
 * Nilai tetap angka (XLSX bertipe angka, CSV angka tanpa kutip); teks lewat netralisasi formula yang sama
 * dengan ekspor tabel. Grid kecil (≤ ± 400 baris), jadi ditulis di Node.
 */
import { writeFile } from "node:fs/promises";
import type { DuckDBConnection } from "@duckdb/node-api";
import { buildPivotSql, pivotOutTypes, shapePivot } from "@/features/query/pivot";
import { toJson, type ResolvedWidget } from "@/features/query/service";
import type { BuiltSql } from "@/features/query/sql";
import { columnNames, pivotTable, type PivotTableModel } from "@/features/widgets/pivot-table";
import { isPercentShowAs } from "@/features/widgets/show-as";
import type { NumberFormat, ShowAs } from "@/features/widgets/spec";
import { csvHeader, neutraliseCsv, quoteCsv } from "./csv";
import { writeXlsx, type XlsxColumn, type XlsxKind } from "./xlsx";

export interface PivotGrid {
  columns: XlsxColumn[];
  /** Baris data (tanpa header); sel null = kosong. */
  rows: unknown[][];
}

const kindOf = (type: string, showAs?: ShowAs, format?: NumberFormat): XlsxKind =>
  // Field terhitung berformat persen (T-068) sama dengan cara tampil persen: sel XLSX bertipe persen.
  isPercentShowAs(showAs) || format?.style === "percent"
    ? "percent"
    : type === "duration" || type === "date" || type === "timestamp"
      ? type
      : type === "integer" || type === "decimal"
        ? "number"
        : "text";

/** Nilai sel: Terkecil/Terbesar kolom tanggal (teks ISO naif dari toJson) → Date UTC untuk XLSX/CSV. */
const cellValue = (v: unknown, kind: XlsxKind): unknown =>
  (kind === "date" || kind === "timestamp") && typeof v === "string"
    ? new Date(`${v.length === 10 ? `${v}T00:00:00` : v}Z`)
    : v;

/** Grid ekspor dari model tabel pivot. Murni. */
export function pivotGrid(model: PivotTableModel, rowFields: readonly string[]): PivotGrid {
  const two = rowFields.length === 2;
  const names = columnNames(model);
  const columns: XlsxColumn[] = [
    ...rowFields.map((label) => ({ label, kind: "text" as const })),
    ...model.valueHeads.map((h, i) => ({
      label: names[i]!,
      kind: kindOf(h.type, h.showAs, h.format),
    })),
  ];
  const kinds = model.valueHeads.map((h) => kindOf(h.type, h.showAs, h.format));
  const values = (vs: unknown[]) => vs.map((v, i) => cellValue(v, kinds[i]!));
  const rows: unknown[][] = [];
  let group = "";
  for (const r of model.rows) {
    if (r.kind === "group") {
      group = r.label;
      // Tanpa subtotal baris kelompok tidak berisi angka: labelnya cukup di baris rinciannya.
      if (r.values.length) rows.push([group, "Subtotal", ...values(r.values)]);
    } else {
      rows.push([...(two ? [group] : []), r.label, ...values(r.values)]);
    }
  }
  if (model.total) rows.push(["Total", ...(two ? [null] : []), ...values(model.total.values)]);
  if (model.note) rows.push([model.note]);
  return { columns, rows };
}

/** Detik → [-]h:mm:ss (sama dengan ekspor tabel). */
function durationText(v: number): string {
  const s = Math.abs(Math.round(v));
  const sign = Math.round(v) < 0 ? "-" : "";
  return `${sign}${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Satu sel CSV: kosong untuk null, angka apa adanya, teks selalu dikutip + dinetralkan. */
function csvCell(v: unknown, kind: XlsxKind): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    // Sama dengan ekspor tabel: YYYY-MM-DD / YYYY-MM-DD HH:MM:SS tanpa zona.
    const iso = v.toISOString();
    return kind === "date" ? iso.slice(0, 10) : `${iso.slice(0, 10)} ${iso.slice(11, 19)}`;
  }
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "";
    return kind === "duration" ? durationText(v) : String(v);
  }
  return quoteCsv(neutraliseCsv(String(v)));
}

export async function writePivotCsv(outPath: string, grid: PivotGrid): Promise<number> {
  const body = grid.rows
    .map((r) => grid.columns.map((c, i) => csvCell(r[i], c.kind)).join(","))
    .join("\n");
  await writeFile(outPath, csvHeader(grid.columns.map((c) => c.label)) + body + (body ? "\n" : ""));
  return grid.rows.length;
}

/** Jalankan query pivot widget di DuckDB ekspor lalu tulis CSV/XLSX ke `outPath`; jumlah baris data. */
export async function writePivotExport(
  conn: DuckDBConnection,
  resolved: Pick<ResolvedWidget, "planned" | "dash">,
  parquetPath: string,
  ext: "csv" | "xlsx",
  outPath: string,
  sheetName: string,
  /** Sumber banyak segmen (T-037): read_parquet($path) diganti daftar/proyeksi. */
  rewrite: (b: BuiltSql) => BuiltSql = (b) => b,
): Promise<number> {
  if (resolved.planned.kind !== "pivot") throw new Error("bukan widget pivot");
  const shape = resolved.planned.pivot;
  const plan = { ...resolved.planned.plan, dash: resolved.dash.clauses };
  const built = rewrite(buildPivotSql(plan, shape, parquetPath));
  const raw = (await conn.runAndReadAll(built.sql, built.params)).getRowsJS() as unknown[][];
  const types = pivotOutTypes(plan, shape);
  const data = shapePivot(
    raw.map((r) => r.map((x, i) => toJson(x, types[i]!))),
    plan,
    shape,
  );
  const grid = pivotGrid(
    pivotTable(data),
    data.rowFields.map((f) => f.label),
  );
  if (ext === "csv") return writePivotCsv(outPath, grid);
  return writeXlsx(
    outPath,
    { sheetName, columns: grid.columns },
    (async function* () {
      yield grid.rows;
    })(),
  );
}
