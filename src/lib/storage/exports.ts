import "server-only";
import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { bucket, s3Internal, s3Public } from "@/lib/storage/s3";

/*
 * Objek ekspor (T-017, flow-kerja :149): exports/<userId>/<exportId>.<ext>. Hapus hanya lewat kunci yang
 * lolos pola ketat (tidak pernah prefix/kunci lain), unduh lewat presigned GET 5 menit yang ditandatangani
 * dengan endpoint publik (D5) dan membawa Content-Disposition/Content-Type dari server.
 */

/** PDF (T-018) menambah ekstensinya di sini. */
export const EXPORT_KEY = /^exports\/[a-z0-9]{20,32}\/[a-z0-9]{20,32}\.(csv|xlsx)$/;
export const EXPORT_PREFIX = "exports/";

export type ExportExt = "csv" | "xlsx";

export function exportKey(userId: string, exportId: string, ext: ExportExt): string {
  const key = `${EXPORT_PREFIX}${userId}/${exportId}.${ext}`;
  if (!EXPORT_KEY.test(key)) throw new Error("kunci ekspor tidak valid");
  return key;
}

/** Hapus satu objek ekspor. Tidak ada → tetap sukses (S3 idempoten). */
export async function deleteExportObject(key: string): Promise<void> {
  if (!EXPORT_KEY.test(key)) throw new Error("kunci objek ekspor tidak valid");
  await s3Internal().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

export interface PresignGetOptions {
  /** Detik; pemanggil membatasi ≤ sisa umur ekspor. */
  expiresIn: number;
  contentDisposition: string;
  contentType: string;
}

/**
 * Presigned GET (endpoint publik, D5) dengan response-content-disposition/-type: browser menyimpan file
 * dengan nama dari server, bukan menampilkan isinya.
 */
export function presignExportGet(key: string, o: PresignGetOptions): Promise<string> {
  if (!EXPORT_KEY.test(key)) throw new Error("kunci objek ekspor tidak valid");
  return getSignedUrl(
    s3Public(),
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
      ResponseContentDisposition: o.contentDisposition,
      ResponseContentType: o.contentType,
    }),
    { expiresIn: Math.max(1, Math.floor(o.expiresIn)) },
  );
}

/**
 * Kunci di bawah exports/ yang terakhir diubah sebelum `before` (sapuan objek yatim), paling banyak
 * `limit`. Kunci yang tidak cocok pola ekspor tidak dikembalikan (tidak pernah dihapus).
 */
export async function listExportObjects(before: Date, limit = 1000): Promise<string[]> {
  const s3 = s3Internal();
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket(),
        Prefix: EXPORT_PREFIX,
        ContinuationToken: token,
      }),
    );
    for (const o of page.Contents ?? []) {
      if (o.Key && EXPORT_KEY.test(o.Key) && o.LastModified && o.LastModified < before) {
        keys.push(o.Key);
        if (keys.length >= limit) return keys;
      }
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return keys;
}
