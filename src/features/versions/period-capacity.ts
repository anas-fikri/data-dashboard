import "server-only";
import type { Prisma, PrismaClient } from "@prisma/client";
import { periodLimits } from "@/features/ingest/period-plan";
import {
  initPeriodRejection,
  periodCapacity,
  uploadEstimate,
  type CapacitySheet,
  type PeriodCapacity,
  type UploadEstimate,
} from "@/features/ingest/period-capacity";
import { periodKeyOf, type PeriodGrain } from "@/features/ingest/period";
import { PARQUET_RATIO } from "@/features/uploads/quota";
import { kindOf } from "@/features/uploads/sniff";
import { env } from "@/lib/env";

/*
 * Kapasitas dataset per periode dari DB (T-055): meter + proyeksi untuk kartu Periode dan panel unggah,
 * perkiraan dan penolakan pasti saat init unggahan periode. Pemanggil sudah memeriksa kepemilikan
 * (halaman: getDataset/periodUploadContext; init: dataset milik pemilik di transaksi init).
 */

type Db = PrismaClient | Prisma.TransactionClient;

/** Rasio byte/baris dari ≤ 10 unggahan terakhir berjenis sama (xlsx/csv) yang berhasil diproses. */
const HISTORY = 10;

interface Loaded {
  grain: PeriodGrain;
  settings: { keepPeriods: number | null; onLimit: "REJECT" | "EVICT_OLDEST" };
  sheets: (CapacitySheet & { periodSource: "COLUMN" | "LABEL" | null })[];
}

async function loadActive(db: Db, datasetId: string): Promise<Loaded | null> {
  const ds = await db.dataset.findUnique({
    where: { id: datasetId },
    select: {
      keepPeriods: true,
      onLimit: true,
      activeVersion: {
        select: {
          periodGrain: true,
          sheets: {
            orderBy: { index: "asc" },
            select: {
              lineageId: true,
              name: true,
              periodSource: true,
              segments: {
                select: {
                  segmentTyped: {
                    select: {
                      dataRows: true,
                      typedBytes: true,
                      segment: {
                        select: { rawBytes: true, periodKey: true, periodStart: true },
                      },
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
  const a = ds?.activeVersion;
  if (!ds || !a?.periodGrain) return null;
  return {
    grain: a.periodGrain,
    settings: { keepPeriods: ds.keepPeriods, onLimit: ds.onLimit },
    sheets: a.sheets.map((s) => ({
      lineageId: s.lineageId,
      name: s.name,
      periodSource: s.periodSource,
      segments: s.segments.flatMap(({ segmentTyped: t }) => {
        const g = t.segment;
        if (!g.periodKey || !g.periodStart) return [];
        return [
          {
            periodKey: g.periodKey,
            periodStart: g.periodStart.toISOString().slice(0, 10),
            rows: t.dataRows ?? 0,
            bytes: Number(g.rawBytes ?? 0n) + Number(t.typedBytes ?? 0n),
          },
        ];
      }),
    })),
  };
}

const limitsNow = () => periodLimits(env());

/** Meter + proyeksi data aktif; null = versi aktif bukan per periode. */
export async function loadPeriodCapacity(
  db: Db,
  datasetId: string,
): Promise<PeriodCapacity | null> {
  const a = await loadActive(db, datasetId);
  return a ? periodCapacity({ ...a, limits: limitsNow() }) : null;
}

/**
 * Byte file per baris dari unggahan sebelumnya berjenis sama: versi REPLACE = baris semua sheet-nya;
 * versi PERIOD = baris segmen yang ditulisnya (sheet versi PERIOD memuat semua periode, bukan file).
 */
async function bytesPerRow(db: Db, datasetId: string, kind: "xlsx" | "csv") {
  const vs = await db.datasetVersion.findMany({
    where: {
      datasetId,
      sizeBytes: { not: null },
      mode: { in: ["REPLACE", "PERIOD"] },
      status: { in: ["READY", "AWAITING_CONFIRM"] },
      originalName: { endsWith: `.${kind}`, mode: "insensitive" },
    },
    orderBy: { createdAt: "desc" },
    take: HISTORY,
    select: {
      mode: true,
      sizeBytes: true,
      originalName: true,
      sheets: { select: { rawRows: true } },
      segments: { select: { rawRows: true } },
    },
  });
  let bytes = 0;
  let rows = 0;
  for (const v of vs) {
    if (!v.originalName || kindOf(v.originalName) !== kind) continue;
    const r = (v.mode === "PERIOD" ? v.segments : v.sheets).reduce((n, x) => n + x.rawRows, 0);
    if (r <= 0) continue;
    bytes += Number(v.sizeBytes ?? 0n);
    rows += r;
  }
  return rows > 0 && bytes > 0 ? bytes / rows : null;
}

export type PeriodInitCheck =
  { ok: false; message: string } | { ok: true; estimate: UploadEstimate | null };

/**
 * Pemeriksaan batas saat init unggahan periode (sebelum byte pertama): penolakan pasti (mode label,
 * batas jumlah periode) atau perkiraan dari ukuran file (hanya peringatan).
 */
export async function periodInitCheck(
  db: Db,
  datasetId: string,
  file: { name: string; size: number; label: string | null },
): Promise<PeriodInitCheck> {
  const a = await loadActive(db, datasetId);
  if (!a) return { ok: true, estimate: null };
  const limits = limitsNow();
  const allLabel = a.sheets.length > 0 && a.sheets.every((s) => s.periodSource === "LABEL");
  if (file.label && allLabel) {
    const message = initPeriodRejection({ ...a, label: file.label, limits });
    if (message) return { ok: false, message };
  }
  const capacity = periodCapacity({ ...a, limits });
  const kind = kindOf(file.name);
  const ratio = kind ? await bytesPerRow(db, datasetId, kind) : null;
  const labelKey = file.label ? periodKeyOf(a.grain, file.label) : null;
  const known = new Set(a.sheets.flatMap((s) => s.segments.map((g) => g.periodKey)));
  return {
    ok: true,
    estimate: uploadEstimate({
      capacity,
      limits,
      fileBytes: file.size,
      bytesPerRow: ratio,
      parquetRatio: PARQUET_RATIO,
      newPeriod: allLabel && labelKey ? !known.has(labelKey) : null,
    }),
  };
}
