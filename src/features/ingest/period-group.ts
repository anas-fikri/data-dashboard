/*
 * Kelompok file satu periode (T-060, rencana G-6 §4.6 P-28) — bagian murni yang dipakai app (antrean
 * kelompok) dan worker (ingest kelompok): daftar file sumber versi kelompok (DatasetVersion.groupFiles)
 * dan kunci objeknya. Semua file kelompok berada di prefix versinya (raw/<ds>/<versionId>/part-<n>.<ext>),
 * jadi retensi file asli 7 hari dan pembersihan versi berlaku apa adanya.
 */
import { z } from "zod";

export interface GroupFile {
  /** Nomor file di kelompok (1..n), sama dengan Segment.groupPart. */
  seq: number;
  key: string;
  name: string;
  size: number;
}

/** Batas keras format (PERIOD_MAX_FILES ≤ 36 ditegakkan saat kelompok dibuat). */
const GROUP_FILES_MAX = 36;

const groupFilesSchema = z
  .array(
    z.object({
      seq: z.number().int().min(1),
      key: z.string().min(1),
      name: z.string().min(1),
      size: z.number().int().nonnegative(),
    }),
  )
  .min(2)
  .max(GROUP_FILES_MAX);

/**
 * Daftar file versi kelompok, urut nomor file; null bila kosong atau bentuknya lain (fail-closed: worker
 * tidak pernah memproses sebagian file kelompok). Nomor file harus 1..n tanpa celah dan kunci unik.
 */
export function parseGroupFiles(json: unknown): GroupFile[] | null {
  const r = groupFilesSchema.safeParse(json);
  if (!r.success) return null;
  const files = [...r.data].sort((a, b) => a.seq - b.seq);
  if (files.some((f, i) => f.seq !== i + 1)) return null;
  if (new Set(files.map((f) => f.key)).size !== files.length) return null;
  return files;
}

/** Kunci file sumber nomor `seq` kelompok di prefix versi kelompoknya. */
export function groupSourceKey(
  datasetId: string,
  versionId: string,
  seq: number,
  ext: "xlsx" | "csv",
): string {
  return `raw/${datasetId}/${versionId}/part-${Math.trunc(seq)}.${ext}`;
}

/** Judul versi kelompok untuk riwayat/antrean: "maret-1.xlsx + 2 file lain". */
export function groupTitle(names: readonly string[]): string {
  if (!names.length) return "Kelompok file";
  return names.length === 1
    ? names[0]!
    : `${names[0]} + ${(names.length - 1).toLocaleString("id-ID")} file lain`;
}
