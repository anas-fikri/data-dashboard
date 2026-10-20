import "server-only";
import { isIdShape } from "@/features/datasets/validation";
import type { ColumnSchema } from "@/features/ingest/infer";
import { isoDay, type PeriodGrain } from "@/features/ingest/period";
import { labelRange, type LabelRange, type ReviewSheetName } from "@/features/ingest/period-review";
import { labelReferenceColumn } from "@/features/ingest/period-setup-plan";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { reviewPeriodUpload, type PeriodReview } from "./period-upload";
import type { VersionResult } from "./types";

/*
 * Data halaman tinjauan unggahan periode /datasets/:id/tinjau/:versionId (T-054, rencana G-6 §4.5
 * langkah 5): pemilik dataset saja (lainnya null → 404, D2). Rencana dihitung ulang lewat
 * reviewPeriodUpload (tanpa mengubah apa pun, pilihan nyasar bawaan "Kecualikan"); konteks yang tidak
 * bergantung pada pilihan (nama sheet, baris file per periode, rentang kolom tanggal acuan sheet
 * berlabel, batas waktu keputusan) dibaca sekali di sini.
 *
 * PERHATIAN (T-058): pada sheet berlabel, Segment.minDate/maxDate = rentang kolom tanggal ACUAN
 * (labelReferenceColumn), bukan rentang periode. Pemangkasan segmen untuk filter tanggal/Periode tidak
 * boleh memakainya sebagai rentang periode (pakai periodStart/periodKey); hanya sah untuk filter pada
 * kolom acuan itu sendiri.
 */

export interface PeriodReviewContext {
  datasetId: string;
  datasetName: string;
  versionId: string;
  fileName: string | null;
  grain: PeriodGrain;
  /** Sheet data aktif (urut tab): nama untuk kunci lineageId rencana. */
  sheets: ReviewSheetName[];
  /** Baris file per kunci periode (semua sheet), termasuk periode yang dikecualikan. */
  fileRows: Record<string, number>;
  labelRanges: LabelRange[];
  /** ISO 8601: unggahan dibuang otomatis bila belum diputuskan (PERIOD_CONFIRM_TTL_HOURS). */
  expiresAt: string;
}

export type PeriodReviewPageData =
  | { state: "pending"; context: PeriodReviewContext; review: VersionResult<PeriodReview> }
  /** Versi tidak ada lagi atau tidak lagi menunggu konfirmasi (diterapkan, dibatalkan, kedaluwarsa). */
  | { state: "gone"; datasetId: string; datasetName: string };

export async function periodReviewPage(
  userId: string,
  datasetId: string,
  versionId: string,
): Promise<PeriodReviewPageData | null> {
  if (!isIdShape(datasetId)) return null;
  const ds = await prisma.dataset.findFirst({
    where: { id: datasetId, ownerId: userId },
    select: {
      id: true,
      name: true,
      activeVersion: {
        select: {
          sheets: {
            orderBy: { index: "asc" },
            select: { lineageId: true, name: true, periodSource: true, schema: true },
          },
        },
      },
    },
  });
  if (!ds) return null;
  const gone = { state: "gone" as const, datasetId: ds.id, datasetName: ds.name };
  if (!isIdShape(versionId)) return gone;
  const v = await prisma.datasetVersion.findFirst({
    where: { id: versionId, datasetId: ds.id },
    select: {
      status: true,
      mode: true,
      originalName: true,
      periodGrain: true,
      ingestFinishedAt: true,
      updatedAt: true,
    },
  });
  if (!v || v.status !== "AWAITING_CONFIRM" || v.mode !== "PERIOD" || !v.periodGrain) return gone;
  const grain = v.periodGrain;
  const [segments, review] = await Promise.all([
    prisma.segment.findMany({
      where: { createdByVersionId: versionId, periodKey: { not: null } },
      select: {
        lineageId: true,
        periodKey: true,
        periodStart: true,
        minDate: true,
        maxDate: true,
        typed: { select: { dataRows: true } },
      },
    }),
    reviewPeriodUpload(userId, ds.id, versionId, { include: [] }),
  ]);
  const active = ds.activeVersion?.sheets ?? [];
  const fileRows: Record<string, number> = {};
  for (const g of segments) {
    const rows = g.typed.reduce((n, t) => n + (t.dataRows ?? 0), 0);
    fileRows[g.periodKey!] = (fileRows[g.periodKey!] ?? 0) + rows;
  }
  const labelRanges: LabelRange[] = [];
  for (const s of active) {
    if (s.periodSource !== "LABEL") continue;
    const ref = labelReferenceColumn(s.schema as ColumnSchema[] | null);
    if (!ref) continue;
    for (const g of segments) {
      const start = isoDay(g.periodStart);
      if (g.lineageId !== s.lineageId || !start || !g.minDate) continue;
      labelRanges.push(
        labelRange(grain, {
          sheet: s.name,
          column: ref.name,
          start,
          min: isoDay(g.minDate),
          max: isoDay(g.maxDate),
        }),
      );
    }
  }
  const from = v.ingestFinishedAt ?? v.updatedAt;
  return {
    state: "pending",
    context: {
      datasetId: ds.id,
      datasetName: ds.name,
      versionId,
      fileName: v.originalName,
      grain,
      sheets: active.map((s) => ({ lineageId: s.lineageId, name: s.name })),
      fileRows,
      labelRanges,
      expiresAt: new Date(
        from.getTime() + env().PERIOD_CONFIRM_TTL_HOURS * 60 * 60 * 1000,
      ).toISOString(),
    },
    review,
  };
}
