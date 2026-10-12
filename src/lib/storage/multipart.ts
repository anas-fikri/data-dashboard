import "server-only";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListMultipartUploadsCommand,
  ListPartsCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { bucket, s3Internal, s3Public } from "@/lib/storage/s3";

/** Masa berlaku presigned UploadPart. Klien meminta URL per batch sesuai kebutuhan. */
export const PRESIGN_TTL_SEC = 60 * 60;

export interface ListedPart {
  partNumber: number;
  size: number;
  etag: string;
}

/**
 * Operasi object storage untuk upload multipart (flow-kerja B2). Diinjeksi ke service agar alur
 * bisa diuji tanpa storage. Semua presigned URL ditandatangani dengan endpoint publik (D5).
 */
export interface MultipartStorage {
  create(key: string): Promise<string>;
  /** Presigned UploadPart dengan Content-Length sebagai signed header (ukuran lain → 403). */
  signPart(
    key: string,
    uploadId: string,
    partNumber: number,
    contentLength: number,
  ): Promise<string>;
  /** null = upload multipart sudah tidak ada (complete/abort/lifecycle). */
  listParts(key: string, uploadId: string): Promise<ListedPart[] | null>;
  complete(key: string, uploadId: string, parts: ListedPart[]): Promise<string>;
  abort(key: string, uploadId: string): Promise<void>;
  head(
    key: string,
  ): Promise<{ size: number; contentType: string | undefined; etag?: string } | null>;
  readHead(key: string, bytes: number): Promise<Uint8Array>;
  remove(key: string): Promise<void>;
}

const isNoSuchUpload = (e: unknown) =>
  e instanceof Error && (e.name === "NoSuchUpload" || /NoSuchUpload/.test(e.message));
const isNotFound = (e: unknown) =>
  e instanceof Error &&
  (e.name === "NotFound" ||
    e.name === "NoSuchKey" ||
    (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404);

export const s3Multipart: MultipartStorage = {
  async create(key) {
    const res = await s3Internal().send(
      new CreateMultipartUploadCommand({
        Bucket: bucket(),
        Key: key,
        // Ditetapkan server, tidak pernah dari klien (flow-kerja B2).
        ContentType: "application/octet-stream",
      }),
    );
    if (!res.UploadId) throw new Error("storage tidak mengembalikan UploadId");
    return res.UploadId;
  },

  signPart(key, uploadId, partNumber, contentLength) {
    return getSignedUrl(
      s3Public(),
      new UploadPartCommand({
        Bucket: bucket(),
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
        ContentLength: contentLength,
      }),
      { expiresIn: PRESIGN_TTL_SEC, signableHeaders: new Set(["content-length"]) },
    );
  },

  async listParts(key, uploadId) {
    const parts: ListedPart[] = [];
    let marker: string | undefined;
    try {
      do {
        const res = await s3Internal().send(
          new ListPartsCommand({
            Bucket: bucket(),
            Key: key,
            UploadId: uploadId,
            PartNumberMarker: marker,
          }),
        );
        for (const p of res.Parts ?? []) {
          if (p.PartNumber && p.ETag) {
            parts.push({ partNumber: p.PartNumber, size: Number(p.Size ?? 0), etag: p.ETag });
          }
        }
        marker = res.IsTruncated ? res.NextPartNumberMarker : undefined;
      } while (marker);
    } catch (e) {
      if (isNoSuchUpload(e) || isNotFound(e)) return null;
      throw e;
    }
    return parts;
  },

  async complete(key, uploadId, parts) {
    const res = await s3Internal().send(
      new CompleteMultipartUploadCommand({
        Bucket: bucket(),
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: [...parts]
            .sort((a, b) => a.partNumber - b.partNumber)
            .map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
        },
      }),
    );
    return res.ETag ?? "";
  },

  async abort(key, uploadId) {
    try {
      await s3Internal().send(
        new AbortMultipartUploadCommand({ Bucket: bucket(), Key: key, UploadId: uploadId }),
      );
    } catch (e) {
      if (!isNoSuchUpload(e) && !isNotFound(e)) throw e;
    }
  },

  async head(key) {
    try {
      const res = await s3Internal().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
      return {
        size: Number(res.ContentLength ?? 0),
        contentType: res.ContentType,
        etag: res.ETag,
      };
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
  },

  async readHead(key, bytes) {
    const res = await s3Internal().send(
      new GetObjectCommand({ Bucket: bucket(), Key: key, Range: `bytes=0-${bytes - 1}` }),
    );
    return res.Body ? await res.Body.transformToByteArray() : new Uint8Array();
  },

  async remove(key) {
    await s3Internal().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
  },
};

/** Abort semua upload multipart yang belum selesai di bawah prefix (dipakai saat hapus dataset). */
export async function abortMultipartUnder(prefix: string): Promise<number> {
  if (!prefix.endsWith("/")) throw new Error("prefix wajib diakhiri '/'");
  const s3 = s3Internal();
  let aborted = 0;
  let keyMarker: string | undefined;
  let idMarker: string | undefined;
  do {
    const res = await s3.send(
      new ListMultipartUploadsCommand({
        Bucket: bucket(),
        Prefix: prefix,
        KeyMarker: keyMarker,
        UploadIdMarker: idMarker,
      }),
    );
    for (const u of res.Uploads ?? []) {
      if (u.Key && u.UploadId) {
        await s3Multipart.abort(u.Key, u.UploadId);
        aborted++;
      }
    }
    keyMarker = res.IsTruncated ? res.NextKeyMarker : undefined;
    idMarker = res.IsTruncated ? res.NextUploadIdMarker : undefined;
  } while (keyMarker);
  return aborted;
}
