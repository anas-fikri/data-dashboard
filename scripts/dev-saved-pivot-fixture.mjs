#!/usr/bin/env node
// Dev/e2e saja (akses DB langsung, menolak NODE_ENV=production). UI pivot tersimpan menyusul T-074;
// sampai saat itu e2e T-073 menyiapkan pivot tersimpan lewat skrip ini:
//   node scripts/dev-saved-pivot-fixture.mjs create <datasetId> <specJson>
//     → pivot tersimpan baru di sheet pertama versi aktif. Kolom di specJson ditulis lewat NAMA
//       ("column": "Pendapatan"), dipetakan ke posisi skema di sini. Cetak { savedPivotId, revision }.
//   node scripts/dev-saved-pivot-fixture.mjs edit <savedPivotId> <specJson>
//     → ganti spec + revisi naik (seperti simpan pemilik). Cetak { revision }.
// Data ikut terhapus bersama dataset (cascade) oleh dev-purge-test-data.
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
const [mode, target, specJson] = process.argv.slice(2);
if (!["create", "edit"].includes(mode) || !target || !specJson) {
  console.error("pakai: node scripts/dev-saved-pivot-fixture.mjs <create|edit> <id> <specJson>");
  process.exit(1);
}

/** Ganti setiap { column: "<nama>" } di spec dengan posisi kolom skema sheet. */
function byName(value, schema) {
  if (Array.isArray(value)) return value.map((v) => byName(v, schema));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === "column" && typeof v === "string") {
        const c = schema.find((x) => x.name === v);
        if (!c) throw new Error(`kolom tidak ada: ${v}`);
        out[k] = c.pos;
      } else out[k] = byName(v, schema);
    }
    return out;
  }
  return value;
}

const prisma = new PrismaClient();
try {
  const datasetId =
    mode === "create"
      ? target
      : (await prisma.savedPivot.findUniqueOrThrow({ where: { id: target } })).datasetId;
  const ds = await prisma.dataset.findUniqueOrThrow({ where: { id: datasetId } });
  const sheet = await prisma.sheet.findFirstOrThrow({
    where: { versionId: ds.activeVersionId ?? "", typedKey: { not: null } },
    orderBy: { index: "asc" },
  });
  const spec = { sheetId: sheet.id, ...byName(JSON.parse(specJson), sheet.schema ?? []) };
  if (mode === "create") {
    const name = `Pivot e2e ${Date.now()}`;
    const p = await prisma.savedPivot.create({
      data: { datasetId, name, nameKey: name.toLowerCase(), spec, createdById: ds.ownerId },
    });
    console.log(JSON.stringify({ savedPivotId: p.id, revision: p.revision }));
  } else {
    const p = await prisma.savedPivot.update({
      where: { id: target },
      data: { spec, missingColumns: [], revision: { increment: 1 } },
    });
    console.log(JSON.stringify({ revision: p.revision }));
  }
} finally {
  await prisma.$disconnect();
}
