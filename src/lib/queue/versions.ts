import "server-only";
import { logger } from "@/lib/logger";
import { ingestQueue } from "./connection";

/** Masukkan versi ke antrean ingest. jobId = versionId sehingga enqueue ulang tidak menggandakan job. */
export async function enqueueIngest(versionId: string): Promise<void> {
  await ingestQueue().add("ingest", { versionId }, { jobId: versionId });
  logger.info({ versionId }, "job ingest masuk antrean");
}

/**
 * Batalkan job ingest untuk versi yang belum terminal. Job yang sedang dikerjakan (terkunci worker)
 * tidak bisa dihapus dari sini; worker memeriksa keberadaan versi/dataset di setiap batch (T-006)
 * sebagai pengaman kedua, sehingga kegagalan di sini hanya dicatat.
 */
export async function cancelVersionJobs(versionIds: string[]): Promise<void> {
  if (versionIds.length === 0) return;
  const q = ingestQueue();
  await Promise.all(
    versionIds.map(async (id) => {
      try {
        const job = await q.getJob(id);
        if (job) await job.remove();
      } catch (e) {
        logger.warn(
          { versionId: id, err: e instanceof Error ? e.message : String(e) },
          "job ingest tidak bisa dibatalkan (mungkin sedang berjalan)",
        );
      }
    }),
  );
}
