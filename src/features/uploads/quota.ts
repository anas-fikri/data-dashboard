import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/*
 * Kuota penyimpanan per pengguna dari byte yang benar-benar tersimpan (T-039, rencana §5.7):
 *  - byte segmen unik yang dirujuk versi hidup (raw + revisi typed yang dirujuk; tiap segmen sekali),
 *  - byte file sumber yang belum dihapus (versi selesai diunggah; sumber dihapus retensi 7 hari),
 *  - ukuran terdeklarasi unggahan yang masih UPLOADING,
 *  - ukuran file antrean unggah (T-059) yang belum menjadi versi (dipesan saat antrean dibuat).
 * `sizeBytes` versi tetap ukuran file unggahan (logika multipart bergantung padanya). Ukuran segmen
 * legacy (sebelum T-039) diisi pemeriksaan malam; selama belum terukur dihitung 0.
 * Init unggah memproyeksikan ukuran file + perkiraan parquet. Transisi makna (QUOTA_GRACE_DAYS sejak
 * migrasi T-039 diterapkan): pengguna yang masih muat menurut hitungan lama (jumlah sizeBytes versi
 * non-FAILED) hanya diberi peringatan, tidak ditolak.
 */

/** Perkiraan parquet hasil cast per byte file sumber (rencana §5.7: 1 GB xlsx ≈ 1,2 GB parquet). */
// shortcut: rasio tetap; ganti dengan rasio historis dataset bila periode (T-049+) membutuhkan presisi.
export const PARQUET_RATIO = 1.2;
/** Ambang banner/meter (rencana §5.2 PERIOD_WARN_PCT). */
export const QUOTA_WARN_PCT = 80;
export const QUOTA_MIGRATION = "20261020100000_t039_quota_bytes";

export interface UsageVersion {
  status: string;
  sizeBytes: bigint | null;
  sourceKey: string | null;
  sourceDeletedAt: Date | null;
  /** Diisi saat peralihan UPLOADING → UPLOADED (objek sumber lengkap di storage). */
  etag: string | null;
}
export interface UsageRef {
  typedId: string;
  typedBytes: bigint | null;
  segmentId: string;
  rawBytes: bigint | null;
}

export interface Usage {
  /** Pemakaian makna baru (byte tersimpan). */
  bytes: number;
  /** Hitungan lama (T-024): jumlah sizeBytes versi non-FAILED — dasar masa transisi. */
  legacyBytes: number;
  /** File segmen terujuk yang ukurannya belum terukur (legacy, menunggu pemeriksaan malam). */
  unmeasured: number;
}

/** File sumber masih di storage: versi selesai diunggah yang sumbernya belum dihapus retensi. */
function sourceStored(v: UsageVersion): boolean {
  if (!v.sourceKey || v.sourceDeletedAt || v.status === "UPLOADING") return false;
  // FAILED: sumber tetap ada bila versinya pernah lengkap diunggah (etag tercatat saat UPLOADED; gagal
  // ingest/pemetaan, sampai retensi 7 hari). Unggahan yang ditolak/kedaluwarsa/dibatalkan sebelum
  // UPLOADED sudah menghapus objeknya atau tidak pernah punya (review T-039).
  return v.status !== "FAILED" || v.etag !== null;
}

/**
 * Pemakaian dari baris versi + rujukan manifest versi hidup + byte file antrean yang belum menjadi
 * versi (`reservedBytes`, T-059). Murni.
 */
export function usageOf(versions: UsageVersion[], refs: UsageRef[], reservedBytes = 0): Usage {
  let bytes = reservedBytes;
  let legacyBytes = reservedBytes;
  for (const v of versions) {
    const size = Number(v.sizeBytes ?? 0n);
    if (v.status !== "FAILED") legacyBytes += size;
    if (v.status === "UPLOADING" || sourceStored(v)) bytes += size;
  }
  const typed = new Map<string, bigint | null>();
  const raw = new Map<string, bigint | null>();
  for (const r of refs) {
    typed.set(r.typedId, r.typedBytes);
    raw.set(r.segmentId, r.rawBytes);
  }
  let unmeasured = 0;
  for (const b of [...typed.values(), ...raw.values()]) {
    if (b === null) unmeasured++;
    else bytes += Number(b);
  }
  return { bytes, legacyBytes, unmeasured };
}

type Db = Pick<Prisma.TransactionClient, "datasetVersion" | "sheetSegment" | "uploadQueueItem">;

export async function userUsage(db: Db, userId: string): Promise<Usage> {
  const [versions, refs, reserved] = await Promise.all([
    db.datasetVersion.findMany({
      where: { dataset: { ownerId: userId } },
      select: {
        status: true,
        sizeBytes: true,
        sourceKey: true,
        sourceDeletedAt: true,
        etag: true,
      },
    }),
    db.sheetSegment.findMany({
      where: { sheet: { version: { dataset: { ownerId: userId }, status: { not: "FAILED" } } } },
      select: {
        segmentTyped: {
          select: { id: true, typedBytes: true, segment: { select: { id: true, rawBytes: true } } },
        },
      },
    }),
    // File antrean yang belum menjadi versi: belum/sedang diunggah atau menunggu giliran (T-059).
    db.uploadQueueItem.aggregate({
      where: {
        state: { in: ["WAITING", "UPLOADING", "QUEUED"] },
        queue: { dataset: { ownerId: userId } },
      },
      _sum: { sizeBytes: true },
    }),
  ]);
  return usageOf(
    versions,
    refs.map((r) => ({
      typedId: r.segmentTyped.id,
      typedBytes: r.segmentTyped.typedBytes,
      segmentId: r.segmentTyped.segment.id,
      rawBytes: r.segmentTyped.segment.rawBytes,
    })),
    Number(reserved._sum.sizeBytes ?? 0n),
  );
}

/** Ruang yang dipakai sebuah file setelah diunggah dan diproses: sumber + perkiraan parquet. */
export const projectedBytes = (size: number) => size + Math.round(size * PARQUET_RATIO);

export type QuotaDecision =
  { ok: true; warn: boolean } | { ok: false; usedBytes: number; projected: number };

/**
 * Keputusan init unggah. Ditolak bila proyeksi melewati kuota — kecuali selama masa transisi bila
 * hitungan lama (jumlah sizeBytes + file ini) masih muat: diterima dengan peringatan. Murni.
 */
export function quotaDecision(
  usage: Usage,
  size: number,
  quota: number,
  inGrace: boolean,
): QuotaDecision {
  const projected = projectedBytes(size);
  if (usage.bytes + projected <= quota) return { ok: true, warn: false };
  if (inGrace && usage.legacyBytes + size <= quota) return { ok: true, warn: true };
  return { ok: false, usedBytes: usage.bytes, projected };
}

/** "19,6 GB": 1 desimal di bawah 100 GB (kuota 20 GB terpakai 19,6 tidak tampil "20 dari 20"). */
export function formatGiB(bytes: number): string {
  const gib = bytes / 1024 ** 3;
  return `${gib.toLocaleString("id-ID", { maximumFractionDigits: gib < 100 ? 1 : 0 })} GB`;
}

let graceCache: { at: number; until: Date | null } | null = null;
const GRACE_CACHE_MS = 10 * 60 * 1000;

/**
 * Akhir masa transisi makna kuota: waktu migrasi T-039 diterapkan + QUOTA_GRACE_DAYS. null = migrasi
 * belum tercatat (mis. DB uji) — tanpa masa transisi.
 */
export async function quotaGraceUntil(
  db: Pick<Prisma.TransactionClient, "$queryRaw"> = prisma,
  now = Date.now(),
): Promise<Date | null> {
  if (graceCache && now - graceCache.at < GRACE_CACHE_MS) return graceCache.until;
  const rows = await db.$queryRaw<{ finished_at: Date | null }[]>`
    SELECT finished_at FROM "_prisma_migrations" WHERE migration_name = ${QUOTA_MIGRATION}`;
  const at = rows[0]?.finished_at ?? null;
  const until = at ? new Date(at.getTime() + env().QUOTA_GRACE_DAYS * 24 * 60 * 60 * 1000) : null;
  graceCache = { at: now, until };
  return until;
}

export interface QuotaAlert {
  tone: "warning" | "error";
  text: string;
}

const dateText = (d: Date) =>
  new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" }).format(d);

/** Banner pengguna di ≥ 80% kuota; null di bawahnya. Murni. */
export function quotaAlert(
  usedBytes: number,
  quota: number,
  graceUntil: Date | null,
  now = new Date(),
): QuotaAlert | null {
  const pct = Math.floor((usedBytes / quota) * 100);
  if (pct < QUOTA_WARN_PCT) return null;
  const used = `${formatGiB(usedBytes)} dari ${formatGiB(quota)} (${pct}%)`;
  if (usedBytes <= quota) {
    return {
      tone: "warning",
      text: `Penyimpanan Anda terpakai ${used}. Hapus dataset atau versi lama yang tidak dipakai agar unggahan berikutnya tidak ditolak.`,
    };
  }
  const grace =
    graceUntil && now < graceUntil
      ? ` Masa transisi hitungan kuota sampai ${dateText(graceUntil)}: sampai saat itu unggahan masih diterima bila muat menurut hitungan lama.`
      : "";
  return {
    tone: "error",
    text: `Penyimpanan Anda melebihi kuota: terpakai ${used}. Unggahan baru ditolak sampai sebagian data dihapus.${grace}`,
  };
}

const alertCache = new Map<string, { at: number; alert: QuotaAlert | null }>();
const ALERT_CACHE_MS = 60 * 1000;

/** Untuk layout (setiap halaman): hasil di-cache 60 detik per pengguna; galat → tanpa banner. */
export async function currentQuotaAlert(userId: string): Promise<QuotaAlert | null> {
  const now = Date.now();
  const hit = alertCache.get(userId);
  if (hit && now - hit.at < ALERT_CACHE_MS) return hit.alert;
  try {
    const [usage, graceUntil] = await Promise.all([userUsage(prisma, userId), quotaGraceUntil()]);
    const alert = quotaAlert(usage.bytes, env().USER_STORAGE_QUOTA_BYTES, graceUntil);
    if (alertCache.size > 10_000) alertCache.clear();
    alertCache.set(userId, { at: now, alert });
    return alert;
  } catch (e) {
    logger.warn(
      { err: e instanceof Error ? e.message : String(e) },
      "kuota pengguna tidak terbaca",
    );
    return null;
  }
}
