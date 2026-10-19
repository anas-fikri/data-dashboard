import "server-only";
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { DATA_KEY } from "@/features/versions/segment-keys";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { abortMultipartUnder } from "@/lib/storage/multipart";
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
      const res = await s3.send(
        new DeleteObjectsCommand({ Bucket: bucket(), Delete: { Objects: keys } }),
      );
      // DeleteObjects tidak melempar untuk kegagalan per kunci; laporan ada di res.Errors.
      const failed = res.Errors ?? [];
      if (failed.length) {
        throw new Error(
          `${failed.length} objek gagal dihapus di ${prefix} (contoh: ${failed[0]?.Key} ${failed[0]?.Code})`,
        );
      }
      deleted += keys.length;
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return deleted;
}

/**
 * Hapus satu file data (raw/typed segmen, DATA_KEY — T-038; dulu hanya typed revisi lama T-007).
 * Pemanggil memastikan kunci tidak dirujuk (GC, StorageCleanup, file percobaan yang belum ditautkan).
 * Tidak ada → tetap sukses (S3 idempoten).
 */
export async function deleteObject(key: string): Promise<void> {
  if (!DATA_KEY.test(key)) throw new Error("kunci objek tidak valid");
  await s3Internal().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

/** Objek ada? 404 → false; galat lain (jaringan, izin) dilempar — bukan "hilang". */
export async function objectExists(key: string): Promise<boolean> {
  try {
    await s3Internal().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return true;
  } catch (e) {
    const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404 || (e as { name?: string }).name === "NotFound") return false;
    throw e;
  }
}

/** Objek di bawah prefix (kunci + waktu ubah), per halaman 1000. */
export async function listObjects(prefix: string): Promise<{ key: string; modified: Date }[]> {
  const s3 = s3Internal();
  const out: { key: string; modified: Date }[] = [];
  let token: string | undefined;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket(), Prefix: prefix, ContinuationToken: token }),
    );
    for (const o of page.Contents ?? []) {
      if (o.Key) out.push({ key: o.Key, modified: o.LastModified ?? new Date(0) });
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return out;
}

/** "Folder" langsung di bawah prefix (Delimiter "/"), mis. parquet/<ds>/ untuk prefix "parquet/". */
export async function listChildPrefixes(prefix: string): Promise<string[]> {
  const s3 = s3Internal();
  const out: string[] = [];
  let token: string | undefined;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket(),
        Prefix: prefix,
        Delimiter: "/",
        ContinuationToken: token,
      }),
    );
    for (const p of page.CommonPrefixes ?? []) if (p.Prefix) out.push(p.Prefix);
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return out;
}

/**
 * Hapus seluruh objek dataset (file mentah + Parquet). Prefix yang gagal (sebagian atau seluruhnya)
 * dicatat ke StorageCleanup untuk diproses ulang job pembersihan, lalu error dilempar ke pemanggil.
 */
export async function deleteDatasetObjects(datasetId: string): Promise<number> {
  let total = 0;
  const failures: { prefix: string; reason: string }[] = [];
  for (const prefix of datasetPrefixes(datasetId)) {
    try {
      // Upload yang sedang berjalan: abort dulu agar part tidak menunggu lifecycle 1 hari.
      if (prefix.startsWith("raw/")) await abortMultipartUnder(prefix);
      total += await deletePrefix(prefix);
    } catch (e) {
      failures.push({ prefix, reason: e instanceof Error ? e.message : String(e) });
    }
  }
  if (failures.length) {
    await prisma.storageCleanup.createMany({ data: failures });
    throw new Error(`penghapusan storage dataset ${datasetId} belum tuntas; dicatat untuk diulang`);
  }
  logger.info({ datasetId, objects: total }, "objek storage dataset dihapus");
  return total;
}
