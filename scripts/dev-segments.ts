/*
 * Dev/e2e saja (T-040; menolak NODE_ENV=production): sheet beberapa segmen tanpa fitur periode, untuk
 * menguji recast per segmen.
 *   split <sheetId> <n>    → sheet satu segmen dipecah menjadi n segmen di seg/<id>/ (raw = baris judul
 *                            + potongan baris data bernomor fisik sendiri, typed revisi sekarang dengan
 *                            rowBase berurutan + profil), manifest sheet diganti ordinal 0..n-1
 *   manifest <sheetId>     → [{ordinal, schemaRevision, typedKey, createdAt}]
 *   finished <versionId>   → {status, ingestFinishedAt}
 *   periods <versionId>    → {mode, periodGrain, sheets: [{id, name, periodSource, segments:
 *                            [{periodKey, dataRows}]}]} (T-051: versi PERIOD_SETUP)
 *   audit <datasetId> <action> → [{actorId, meta}] baris AuditLog dataset itu (T-051)
 *   review <versionId> [include,…]  → hasil reviewPeriodUpload pemilik dataset (T-052)
 *   confirm <versionId> <json>      → hasil confirmPeriodUpload pemilik dataset; json = payload
 *                                     {include, digest, ack} (T-052)
 * Pakai: npx tsx --conditions=react-server --env-file-if-exists=.env scripts/dev-segments.ts …
 */
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Prisma } from "@prisma/client";
import type { ColumnSchema } from "@/features/ingest/infer";
import { packProfile } from "@/features/ingest/profile";
import { copyTyped, profileRaw } from "@/features/ingest/typed";
import { newSegmentId, segmentPrefix } from "@/features/versions/segment-keys";
import { prisma } from "@/lib/db";
import { lit, openDuck } from "@/lib/duckdb";
import { downloadToFile, uploadFile } from "@/lib/storage/files";

if (process.env.NODE_ENV === "production") {
  console.error("menolak: NODE_ENV=production");
  process.exit(1);
}
const PARQUET = "application/vnd.apache.parquet";

async function split(sheetId: string, n: number) {
  if (!Number.isSafeInteger(n) || n < 2 || n > 200) throw new Error("n harus 2..200");
  const s = await prisma.sheet.findUniqueOrThrow({
    where: { id: sheetId },
    select: {
      versionId: true,
      lineageId: true,
      headerRow: true,
      colCount: true,
      columns: true,
      schema: true,
      schemaRevision: true,
      version: { select: { datasetId: true, sourceKey: true } },
      segments: { select: { segmentTyped: { select: { segment: { select: { rawKey: true } } } } } },
    },
  });
  if (s.segments.length !== 1) throw new Error("sheet harus tepat satu segmen");
  const datasetId = s.version.datasetId;
  const h = s.headerRow;
  const work = mkdtempSync(join(tmpdir(), "dd-split-"));
  const duck = await openDuck({ path: join(work, "s.duckdb"), tmpDir: work, memoryLimit: "1GB" });
  try {
    const raw = join(work, "raw.parquet");
    await downloadToFile(s.segments[0]!.segmentTyped.segment.rawKey, raw);
    const total = Number(
      (
        await duck.conn.runAndReadAll(
          `SELECT count(*) FROM read_parquet(${lit(raw)}) WHERE _row > ${h}`,
        )
      ).getRows()[0]![0],
    );
    const per = Math.ceil(total / n);
    const schema = s.schema as unknown as ColumnSchema[];
    const made: {
      id: string;
      rawKey: string;
      typedKey: string;
      rowBase: bigint;
      maxSrcRow: number;
      rawBytes: number;
      typedBytes: number;
      dataRows: number;
      columns: number[];
      profile: unknown;
    }[] = [];
    let rowBase = 0n;
    for (let k = 0; k < n; k++) {
      const lo = h + 1 + k * per;
      const hi = Math.min(h + (k + 1) * per, h + total);
      const id = newSegmentId();
      const prefix = segmentPrefix(datasetId, id);
      const segRaw = join(work, `raw-${k}.parquet`);
      await duck.conn.run(
        `COPY (SELECT CAST(CASE WHEN _row <= ${h} THEN _row ELSE _row - ${lo - h - 1} END AS INTEGER) AS _row,
                * EXCLUDE (_row)
              FROM read_parquet(${lit(raw)}) WHERE _row <= ${h} OR _row BETWEEN ${lo} AND ${hi} ORDER BY _row)
         TO ${lit(segRaw)} (FORMAT parquet)`,
      );
      // Skema sheet apa adanya (tipe fisik sama di semua segmen, seperti hasil recast T-040).
      const typedPath = join(work, `typed-${k}.parquet`);
      const profile = await profileRaw(duck, {
        rawPath: segRaw,
        headerRow: h,
        colCount: s.colCount,
        watch: async () => {},
      });
      const chars = [...profile.profiles.values()].reduce((n, p) => n + p.chars, 0);
      await copyTyped(duck, {
        rawPath: segRaw,
        outPath: typedPath,
        source: s.version.sourceKey?.endsWith(".csv") ? "csv" : "xlsx",
        headerRow: h,
        rowBase,
        watch: async () => {},
        rawCols: s.colCount,
        schema,
        charsPerRow: profile.dataRows > 0 ? chars / profile.dataRows : 0,
      });
      const rawKey = `${prefix}raw.parquet`;
      const typedKey = `${prefix}typed-${s.schemaRevision}.parquet`;
      await uploadFile(rawKey, segRaw, PARQUET);
      await uploadFile(typedKey, typedPath, PARQUET);
      const maxSrcRow = h + hi - lo + 1;
      made.push({
        id,
        rawKey,
        typedKey,
        rowBase,
        maxSrcRow,
        rawBytes: statSync(segRaw).size,
        typedBytes: statSync(typedPath).size,
        dataRows: profile.dataRows,
        columns: schema.map((c) => c.pos),
        profile: packProfile(h, profile),
      });
      rowBase += BigInt(maxSrcRow);
      rmSync(segRaw, { force: true });
      rmSync(typedPath, { force: true });
    }
    await prisma.$transaction(async (tx) => {
      await tx.sheetSegment.deleteMany({ where: { sheetId } });
      for (const [ordinal, m] of made.entries()) {
        await tx.segment.create({
          data: {
            id: m.id,
            datasetId,
            lineageId: s.lineageId,
            rowBase: m.rowBase,
            maxSrcRow: m.maxSrcRow,
            rawKey: m.rawKey,
            rawRows: m.maxSrcRow,
            rawBytes: BigInt(m.rawBytes),
            headerRow: h,
            colCount: s.colCount,
            createdByVersionId: s.versionId,
          },
        });
        const t = await tx.segmentTyped.create({
          data: {
            segmentId: m.id,
            schemaRevision: s.schemaRevision,
            typedKey: m.typedKey,
            columns: m.columns,
            dataRows: m.dataRows,
            typedBytes: BigInt(m.typedBytes),
            profile: m.profile as unknown as Prisma.InputJsonValue,
          },
          select: { id: true },
        });
        await tx.sheetSegment.create({ data: { sheetId, segmentTypedId: t.id, ordinal } });
      }
      await tx.sheet.update({ where: { id: sheetId }, data: { typedKey: made[0]!.typedKey } });
      await tx.sheetLineage.updateMany({
        where: { id: s.lineageId, rowHighWater: { lt: rowBase } },
        data: { rowHighWater: rowBase },
      });
    });
    console.log(JSON.stringify({ segments: n, rows: total }));
  } finally {
    duck.close();
    rmSync(work, { recursive: true, force: true });
  }
}

async function main() {
  const [cmd, a, b] = process.argv.slice(2);
  try {
    if (cmd === "split") {
      await split(a!, Number(b));
    } else if (cmd === "manifest") {
      const rows = await prisma.sheetSegment.findMany({
        where: { sheetId: a },
        orderBy: { ordinal: "asc" },
        select: {
          ordinal: true,
          segmentTyped: { select: { schemaRevision: true, typedKey: true, createdAt: true } },
        },
      });
      console.log(JSON.stringify(rows.map((r) => ({ ordinal: r.ordinal, ...r.segmentTyped }))));
    } else if (cmd === "periods") {
      const v = await prisma.datasetVersion.findUnique({
        where: { id: a },
        select: {
          mode: true,
          periodGrain: true,
          sheets: {
            orderBy: { index: "asc" },
            select: {
              id: true,
              name: true,
              periodSource: true,
              schema: true,
              segments: {
                orderBy: { ordinal: "asc" },
                select: {
                  segmentTyped: {
                    select: {
                      id: true,
                      typedKey: true,
                      dataRows: true,
                      segment: { select: { id: true, periodKey: true, rawKey: true } },
                    },
                  },
                },
              },
            },
          },
        },
      });
      console.log(
        JSON.stringify(
          v && {
            mode: v.mode,
            periodGrain: v.periodGrain,
            sheets: v.sheets.map((s) => ({
              id: s.id,
              name: s.name,
              periodSource: s.periodSource,
              // T-057: kolom sheet (kolom tersembunyi baru, alias judul, bukan absent).
              columns: (
                (s.schema ?? []) as {
                  pos: number;
                  name: string;
                  type: string;
                  hidden: boolean;
                  absent?: boolean;
                  aliases?: string[];
                }[]
              ).map((c) => ({
                pos: c.pos,
                name: c.name,
                type: c.type,
                hidden: c.hidden,
                absent: c.absent === true,
                aliases: c.aliases ?? [],
              })),
              segments: s.segments.map((m) => ({
                periodKey: m.segmentTyped.segment.periodKey,
                dataRows: m.segmentTyped.dataRows,
                segmentId: m.segmentTyped.segment.id,
                typedId: m.segmentTyped.id,
                rawKey: m.segmentTyped.segment.rawKey,
                typedKey: m.segmentTyped.typedKey,
              })),
            })),
          },
        ),
      );
    } else if (cmd === "audit") {
      const rows = await prisma.auditLog.findMany({
        where: { targetType: "dataset", targetId: a, action: b },
        orderBy: { at: "asc" },
        select: { actorId: true, meta: true },
      });
      console.log(JSON.stringify(rows));
    } else if (cmd === "review" || cmd === "confirm") {
      // Pemilik dataset versi itu (dev/e2e saja): layar tinjauan T-054 belum ada.
      const v = await prisma.datasetVersion.findUniqueOrThrow({
        where: { id: a },
        select: { datasetId: true, dataset: { select: { ownerId: true } } },
      });
      const svc = await import("@/features/versions/period-upload");
      const r =
        cmd === "review"
          ? await svc.reviewPeriodUpload(v.dataset.ownerId, v.datasetId, a, {
              include: b ? b.split(",") : [],
            })
          : await svc.confirmPeriodUpload(
              v.dataset.ownerId,
              v.datasetId,
              a,
              JSON.parse(b ?? "{}"),
              "127.0.0.1",
            );
      console.log(JSON.stringify(r));
      // Klien Redis/antrean yang terbuka tidak boleh menahan proses.
      process.exit(0);
    } else if (cmd === "finished") {
      const v = await prisma.datasetVersion.findUnique({
        where: { id: a },
        select: { status: true, ingestFinishedAt: true },
      });
      console.log(JSON.stringify(v));
    } else {
      console.error(`perintah tidak dikenal: ${cmd}`);
      process.exitCode = 2;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
