/** Kode hasil aksi admin (konvensi: Server Action tidak melempar untuk kegagalan yang diharapkan). */
export type AdminErrorCode =
  "NOT_FOUND" | "LAST_ADMIN" | "FORBIDDEN" | "INVALID" | "RATE_LIMITED" | "LIMIT_REACHED" | "BUSY";

export type AdminResult<T = null> =
  { ok: true; data: T } | { ok: false; code: AdminErrorCode; message: string };

export interface TransferSummary {
  moved: number;
  /**
   * Hanya dataset yang namanya bentrok di pemilik baru, diberi akhiran " (n)". datasetId ikut agar
   * rollback manual dari meta AuditLog tidak bergantung pada nama (yang bisa diganti lagi).
   */
  renamed: { datasetId: string; from: string; to: string }[];
  /** Pemakaian penyimpanan pemilik baru kini penuh atau melebihi kuota (unggahan berikutnya ditolak). */
  quotaExceeded: boolean;
}

/** Akun baru dari admin (T-c7wf); inviteSent false = email undangan gagal, akun tetap dibuat. */
export interface CreatedUser {
  id: string;
  email: string;
  inviteSent: boolean;
}

/** Status yang bisa disaring di /admin/pengguna (sama dengan badge status di daftar). */
export const USER_STATUSES = ["all", "active", "inactive", "unverified"] as const;
export type UserStatusFilter = (typeof USER_STATUSES)[number];

/** Calon pemilik baru (hasil cari server, nama sudah dibersihkan). */
export interface TransferTarget {
  id: string;
  email: string;
  name: string | null;
}
