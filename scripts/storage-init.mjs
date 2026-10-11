#!/usr/bin/env node
// Inisialisasi object storage (idempoten) lewat API S3 standar, tanpa CLI vendor:
// bucket, CORS untuk presigned PUT/GET dari browser (ExposeHeaders ETag wajib untuk resume multipart),
// dan lifecycle abort multipart yang tidak selesai setelah 1 hari (flow-kerja B2).
// File mentah 7 hari dan ekspor 1 jam dibersihkan job aplikasi (granularitas lifecycle = hari).
import { readFileSync, existsSync } from "node:fs";
import {
  S3Client,
  CreateBucketCommand,
  PutBucketCorsCommand,
  PutBucketLifecycleConfigurationCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";

// Muat .env sederhana (tanpa dependensi) bila variabel belum ada di process.env.
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
}

const need = (k) => {
  const v = process.env[k];
  if (!v) {
    console.error(`${k} belum diisi di .env`);
    process.exit(1);
  }
  return v;
};

const endpoint = need("S3_ENDPOINT");
const Bucket = need("S3_BUCKET");
const appOrigin = process.env.APP_URL ?? "http://localhost:3000";

const s3 = new S3Client({
  endpoint,
  region: process.env.S3_REGION ?? "us-east-1",
  forcePathStyle: true,
  // SDK v3 ≥ 3.729 menambah checksum CRC32 ke presigned URL; server non-AWS menolak (BadDigest).
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
  credentials: { accessKeyId: need("S3_ACCESS_KEY"), secretAccessKey: need("S3_SECRET_KEY") },
});

async function waitReady(retries = 20) {
  for (let i = 0; i < retries; i++) {
    try {
      await s3.send(new HeadBucketCommand({ Bucket }));
      return true;
    } catch (e) {
      if (e?.name === "NotFound" || e?.$metadata?.httpStatusCode === 404) return false;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw new Error(`object storage di ${endpoint} tidak merespons`);
}

const exists = await waitReady();
if (!exists) {
  await s3.send(new CreateBucketCommand({ Bucket }));
  console.log(`bucket ${Bucket} dibuat`);
}

await s3.send(
  new PutBucketCorsCommand({
    Bucket,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: [appOrigin],
          AllowedMethods: ["GET", "PUT", "HEAD"],
          AllowedHeaders: ["Content-Type", "Content-Length", "x-amz-*"],
          ExposeHeaders: ["ETag"],
          MaxAgeSeconds: 3600,
        },
      ],
    },
  }),
);

await s3.send(
  new PutBucketLifecycleConfigurationCommand({
    Bucket,
    LifecycleConfiguration: {
      Rules: [
        {
          ID: "abort-incomplete-multipart-1d",
          Status: "Enabled",
          Filter: { Prefix: "" },
          AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 },
        },
      ],
    },
  }),
);

console.log(
  `object storage siap: bucket=${Bucket}, CORS origin=${appOrigin}, lifecycle abort-mpu=1 hari`,
);
