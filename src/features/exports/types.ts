/*
 * Kontrak ekspor widget (T-017) dan dashboard PDF (T-018) yang aman dipakai klien: bentuk permintaan,
 * status, dan kode galat. Rute: POST /api/exports (buat), GET /api/exports/[id] (status, pemilik saja),
 * GET /api/exports/[id]/download (302 ke presigned 5 menit; 404 bukan pemilik/tanpa akses; 410
 * kedaluwarsa).
 */
import type { DashFilter, PivotFilter } from "@/features/query/filters";

/** Format ekspor widget (tabular). PDF hanya untuk dashboard utuh (PdfExportCreateBody). */
export const EXPORT_FORMATS = ["csv", "xlsx"] as const;
export type ExportFormatInput = (typeof EXPORT_FORMATS)[number];
/** Ekstensi file ekspor apa pun (kunci objek, MIME, nama file). */
export type ExportFileFormat = ExportFormatInput | "pdf";

export type ExportState = "queued" | "running" | "done" | "failed" | "expired";

/** Body POST /api/exports: filter dashboard + urutan tabel sama dengan yang dikirim kartu widget. */
export interface ExportCreateBody {
  widgetId: string;
  format: ExportFormatInput;
  dashboardFilters?: DashFilter[];
  /** Saringan pivot dari pembaca (T-f4a7), sama dengan permintaan /api/query kartu pivot. */
  pivotFilters?: PivotFilter[];
  /** Urutan tabel (posisi kolom), sama dengan permintaan /api/query kartu tabel. */
  sort?: { column: number; dir: "asc" | "desc" };
}

/**
 * Body POST /api/exports "Unduh tampilan" Lihat data (T-046): tampilan grid saat ini — kolom terlihat
 * dalam urutan tampil (posisi skema), urut, saringan, dan cari dengan bentuk POST /api/sheets/:id/rows.
 * Hanya pemilik/editor dataset; viewer → FORBIDDEN.
 */
export interface SheetExportCreateBody {
  sheetId: string;
  versionId: string;
  format: ExportFormatInput;
  cols: number[];
  sort?: { pos: number; dir: "asc" | "desc" }[];
  filters?: ({ pos: number } & Record<string, unknown>)[];
  search?: { text: string; cols: number[] };
  /** Pemilih periode Lihat data (T-058): kunci periode terpilih. */
  period?: string[];
}

/**
 * Body POST /api/exports untuk PDF dashboard (T-018): `f` = encodeFilterParam(status filter yang
 * berlaku di layar) — null/kosong = tanpa filter. Server memvalidasi + menyaring ulang `f` terhadap
 * kolom filter dan cross-filter dashboard saat buat DAN saat render.
 */
export interface PdfExportCreateBody {
  dashboardId: string;
  format: "pdf";
  f?: string | null;
}

/** Jawaban GET /api/exports/[id] (selain { ok: true }). */
export interface ExportStatusView {
  state: ExportState;
  /** Kode galat (failed/expired), mis. EXPORT_TOO_LARGE, EXPORT_EXPIRED. */
  code?: string;
  /** Pesan untuk user (bahasa Indonesia, sudah dibentuk per peran). */
  message?: string;
  /** Jumlah baris data di file (done). */
  rows?: number;
  /** ISO; tautan unduh berlaku sampai waktu ini (done). */
  expiresAt?: string;
  fileName?: string;
}

export const EXPORT_CODES = {
  INVALID: "INVALID",
  NOT_FOUND: "NOT_FOUND",
  NOT_READY: "NOT_READY",
  COLUMN_UNAVAILABLE: "COLUMN_UNAVAILABLE",
  SHEET_UNAVAILABLE: "SHEET_UNAVAILABLE",
  RATE_LIMITED: "RATE_LIMITED",
  /** Sudah ada 2 ekspor berjalan milik user ini. */
  EXPORT_BUSY: "EXPORT_BUSY",
  /** Hasil melebihi EXPORT_MAX_ROWS (1 juta baris); pesannya menyarankan mempersempit filter. */
  EXPORT_TOO_LARGE: "EXPORT_TOO_LARGE",
  /** Tautan unduh lewat 60 menit (atau objek sudah dihapus). */
  EXPORT_EXPIRED: "EXPORT_EXPIRED",
  /** Job melewati batas waktu 10 menit. */
  EXPORT_TIMEOUT: "EXPORT_TIMEOUT",
  /** Galat lain saat menyiapkan file (detail hanya di log server). */
  EXPORT_FAILED: "EXPORT_FAILED",
  FORBIDDEN: "FORBIDDEN",
  /** Ekspor tampilan (T-046): versi data aktif berganti sejak tampilan dimuat/diminta. */
  VERSION_CHANGED: "VERSION_CHANGED",
  UNAVAILABLE: "UNAVAILABLE",
  /**
   * Renderer PDF tidak bisa dihubungi (T-018): 503 langsung saat buat (cek kesehatan ≤ 3 detik), atau
   * kode FAILED bila renderer mati/penuh setelah ekspor masuk antrean.
   */
  RENDERER_UNAVAILABLE: "RENDERER_UNAVAILABLE",
} as const;
export type ExportCode = (typeof EXPORT_CODES)[keyof typeof EXPORT_CODES];

/** Batas baris default (EXPORT_MAX_ROWS); teks UI boleh menyebutnya. */
export const EXPORT_MAX_ROWS_DEFAULT = 1_000_000;
/** Baris data maksimum satu sheet XLSX (1.048.576 baris Excel dikurangi baris judul). */
export const XLSX_MAX_DATA_ROWS = 1_048_575;
/** Ekspor berjalan (antre/diproses) per user. */
export const EXPORT_IN_FLIGHT_MAX = 2;
