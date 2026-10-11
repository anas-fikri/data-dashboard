import { S3Client } from "@aws-sdk/client-s3";
import { env } from "@/lib/env";

const globalForS3 = globalThis as unknown as { s3Internal?: S3Client; s3Public?: S3Client };

function makeClient(endpoint: string): S3Client {
  const e = env();
  return new S3Client({
    endpoint,
    region: e.S3_REGION,
    forcePathStyle: true,
    // SDK v3 ≥ 3.729 menyisipkan checksum CRC32 ke presigned URL; RustFS/SeaweedFS menolak
    // dengan BadDigest. Integritas part dijamin ETag + signed Content-Length (flow-kerja B2).
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    credentials: { accessKeyId: e.S3_ACCESS_KEY, secretAccessKey: e.S3_SECRET_KEY },
  });
}

/** Klien untuk operasi server→storage lewat jaringan internal. */
export function s3Internal(): S3Client {
  if (!globalForS3.s3Internal) globalForS3.s3Internal = makeClient(env().S3_ENDPOINT);
  return globalForS3.s3Internal;
}

/**
 * Klien yang menandatangani dengan endpoint publik yang persis dilihat browser.
 * Wajib dipakai untuk semua presigned URL (keputusan D5): SigV4 menyertakan host.
 */
export function s3Public(): S3Client {
  if (!globalForS3.s3Public) globalForS3.s3Public = makeClient(env().S3_PUBLIC_ENDPOINT);
  return globalForS3.s3Public;
}

export function bucket(): string {
  return env().S3_BUCKET;
}
