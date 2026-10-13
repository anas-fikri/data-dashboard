/** Kode hasil aksi admin (konvensi: Server Action tidak melempar untuk kegagalan yang diharapkan). */
export type AdminErrorCode =
  "NOT_FOUND" | "LAST_ADMIN" | "FORBIDDEN" | "INVALID" | "RATE_LIMITED" | "LIMIT_REACHED" | "BUSY";

export type AdminResult<T = null> =
  { ok: true; data: T } | { ok: false; code: AdminErrorCode; message: string };

export interface TransferSummary {
  moved: number;
  /** Dataset yang diberi akhiran " (n)" karena nama bentrok di pemilik baru. */
  renamed: { from: string; to: string }[];
  /** Pemakaian penyimpanan pemilik baru kini melebihi kuota (unggahan berikutnya ditolak). */
  quotaExceeded: boolean;
}
