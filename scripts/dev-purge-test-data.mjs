#!/usr/bin/env node
// Dev/e2e saja: hapus data user uji (email buatan uniqueEmail: "<prefix>-<13 digit>-<angka>@" atau
// akun audit "audit<n>-...@") — dataset beserta objek storage-nya (raw/, parquet/, multipart
// yang belum selesai). Mencegah volume storage dev membengkak oleh unggahan e2e (200 MB per putaran).
// Lalu hapus AKUN buatan uniqueEmail saja (ACCOUNT_EMAIL) yang datasetnya sudah habis: akun uji
// tidak menumpuk (ribuan pengguna, puluhan admin e2e) dan tidak mengganggu daftar/pemilih admin.
// Akun lain (termasuk audit*) tidak pernah dihapus. Token ikut terhapus (cascade); AuditLog tetap
// (actorId → null, targetId tanpa FK).
// Menolak NODE_ENV=production. Pakai: node scripts/dev-purge-test-data.mjs [--dry-run]
import { readFileSync, existsSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  ListMultipartUploadsCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
}
if (process.env.NODE_ENV === "production") {
  console.error("menolak: NODE_ENV=production");
  process.exit(1);
}
const dryRun = process.argv.includes("--dry-run");
const TEST_EMAIL = /^([a-z0-9-]+-\d{13}-\d+|audit\d*-[a-z0-9-]+)@/i;
/** Hanya akun buatan uniqueEmail (tests/e2e/helpers.ts) yang dihapus. */
const ACCOUNT_EMAIL = /^[a-z0-9-]+-\d{13}-\d+@pcpexpress\.com$/;

const prisma = new PrismaClient();
const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION ?? "us-east-1",
  forcePathStyle: true,
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
});
const Bucket = process.env.S3_BUCKET;

async function purgePrefix(prefix) {
  let n = 0;
  let token;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken: token }),
    );
    const keys = (page.Contents ?? []).map((o) => ({ Key: o.Key }));
    if (keys.length && !dryRun)
      await s3.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: keys } }));
    n += keys.length;
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  const mp = await s3.send(new ListMultipartUploadsCommand({ Bucket, Prefix: prefix }));
  for (const u of mp.Uploads ?? []) {
    if (!dryRun)
      await s3.send(new AbortMultipartUploadCommand({ Bucket, Key: u.Key, UploadId: u.UploadId }));
    n++;
  }
  return n;
}

try {
  const users = (await prisma.user.findMany({ select: { id: true, email: true } })).filter((u) =>
    TEST_EMAIL.test(u.email),
  );
  const datasets = await prisma.dataset.findMany({
    where: { ownerId: { in: users.map((u) => u.id) } },
    select: { id: true },
  });
  let objects = 0;
  for (const d of datasets) {
    for (const p of [`raw/${d.id}/`, `parquet/${d.id}/`]) objects += await purgePrefix(p);
  }
  if (!dryRun)
    await prisma.dataset.deleteMany({ where: { id: { in: datasets.map((d) => d.id) } } });
  // Setelah dataset (dan storage-nya) habis lewat jalur di atas; akun yang masih punya dataset
  // (mis. dibuat bersamaan) dilewati agar tidak ada dataset terhapus cascade tanpa storage.
  const accountIds = users.filter((u) => ACCOUNT_EMAIL.test(u.email)).map((u) => u.id);
  const accounts = dryRun
    ? accountIds.length
    : (await prisma.user.deleteMany({ where: { id: { in: accountIds }, datasets: { none: {} } } }))
        .count;
  console.log(
    JSON.stringify({
      dryRun,
      testUsers: users.length,
      datasets: datasets.length,
      objects,
      accounts,
    }),
  );
} finally {
  await prisma.$disconnect();
}
