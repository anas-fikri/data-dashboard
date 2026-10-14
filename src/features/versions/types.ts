/*
 * Tipe riwayat versi dataset (T-013) yang dipakai server dan komponen klien. Tanpa "server-only":
 * hanya tipe dan konstanta.
 */
import type { VersionStatus } from "@/features/datasets/label";
import type { ColumnType, DateFormat, NumberLocale } from "@/features/ingest/infer";
import type { SnapshotRef } from "@/features/ingest/refresh";

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

/** STALE: skema aktif berubah sejak halaman pemetaan dimuat (T-014) — muat ulang halaman. */
export type VersionCode = "NOT_FOUND" | "DATASET_BUSY" | "INVALID" | "RATE_LIMITED" | "STALE";

/** Hasil Server Action versi (konvensi D2: kegagalan yang diharapkan tidak melempar). */
export type VersionResult<T> =
  { ok: true; data: T } | { ok: false; code: VersionCode; message: string };

/*
 * Halaman pemetaan kolom (T-014): isu dihitung ulang dari Sheet versi yang menunggu pemetaan + skema
 * aktif terkini (planSheets/planColumns). Posisi kolom: activePos = posisi di skema aktif, newPos =
 * posisi di file baru.
 */

/** Kolom skema aktif. */
export interface MappingActiveColumn {
  pos: number;
  name: string;
  original: string;
  type: ColumnType;
  numberLocale?: NumberLocale;
  dateFormat?: DateFormat;
  hidden: boolean;
  /** Kolom kosong (NULL) hasil pemetaan sebelumnya: tidak ada di file. */
  absent: boolean;
}

/** Kolom file baru. */
export interface MappingNewColumn {
  pos: number;
  /** Judul di file baru. */
  original: string;
  /** Nama tampil di versi baru (nama aktif bila cocok otomatis, nama unik bila kolom tambahan). */
  name: string;
  /** Tipe cast versi baru (tipe aktif bila cocok otomatis, hasil inferensi bila tidak). */
  type: ColumnType;
  /** Nilai non-kosong yang gagal dikonversi ke `type`. */
  castFailCount: number;
  /** Nilai non-kosong (tidak ada di skema versi lama). */
  nonEmpty?: number;
  /** ≤ 3 contoh nilai unik dari baris data pratinjau (hanya 50 kolom pertama punya pratinjau). */
  samples: string[];
}

/** Kolom yang nilainya banyak tidak cocok dengan tipenya (< 98 %). */
export interface MappingLowCast {
  /** Posisi di file baru. */
  pos: number;
  activePos: number | null;
  /**
   * Porsi nilai yang cocok (0–1), dibulatkan ke bawah ke persen bulat (0,979 → 0,97): kolom di bawah
   * 98 % tidak pernah tampil "98%".
   */
  pct: number;
  /** "Tanggal (dd/mm/yyyy)". */
  typeLabel: string;
  /** Persen dihitung dari perkiraan jumlah nilai (skema lama tanpa nonEmpty). */
  approx: boolean;
}

/** Rencana pemetaan satu pasangan sheet aktif ↔ sheet file baru. */
export interface MappingPlanView {
  newColumns: MappingNewColumn[];
  autoMatched: { activePos: number; newPos: number }[];
  /** Kolom aktif terlihat yang perlu keputusan (posisi aktif). */
  missing: number[];
  /** Kolom file baru yang tidak dipakai: masuk tersembunyi (posisi baru). */
  extra: number[];
  lowCast: MappingLowCast[];
}

/** Sheet file baru yang belum berpasangan, beserta rencananya bila dipasangkan dengan sheet aktif ini. */
export interface MappingCandidate extends MappingPlanView {
  id: string;
  name: string;
}

export interface MappingSheetView extends MappingPlanView {
  active: { id: string; name: string; schemaRevision: number; columns: MappingActiveColumn[] };
  /**
   * Pasangan otomatis; null = sheet aktif tidak ada di file baru (pilih kandidat atau "tidak dipakai
   * lagi"). Bila null, `missing` = semua kolom aktif terlihat dan kolom/rencana ada di `candidates`.
   */
  target: { id: string; name: string } | null;
  /** Sheet baru tanpa pasangan (hanya bila target null). */
  candidates: MappingCandidate[];
}

/** Acuan skema aktif yang dilihat halaman; dikirim kembali saat simpan (berubah → STALE). */
export type MappingBase = SnapshotRef;

export type MappingView =
  | { none: true; datasetId: string; datasetName: string }
  | {
      none: false;
      datasetId: string;
      datasetName: string;
      /** Versi yang menunggu pemetaan. */
      awaiting: { id: string; fileName: string | null; createdAt: string; sourceDeleted: boolean };
      active: { id: string; fileName: string | null };
      base: MappingBase;
      /** Job pemetaan sedang berjalan (indeks Redis); jobId untuk polling status. */
      applying: boolean;
      jobId: string | null;
      /** Hanya sheet aktif yang bermasalah. */
      sheets: MappingSheetView[];
    };

/** Status job pemetaan (GET /api/datasets/[id]/mapping/[jobId]). */
export type MappingJobState =
  "queued" | "running" | "done" | "stale" | "invalid" | "failed" | "gone";
