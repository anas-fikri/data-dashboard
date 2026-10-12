import { DuckDBInstance } from "@duckdb/node-api";
import type { Parser, RawValue } from "./types";

/**
 * DuckDB read_xlsx (ekstensi excel), semua kolom VARCHAR, tanpa header, tidak berhenti di baris kosong.
 * memory_limit/threads mengikuti D7 (worker: 1 GB, 2 thread). Nomor baris = urutan baris keluaran.
 */
export const duckdbParser: Parser = {
  name: "duckdb-read_xlsx",
  physicalRowNumbers: false,
  async parse(path, opts, onRow) {
    const db = await DuckDBInstance.create(":memory:", {
      memory_limit: process.env.DUCKDB_MEM ?? "1GB",
      threads: "2",
      temp_directory: opts.tmpDir,
      max_temp_directory_size: "1GB",
    });
    const conn = await db.connect();
    await conn.run("INSTALL excel; LOAD excel;");
    try {
      for (let s = 0; s < opts.sheetNames.length; s++) {
        const range = opts.ranges?.[s];
        const result = await conn.stream(
          `SELECT * FROM read_xlsx($path, sheet = $sheet, header = false, all_varchar = true, stop_at_empty = false${
            range ? ", range = $range" : ""
          })`,
          range
            ? { path, sheet: opts.sheetNames[s]!, range }
            : { path, sheet: opts.sheetNames[s]! },
        );
        let n = 0;
        for await (const rows of result.yieldRowsJs()) {
          for (const row of rows) onRow(s, ++n, row as RawValue[]);
        }
      }
    } finally {
      conn.closeSync();
      db.closeSync();
    }
  },
};
