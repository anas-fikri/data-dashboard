#!/usr/bin/env node
// Verifikasi object storage menegakkan presigned UploadPart (flow-kerja B2, AC T-004 #8):
//   1. part dengan Content-Length sesuai tanda tangan → 200 + ETag
//   2. part dengan Content-Length berbeda → ditolak (403)
//   3. Content-Type objek hasil complete = application/octet-stream (ditetapkan server)
// Jalankan setelah compose:up / deploy: node scripts/check-presign.mjs
import { readFileSync, existsSync } from "node:fs";
import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
}

const mk = (endpoint) =>
  new S3Client({
    endpoint,
    region: process.env.S3_REGION ?? "us-east-1",
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY,
      secretAccessKey: process.env.S3_SECRET_KEY,
    },
  });
const internal = mk(process.env.S3_ENDPOINT);
const pub = mk(process.env.S3_PUBLIC_ENDPOINT);
const Bucket = process.env.S3_BUCKET;
const Key = `raw/_check/${Date.now()}/source.bin`;

const sign = (UploadId, PartNumber, ContentLength) =>
  getSignedUrl(pub, new UploadPartCommand({ Bucket, Key, UploadId, PartNumber, ContentLength }), {
    expiresIn: 300,
    signableHeaders: new Set(["content-length"]),
  });

let failed = false;
const ok = (cond, msg) => {
  console.log(`${cond ? "ok  " : "FAIL"} ${msg}`);
  if (!cond) failed = true;
};

const { UploadId } = await internal.send(
  new CreateMultipartUploadCommand({ Bucket, Key, ContentType: "application/octet-stream" }),
);
try {
  const body = Buffer.alloc(1024, 7);
  const url = await sign(UploadId, 1, body.length);
  ok(/X-Amz-SignedHeaders=[^&]*content-length/i.test(url), "content-length ada di SignedHeaders");

  const bigger = Buffer.alloc(2048, 7);
  const bad = await fetch(url, { method: "PUT", body: bigger });
  ok(bad.status === 403, `part dengan Content-Length berbeda ditolak (status ${bad.status})`);

  const good = await fetch(url, { method: "PUT", body, headers: { "content-type": "text/html" } });
  const etag = good.headers.get("etag");
  ok(good.status === 200 && !!etag, `part sesuai tanda tangan diterima (status ${good.status})`);

  await internal.send(
    new CompleteMultipartUploadCommand({
      Bucket,
      Key,
      UploadId,
      MultipartUpload: { Parts: [{ PartNumber: 1, ETag: etag }] },
    }),
  );
  const head = await internal.send(new HeadObjectCommand({ Bucket, Key }));
  ok(
    head.ContentType === "application/octet-stream",
    `Content-Type objek ditetapkan server (${head.ContentType})`,
  );
  await internal.send(new DeleteObjectCommand({ Bucket, Key }));
} catch (e) {
  failed = true;
  console.error(e);
  await internal.send(new AbortMultipartUploadCommand({ Bucket, Key, UploadId })).catch(() => {});
}
process.exit(failed ? 1 : 0);
