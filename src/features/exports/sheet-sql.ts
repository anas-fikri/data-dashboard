/*
 * SQL ekspor tampilan "Lihat data" (T-046, rencana G-6 §3.5). Baris dan urutannya HARUS sama dengan
 * grid (grid-service.ts runGridRows):
 *  - tampilan polos (tanpa urut/saring/cari) dan jumlah baris tiap segmen diketahui → urutan jalur 1
 *    grid: segmen menurut manifest, lalu baris di dalam file (typed ditulis urut `_row`);
 *  - selain itu → jalur 2 grid: WHERE saringan/cari dan ORDER BY kunci urut … , `_row` yang SAMA
 *    (gridWhereSql/gridOrderSql), atas sumber `read_parquet($path)` (segmen lewat withSegments).
 * Kolom = kolom terlihat dalam urutan tampil, teks utuh (tanpa potong 500 karakter). Alias keluaran
 * o<i> buatan program: ORDER BY tetap merujuk kolom sumber c<pos>, bukan nilai yang sudah
 * dinetralkan/diubah jadi teks. Semua nilai lewat parameter; target CSV/XLSX = valueExpr ekspor widget
 * (netralisasi formula = + - @ tab CR, desimal tanpa nol di belakang, durasi h:mm:ss, tanggal ISO).
 * Murni.
 */
import { sqlType } from "@/features/ingest/infer";
import { gridOrderSql, gridWhereSql, isPlainWindow, type GridPlan } from "@/features/query/grid";
import type { SegmentFile } from "@/features/query/source";
import type { BuiltSql } from "@/features/query/sql";
import type { OutColumn } from "@/features/query/spec";
import { ident } from "@/lib/duckdb";
import { valueExpr, type ExportTarget } from "./sql";

type Col = GridPlan["cols"][number];

const cid = (c: Pick<Col, "pos">) => ident(`c${Math.trunc(c.pos)}`);

/** Kolom file (kunci alias o<i>, label = nama tampil skema, tipe) dalam urutan tampil. */
export function sheetExportColumns(
  plan: GridPlan,
  names: ReadonlyMap<number, string>,
): Pick<OutColumn, "key" | "label" | "type">[] {
  return plan.cols.map((c, i) => ({
    key: `o${i}`,
    label: names.get(c.pos) ?? `Kolom ${c.pos}`,
    type: c.type,
  }));
}

const selectList = (plan: GridPlan, target: ExportTarget) =>
  plan.cols.map((c, i) => `${valueExpr(cid(c), c.type, target)} AS ${ident(`o${i}`)}`).join(", ");

const limitOf = (maxRows: number) => `LIMIT ${Math.max(0, Math.trunc(maxRows))}`;

/** Jalur urut/saring/cari (dan tampilan polos satu sumber): urutan = gridOrderSql. */
export function buildSheetExportSql(
  plan: GridPlan,
  parquetPath: string,
  target: ExportTarget,
  maxRows: number,
): BuiltSql {
  const params: BuiltSql["params"] = { path: parquetPath };
  const where = gridWhereSql(plan, params);
  const sql = [
    `SELECT ${selectList(plan, target)}`,
    `FROM read_parquet($path)`,
    where,
    `ORDER BY ${gridOrderSql(plan)}`,
    limitOf(maxRows),
  ]
    .filter(Boolean)
    .join("\n");
  return { sql, params };
}

/**
 * Tampilan polos beberapa segmen (jalur 1 grid): satu SELECT per file (UNION ALL) dengan proyeksi
 * eksplisit (kolom yang tidak ada di file → NULL bertipe skema; `_row` legacy INTEGER → BIGINT), lalu
 * ORDER BY indeks segmen, `_row`. `paths[i]` = file lokal `files[i]`.
 */
export function buildSheetExportSegmentSql(
  plan: GridPlan,
  files: SegmentFile[],
  paths: string[],
  target: ExportTarget,
  maxRows: number,
): BuiltSql {
  if (files.length !== paths.length) throw new Error("jumlah path segmen tidak cocok");
  const params: BuiltSql["params"] = {};
  const parts = files.map((f, k) => {
    const has = new Set(f.columns.length ? f.columns : plan.cols.map((c) => c.pos));
    params[`s${k}`] = paths[k]!;
    const proj = plan.cols.map(
      (c) => `CAST(${has.has(c.pos) ? cid(c) : "NULL"} AS ${sqlType(c)}) AS ${cid(c)}`,
    );
    return `SELECT ${k} AS _part, CAST(_row AS BIGINT) AS _row, ${proj.join(", ")} FROM read_parquet($s${k})`;
  });
  const sql = [
    `SELECT ${selectList(plan, target)}`,
    `FROM (${parts.join("\nUNION ALL\n")})`,
    `ORDER BY _part, _row`,
    limitOf(maxRows),
  ].join("\n");
  return { sql, params };
}

/**
 * Jalur yang dipakai grid untuk tampilan ini: urutan segmen hanya bila tampilan polos, lebih dari satu
 * file, dan jumlah baris tiap segmen diketahui (sama dengan syarat jalur 1 runGridRows).
 */
export const segmentOrdered = (plan: GridPlan, segs: { dataRows: number | null }[]) =>
  isPlainWindow(plan) && segs.length > 1 && segs.every((s) => s.dataRows !== null);
