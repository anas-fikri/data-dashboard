import "server-only";
import { logger } from "@/lib/logger";
import { ingestQueue, withQueueTimeout } from "./connection";

/** Masukkan versi ke antrean ingest. jobId = versionId sehingga enqueue ulang tidak menggandakan job. */
export async function enqueueIngest(versionId: string, datasetId?: string): Promise<void> {
  await withQueueTimeout(
    ingestQueue().add("ingest", { versionId, datasetId }, { jobId: versionId }),
    "enqueue ingest",
  );
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
        const job = await withQueueTimeout(q.getJob(id), "cari job");
        if (job) await withQueueTimeout(job.remove(), "hapus job");
      } catch (e) {
        logger.warn(
          { versionId: id, err: e instanceof Error ? e.message : String(e) },
          "job ingest tidak bisa dibatalkan (mungkin sedang berjalan atau Redis mati)",
        );
      }
    }),
  );
}
