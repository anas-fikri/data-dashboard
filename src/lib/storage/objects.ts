import "server-only";
import { DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { logger } from "@/lib/logger";
import { bucket, s3Internal } from "@/lib/storage/s3";

/** Prefix objek milik satu dataset (flow-kerja B1). Selalu diakhiri '/' (cuid berawalan sama aman). */
export function datasetPrefixes(datasetId: string): string[] {
  if (!/^[a-z0-9]{20,32}$/.test(datasetId)) throw new Error("datasetId tidak valid");
  return [`raw/${datasetId}/`, `parquet/${datasetId}/`];
}

/** Hapus semua objek di bawah prefix (per halaman 1000 kunci). Mengembalikan jumlah objek terhapus. */
export async function deletePrefix(prefix: string): Promise<number> {
  if (!prefix.endsWith("/")) throw new Error("prefix wajib diakhiri '/'");
  const s3 = s3Internal();
  let deleted = 0;
  let token: string | undefined;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket(), Prefix: prefix, ContinuationToken: token }),
    );
    const keys = (page.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []));
    if (keys.length) {
      await s3.send(new DeleteObjectsCommand({ Bucket: bucket(), Delete: { Objects: keys } }));
      deleted += keys.length;
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return deleted;
}

/** Hapus seluruh objek dataset (file mentah + Parquet). Dipanggil saat profil dihapus. */
export async function deleteDatasetObjects(datasetId: string): Promise<number> {
  let total = 0;
  for (const prefix of datasetPrefixes(datasetId)) total += await deletePrefix(prefix);
  logger.info({ datasetId, objects: total }, "objek storage dataset dihapus");
  return total;
}
