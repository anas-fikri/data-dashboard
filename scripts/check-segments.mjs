#!/usr/bin/env node
// Pemeriksaan migrasi segmen T-036 (ADR-0008), hanya membaca: setiap Sheet punya tepat satu segmen
// legacy (rowBase 0) di versinya dengan rawKey yang sama, setiap sheet ber-typedKey punya manifest
// ordinal 0 yang menunjuk file typed yang sama, lineage satu dataset dengan sheetnya. Mencetak jumlah
// saja (tanpa nama/isi). Pakai: node --env-file=.env scripts/check-segments.mjs (exit 1 bila ada selisih).
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const one = async (sql) => Number((await prisma.$queryRawUnsafe(sql))[0].n);
try {
  const checks = {
    sheets: await one(`SELECT count(*) AS n FROM "Sheet"`),
    "sheet tanpa segmen di versinya": await one(`
      SELECT count(*) AS n FROM "Sheet" s WHERE NOT EXISTS (
        SELECT 1 FROM "Segment" g WHERE g."createdByVersionId" = s."versionId" AND g."rawKey" = s."rawKey"
          AND g."lineageId" = s."lineageId")`),
    "sheet bertyped tanpa manifest yang cocok": await one(`
      SELECT count(*) AS n FROM "Sheet" s WHERE s."typedKey" IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "SheetSegment" m JOIN "SegmentTyped" t ON t.id = m."segmentTypedId"
        WHERE m."sheetId" = s.id AND m.ordinal = 0 AND t."typedKey" = s."typedKey")`),
    "manifest lebih dari satu segmen (REPLACE)": await one(`
      SELECT count(*) AS n FROM (SELECT "sheetId" FROM "SheetSegment" GROUP BY "sheetId" HAVING count(*) > 1) x`),
    "lineage lintas dataset": await one(`
      SELECT count(*) AS n FROM "Sheet" s JOIN "DatasetVersion" v ON v.id = s."versionId"
      JOIN "SheetLineage" l ON l.id = s."lineageId" WHERE l."datasetId" <> v."datasetId"`),
    // Hanya file typed yang dirujuk manifest: pemetaan bisa memberi segmen legacy rowBase baru
    // (typed ditulis ulang, baris SegmentTyped legacy lama tidak lagi dirujuk).
    "segmen legacy dengan rowBase bukan 0": await one(`
      SELECT count(*) AS n FROM "SheetSegment" m JOIN "SegmentTyped" t ON t.id = m."segmentTypedId"
      JOIN "Segment" g ON g.id = t."segmentId" WHERE t."legacyRow" AND g."rowBase" <> 0`),
  };
  for (const [k, v] of Object.entries(checks)) console.log(`${k}: ${v}`);
  const bad = Object.entries(checks).filter(([k, v]) => k !== "sheets" && v !== 0);
  if (bad.length) process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
