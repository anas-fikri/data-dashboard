#!/usr/bin/env node
// Dev/e2e saja: majukan waktu satu ekspor (T-017) seolah 61 menit sudah berlalu sejak selesai —
// finishedAt dan expiresAt dimundurkan 61 menit (uji AC3 tanpa menunggu). Objeknya TIDAK dihapus di sini;
// jalankan `node scripts/dev-upload-fixture.mjs run-job export-cleanup` sesudahnya. Akses DB langsung,
// tidak ada endpoint HTTP. Menolak jalan di produksi.
//   node scripts/dev-expire-export.mjs <exportId>
import { readFileSync, existsSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

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
const id = process.argv[2] ?? "";
if (!/^[a-z0-9]{20,32}$/.test(id)) {
  console.error("pakai: node scripts/dev-expire-export.mjs <exportId>");
  process.exit(1);
}
const SHIFT_MS = 61 * 60 * 1000;
const prisma = new PrismaClient();
try {
  const e = await prisma.export.findUnique({
    where: { id },
    select: { status: true, finishedAt: true, expiresAt: true },
  });
  if (!e || e.status !== "DONE" || !e.finishedAt || !e.expiresAt) {
    console.error(`ekspor ${id} belum selesai (status ${e?.status ?? "tidak ada"})`);
    process.exitCode = 1;
  } else {
    const finishedAt = new Date(e.finishedAt.getTime() - SHIFT_MS);
    const expiresAt = new Date(e.expiresAt.getTime() - SHIFT_MS);
    await prisma.export.update({ where: { id }, data: { finishedAt, expiresAt } });
    console.log(JSON.stringify({ id, finishedAt, expiresAt }));
  }
} finally {
  await prisma.$disconnect();
}
