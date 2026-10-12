import type { ColumnSchema, ColumnType, DateFormat, NumberLocale } from "@/features/ingest/infer";

/* Label tipe/format untuk user non-teknis (bahasa sehari-hari, contoh nilai di format). */

export const TYPE_LABEL: Record<ColumnType, string> = {
  text: "Teks",
  integer: "Bilangan bulat",
  decimal: "Angka desimal",
  date: "Tanggal",
  timestamp: "Tanggal & jam",
  duration: "Durasi",
  boolean: "Ya / Tidak",
};

/** Durasi hanya hasil deteksi dari sel waktu Excel; tidak ditawarkan untuk kolom lain. */
export function typeOptions(current: ColumnType): ColumnType[] {
  const base: ColumnType[] = ["text", "integer", "decimal", "date", "timestamp", "boolean"];
  return current === "duration" ? [...base, "duration"] : base;
}

export const DATE_FORMAT_LABEL: Record<DateFormat, string> = {
  "dd-mm-yyyy": "31-12-2025",
  "dd/mm/yyyy": "31/12/2025",
  "dd.mm.yyyy": "31.12.2025",
  "yyyy-mm-dd": "2025-12-31",
  "yyyy/mm/dd": "2025/12/31",
  "mm/dd/yyyy": "12/31/2025 (bulan dulu)",
  serial: "Nomor seri Excel (46022)",
};
export const DATE_FORMATS = Object.keys(DATE_FORMAT_LABEL) as DateFormat[];

export const LOCALE_LABEL: Record<NumberLocale, string> = {
  id: "1.234,56 (Indonesia)",
  us: "1,234.56 (internasional)",
};

export const needsDateFormat = (t: ColumnType) => t === "date" || t === "timestamp";
export const needsLocale = (t: ColumnType) => t === "integer" || t === "decimal";

export const fmtInt = (n: number) => n.toLocaleString("id-ID");
export const fmtPct = (x: number) =>
  `${(x * 100).toLocaleString("id-ID", { maximumFractionDigits: x > 0 && x < 0.01 ? 2 : 0 })}%`;

/** Pilihan kolom yang bisa diedit user (bagian ColumnSchema yang dikirim ke recast). */
export type ColumnDraft = Pick<
  ColumnSchema,
  "pos" | "name" | "type" | "numberLocale" | "dateFormat" | "hidden"
>;

export const draftOf = (c: ColumnSchema): ColumnDraft => ({
  pos: c.pos,
  name: c.name,
  type: c.type,
  numberLocale: c.numberLocale,
  dateFormat: c.dateFormat,
  hidden: c.hidden,
});
