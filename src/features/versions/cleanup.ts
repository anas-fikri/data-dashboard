import "server-only";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { deleteGuideObject } from "@/lib/storage/guides";
import { abortMultipartFor, abortMultipartUnder } from "@/lib/storage/multipart";
import { deleteObject, deletePrefix } from "@/lib/storage/objects";
import { SEGMENT_GC_GRACE_MS } from "./gc";
import { rawRetentionWhere, versionPrefixes } from "./retention";
import { DATA_KEY, SEGMENT_PREFIX } from "./segment-keys";

/*
 * Job pemeliharaan storage di worker (T-013, flow-kerja B1/B5):
 *  - storage-cleanup: memproses StorageCleanup (hapus dataset yang gagal sebagian, versi dibuang
 *    retensi/pemilik, sisa ingest gagal, objek video/poster/takarir panduan yang gagal dihapus — T-z5nq,
 *    T-j9j6). Prefix hanya boleh berbentuk (raw|parquet)/<cuid>/[<cuid>/] (review T-003) atau kunci persis
 *    guides/videos/<cuid>.(mp4|webm) / guides/posters/<cuid>.png / guides/captions/<cuid>.vtt, dan hanya dihapus bila datanya
 *    memang sudah tidak dipakai; gagal → coba lagi dengan jeda bertingkat, maksimal 8 kali.
 *  - raw-retention: file asli raw/<ds>/<ver>/ dihapus 7 hari setelah ingest selesai; versi ditandai
 *    sourceDeletedAt (sourceKey tetap: recast menurunkan csv/xlsx dari ekstensinya).
 * T-038: juga prefix segmen parquet/<ds>/seg/<seg>/ (hanya bila baris Segment-nya sudah tidak ada) dan
 * kunci file data persis (GC segmen legacy, sapuan yatim — hanya bila tidak ada Segment/SegmentTyped/
 * sheet versi hidup yang merujuknya). Prefix Parquet versi yang masih memuat kunci segmen terujuk
 * (segmen legacy yang belum disapu GC) DITUNDA satu masa tenggang, bukan dibuang.
 */

export const CLEANUP_BATCH = 50;
export const CLEANUP_MAX_ATTEMPTS = 8;
export const RAW_BATCH = 100;
const BACKOFF_BASE_MS = 5 * 60 * 1000;
const BACKOFF_MAX_MS = 24 * 60 * 60 * 1000;
const ERROR_MAX = 500;

const PREFIX = /^(raw|parquet)\/([a-z0-9]{20,32})\/(?:([a-z0-9]{20,32})\/)?$/;
const GUIDE_KEY =
  /^guides\/(?:videos\/([a-z0-9]{20,32})\.(?:mp4|webm)|posters\/([a-z0-9]{20,32})\.png|captions\/([a-z0-9]{20,32})(?:-[a-f0-9]{12})?\.vtt)$/;

export type CleanupTarget =
  | {
      kind: "raw" | "parquet";
      datasetId: string;
      /** null = prefix seluruh dataset. */
      versionId: string | null;
    }
  /** Satu objek video/poster/takarir panduan (kunci persis); video = multipart-nya ikut di-abort. */
  | { kind: "guide"; videoId: string; video: boolean }
  /** Prefix satu segmen parquet/<ds>/seg/<seg>/ (T-038). */
  | { kind: "segment"; datasetId: string; segmentId: string }
  /** Satu file data persis (raw/typed segmen, DATA_KEY). */
  | { kind: "object"; datasetId: string };

/** Prefix StorageCleanup yang sah, atau null (tidak pernah menyentuh storage). */
export function parseCleanupPrefix(prefix: string): CleanupTarget | null {
  const m = PREFIX.exec(prefix);
  if (m) return { kind: m[1] as "raw" | "parquet", datasetId: m[2]!, versionId: m[3] ?? null };
  const g = GUIDE_KEY.exec(prefix);
  if (g) return { kind: "guide", videoId: (g[1] ?? g[2] ?? g[3])!, video: g[1] !== undefined };
  const sg = SEGMENT_PREFIX.exec(prefix);
  if (sg) return { kind: "segment", datasetId: sg[1]!, segmentId: sg[2]! };
  const k = DATA_KEY.exec(prefix);
  if (k) return { kind: "object", datasetId: k[1]! };
  return null;
}

/**
 * Keadaan DB pemilik prefix: dataset ada?, status versi (null = barisnya sudah tidak ada); untuk objek
 * panduan: baris GuideVideo masih ada?
 */
export interface CleanupState {
  datasetExists: boolean;
  versionStatus: string | null;
  guideVideoExists?: boolean;
  /** Segmen/kunci masih dirujuk baris DB (Segment, SegmentTyped, atau sheet versi hidup). */
  referenced?: boolean;
}

/**
 * Aman dihapus? Prefix dataset hanya bila Dataset sudah tidak ada; raw versi hanya bila versinya
 * sudah tidak ada; Parquet versi bila versinya tidak ada atau FAILED (sisa ingest gagal); objek
 * panduan hanya bila baris videonya sudah tidak ada.
 */
export function isSafeToDelete(t: CleanupTarget, s: CleanupState): boolean {
  if (t.kind === "guide") return !s.guideVideoExists;
  if (t.kind === "segment" || t.kind === "object") return !s.referenced;
  if (t.versionId === null) return !s.datasetExists;
  // Parquet versi: kunci segmen legacy di bawahnya yang masih tercatat menunda penghapusan (T-038).
  if (t.kind === "parquet" && s.referenced) return false;
  if (s.versionStatus === null) return true;
  return t.kind === "parquet" && s.versionStatus === "FAILED";
}

/** Tidak aman sekarang tetapi akan aman setelah GC menyapu segmen legacy-nya → tunda, jangan buang. */
export const isPostponed = (t: CleanupTarget, s: CleanupState) =>
  t.kind === "parquet" && t.versionId !== null && !!s.referenced;

/** Percobaan berikutnya setelah gagal ke-(attempts+1): 5 menit · 2^attempts, maksimal 24 jam. */
export function nextAttemptAt(attempts: number, now: Date): Date {
  return new Date(now.getTime() + Math.min(BACKOFF_BASE_MS * 2 ** attempts, BACKOFF_MAX_MS));
}

export interface CleanupDeps {
  deletePrefix: (prefix: string) => Promise<number>;
  abortMultipartUnder: (prefix: string) => Promise<number>;
  /** Kunci persis objek panduan (deletePrefix/abortMultipartUnder hanya menerima prefix ber-"/"). */
  deleteObject: (key: string) => Promise<void>;
  abortMultipartFor: (key: string) => Promise<number>;
  /** Kunci persis file data (DATA_KEY, T-038). */
  deleteDataObject: (key: string) => Promise<void>;
}

const storage: CleanupDeps = {
  deletePrefix,
  abortMultipartUnder,
  deleteObject: deleteGuideObject,
  abortMultipartFor,
  deleteDataObject: (key) => deleteObject(key),
};

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, ERROR_MAX);

/**
 * Kunci (persis, atau semua di bawah prefix) masih dirujuk: segmen/revisi tercatat, atau sheet versi
 * hidup (jaring pengaman bila manifest tidak lengkap).
 */
export async function keyReferenced(key: string, prefix = false): Promise<boolean> {
  const match = prefix ? { startsWith: key } : { equals: key };
  const live = { version: { status: { not: "FAILED" as const } } };
  const [seg, typed, sheet] = await Promise.all([
    prisma.segment.count({ where: { rawKey: match } }),
    prisma.segmentTyped.count({ where: { typedKey: match } }),
    prisma.sheet.count({ where: { ...live, OR: [{ rawKey: match }, { typedKey: match }] } }),
  ]);
  return seg + typed + sheet > 0;
}

async function stateOf(t: CleanupTarget, prefix: string): Promise<CleanupState> {
  if (t.kind === "segment") {
    const segment = await prisma.segment.count({ where: { id: t.segmentId } });
    return {
      datasetExists: true,
      versionStatus: null,
      referenced: segment > 0 || (await keyReferenced(prefix, true)),
    };
  }
  if (t.kind === "object") {
    return { datasetExists: true, versionStatus: null, referenced: await keyReferenced(prefix) };
  }
  if (t.kind === "guide") {
    // Takarir bisa dihapus sementara videonya tetap ada (T-qqbc): dipakai = baris masih menunjuk kunci ini.
    const caption = prefix.startsWith("guides/captions/") ? { captionKey: prefix } : {};
    const n = await prisma.guideVideo.count({ where: { id: t.videoId, ...caption } });
    return { datasetExists: false, versionStatus: null, guideVideoExists: n > 0 };
  }
  if (t.versionId === null) {
    return {
      datasetExists: (await prisma.dataset.count({ where: { id: t.datasetId } })) > 0,
      versionStatus: null,
    };
  }
  const v = await prisma.datasetVersion.findUnique({
    where: { id: t.versionId },
    select: { status: true },
  });
  return {
    datasetExists: true,
    versionStatus: v?.status ?? null,
    ...(t.kind === "parquet" ? { referenced: await keyReferenced(prefix, true) } : {}),
  };
}

/** Satu putaran storage-cleanup (≤ 50 baris jatuh tempo, terlama dulu). */
export async function runStorageCleanup(deps: CleanupDeps = storage, now = new Date()) {
  const rows = await prisma.storageCleanup.findMany({
    where: { notBefore: { lte: now }, attempts: { lt: CLEANUP_MAX_ATTEMPTS } },
    orderBy: { createdAt: "asc" },
    take: CLEANUP_BATCH,
    select: { id: true, prefix: true, attempts: true },
  });
  const out = { deleted: 0, skipped: 0, failed: 0 };
  for (const row of rows) {
    const t = parseCleanupPrefix(row.prefix);
    if (!t) {
      logger.error(
        { id: row.id, prefix: row.prefix.slice(0, 200) },
        "prefix pembersihan tidak sah; dibuang",
      );
      await prisma.storageCleanup.deleteMany({ where: { id: row.id } });
      out.skipped++;
      continue;
    }
    const state = await stateOf(t, row.prefix);
    if (isPostponed(t, state)) {
      await prisma.storageCleanup.updateMany({
        where: { id: row.id },
        data: { notBefore: new Date(now.getTime() + SEGMENT_GC_GRACE_MS) },
      });
      out.skipped++;
      continue;
    }
    if (!isSafeToDelete(t, state)) {
      logger.warn(
        { id: row.id, prefix: row.prefix },
        "prefix pembersihan masih dipakai; dibuang tanpa hapus",
      );
      await prisma.storageCleanup.deleteMany({ where: { id: row.id } });
      out.skipped++;
      continue;
    }
    try {
      // Upload yang sedang berjalan: abort dulu agar part tidak menunggu lifecycle 1 hari.
      if (t.kind === "guide") {
        if (t.video) await deps.abortMultipartFor(row.prefix);
        await deps.deleteObject(row.prefix);
      } else if (t.kind === "object") {
        await deps.deleteDataObject(row.prefix);
      } else {
        if (t.kind === "raw") await deps.abortMultipartUnder(row.prefix);
        await deps.deletePrefix(row.prefix);
      }
      await prisma.storageCleanup.deleteMany({ where: { id: row.id } });
      out.deleted++;
    } catch (e) {
      const lastError = errText(e);
      logger.warn(
        { id: row.id, prefix: row.prefix, attempt: row.attempts + 1, err: lastError },
        "pembersihan storage gagal",
      );
      await prisma.storageCleanup.updateMany({
        where: { id: row.id },
        data: {
          attempts: { increment: 1 },
          lastError,
          notBefore: nextAttemptAt(row.attempts, now),
        },
      });
      out.failed++;
    }
  }
  return out;
}

/** Satu putaran raw-retention (≤ 100 versi); yang gagal diulang putaran berikutnya. */
export async function runRawRetention(
  deps: Pick<CleanupDeps, "deletePrefix"> = storage,
  now = new Date(),
) {
  const versions = await prisma.datasetVersion.findMany({
    where: rawRetentionWhere(now),
    orderBy: { createdAt: "asc" },
    take: RAW_BATCH,
    select: { id: true, datasetId: true },
  });
  const out = { deleted: 0, failed: 0 };
  for (const v of versions) {
    try {
      const [raw] = versionPrefixes(v.datasetId, v.id);
      await deps.deletePrefix(raw);
      await prisma.datasetVersion.updateMany({
        where: { id: v.id, sourceDeletedAt: null },
        data: { sourceDeletedAt: now },
      });
      out.deleted++;
    } catch (e) {
      logger.warn({ versionId: v.id, err: errText(e) }, "hapus file asli gagal; diulang nanti");
      out.failed++;
    }
  }
  return out;
}
