/*
 * Tipe berbagi dashboard (T-016) yang aman dipakai klien: tanpa "server-only", tanpa Prisma. Komponen
 * klien mengimpor dari sini, tidak pernah dari access.ts/service.ts.
 */
export type { DashboardAccessRole } from "./access";

/** Peran yang bisa diberikan pemilik (OWNER tidak pernah disimpan sebagai share). */
export type ShareRole = "VIEWER" | "EDITOR";
export const SHARE_ROLES: readonly ShareRole[] = ["VIEWER", "EDITOR"];

export interface ShareGrantView {
  userId: string;
  /** Nama tampilan yang sudah dibersihkan; null bila pengguna belum mengisi nama. */
  name: string | null;
  email: string;
  role: ShareRole;
  /** Akun aktif dan terverifikasi; share akun nonaktif tetap tersimpan tetapi tidak berlaku. */
  active: boolean;
}

export interface ShareWarnings {
  /** Ada share EDITOR: editor dapat membaca semua kolom tidak tersembunyi dataset ini. */
  editor: boolean;
  /**
   * Nama kolom filter/cross-filter yang juga ada (nama + kelompok tipe sama, tidak tersembunyi) di
   * lebih dari satu sheet yang dipakai widget dashboard ini.
   */
  filterColumns: string[];
}

export interface ShareState {
  orgShared: boolean;
  grants: ShareGrantView[];
  warnings: ShareWarnings;
}

/** Hasil cari pengguna untuk pemilih di dialog share (aktif + terverifikasi saja). */
export interface ShareUserOption {
  id: string;
  name: string | null;
  email: string;
}

export type ShareActionResult<T> =
  { ok: true; data: T } | { ok: false; code: string; message: string };
