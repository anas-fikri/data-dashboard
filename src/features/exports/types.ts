/*
 * Kontrak ekspor widget (T-017) yang aman dipakai klien: bentuk permintaan, status, dan kode galat.
 * Rute: POST /api/exports (buat), GET /api/exports/[id] (status, pemilik saja), GET
 * /api/exports/[id]/download (302 ke presigned 5 menit; 404 bukan pemilik/tanpa akses; 410 kedaluwarsa).
 */
import type { DashFilter } from "@/features/query/filters";

export const EXPORT_FORMATS = ["csv", "xlsx"] as const;
export type ExportFormatInput = (typeof EXPORT_FORMATS)[number];

export type ExportState = "queued" | "running" | "done" | "failed" | "expired";

/** Body POST /api/exports: filter dashboard + urutan tabel sama dengan yang dikirim kartu widget. */
export interface ExportCreateBody {
  widgetId: string;
  format: ExportFormatInput;
  dashboardFilters?: DashFilter[];
  /** Urutan tabel (posisi kolom), sama dengan permintaan /api/query kartu tabel. */
  sort?: { column: number; dir: "asc" | "desc" };
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
  UNAVAILABLE: "UNAVAILABLE",
} as const;
export type ExportCode = (typeof EXPORT_CODES)[keyof typeof EXPORT_CODES];

/** Batas baris default (EXPORT_MAX_ROWS); teks UI boleh menyebutnya. */
export const EXPORT_MAX_ROWS_DEFAULT = 1_000_000;
/** Ekspor berjalan (antre/diproses) per user. */
export const EXPORT_IN_FLIGHT_MAX = 2;
