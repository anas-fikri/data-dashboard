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
  /**
   * File database kedua untuk tabel lebar, di-ATTACH ber-blok 16 KiB saat pertama dipakai
   * (wideCatalog). Tabel lebar menahan satu segmen per kolom di memori: 2.048 kolom × blok default
   * 256 KiB tidak muat di 1 GB, × 16 KiB muat. Tabel sempit tetap di DB utama (blok default, lebih
   * cepat untuk jutaan baris).
   */
  widePath?: string;
}

/** Ukuran blok DB tabel lebar. */
export const WIDE_BLOCK_SIZE = 16 * 1024;

export interface Duck {
  conn: DuckDBConnection;
  /** Hentikan query yang sedang berjalan (dataset dihapus, deadline). */
  interrupt(): void;
  /** Nama katalog DB tabel lebar (di-ATTACH sekali); null bila widePath tidak diisi. */
  wideCatalog(): Promise<string | null>;
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
  let wide: Promise<string> | null = null;
  return {
    conn,
    interrupt: () => {
      if (!closed) conn.interrupt();
    },
    wideCatalog: () => {
      if (!o.widePath) return Promise.resolve(null);
      // Ukuran blok hanya bisa dipilih saat ATTACH file baru.
      wide ??= conn
        .run(`ATTACH ${lit(o.widePath)} AS wide (BLOCK_SIZE ${WIDE_BLOCK_SIZE})`)
        .then(() => "wide");
      return wide;
    },
    close: () => {
      if (closed) return;
      closed = true;
      conn.closeSync();
      db.closeSync();
    },
  };
}

/**
 * Jalankan query panjang dengan watchdog: `watch` dipanggil tiap `everyMs`; bila melempar (dataset
 * dihapus, deadline lewat), query diinterupsi dan error dari `watch` yang dilempar.
 */
export async function watched<T>(
  duck: Duck,
  watch: () => Promise<void>,
  fn: () => Promise<T>,
  everyMs = 5_000,
): Promise<T> {
  let watchErr: unknown = null;
  const timer = setInterval(() => {
    watch().catch((e: unknown) => {
      watchErr ??= e;
      duck.interrupt();
    });
  }, everyMs);
  try {
    const r = await fn();
    if (watchErr) throw watchErr;
    return r;
  } catch (e) {
    throw watchErr ?? e;
  } finally {
    clearInterval(timer);
  }
}

/** Kutip identifier SQL DuckDB (nama kolom/tabel berasal dari program, tetap dikutip). */
export const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;

/** Literal string SQL (path file). Nilai dari user selalu lewat parameter binding, bukan ini. */
export const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
