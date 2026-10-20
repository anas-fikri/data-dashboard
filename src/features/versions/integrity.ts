import "server-only";
import { isoDay } from "@/features/ingest/period";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { listChildPrefixes, listObjects, objectBytes, objectExists } from "@/lib/storage/objects";
import { SEGMENT_GC_GRACE_MS } from "./gc";
import { missingKeys, type IntegrityDeps, type ManifestSheet } from "./integrity-check";
import { saveIntegrityStatus, type IntegrityStatus } from "./integrity-status";
import { DATA_KEY } from "./segment-keys";

/*
 * Integritas data versi (T-038, ADR-0008), bagian DB/storage (gerbang murni: integrity-check.ts).
 *  - prismaManifest/prismaIntegrityDeps: manifest versi dari DB + HEAD storage untuk
 *    verifyVersionIntegrity.
 *  - runStorageAudit (job malam): HEAD semua kunci yang dirujuk versi hidup → alert di log + status
 *    admin; objek yatim di seg/ (unggahan/pemetaan yang mati di tengah) dan prefix dataset yang sudah
 *    tidak ada diserahkan ke StorageCleanup (yang memeriksa ulang sebelum menghapus).
 */

/** Manifest versi dari DB (Prisma). */
export async function prismaManifest(versionId: string): Promise<ManifestSheet[] | null> {
  const v = await prisma.datasetVersion.findUnique({
    where: { id: versionId },
    select: {
      periodGrain: true,
      sheets: {
        orderBy: { index: "asc" },
        select: {
          id: true,
          name: true,
          typedKey: true,
          periodSource: true,
          segments: {
            select: {
              ordinal: true,
              segmentTyped: {
                select: {
                  typedKey: true,
                  dataRows: true,
                  segment: {
                    select: {
                      rawKey: true,
                      rowBase: true,
                      maxSrcRow: true,
                      periodKey: true,
                      periodStart: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!v) return null;
  return v.sheets.map((s) => ({
    id: s.id,
    name: s.name,
    typedKey: s.typedKey,
    periodGrain: v.periodGrain,
    periodSource: s.periodSource,
    segments: s.segments.map((m) => ({
      ordinal: m.ordinal,
      typedKey: m.segmentTyped.typedKey,
      rawKey: m.segmentTyped.segment.rawKey,
      rowBase: m.segmentTyped.segment.rowBase,
      maxSrcRow: m.segmentTyped.segment.maxSrcRow,
      periodKey: m.segmentTyped.segment.periodKey,
      periodStart: isoDay(m.segmentTyped.segment.periodStart),
      dataRows: m.segmentTyped.dataRows,
    })),
  }));
}

export const prismaIntegrityDeps: IntegrityDeps = {
  manifest: prismaManifest,
  exists: (key) => objectExists(key),
};

export interface AuditDeps {
  /** Ukuran objek (HEAD); null = tidak ada (404); galat lain dilempar. */
  size(key: string): Promise<number | null>;
  listObjects(prefix: string): Promise<{ key: string; modified: Date }[]>;
  listChildPrefixes(prefix: string): Promise<string[]>;
  saveStatus(s: IntegrityStatus): Promise<void>;
}

const s3AuditDeps: AuditDeps = {
  size: (key) => objectBytes(key),
  listObjects: (prefix) => listObjects(prefix),
  listChildPrefixes: (prefix) => listChildPrefixes(prefix),
  saveStatus: (s) => saveIntegrityStatus(s),
};

const SAMPLE = 20;
const ID = /^[a-z0-9]{20,32}$/;

/** Isian StorageCleanup baru (yang sudah antre tidak digandakan). */
async function enqueue(prefixes: string[], reason: string, now: Date): Promise<number> {
  if (!prefixes.length) return 0;
  const queued = await prisma.storageCleanup.findMany({
    where: { prefix: { in: prefixes } },
    select: { prefix: true },
  });
  const fresh = prefixes.filter((p) => !queued.some((q) => q.prefix === p));
  if (fresh.length) {
    await prisma.storageCleanup.createMany({
      data: fresh.map((prefix) => ({ prefix, reason, notBefore: now })),
    });
  }
  return fresh.length;
}

/** Satu putaran segment-audit (malam). */
export async function runStorageAudit(
  deps: AuditDeps = s3AuditDeps,
  now = new Date(),
  graceMs = SEGMENT_GC_GRACE_MS,
): Promise<IntegrityStatus> {
  // 1. Semua kunci yang dirujuk manifest versi hidup harus ada.
  const rows = await prisma.sheetSegment.findMany({
    where: { sheet: { version: { status: { not: "FAILED" } } } },
    select: {
      segmentTyped: {
        select: {
          id: true,
          typedKey: true,
          typedBytes: true,
          segment: { select: { id: true, rawKey: true, rawBytes: true } },
        },
      },
    },
  });
  const keys = [
    ...new Set(rows.flatMap((r) => [r.segmentTyped.typedKey, r.segmentTyped.segment.rawKey])),
  ];
  // Satu galat storage sementara tidak menggagalkan seluruh pemeriksaan: kunci itu "belum diperiksa".
  let unchecked = 0;
  const sizes = new Map<string, number>();
  const missing = await missingKeys(keys, async (k) => {
    try {
      const n = await deps.size(k);
      if (n !== null) sizes.set(k, n);
      return n !== null;
    } catch {
      unchecked++;
      return true;
    }
  });
  // Ukuran file lama (sebelum T-039) yang belum tercatat: diisi dari HEAD yang sama (kuota).
  let measured = 0;
  const seenSeg = new Set<string>();
  for (const { segmentTyped: t } of rows) {
    if (t.typedBytes === null && sizes.has(t.typedKey)) {
      measured += (
        await prisma.segmentTyped.updateMany({
          where: { id: t.id, typedBytes: null },
          data: { typedBytes: BigInt(sizes.get(t.typedKey)!) },
        })
      ).count;
    }
    const g = t.segment;
    if (g.rawBytes === null && sizes.has(g.rawKey) && !seenSeg.has(g.id)) {
      seenSeg.add(g.id);
      measured += (
        await prisma.segment.updateMany({
          where: { id: g.id, rawBytes: null },
          data: { rawBytes: BigInt(sizes.get(g.rawKey)!) },
        })
      ).count;
    }
  }
  if (measured) logger.info({ measured }, "ukuran file data lama dicatat (kuota)");
  if (unchecked) logger.warn({ unchecked }, "sebagian kunci data tidak bisa diperiksa malam ini");
  if (missing.length) {
    logger.error(
      { missing: missing.length, keys: missing.slice(0, SAMPLE) },
      "kunci data terujuk hilang dari storage",
    );
  }

  // 2. Objek yatim di parquet/<ds>/ (segmen seg/ maupun prefix versi legacy): tidak tercatat di
  //    Segment/SegmentTyped/Sheet dan lebih tua dari masa tenggang (file unggahan/recast/pemetaan yang
  //    sedang berjalan masih muda dan belum tercatat).
  const old = now.getTime() - graceMs;
  const datasets = await prisma.dataset.findMany({ select: { id: true } });
  const orphanKeys: string[] = [];
  for (const { id } of datasets) {
    const objects = await deps.listObjects(`parquet/${id}/`);
    if (!objects.length) continue;
    const [segs, typed, sheets] = await Promise.all([
      prisma.segment.findMany({ where: { datasetId: id }, select: { rawKey: true } }),
      prisma.segmentTyped.findMany({
        where: { segment: { datasetId: id } },
        select: { typedKey: true },
      }),
      prisma.sheet.findMany({
        where: { version: { datasetId: id } },
        select: { rawKey: true, typedKey: true },
      }),
    ]);
    const refs = new Set<string>([
      ...segs.map((s) => s.rawKey),
      ...typed.map((t) => t.typedKey),
      ...sheets.flatMap((s) => [s.rawKey, ...(s.typedKey ? [s.typedKey] : [])]),
    ]);
    for (const o of objects) {
      if (DATA_KEY.test(o.key) && !refs.has(o.key) && o.modified.getTime() <= old) {
        orphanKeys.push(o.key);
      }
    }
  }
  // 3. Prefix dataset yang barisnya sudah tidak ada (unggahan yang selesai setelah dataset dihapus).
  const known = new Set(datasets.map((d) => d.id));
  const goneDatasets: string[] = [];
  for (const top of ["parquet/", "raw/"]) {
    for (const p of await deps.listChildPrefixes(top)) {
      const id = p.slice(top.length, -1);
      if (ID.test(id) && !known.has(id)) goneDatasets.push(p);
    }
  }
  const orphans =
    (await enqueue(orphanKeys, "objek segmen yatim", now)) +
    (await enqueue(goneDatasets, "prefix dataset yatim", now));

  const status: IntegrityStatus = {
    checkedAt: now.toISOString(),
    keys: keys.length,
    missing: missing.length,
    unchecked,
    sample: missing.slice(0, SAMPLE),
    orphans,
  };
  await deps.saveStatus(status);
  logger.info({ ...status, sample: undefined }, "pemeriksaan storage malam selesai");
  return status;
}
