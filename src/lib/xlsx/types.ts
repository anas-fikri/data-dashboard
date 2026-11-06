/** Nilai sel yang dikembalikan parser, apa adanya (string/angka/Date/null). */
export type RawValue = string | number | boolean | Date | null | undefined;

/**
 * Callback per baris. `rowNumber` = nomor baris fisik 1-based bila parser mengetahuinya, atau
 * urutan baris yang dipancarkan (parser tanpa nomor baris) — verifikasi mencatat bedanya.
 * `values[c]` = kolom ke-c (0-based).
 */
export type OnRow = (sheet: number, rowNumber: number, values: RawValue[]) => void;

export interface ParseOptions {
  /** Sheet yang dibaca (dibaca urut workbook; kosong = semua; nama tak ada → XlsxLimitError). */
  sheetNames: string[];
  /** Direktori sementara (spill), dibersihkan pemanggil. */
  tmpDir: string;
  /**
   * Rentang sel per sheet (mis. "A1:AD1000004"). Hanya DuckDB yang membutuhkannya: tanpa range,
   * lebar tabel diambil dari baris pertama sehingga kolom di luar baris judul hilang.
   */
  ranges?: string[];
  /** Progres per sheet: fraksi XML worksheet yang sudah dibaca (dipanggil per potongan stream). */
  onProgress?: (p: { sheet: number; sheetName: string; fraction: number }) => void;
  /** Batas sheet (sinkron, dipanggil berurutan sebelum/ sesudah baris sheet itu). */
  onSheetStart?: (sheet: number, name: string) => void;
  onSheetEnd?: (sheet: number) => void;
  /**
   * Ditunggu parser setelah setiap potongan stream dan setelah setiap sheet: konsumen async
   * (mis. penulis Parquet) memproses baris yang terkumpul. Antrean ≤ satu potongan (± 16 KB XML).
   */
  drain?: () => Promise<void>;
}

export interface ParseSummary {
  /** Sel yang dipotong karena melebihi batas panjang (Excel: 32.767 karakter). */
  truncatedCells: number;
  /** Sel terpotong per indeks sheet. */
  truncatedBySheet: number[];
}

export interface Parser {
  name: string;
  /** Apakah rowNumber = nomor baris fisik (dibutuhkan raw.parquet `_row`). */
  physicalRowNumbers: boolean;
  parse(path: string, opts: ParseOptions, onRow: OnRow): Promise<ParseSummary | void>;
}
