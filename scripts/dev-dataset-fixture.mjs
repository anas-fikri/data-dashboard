#!/usr/bin/env node
// Dev/e2e saja (akses DB langsung, menolak NODE_ENV=production):
//   node scripts/dev-dataset-fixture.mjs seed <datasetId>   → versi READY aktif + versi FAILED terbaru + 1 dashboard
//   node scripts/dev-dataset-fixture.mjs count <datasetId>  → {"versions":n,"dashboards":n,"exists":bool}
import { readFileSync, existsSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
if (process.env.NODE_ENV === "production") {
  console.error("menolak: NODE_ENV=production");
  process.exit(1);
}
const [cmd, datasetId] = process.argv.slice(2);
if (!cmd || !datasetId) {
  console.error("pakai: node scripts/dev-dataset-fixture.mjs <seed|count> <datasetId>");
  process.exit(1);
}
const prisma = new PrismaClient();
try {
  if (cmd === "seed") {
    const ready = await prisma.datasetVersion.create({
      data: {
        datasetId,
        status: "READY",
        originalName: "penjualan-september.xlsx",
        ingestFinishedAt: new Date(Date.now() - 60_000),
        createdAt: new Date(Date.now() - 120_000),
      },
    });
    await prisma.dataset.update({ where: { id: datasetId }, data: { activeVersionId: ready.id } });
    await prisma.datasetVersion.create({
      data: {
        datasetId,
        status: "FAILED",
        originalName: "penjualan-oktober.xlsx",
        errorMessage: "Sheet 'Oktober' baris 1.204: file rusak, tidak bisa dibaca.",
        ingestFinishedAt: new Date(),
      },
    });
    await prisma.dashboard.create({ data: { datasetId, name: "Ringkasan penjualan" } });
    console.log(JSON.stringify({ ok: true }));
  } else if (cmd === "fill") {
    // datasetId di sini = email pemilik; argumen ke-3 = jumlah dataset total yang diinginkan
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: datasetId } });
    const target = Number(process.argv[4] ?? "49");
    const have = await prisma.dataset.count({ where: { ownerId: owner.id } });
    const rows = Array.from({ length: Math.max(0, target - have) }, (_, i) => ({
      ownerId: owner.id,
      name: `Isi ${have + i + 1}`,
      nameKey: `isi ${have + i + 1}`,
    }));
    await prisma.dataset.createMany({ data: rows });
    console.log(JSON.stringify({ total: have + rows.length }));
  } else if (cmd === "total") {
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: datasetId } });
    console.log(
      JSON.stringify({ total: await prisma.dataset.count({ where: { ownerId: owner.id } }) }),
    );
  } else if (cmd === "count") {
    const [versions, dashboards, exists] = await Promise.all([
      prisma.datasetVersion.count({ where: { datasetId } }),
      prisma.dashboard.count({ where: { datasetId } }),
      prisma.dataset.count({ where: { id: datasetId } }),
    ]);
    console.log(JSON.stringify({ versions, dashboards, exists: exists > 0 }));
  } else {
    console.error(`perintah tidak dikenal: ${cmd}`);
    process.exitCode = 1;
  }
} finally {
  await prisma.$disconnect();
}
