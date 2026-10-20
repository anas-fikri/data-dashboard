import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { DATA_KEY, segmentPrefix } from "./segment-keys";

/*
 * GC segmen mark-and-sweep (T-038, ADR-0008) — tanpa penghitung referensi: setiap putaran membaca ulang
 * siapa merujuk apa. Versi hidup = status selain FAILED (aktif, READY tersimpan, dan non-terminal yang
 * sedang diunggah/diproses/menunggu pemetaan). Revisi typed dirujuk bila ada di manifest (SheetSegment)
 * sheet versi hidup; segmen dirujuk bila salah satu revisinya dirujuk atau versi pembuatnya masih hidup
 * (ingest yang belum menautkan manifest). Yang tidak dirujuk ditandai (unreferencedAt) dan baru disapu
 * setelah SEGMENT_GC_GRACE_HOURS tidak dirujuk terus-menerus: barisnya dihapus dalam transaksi di bawah
 * kunci Dataset (urutan lock sama dengan aktivasi/ingest finish), objeknya diserahkan ke StorageCleanup
 * yang memeriksa ulang "masih dirujuk?" tepat sebelum menghapus.
 */
export const SEGMENT_GC_GRACE_HOURS = 24;
export const SEGMENT_GC_GRACE_MS = SEGMENT_GC_GRACE_HOURS * 60 * 60 * 1000;
const DATASET_PAGE = 200;

export interface GcSnapshot {
  versions: { id: string; status: string }[];
  /** Manifest: revisi typed yang dirujuk sheet sebuah versi. */
  manifests: { versionId: string; typedId: string }[];
  segments: {
    id: string;
    createdByVersionId: string | null;
    unreferencedAt: Date | null;
    rawKey: string;
  }[];
  typed: { id: string; segmentId: string; unreferencedAt: Date | null; typedKey: string }[];
}

export interface GcPlan {
  /** Baru tidak dirujuk → unreferencedAt = sekarang. */
  markSegments: string[];
  markTyped: string[];
  /** Dirujuk lagi → unreferencedAt = null. */
  unmarkSegments: string[];
  unmarkTyped: string[];
  /** Tidak dirujuk ≥ masa tenggang → baris dihapus, objek ke StorageCleanup. */
  sweepSegments: string[];
  /** Revisi typed lama dari segmen yang masih dirujuk (segmen yang disapu membawa revisinya). */
  sweepTyped: string[];
}

export function gcPlan(s: GcSnapshot, now: Date, graceMs = SEGMENT_GC_GRACE_MS): GcPlan {
  const live = new Set(s.versions.filter((v) => v.status !== "FAILED").map((v) => v.id));
  const refTyped = new Set(s.manifests.filter((m) => live.has(m.versionId)).map((m) => m.typedId));
  // Versi belum terminal (T-052): file typed segmen yang ditulisnya boleh belum ada di manifest mana
  // pun (unggahan periode yang menunggu konfirmasi: periode "nyasar" yang dikecualikan bisa dimasukkan
  // pemilik saat "Terapkan") — semuanya tetap dirujuk sampai versinya READY/FAILED/dibuang.
  const pending = new Set(
    s.versions.filter((v) => v.status !== "FAILED" && v.status !== "READY").map((v) => v.id),
  );
  const held = new Set(
    s.segments
      .filter((g) => g.createdByVersionId && pending.has(g.createdByVersionId))
      .map((g) => g.id),
  );
  for (const t of s.typed) if (held.has(t.segmentId)) refTyped.add(t.id);
  const refSeg = new Set(s.typed.filter((t) => refTyped.has(t.id)).map((t) => t.segmentId));
  for (const g of s.segments) {
    if (g.createdByVersionId && live.has(g.createdByVersionId)) refSeg.add(g.id);
  }
  const due = (at: Date | null) => at !== null && now.getTime() - at.getTime() >= graceMs;
  const plan: GcPlan = {
    markSegments: [],
    markTyped: [],
    unmarkSegments: [],
    unmarkTyped: [],
    sweepSegments: [],
    sweepTyped: [],
  };
  const swept = new Set<string>();
  for (const g of s.segments) {
    if (refSeg.has(g.id)) {
      if (g.unreferencedAt) plan.unmarkSegments.push(g.id);
    } else if (due(g.unreferencedAt)) {
      plan.sweepSegments.push(g.id);
      swept.add(g.id);
    } else if (!g.unreferencedAt) {
      plan.markSegments.push(g.id);
    }
  }
  for (const t of s.typed) {
    if (swept.has(t.segmentId)) continue;
    if (refTyped.has(t.id)) {
      if (t.unreferencedAt) plan.unmarkTyped.push(t.id);
    } else if (due(t.unreferencedAt)) {
      plan.sweepTyped.push(t.id);
    } else if (!t.unreferencedAt) {
      plan.markTyped.push(t.id);
    }
  }
  return plan;
}

/**
 * Isian StorageCleanup untuk yang disapu: segmen seg/ = satu prefix (raw + semua revisi + file
 * percobaan yang tertinggal); segmen legacy (prefix versi) = kunci persisnya; revisi lama = kuncinya.
 * Kunci di luar pola data tidak pernah diserahkan (dicatat).
 */
export function sweepTargets(
  datasetId: string,
  s: Pick<GcSnapshot, "segments" | "typed">,
  plan: Pick<GcPlan, "sweepSegments" | "sweepTyped">,
): string[] {
  const out = new Set<string>();
  const key = (k: string) => {
    if (DATA_KEY.test(k)) out.add(k);
    else
      logger.error({ datasetId, key: k.slice(0, 200) }, "kunci segmen di luar pola; tidak dihapus");
  };
  for (const id of plan.sweepSegments) {
    const g = s.segments.find((x) => x.id === id)!;
    const prefix = segmentPrefix(datasetId, g.id);
    if (g.rawKey.startsWith(prefix)) {
      out.add(prefix);
      continue;
    }
    key(g.rawKey);
    for (const t of s.typed) if (t.segmentId === id) key(t.typedKey);
  }
  for (const id of plan.sweepTyped) key(s.typed.find((x) => x.id === id)!.typedKey);
  return [...out];
}

async function snapshotOf(tx: Prisma.TransactionClient, datasetId: string): Promise<GcSnapshot> {
  const [versions, manifests, segments, typed] = await Promise.all([
    tx.datasetVersion.findMany({ where: { datasetId }, select: { id: true, status: true } }),
    tx.sheetSegment.findMany({
      where: { sheet: { version: { datasetId } } },
      select: { segmentTypedId: true, sheet: { select: { versionId: true } } },
    }),
    tx.segment.findMany({
      where: { datasetId },
      select: { id: true, createdByVersionId: true, unreferencedAt: true, rawKey: true },
    }),
    tx.segmentTyped.findMany({
      where: { segment: { datasetId } },
      select: { id: true, segmentId: true, unreferencedAt: true, typedKey: true },
    }),
  ]);
  return {
    versions,
    manifests: manifests.map((m) => ({ versionId: m.sheet.versionId, typedId: m.segmentTypedId })),
    segments,
    typed,
  };
}

export interface GcResult {
  datasets: number;
  marked: number;
  unmarked: number;
  sweptSegments: number;
  sweptTyped: number;
  lineages: number;
}

/** Satu dataset di bawah kunci barisnya: tandai, lepas tanda, sapu, dan lineage yatim. */
async function collectDataset(datasetId: string, now: Date, graceMs: number, out: GcResult) {
  await prisma.$transaction(
    async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Dataset" WHERE id = ${datasetId} FOR UPDATE`;
      if (!locked.length) return;
      const s = await snapshotOf(tx, datasetId);
      const plan = gcPlan(s, now, graceMs);
      const set = async (
        model: "segment" | "segmentTyped",
        ids: string[],
        unreferencedAt: Date | null,
      ) => {
        if (!ids.length) return;
        const where = { id: { in: ids } };
        if (model === "segment") await tx.segment.updateMany({ where, data: { unreferencedAt } });
        else await tx.segmentTyped.updateMany({ where, data: { unreferencedAt } });
      };
      await set("segment", plan.markSegments, now);
      await set("segmentTyped", plan.markTyped, now);
      await set("segment", plan.unmarkSegments, null);
      await set("segmentTyped", plan.unmarkTyped, null);
      const targets = sweepTargets(datasetId, s, plan);
      const typedIds = [
        ...plan.sweepTyped,
        ...s.typed.filter((t) => plan.sweepSegments.includes(t.segmentId)).map((t) => t.id),
      ];
      if (typedIds.length) {
        // Hanya manifest versi FAILED yang masih bisa merujuk (yang hidup sudah dikecualikan rencana);
        // FK NoAction menolak hapus revisi yang masih dirujuk manifest mana pun.
        await tx.sheetSegment.deleteMany({ where: { segmentTypedId: { in: typedIds } } });
      }
      if (plan.sweepTyped.length) {
        await tx.segmentTyped.deleteMany({ where: { id: { in: plan.sweepTyped } } });
      }
      if (plan.sweepSegments.length) {
        await tx.segment.deleteMany({ where: { id: { in: plan.sweepSegments } } });
      }
      if (targets.length) {
        await tx.storageCleanup.createMany({
          data: targets.map((prefix) => ({ prefix, reason: "GC segmen", notBefore: now })),
        });
      }
      // Lineage tanpa sheet dan segmen (ingest ulang/dibuang) — tenggang yang sama agar lineage yang baru
      // dibuat ingest (sebelum sheet-nya ditulis) tidak ikut terhapus.
      const lineages = await tx.sheetLineage.deleteMany({
        where: {
          datasetId,
          sheets: { none: {} },
          segments: { none: {} },
          createdAt: { lte: new Date(now.getTime() - graceMs) },
        },
      });
      out.datasets++;
      out.marked += plan.markSegments.length + plan.markTyped.length;
      out.unmarked += plan.unmarkSegments.length + plan.unmarkTyped.length;
      out.sweptSegments += plan.sweepSegments.length;
      out.sweptTyped += plan.sweepTyped.length;
      out.lineages += lineages.count;
    },
    { timeout: 30_000 },
  );
}

/** Satu putaran segment-gc untuk semua dataset yang punya segmen atau lineage. */
export async function runSegmentGc(
  now = new Date(),
  graceMs = SEGMENT_GC_GRACE_MS,
): Promise<GcResult> {
  const out: GcResult = {
    datasets: 0,
    marked: 0,
    unmarked: 0,
    sweptSegments: 0,
    sweptTyped: 0,
    lineages: 0,
  };
  let cursor: string | undefined;
  for (;;) {
    const page = await prisma.dataset.findMany({
      where: { OR: [{ segments: { some: {} } }, { lineages: { some: {} } }] },
      orderBy: { id: "asc" },
      take: DATASET_PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: { id: true },
    });
    for (const d of page) {
      try {
        await collectDataset(d.id, now, graceMs, out);
      } catch (e) {
        // Satu dataset gagal (lock lama, deadlock) tidak menahan yang lain; diulang putaran berikutnya.
        logger.warn(
          { datasetId: d.id, err: e instanceof Error ? e.message : String(e) },
          "GC segmen dataset gagal; diulang nanti",
        );
      }
    }
    if (page.length < DATASET_PAGE) break;
    cursor = page[page.length - 1]!.id;
  }
  if (out.sweptSegments || out.sweptTyped) logger.info(out, "GC segmen menyapu objek tak terujuk");
  return out;
}
