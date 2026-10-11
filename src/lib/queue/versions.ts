import "server-only";
import { logger } from "@/lib/logger";

/**
 * Batalkan job antrean (ingest) untuk versi yang belum terminal. Antrean BullMQ dibangun di T-006;
 * sampai saat itu tidak ada job yang berjalan, sehingga fungsi ini hanya mencatat. Worker juga
 * memeriksa keberadaan dataset di setiap batch (T-006) sebagai pengaman kedua.
 */
export async function cancelVersionJobs(versionIds: string[]): Promise<void> {
  if (versionIds.length === 0) return;
  logger.info({ versionIds }, "pembatalan job versi diminta (antrean belum aktif)");
}
