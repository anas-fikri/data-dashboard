/*
 * Lib DuckDB bersama (T-006; dipakai worker sekarang, query app di T-009). Setiap proses memakai
 * memory_limit eksplisit (D7) dan temp_directory dengan batas ukuran agar spill tidak memenuhi disk.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";

export interface DuckOptions {
  /** File database (di disk temp) — tabel besar bisa spill ke disk; ":memory:" untuk kecil. */
  path: string;
  tmpDir: string;
  memoryLimit?: string;
  threads?: number;
  maxTempSize?: string;
}

export interface Duck {
  conn: DuckDBConnection;
  /** Hentikan query yang sedang berjalan (dataset dihapus, deadline). */
  interrupt(): void;
  close(): void;
}

export async function openDuck(o: DuckOptions): Promise<Duck> {
  const temp = join(o.tmpDir, "duck-temp");
  mkdirSync(temp, { recursive: true });
  const db = await DuckDBInstance.create(o.path, {
    memory_limit: o.memoryLimit ?? "1GB",
    threads: String(o.threads ?? 2),
    temp_directory: temp,
    max_temp_directory_size: o.maxTempSize ?? "8GB",
    // Default DuckDB, dikunci eksplisit: ingest CSV memakai rowid sebagai urutan record (T-006).
    preserve_insertion_order: "true",
    // Tanpa unduhan ekstensi saat runtime (on-prem tanpa internet); parquet sudah bawaan.
    autoinstall_known_extensions: "false",
    autoload_known_extensions: "false",
  });
  const conn = await db.connect();
  let closed = false;
  return {
    conn,
    interrupt: () => {
      if (!closed) conn.interrupt();
    },
    close: () => {
      if (closed) return;
      closed = true;
      conn.closeSync();
      db.closeSync();
    },
  };
}

/** Kutip identifier SQL DuckDB (nama kolom/tabel berasal dari program, tetap dikutip). */
export const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;

/** Literal string SQL (path file). Nilai dari user selalu lewat parameter binding, bukan ini. */
export const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
