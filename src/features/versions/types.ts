/*
 * Tipe riwayat versi dataset (T-013) yang dipakai server dan komponen klien. Tanpa "server-only":
 * hanya tipe dan konstanta.
 */
import type { VersionStatus } from "@/features/datasets/label";

export type { VersionStatus };

/** Satu baris "Riwayat versi" di profil dataset (terbaru dulu, tanpa UPLOADING). */
export interface VersionRow {
  id: string;
  fileName: string | null;
  status: VersionStatus;
  sizeBytes: number | null;
  /** ISO 8601. */
  createdAt: string;
  /** ISO 8601; kapan ingest selesai (siap/gagal/menunggu pemetaan). */
  finishedAt: string | null;
  active: boolean;
  /** READY dan bukan versi aktif: pemilik bisa mengaktifkannya (rollback). */
  canActivate: boolean;
  /** AWAITING_MAPPING: pemilik bisa membuangnya. */
  canDiscard: boolean;
  /** Pesan error untuk FAILED/AWAITING_MAPPING; null untuk status lain. */
  message: string | null;
  /** Nama tampil pengunggah (atau email bila tanpa nama); null bila akunnya sudah dihapus. */
  uploadedBy: string | null;
  /** File asli sudah dihapus job retensi 7 hari (data Parquet tetap ada). */
  sourceDeleted: boolean;
}

export type VersionCode = "NOT_FOUND" | "DATASET_BUSY" | "INVALID" | "RATE_LIMITED";

/** Hasil Server Action versi (konvensi D2: kegagalan yang diharapkan tidak melempar). */
export type VersionResult<T> =
  { ok: true; data: T } | { ok: false; code: VersionCode; message: string };
