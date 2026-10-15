/*
 * Penulis CSV ekspor (T-017, E3): isi dari DuckDB `COPY (SELECT …) TO '<kerja>/body.csv'` (streaming di
 * DuckDB — 1 juta baris tidak pernah lewat Node), lalu Node menulis BOM UTF-8 + baris header (nama tampil
 * kolom, dikutip dan dinetralkan di Node karena nama dari user tidak boleh masuk SQL) + isi tadi.
 * RFC 4180: koma, kutip ganda, LF; NULL = kosong; teks kosong = "".
 */
import { createReadStream, createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import type { DuckDBConnection } from "@duckdb/node-api";
import { lit } from "@/lib/duckdb";
import type { BuiltSql } from "@/features/query/sql";
import { FORMULA_START } from "./sql";

/** Awalan ' untuk teks yang dibaca spreadsheet sebagai formula (= + - @ tab CR), AC5. */
export const neutraliseCsv = (s: string) => (FORMULA_START.test(s) ? `'${s}` : s);

/** Field CSV selalu dikutip; kutip ganda di dalamnya digandakan. */
export const quoteCsv = (s: string) => `"${s.replace(/"/g, '""')}"`;

export const CSV_BOM = "\uFEFF";

export function csvHeader(labels: string[]): string {
  return `${CSV_BOM}${labels.map((l) => quoteCsv(neutraliseCsv(l))).join(",")}\n`;
}

/**
 * Tulis file CSV lengkap ke `outPath`. `bodyPath` = file sementara isi (di direktori kerja job, satu-satunya
 * direktori yang boleh ditulis DuckDB ekspor). Mengembalikan jumlah baris data.
 */
export async function writeCsv(
  conn: DuckDBConnection,
  built: BuiltSql,
  labels: string[],
  bodyPath: string,
  outPath: string,
): Promise<number> {
  const r = await conn.run(
    `COPY (${built.sql}) TO ${lit(bodyPath)} (FORMAT csv, HEADER false, DELIMITER ',', QUOTE '"', ESCAPE '"', NULLSTR '')`,
    built.params,
  );
  const rows = Number(r.rowsChanged);
  const out = createWriteStream(outPath);
  out.write(csvHeader(labels));
  await pipeline(createReadStream(bodyPath), out);
  await rm(bodyPath, { force: true });
  return rows;
}
