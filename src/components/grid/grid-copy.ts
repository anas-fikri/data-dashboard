/*
 * Salin ke Excel dari "Lihat data" (T-045, rencana G-6 §3.5). Murni (tanpa DOM) kecuali writeClipboard.
 *  - Angka tanpa pemisah ribuan, pemisah desimal sesuai pilihan "Excel saya pakai koma/titik"
 *    (default dari bahasa browser); angka negatif tidak diubah.
 *  - Tanggal ISO yyyy-mm-dd, tanggal & jam "yyyy-mm-dd hh:mm:ss", durasi [h]:mm:ss (dibaca Excel
 *    sebagai tanggal/waktu).
 *  - Netralisasi formula (D14, sama dengan ekspor CSV) HANYA untuk sel bertipe teks yang diawali
 *    = + - @ tab CR: diberi awalan '.
 *  - Baris: TSV + baris judul; tab/baris baru di dalam teks dikutip gaya Excel ("…", "" untuk ").
 */
import type { ColumnType } from "@/features/ingest/infer";

/** Batas salin baris (GRID_COPY_MAX_ROWS); lebih dari ini → tawaran "Unduh tampilan". */
export const COPY_MAX_ROWS = 1_000;

export type DecimalSep = "," | ".";

/** Pemisah desimal bawaan dari bahasa browser ("id-ID" → koma, "en-US" → titik). */
export function defaultDecimal(locale: string | undefined): DecimalSep {
  try {
    return new Intl.NumberFormat(locale).format(1.5).includes(",") ? "," : ".";
  } catch {
    return ",";
  }
}

/** Sama dengan FORMULA_START ekspor CSV (src/features/exports/sql.ts). */
const FORMULA_START = /^[=+\-@\t\r]/;

/** Angka → teks tanpa pemisah ribuan dan tanpa notasi eksponen. */
function plainNumber(n: number, sep: DecimalSep): string {
  let s = String(n);
  if (/e/i.test(s)) {
    s = n.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 20 });
  }
  return sep === "," ? s.replace(".", ",") : s;
}

/** Nilai sel (bentuk JSON server) → teks yang dibaca Excel sesuai tipenya. NULL → kosong. */
export function excelValue(value: unknown, type: ColumnType, sep: DecimalSep): string {
  if (value === null || value === undefined) return "";
  switch (type) {
    case "duration": {
      // Detik → [h]:mm:ss (Excel membacanya sebagai waktu/durasi, juga di atas 24 jam).
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) return String(value);
      const t = Math.round(Math.abs(n));
      const pad = (x: number) => String(x).padStart(2, "0");
      return `${n < 0 ? "-" : ""}${Math.floor(t / 3600)}:${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)}`;
    }
    case "integer":
    case "decimal": {
      const n = typeof value === "number" ? value : Number(value);
      return Number.isFinite(n) ? plainNumber(n, sep) : String(value);
    }
    case "date":
      return String(value).slice(0, 10);
    case "timestamp":
      return String(value).replace("T", " ").slice(0, 19);
    case "boolean":
      return value ? "Ya" : "Tidak";
    default: {
      const s = String(value);
      return FORMULA_START.test(s) ? `'${s}` : s;
    }
  }
}

/** Satu sel TSV: teks bertab/baris baru/kutip dikutip seperti Excel menyalin. */
function tsvCell(s: string): string {
  return /[\t\n\r"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export interface CopyColumn {
  /** Kunci nilai di baris (colId c<pos>). */
  id: string;
  name: string;
  type: ColumnType;
}

/** Baris → TSV dengan baris judul (judul juga dinetralkan: nama kolom adalah teks dari file). */
export function rowsToTsv(
  cols: readonly CopyColumn[],
  rows: readonly Record<string, unknown>[],
  sep: DecimalSep,
): string {
  const head = cols.map((c) => tsvCell(excelValue(c.name, "text", sep)));
  const body = rows.map((r) => cols.map((c) => tsvCell(excelValue(r[c.id], c.type, sep))));
  return [head, ...body].map((r) => r.join("\t")).join("\r\n");
}

/**
 * Tulis teks ke papan klip. Teks yang masih dimuat (Promise) lewat ClipboardItem agar izin dari
 * tombol/pintasan pengguna tetap berlaku di Safari/Firefox; fallback writeText.
 */
export async function writeClipboard(text: string | Promise<string>): Promise<void> {
  const clip = navigator.clipboard;
  if (typeof text !== "string" && typeof ClipboardItem !== "undefined" && clip?.write) {
    try {
      await clip.write([
        new ClipboardItem({
          "text/plain": text.then((t) => new Blob([t], { type: "text/plain" })),
        }),
      ]);
      return;
    } catch {
      // Peramban tanpa ClipboardItem berjanji → coba writeText (teks yang sama).
    }
  }
  await clip.writeText(await text);
}
