/*
 * Aturan retensi versi (T-013, flow-kerja A4/B1/B5). Murni: dipakai aktivasi (di dalam transaksi),
 * job pembersihan di worker, dan diuji unit.
 *  - Versi: 3 READY terbaru (urut createdAt) ∪ versi aktif disimpan; READY lain dibuang. FAILED yang
 *    dibuat sebelum READY terbaru sudah tergantikan dan ikut dibuang. Versi aktif tidak pernah dibuang
 *    (activeVersionId onDelete SetNull akan mengosongkan dataset).
 *  - Objek versi yang dibuang dihapus job pembersihan ≥ 1 jam kemudian: query yang sudah membaca
 *    pointer lama selesai dulu (B5).
 *  - File asli raw/<ds>/<ver>/ dihapus 7 hari setelah ingest selesai (sukses atau gagal, B1).
 */

import type { Prisma } from "@prisma/client";

export const KEEP_READY = 3;
export const RETENTION_GRACE_MS = 60 * 60 * 1000;
export const RAW_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

const ID = /^[a-z0-9]{20,32}$/;

export interface VersionBrief {
  id: string;
  status: string;
  createdAt: Date;
}

/** Id versi yang dibuang retensi (tidak pernah versi aktif). */
export function retentionVictims(versions: VersionBrief[], activeId: string): string[] {
  const ready = versions
    .filter((v) => v.status === "READY")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const keep = new Set([activeId, ...ready.slice(0, KEEP_READY).map((v) => v.id)]);
  const newest = ready[0]?.createdAt.getTime();
  return versions
    .filter((v) =>
      v.status === "READY"
        ? !keep.has(v.id)
        : v.status === "FAILED" && newest !== undefined && v.createdAt.getTime() < newest,
    )
    .map((v) => v.id)
    .filter((id) => id !== activeId);
}

/** Prefix objek satu versi (file asli + Parquet), selalu diakhiri '/'; id divalidasi. */
export function versionPrefixes(datasetId: string, versionId: string): [string, string] {
  if (!ID.test(datasetId) || !ID.test(versionId)) throw new Error("id versi tidak valid");
  return [`raw/${datasetId}/${versionId}/`, `parquet/${datasetId}/${versionId}/`];
}

/** Batas waktu file asli: versi yang selesai sebelum ini dihapus file aslinya. */
export function rawCutoff(now: Date): Date {
  return new Date(now.getTime() - RAW_RETENTION_MS);
}

/**
 * Filter versi yang file aslinya sudah lewat 7 hari: selesai (siap/gagal/menunggu pemetaan atau
 * konfirmasi — datanya sudah di Parquet) sebelum
 * batas, atau FAILED tanpa ingestFinishedAt (unggahan kedaluwarsa/dibatalkan) yang terakhir berubah
 * sebelum batas. File yang sudah dihapus (sourceDeletedAt) tidak dipilih lagi.
 */
export function rawRetentionWhere(now: Date): Prisma.DatasetVersionWhereInput {
  const cutoff = rawCutoff(now);
  return {
    sourceKey: { not: null },
    sourceDeletedAt: null,
    OR: [
      {
        status: { in: ["READY", "FAILED", "AWAITING_MAPPING", "AWAITING_CONFIRM"] },
        ingestFinishedAt: { lt: cutoff },
      },
      { status: "FAILED", ingestFinishedAt: null, updatedAt: { lt: cutoff } },
    ],
  };
}
