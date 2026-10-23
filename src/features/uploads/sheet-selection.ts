import type { XlsxSheetInfo } from "./xlsx-sheets";

/*
 * Pilihan sheet saat unggah xlsx (T-85tb), murni (diuji unit). Hanya worksheet yang bisa dipilih;
 * chartsheet/lainnya ditampilkan nonaktif. Bawaan centang: worksheet tampil tanpa PivotTable + sheet yang
 * cocok dengan sheet data aktif (penggantian data). Sheet tersembunyi dan ber-PivotTable tidak dicentang
 * (ringkasan, bukan data mentah) kecuali sheet aktif.
 */

export const SHEET_SELECT_MAX = 50;

export const SHEETS_REQUIRED = "Pilih minimal satu sheet.";
export const SHEETS_TOO_MANY = `Pilih paling banyak ${SHEET_SELECT_MAX} sheet.`;

export function selectable(s: XlsxSheetInfo): boolean {
  return s.kind === "worksheet" && s.name.length > 0;
}

/** Pemilih ditampilkan bila ada ≥ 2 worksheet yang bisa dipilih (1 sheet = tidak ada yang dipilih). */
export function needsPicker(sheets: readonly XlsxSheetInfo[] | null): boolean {
  const ok = (sheets ?? []).filter(selectable).length;
  // > batas sheet per file (dihitung worker atas SEMUA sheet, termasuk grafik): pilihan wajib dikirim.
  return ok >= 2 || (ok >= 1 && (sheets ?? []).length > SHEET_SELECT_MAX);
}

export function defaultSelection(
  sheets: readonly XlsxSheetInfo[],
  activeSheets: readonly string[],
): string[] {
  const ok = sheets.filter(selectable);
  const active = new Set(activeSheets);
  // Sheet data aktif selalu ikut (penggantian data); sheet baru yang tampil tanpa PivotTable juga —
  // sheet data baru tidak boleh hilang diam-diam.
  const picked = ok.filter((s) => active.has(s.name) || (s.state === "visible" && !s.pivot));
  return (picked.length ? picked : ok).map((s) => s.name).slice(0, SHEET_SELECT_MAX);
}

/**
 * Pilihan yang dikirim ke server: [] bila semua worksheet dipilih (persis perilaku lama: semua sheet
 * dibaca); selain itu nama urut workbook.
 */
export function selectionToSend(
  sheets: readonly XlsxSheetInfo[],
  picked: ReadonlySet<string>,
): string[] {
  const ok = sheets.filter(selectable);
  const names = ok.filter((s) => picked.has(s.name)).map((s) => s.name);
  // Semua dipilih dan masih dalam batas = perilaku lama; > batas tetap dikirim (ditolak picker/server).
  // Batas dihitung atas semua sheet buku kerja (sama dengan worker), bukan hanya worksheet.
  if (names.length === ok.length && sheets.length <= SHEET_SELECT_MAX) return [];
  return names;
}

/** Keterangan per sheet (alasan tidak dicentang bawaan). */
export function sheetNote(s: XlsxSheetInfo): string | null {
  if (s.kind === "chartsheet") return "grafik, tidak bisa diimpor";
  if (s.kind !== "worksheet") return "bukan sheet data, tidak bisa diimpor";
  if (s.pivot) return "berisi PivotTable";
  if (s.state !== "visible") return "tersembunyi";
  return null;
}
