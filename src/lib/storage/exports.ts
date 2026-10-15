import "server-only";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { bucket, s3Internal, s3Public } from "@/lib/storage/s3";

/*
 * Objek ekspor (T-017, flow-kerja :149): exports/<userId>/<exportId>.<csv|xlsx|pdf>. Hapus hanya lewat
 * kunci yang lolos pola ketat (tidak pernah prefix/kunci lain), unduh lewat presigned GET 5 menit yang
 * ditandatangani dengan endpoint publik (D5) dan membawa Content-Disposition/Content-Type dari server.
 */

/** CSV/XLSX (T-017) dan PDF dashboard (T-018). */
export const EXPORT_KEY = /^exports\/[a-z0-9]{20,32}\/[a-z0-9]{20,32}\.(csv|xlsx|pdf)$/;
export const EXPORT_PREFIX = "exports/";

export type ExportExt = "csv" | "xlsx" | "pdf";

export function exportKey(userId: string, exportId: string, ext: ExportExt): string {
  const key = `${EXPORT_PREFIX}${userId}/${exportId}.${ext}`;
  if (!EXPORT_KEY.test(key)) throw new Error("kunci ekspor tidak valid");
  return key;
}

/**
 * Unggah satu objek ekspor dari memori (PDF dari renderer, ≤ PDF_MAX_BYTES): satu PutObject dengan
 * Content-Type/Disposition dari server. Kunci wajib lolos pola ketat.
 */
export async function putExportObject(
  key: string,
  body: Uint8Array,
  contentType: string,
  opts: { contentDisposition?: string } = {},
): Promise<void> {
  if (!EXPORT_KEY.test(key)) throw new Error("kunci objek ekspor tidak valid");
  await s3Internal().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentLength: body.byteLength,
      ContentType: contentType,
      ...(opts.contentDisposition ? { ContentDisposition: opts.contentDisposition } : {}),
    }),
  );
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
