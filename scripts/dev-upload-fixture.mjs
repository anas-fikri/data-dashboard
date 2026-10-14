#!/usr/bin/env node
// Dev/e2e saja (akses DB, storage internal, dan Redis langsung; menolak NODE_ENV=production):
//   version <versionId>                 → status, ukuran, etag, sourceKey, uploadId, job ingest ada?
//   latest <datasetId>                  → versi terbaru dataset (bentuk sama dengan "version")
//   set-status <datasetId> <STATUS>     → buat versi dengan status tertentu (mis. INGESTING)
//   put-part <versionId> <n> <bytes>    → unggah part langsung ke storage (lewati presigned URL)
//   object <versionId>                  → {"exists":bool,"contentType":...} objek sumber
//   multipart <versionId> [uploadId]    → {"alive":bool,"parts":n} upload multipart masih ada?
//   usage <email> <bytes>               → buat dataset + versi READY berukuran <bytes> (kuota)
//   ingest <versionId>                  → status ingest, metadata sheet, objek parquet versi
// Versi + pemeliharaan (T-013):
//   versions <datasetId>                → [{id,status,createdAt,active,sourceDeletedAt,errorMessage}]
//   backdate <versionId> <days>         → ingestFinishedAt = sekarang − <days> hari
//   cleanup-rows <datasetId>            → baris StorageCleanup yang prefix-nya memuat id itu
//   cleanup-due <datasetId>             → baris di atas jatuh tempo sekarang (notBefore = now)
//   run-job <storage-cleanup|raw-retention> → jalankan job maintenance di worker, tunggu ≤ 60 s
//   prefix-count <prefix>               → jumlah objek di bawah prefix (raw|parquet)/<cuid>/[<cuid>/]
import { readFileSync, existsSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import {
  S3Client,
  UploadPartCommand,
  HeadObjectCommand,
  ListPartsCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { Queue, QueueEvents } from "bullmq";
import Redis from "ioredis";

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

const [cmd, a, b, c] = process.argv.slice(2);
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
const CLEANUP_PREFIX = /^(raw|parquet)\/[a-z0-9]{20,32}\/([a-z0-9]{20,32}\/)?$/;
const MAINTENANCE_JOBS = ["storage-cleanup", "raw-retention"];

async function describe(v) {
  if (!v) return { exists: false };
  const connection = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 });
  const q = new Queue("ingest", { connection });
  const job = await q.getJob(v.id);
  await q.close();
  connection.disconnect();
  return {
    exists: true,
    id: v.id,
    status: v.status,
    sizeBytes: v.sizeBytes === null ? null : Number(v.sizeBytes),
    etag: v.etag,
    sourceKey: v.sourceKey,
    uploadId: v.uploadId,
    errorMessage: v.errorMessage,
    job: Boolean(job),
  };
}

try {
  if (cmd === "version") {
    console.log(
      JSON.stringify(await describe(await prisma.datasetVersion.findUnique({ where: { id: a } }))),
    );
  } else if (cmd === "latest") {
    const v = await prisma.datasetVersion.findFirst({
      where: { datasetId: a },
      orderBy: { createdAt: "desc" },
    });
    console.log(JSON.stringify(await describe(v)));
  } else if (cmd === "set-status") {
    const v = await prisma.datasetVersion.create({
      data: { datasetId: a, status: b, originalName: "sedang-diproses.xlsx", sizeBytes: 1024n },
    });
    console.log(JSON.stringify({ id: v.id }));
  } else if (cmd === "put-part") {
    const v = await prisma.datasetVersion.findUniqueOrThrow({ where: { id: a } });
    const body = Buffer.alloc(Number(c), 0x41);
    const res = await s3.send(
      new UploadPartCommand({
        Bucket,
        Key: v.sourceKey,
        UploadId: v.uploadId,
        PartNumber: Number(b),
        Body: body,
      }),
    );
    console.log(JSON.stringify({ etag: res.ETag }));
  } else if (cmd === "object") {
    const v = await prisma.datasetVersion.findUniqueOrThrow({ where: { id: a } });
    try {
      const h = await s3.send(new HeadObjectCommand({ Bucket, Key: v.sourceKey }));
      console.log(
        JSON.stringify({ exists: true, contentType: h.ContentType, size: Number(h.ContentLength) }),
      );
    } catch {
      console.log(JSON.stringify({ exists: false }));
    }
  } else if (cmd === "multipart") {
    const v = await prisma.datasetVersion.findUniqueOrThrow({ where: { id: a } });
    const uploadId = v.uploadId ?? b;
    try {
      const res = await s3.send(
        new ListPartsCommand({ Bucket, Key: v.sourceKey, UploadId: uploadId }),
      );
      console.log(JSON.stringify({ alive: true, parts: (res.Parts ?? []).length }));
    } catch {
      console.log(JSON.stringify({ alive: false }));
    }
  } else if (cmd === "multipart-raw") {
    // a = key, b = uploadId (dipakai setelah versi terhapus bersama dataset)
    try {
      const res = await s3.send(new ListPartsCommand({ Bucket, Key: a, UploadId: b }));
      console.log(JSON.stringify({ alive: true, parts: (res.Parts ?? []).length }));
    } catch {
      console.log(JSON.stringify({ alive: false }));
    }
  } else if (cmd === "ingest") {
    // a = versionId: status ingest + metadata sheet + jumlah objek parquet versi
    const v = await prisma.datasetVersion.findUnique({
      where: { id: a },
      include: {
        sheets: { orderBy: { index: "asc" } },
        dataset: { select: { activeVersionId: true } },
      },
    });
    if (!v) {
      console.log(JSON.stringify({ exists: false }));
    } else {
      const listed = await s3.send(
        new ListObjectsV2Command({ Bucket, Prefix: `parquet/${v.datasetId}/${v.id}/` }),
      );
      console.log(
        JSON.stringify({
          exists: true,
          status: v.status,
          ingestStage: v.ingestStage,
          active: v.dataset.activeVersionId === v.id,
          errorMessage: v.errorMessage,
          sha256: v.sha256,
          progress: v.progress,
          sheets: v.sheets.map((s) => ({
            id: s.id,
            name: s.name,
            headerRow: s.headerRow,
            rawRows: s.rawRows,
            colCount: s.colCount,
            rawKey: s.rawKey,
            typedKey: s.typedKey,
            schemaRevision: s.schemaRevision,
            types: Array.isArray(s.schema) ? s.schema.map((c) => `${c.name}:${c.type}`) : [],
          })),
          objects: (listed.Contents ?? []).map((o) => o.Key),
        }),
      );
    }
  } else if (cmd === "usage") {
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: a } });
    const ds = await prisma.dataset.create({
      data: { ownerId: owner.id, name: `Kuota ${Date.now()}`, nameKey: `kuota ${Date.now()}` },
    });
    await prisma.datasetVersion.create({
      data: { datasetId: ds.id, status: "READY", originalName: "besar.xlsx", sizeBytes: BigInt(b) },
    });
    console.log(JSON.stringify({ datasetId: ds.id }));
  } else if (cmd === "versions") {
    const ds = await prisma.dataset.findUniqueOrThrow({
      where: { id: a },
      select: { activeVersionId: true },
    });
    const versions = await prisma.datasetVersion.findMany({
      where: { datasetId: a },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        createdAt: true,
        sourceDeletedAt: true,
        errorMessage: true,
      },
    });
    console.log(
      JSON.stringify(versions.map((v) => ({ ...v, active: v.id === ds.activeVersionId }))),
    );
  } else if (cmd === "backdate") {
    const days = Number(b);
    if (!Number.isFinite(days) || days < 0) throw new Error("days tidak valid");
    const at = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    await prisma.datasetVersion.update({ where: { id: a }, data: { ingestFinishedAt: at } });
    console.log(JSON.stringify({ id: a, ingestFinishedAt: at }));
  } else if (cmd === "cleanup-rows" || cmd === "cleanup-due") {
    if (!/^[a-z0-9]{20,32}$/.test(a ?? "")) throw new Error("datasetId tidak valid");
    const where = { prefix: { contains: a } };
    if (cmd === "cleanup-due") {
      const r = await prisma.storageCleanup.updateMany({ where, data: { notBefore: new Date() } });
      console.log(JSON.stringify({ updated: r.count }));
    } else {
      const rows = await prisma.storageCleanup.findMany({ where, orderBy: { createdAt: "asc" } });
      console.log(JSON.stringify(rows));
    }
  } else if (cmd === "run-job") {
    if (!MAINTENANCE_JOBS.includes(a)) throw new Error(`job tidak dikenal: ${a}`);
    const connection = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
    const q = new Queue("maintenance", { connection });
    const events = new QueueEvents("maintenance", { connection: connection.duplicate() });
    try {
      await events.waitUntilReady();
      const job = await q.add(a, {}, { removeOnComplete: 50, removeOnFail: 100 });
      console.log(JSON.stringify({ job: a, result: await job.waitUntilFinished(events, 60_000) }));
    } finally {
      await events.close();
      await q.close();
      connection.disconnect();
    }
  } else if (cmd === "prefix-count") {
    if (!CLEANUP_PREFIX.test(a ?? "")) throw new Error("prefix tidak valid");
    let count = 0;
    let token;
    do {
      const page = await s3.send(
        new ListObjectsV2Command({ Bucket, Prefix: a, ContinuationToken: token }),
      );
      count += (page.Contents ?? []).length;
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    console.log(JSON.stringify({ prefix: a, count }));
  } else {
    console.error(`perintah tidak dikenal: ${cmd}`);
    process.exitCode = 1;
  }
} finally {
  await prisma.$disconnect();
}
