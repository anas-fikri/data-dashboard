import "server-only";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { open, stat } from "node:fs/promises";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  PutObjectCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { bucket, s3Internal } from "@/lib/storage/s3";

/*
 * Transfer file besar antara disk temp worker dan storage (T-006). Unduhan menghitung SHA-256 sambil
 * jalan (flow-kerja B3); unggahan > 16 MB memakai multipart (part 16 MB, dibatalkan bila gagal).
 */

const PART = 16 * 1024 * 1024;

export async function downloadToFile(
  key: string,
  dest: string,
): Promise<{ sha256: string; bytes: number }> {
  const res = await s3Internal().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  if (!res.Body) throw new Error(`objek ${key} kosong`);
  const hash = createHash("sha256");
  let bytes = 0;
  await pipeline(
    res.Body as Readable,
    new Transform({
      transform(chunk: Buffer, _e, cb) {
        hash.update(chunk);
        bytes += chunk.length;
        cb(null, chunk);
      },
    }),
    createWriteStream(dest),
  );
  return { sha256: hash.digest("hex"), bytes };
}

export async function uploadFile(key: string, path: string, contentType: string): Promise<void> {
  const s3 = s3Internal();
  const { size } = await stat(path);
  if (size <= PART) {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket(),
        Key: key,
        Body: createReadStream(path),
        ContentLength: size,
        ContentType: contentType,
      }),
    );
    return;
  }
  const { UploadId } = await s3.send(
    new CreateMultipartUploadCommand({ Bucket: bucket(), Key: key, ContentType: contentType }),
  );
  if (!UploadId) throw new Error("storage tidak mengembalikan UploadId");
  const fh = await open(path, "r");
  try {
    const parts: { PartNumber: number; ETag: string }[] = [];
    for (let n = 1, pos = 0; pos < size; n++, pos += PART) {
      const len = Math.min(PART, size - pos);
      const buf = Buffer.allocUnsafe(len);
      for (let r = 0; r < len;) {
        const { bytesRead } = await fh.read(buf, r, len - r, pos + r);
        if (bytesRead === 0) throw new Error("file temp terpotong saat diunggah");
        r += bytesRead;
      }
      const up = await s3.send(
        new UploadPartCommand({
          Bucket: bucket(),
          Key: key,
          UploadId,
          PartNumber: n,
          Body: buf,
          ContentLength: len,
        }),
      );
      parts.push({ PartNumber: n, ETag: up.ETag ?? "" });
    }
    await s3.send(
      new CompleteMultipartUploadCommand({
        Bucket: bucket(),
        Key: key,
        UploadId,
        MultipartUpload: { Parts: parts },
      }),
    );
  } catch (e) {
    await s3
      .send(new AbortMultipartUploadCommand({ Bucket: bucket(), Key: key, UploadId }))
      .catch(() => {});
    throw e;
  } finally {
    await fh.close();
  }
}
