import { DuckDBInstance } from "@duckdb/node-api";
import type { RawValue } from "./types";

/**
 * DuckDB read_csv: semua VARCHAR, tanpa header, kolom eksplisit (baris pembuka lebih sempit
 * dipadatkan NULL), quote/escape RFC 4180. Mengembalikan baris sesuai urutan file.
 */
export async function parseCsvDuckdb(
  path: string,
  opts: { cols: number; delimiter: string; tmpDir: string },
  onRow: (rowNumber: number, values: RawValue[]) => void,
): Promise<void> {
  const db = await DuckDBInstance.create(":memory:", {
    memory_limit: "1GB",
    threads: "2",
    temp_directory: opts.tmpDir,
    max_temp_directory_size: "1GB",
  });
  const conn = await db.connect();
  try {
    const columns = Object.fromEntries(
      Array.from({ length: opts.cols }, (_, i) => [`c${i + 1}`, "VARCHAR"]),
    );
    const result = await conn.stream(
      `SELECT * FROM read_csv($path, header = false, auto_detect = false, delim = $delim, quote = '"', escape = '"',
         null_padding = true, strict_mode = false, columns = ${toStruct(columns)})`,
      { path, delim: opts.delimiter },
    );
    let n = 0;
    for await (const rows of result.yieldRowsJs()) {
      for (const row of rows) onRow(++n, row as RawValue[]);
    }
  } finally {
    conn.closeSync();
    db.closeSync();
  }
}

function toStruct(cols: Record<string, string>): string {
  return `{${Object.entries(cols)
    .map(([k, v]) => `'${k}': '${v}'`)
    .join(", ")}}`;
}
