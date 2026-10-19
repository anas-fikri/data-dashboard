import "server-only";
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { Queue } from "bullmq";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { IngestJobData } from "@/lib/queue/connection";
import { segmentPrefix } from "@/features/versions/segment-keys";
import { INGEST_DEADLINE_MS, cleanupPrefix, versionParquetPrefix } from "./ingest";
import { prismaIngestRepo, s3IngestStorage } from "./repo";

/*
 * Pemulihan ingest (review T-006): versi tidak boleh tertinggal di INGESTING (dataset terkunci untuk
 * unggahan baru) dan objek/metadata versi gagal tidak boleh tertinggal.
 */

export const FINAL_FAILURE_MESSAGE =
  "Pemrosesan file gagal setelah beberapa percobaan karena gangguan server. Coba unggah ulang; bila berulang, hubungi admin.";
/** Semua percobaan berakhir "stale": skema aktif terus diubah selama file diproses (T-013). */
export const STALE_FAILURE_MESSAGE =
  "Skema data aktif diubah selama file ini diproses, berulang kali. Selesaikan perubahan skema, lalu unggah ulang file.";
const STUCK_AFTER_MS = INGEST_DEADLINE_MS + 30 * 60 * 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Akhiri versi sebagai FAILED: hapus prefix Parquet versi + prefix segmen seg/ miliknya (gagal →
 * StorageCleanup; yang terlewat disapu GC segmen) dan metadata Sheet.
 * Dicoba ulang (DB bisa sedang tidak tersedia); bila tetap gagal, penyapu INGESTING mengulang nanti.
 */
export async function finalizeFailed(
  versionId: string,
  datasetIdHint: string | undefined,
  message = FINAL_FAILURE_MESSAGE,
): Promise<boolean> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const v = await prisma.datasetVersion.findUnique({
        where: { id: versionId },
        select: { datasetId: true },
      });
      const datasetId = v?.datasetId ?? datasetIdHint;
      if (datasetId) {
        await cleanupPrefix(
          prismaIngestRepo,
          s3IngestStorage,
          versionParquetPrefix(datasetId, versionId),
          "ingest gagal final",
        );
      }
      if (v) {
        for (const id of await prismaIngestRepo.deleteSheets(versionId)) {
          await cleanupPrefix(
            prismaIngestRepo,
            s3IngestStorage,
            segmentPrefix(v.datasetId, id),
            "ingest gagal final",
          );
        }
        await prismaIngestRepo.fail(versionId, message);
      }
      return true;
    } catch (e) {
      logger.warn(
        { versionId, attempt, err: e instanceof Error ? e.message : String(e) },
        "finalisasi ingest gagal, dicoba lagi",
      );
      await sleep(2_000 * 2 ** attempt);
    }
  }
  return false;
}

/**
 * Versi INGESTING yang dimulai > deadline + 30 menit lalu dan tidak punya job aktif (worker mati
 * berulang, job dibuang sebagai stalled, finalisasi sebelumnya gagal) → FAILED + bersih.
 * Raw dan typed berjalan dalam satu job (T-007): job selesai selalu berakhir READY/AWAITING_MAPPING/
 * FAILED/dihapus (acuan skema basi → job diulang), jadi INGESTING tanpa job hidup berarti macet, apa
 * pun ingestStage-nya.
 */
export async function recoverStuckIngests(queue: Queue<IngestJobData>): Promise<number> {
  const stuck = await prisma.datasetVersion.findMany({
    where: {
      status: "INGESTING",
      OR: [
        { ingestStartedAt: { lt: new Date(Date.now() - STUCK_AFTER_MS) } },
        { ingestStartedAt: null, updatedAt: { lt: new Date(Date.now() - STUCK_AFTER_MS) } },
      ],
    },
    select: { id: true, datasetId: true },
    take: 200,
  });
  let n = 0;
  for (const v of stuck) {
    const job = await queue.getJob(v.id);
    const state = job ? await job.getState() : null;
    if (state === "active" || state === "waiting" || state === "delayed") continue;
    if (await finalizeFailed(v.id, v.datasetId)) n++;
  }
  if (n) logger.warn({ count: n }, "versi ingest macet diakhiri FAILED");
  return n;
}

/** ingest-* (runIngest), recast-* (recastSheet), mapping-* (applyMapping, T-038): raw/typed/temp GB. */
const WORK_DIRS = ["ingest-", "recast-", "mapping-"];

/**
 * Hapus direktori kerja ingest/recast/pemetaan yang tertinggal (worker mati di tengah job). Aman
 * dipanggil saat start: WORKER_TMP_DIR wajib per replika dan job baru belum berjalan.
 */
export function removeStaleWorkDirs(tmpRoot: string): number {
  let n = 0;
  for (const name of readdirSync(tmpRoot)) {
    if (!WORK_DIRS.some((p) => name.startsWith(p))) continue;
    rmSync(join(tmpRoot, name), { recursive: true, force: true });
    n++;
  }
  return n;
}
