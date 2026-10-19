#!/usr/bin/env node
// Laporan pemakaian kuota per pengguna (T-039), hanya membaca: hitungan lama (jumlah ukuran file versi
// non-FAILED) dan hitungan baru (byte tersimpan: segmen unik terujuk versi hidup + file sumber yang belum
// dihapus + ukuran terdeklarasi UPLOADING — sama dengan src/features/uploads/quota.ts usageOf), persen
// kuota, dan jumlah file segmen lama yang belum terukur (diisi pemeriksaan malam segment-audit; jalankan
// "run-job segment-audit" bila perlu segera). Cetak sebelum dan sesudah deploy T-039 (masa transisi).
// Pakai: node --env-file=.env scripts/quota-report.mjs   (app: docker compose exec app node scripts/quota-report.mjs)
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const GiB = 1024 ** 3;
const quota = Number(process.env.USER_STORAGE_QUOTA_BYTES ?? 20 * GiB);
const gb = (n) => (n / GiB).toFixed(2);

try {
  const users = await prisma.user.findMany({
    where: { datasets: { some: {} } },
    select: { id: true, email: true },
    orderBy: { email: "asc" },
  });
  const rows = [];
  for (const u of users) {
    const versions = await prisma.datasetVersion.findMany({
      where: { dataset: { ownerId: u.id } },
      select: {
        status: true,
        sizeBytes: true,
        sourceKey: true,
        sourceDeletedAt: true,
        ingestFinishedAt: true,
      },
    });
    const refs = await prisma.sheetSegment.findMany({
      where: { sheet: { version: { dataset: { ownerId: u.id }, status: { not: "FAILED" } } } },
      select: {
        segmentTyped: {
          select: { id: true, typedBytes: true, segment: { select: { id: true, rawBytes: true } } },
        },
      },
    });
    let legacy = 0;
    let bytes = 0;
    for (const v of versions) {
      const size = Number(v.sizeBytes ?? 0n);
      if (v.status !== "FAILED") legacy += size;
      const stored =
        v.sourceKey &&
        !v.sourceDeletedAt &&
        v.status !== "UPLOADING" &&
        (v.status !== "FAILED" || v.ingestFinishedAt !== null);
      if (v.status === "UPLOADING" || stored) bytes += size;
    }
    const typed = new Map();
    const raw = new Map();
    for (const r of refs) {
      typed.set(r.segmentTyped.id, r.segmentTyped.typedBytes);
      raw.set(r.segmentTyped.segment.id, r.segmentTyped.segment.rawBytes);
    }
    let unmeasured = 0;
    for (const b of [...typed.values(), ...raw.values()]) {
      if (b === null) unmeasured++;
      else bytes += Number(b);
    }
    rows.push({
      email: u.email,
      lamaGB: gb(legacy),
      baruGB: gb(bytes),
      persen: Math.round((bytes / quota) * 100),
      belumTerukur: unmeasured,
    });
  }
  console.log(`kuota per pengguna: ${gb(quota)} GB`);
  console.table(rows);
  const over = rows.filter((r) => r.persen > 100).length;
  const near = rows.filter((r) => r.persen >= 80 && r.persen <= 100).length;
  console.log(`melebihi kuota: ${over} · ≥ 80%: ${near} · pengguna: ${rows.length}`);
} finally {
  await prisma.$disconnect();
}
