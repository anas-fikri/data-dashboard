#!/usr/bin/env node
// Verifikasi pasca-deploy storage publik (T-023 AC2 + AC6), dijalankan di container worker:
//   docker compose -f docker-compose.prod.yml run --rm --add-host <STORAGE_HOST>:host-gateway \
//     worker node deploy/check-public-presign.mjs [--insecure]
// 1. UploadPart 16 MiB presigned dengan endpoint PUBLIK lewat reverse proxy → 200 + ETag
//    (bukan 403 SignatureDoesNotMatch / 413), lalu multipart di-abort.
// 2. Proxy menolak (403) metode/path di luar allowlist: DELETE objek, POST ?uploads, daftar bucket,
//    API admin /minio/* dan /rustfs/*.
// 3. Respons storage membawa X-Content-Type-Options: nosniff dan Content-Security-Policy: sandbox.
// --insecure: terima CA internal Caddy (CADDY_TLS=internal). Tidak mencetak kredensial.
import { randomBytes } from "node:crypto";
import {
  AbortMultipartUploadCommand,
  CreateMultipartUploadCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

if (process.argv.includes("--insecure")) process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const need = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} belum diisi`);
  return v;
};
const Bucket = need("S3_BUCKET");
const client = (endpoint) =>
  new S3Client({
    endpoint,
    region: process.env.S3_REGION ?? "us-east-1",
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    credentials: { accessKeyId: need("S3_ACCESS_KEY"), secretAccessKey: need("S3_SECRET_KEY") },
  });
const internal = client(need("S3_ENDPOINT"));
const pub = client(need("S3_PUBLIC_ENDPOINT"));
const base = need("S3_PUBLIC_ENDPOINT").replace(/\/$/, "");

let failed = 0;
const check = (ok, label) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) failed++;
};

const SIZE = 16 * 1024 * 1024;
const Key = `raw/_deploy-check/${randomBytes(8).toString("hex")}/part.bin`;
const { UploadId } = await internal.send(new CreateMultipartUploadCommand({ Bucket, Key }));
try {
  const url = await getSignedUrl(
    pub,
    new UploadPartCommand({ Bucket, Key, UploadId, PartNumber: 1, ContentLength: SIZE }),
    { expiresIn: 600, signableHeaders: new Set(["content-length"]) },
  );
  const res = await fetch(url, { method: "PUT", body: new Uint8Array(SIZE) });
  check(
    res.status === 200 && !!res.headers.get("etag"),
    `PUT part 16 MiB lewat proxy → ${res.status}`,
  );
  check(res.headers.get("x-content-type-options") === "nosniff", "nosniff pada respons storage");
  check(
    res.headers.get("content-security-policy") === "sandbox",
    "Content-Security-Policy: sandbox pada respons storage",
  );
} finally {
  await internal.send(new AbortMultipartUploadCommand({ Bucket, Key, UploadId }));
}

for (const [method, path] of [
  ["DELETE", `/${Bucket}/raw/x`],
  ["POST", `/${Bucket}/raw/x?uploads`],
  ["GET", `/${Bucket}?list-type=2`],
  ["GET", `/${Bucket}/parquet/x`],
  ["GET", "/minio/admin/v3/info"],
  ["GET", "/rustfs/admin/v3/info"],
]) {
  const res = await fetch(base + path, { method });
  check(res.status === 403, `${method} ${path.split("?")[0]} ditolak proxy → ${res.status}`);
}

process.exitCode = failed ? 1 : 0;
console.log(failed ? `${failed} pemeriksaan gagal` : "storage publik OK");
