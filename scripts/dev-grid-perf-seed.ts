/*
 * Dev/stack uji perf saja (T-061; menolak NODE_ENV=production): pasang sheet "Lihat data" besar tanpa
 * mengunggah file — data dari scripts/perf-grid-data.ts (tata letak typed ingest) diunggah ke storage
 * sebagai segmen sungguhan (parquet/<ds>/seg/<id>/typed-1.parquet + raw kecil), lalu metadata ditulis
 * persis seperti ingest: Dataset, versi READY aktif, SheetLineage, Sheet (layout period: sumber LABEL,
 * satuan bulan), Segment, SegmentTyped, manifest SheetSegment, plus satu dashboard kosong yang dibagikan
 * sebagai EDITOR ke akun lain (penggulir uji beban). Endpoint, otorisasi, cache parquet aplikasi, dan
 * mesin query yang diukur scripts/perf-grid-http.mjs semuanya jalur produksi.
 *
 *   npx tsx --conditions=react-server --env-file-if-exists=.env scripts/dev-grid-perf-seed.ts \
 *     --dir <scratch> --owner <email> [--editors a@x,b@x] [--rows 10000000] [--segs 24]
 *     [--layout period|single] [--name "Perf grid 10 jt"]
 * Keluaran (stdout, satu baris JSON): {datasetId, versionId, sheetId, dashboardId, rows, segs, layout}.
 * Hapus dataset lewat UI (atau stack uji `deploy/perf-stack.sh down`) setelah selesai.
 */
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import type { Prisma } from "@prisma/client";
import { newSegmentId, segmentPrefix } from "@/features/versions/segment-keys";
import { prisma } from "@/lib/db";
import { uploadFile } from "@/lib/storage/files";
import {
  generateGridData,
  GRID_COLS,
  gridSchema,
  ROW_BASE_STEP,
  type Layout,
} from "./perf-grid-data";

if (process.env.NODE_ENV === "production") {
  console.error("menolak: NODE_ENV=production");
  process.exit(1);
}
const PARQUET = "application/vnd.apache.parquet";
const arg = (name: string, def?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};

async function main() {
  const dir = arg("dir");
  const ownerEmail = arg("owner")?.toLowerCase();
  if (!dir || !ownerEmail) {
    throw new Error("pakai: dev-grid-perf-seed.ts --dir <scratch> --owner <email> [--editors a,b]");
  }
  const rows = Number(arg("rows", "10000000"));
  const layout = arg("layout", "period") as Layout;
  const segs = layout === "single" ? 1 : Number(arg("segs", "24"));
  const name = arg("name", `Perf grid ${rows / 1e6} jt ${Date.now()}`)!;
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: ownerEmail } });
  const editors = await prisma.user.findMany({
    where: {
      email: {
        in: (arg("editors") ?? "")
          .split(",")
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean),
      },
    },
    select: { id: true },
  });
  const data = await generateGridData({ dir, rows, segs, layout });

  // Raw kecil (judul saja) per segmen: sel jendela tidak pernah NULL, jadi raw tidak dibaca.
  const tmp = mkdtempSync(join(dir, "raw-"));
  const rawPath = join(tmp, "raw.parquet");
  const db = await DuckDBInstance.create(":memory:");
  const c = await db.connect();
  const cols = gridSchema.map((g) => `'${g.original}' AS c${g.pos}`).join(", ");
  await c.run(
    `COPY (SELECT 1::INTEGER AS _row, ${cols}) TO '${rawPath}' (FORMAT parquet, COMPRESSION zstd)`,
  );
  c.closeSync();
  db.closeSync();
  const rawBytes = BigInt(statSync(rawPath).size);

  const dataset = await prisma.dataset.create({
    data: { ownerId: owner.id, name, nameKey: name.trim().toLowerCase() },
  });
  const version = await prisma.datasetVersion.create({
    data: {
      datasetId: dataset.id,
      status: "READY",
      mode: layout === "period" ? "PERIOD" : "REPLACE",
      periodGrain: layout === "period" ? "MONTH" : null,
      originalName: "perf-grid.csv",
      uploadedById: owner.id,
      ingestStartedAt: new Date(),
      ingestFinishedAt: new Date(),
      ingestStage: "typed",
    },
  });
  const lineage = await prisma.sheetLineage.create({
    data: { datasetId: dataset.id, rowHighWater: BigInt(segs * ROW_BASE_STEP) },
  });
  const typedKeys: string[] = [];
  const segRows: { id: string; typedKey: string; seg: (typeof data.segments)[number] }[] = [];
  for (const seg of data.segments) {
    const id = newSegmentId();
    const prefix = segmentPrefix(dataset.id, id);
    const typedKey = `${prefix}typed-1.parquet`;
    await uploadFile(`${prefix}raw.parquet`, rawPath, PARQUET);
    await uploadFile(typedKey, join(data.dir, seg.typedKey), PARQUET);
    typedKeys.push(typedKey);
    segRows.push({ id, typedKey, seg });
  }
  rmSync(tmp, { recursive: true, force: true });
  const sheet = await prisma.sheet.create({
    data: {
      versionId: version.id,
      index: 0,
      name: "Pengiriman",
      rawKey: `${segmentPrefix(dataset.id, segRows[0]!.id)}raw.parquet`,
      rawRows: rows + segs,
      colCount: GRID_COLS,
      headerRow: 1,
      columns: gridSchema.map(({ pos, name: n, original }) => ({
        pos,
        name: n,
        original,
      })) as unknown as Prisma.InputJsonValue,
      typedKey: typedKeys[0]!,
      schemaRevision: 1,
      schema: gridSchema as unknown as Prisma.InputJsonValue,
      lineageId: lineage.id,
      periodSource: layout === "period" ? "LABEL" : null,
    },
  });
  for (const [ordinal, { id, typedKey, seg }] of segRows.entries()) {
    await prisma.segment.create({
      data: {
        id,
        datasetId: dataset.id,
        lineageId: lineage.id,
        rowBase: BigInt(seg.rowBase),
        maxSrcRow: seg.maxSrcRow,
        rawKey: `${segmentPrefix(dataset.id, id)}raw.parquet`,
        rawRows: (seg.dataRows ?? 0) + 1,
        rawBytes,
        headerRow: 1,
        colCount: GRID_COLS,
        periodKey: seg.period?.key ?? null,
        periodStart: seg.period ? new Date(`${seg.period.start}T00:00:00Z`) : null,
        originalName: seg.fileName,
        sourceKind: "csv",
        uploadedById: owner.id,
        createdByVersionId: version.id,
        typed: {
          create: {
            schemaRevision: 1,
            typedKey,
            columns: seg.columns,
            dataRows: seg.dataRows,
            typedBytes: BigInt(statSync(join(data.dir, seg.typedKey)).size),
            headerRow: 1,
            sheets: { create: { sheetId: sheet.id, ordinal } },
          },
        },
      },
    });
  }
  await prisma.dataset.update({
    where: { id: dataset.id },
    data: { activeVersionId: version.id },
  });
  const dashboard = await prisma.dashboard.create({
    data: {
      datasetId: dataset.id,
      name: "Perf dashboard",
      nameKey: "perf dashboard",
      shares: {
        create: editors.map((e) => ({ userId: e.id, role: "EDITOR", createdById: owner.id })),
      },
    },
  });
  console.log(
    JSON.stringify({
      datasetId: dataset.id,
      versionId: version.id,
      sheetId: sheet.id,
      dashboardId: dashboard.id,
      rows,
      segs,
      layout,
      dataMb: data.sizeMb,
    }),
  );
}

main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
