import "server-only";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { isIdShape } from "@/features/datasets/validation";
import { periodLimits, type PeriodPlan } from "@/features/ingest/period-plan";
import { periodPlanDigest, periodPlanSummary } from "@/features/ingest/period-upload-plan";
import { forgetLocalParquet } from "@/features/query/local-parquet";
import { announceVersionActivated } from "@/features/query/warm";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { enqueueIngest } from "@/lib/queue/versions";
import { redisReady } from "@/lib/redis";
import { objectExists } from "@/lib/storage/objects";
import { IntegrityError, integrityMessage, missingKeys } from "./integrity-check";
import { commitPeriodInTx, periodSheetSelect, sheetKeys } from "./period-commit";
import type { VersionCode, VersionResult } from "./types";

/*
 * Tinjauan dan "Terapkan" unggahan periode yang menunggu konfirmasi (T-052, rencana G-6 §4.5 langkah 5),
 * sisi app — pemilik dataset saja (lainnya NOT_FOUND, D2). Layar tinjauan sendiri = T-054.
 *  - reviewPeriodUpload: rencana DIHITUNG ULANG dari data aktif + pengaturan + batas saat ini (dengan
 *    pilihan "Masukkan" periode nyasar) + sidiknya. Tidak ada yang berubah.
 *  - confirmPeriodUpload: di bawah lock Dataset rencana dihitung ulang lagi; sidik berbeda dengan yang
 *    dilihat pemilik → PLAN_STALE (rencana baru dibekukan, pemilik meninjau ulang); centang wajib
 *    (menyusut > 50%, "Buang N baris") harus ada; lalu manifest + gerbang integritas + aktif (sheetMap)
 *    + AuditLog dataset.period.confirm. Skema/versi aktif berubah sejak file diproses → file diproses
 *    ulang (segmen baru di-cast dengan skema terbaru) dan PLAN_STALE.
 */

const TX_OPTIONS = { maxWait: 5_000, timeout: 30_000 };
const PERIOD_KEY = /^\d{4}(?:-(?:0[1-9]|1[0-2])|-Q[1-4])?$/;

const fail = <T>(code: VersionCode, message: string): VersionResult<T> => ({
  ok: false,
  code,
  message,
});
const notFound = <T>() => fail<T>("NOT_FOUND", "Versi data tidak ditemukan.");
const NOT_PENDING = "Unggahan ini tidak lagi menunggu konfirmasi. Muat ulang halaman.";
const PLAN_STALE_MESSAGE =
  "Data aktif atau pengaturan periode berubah sejak ditinjau, jadi rencananya dihitung ulang. Tinjau ulang sebelum menerapkan.";
const REPROCESS_MESSAGE =
  "Skema data aktif diubah sejak file ini diproses, jadi file diproses ulang dengan skema terbaru. Tinjau lagi setelah selesai.";
const REVIEW_STALE_MESSAGE =
  "Skema data aktif diubah sejak file ini diproses. Tekan “Terapkan” untuk memproses ulang file dengan skema terbaru, atau batalkan unggahan ini.";
const REUPLOAD_MESSAGE =
  "Skema data aktif diubah sejak file ini diproses dan file aslinya sudah tidak tersimpan. Batalkan unggahan ini lalu unggah ulang file.";

const includeSchema = z.array(z.string().regex(PERIOD_KEY, "Periode tidak dikenal.")).max(600);

const reviewSchema = z.object({ include: includeSchema }).strict();

const confirmSchema = z
  .object({
    include: includeSchema,
    digest: z.string().regex(/^[0-9a-f]{64}$/, "Tinjauan tidak dikenal."),
    ack: z
      .object({
        shrink: z.boolean(),
        droppedRows: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
      })
      .strict(),
  })
  .strict();

export interface PeriodReview {
  versionId: string;
  fileName: string | null;
  plan: PeriodPlan;
  /** Sidik rencana: "Terapkan" mengirimnya kembali (berbeda dengan hitungan ulang → PLAN_STALE). */
  digest: string;
  summary: string;
}

/** Versi AWAITING_CONFIRM ber-mode PERIOD milik user; null = bukan pemilik/tidak ada. */
async function pendingOf(userId: string, datasetId: string, versionId: string) {
  return prisma.datasetVersion.findFirst({
    where: { id: versionId, datasetId, dataset: { ownerId: userId } },
    select: { id: true, status: true, mode: true, originalName: true, sourceDeletedAt: true },
  });
}

const limitsNow = () => periodLimits(env());

/** Tinjauan rencana sekarang (tanpa mengubah apa pun). */
export async function reviewPeriodUpload(
  userId: string,
  datasetId: unknown,
  versionId: unknown,
  payload: unknown,
): Promise<VersionResult<PeriodReview>> {
  if (!isIdShape(datasetId) || !isIdShape(versionId)) return notFound();
  const parsed = reviewSchema.safeParse(payload);
  if (!parsed.success)
    return fail("INVALID", parsed.error.issues[0]?.message ?? "Isian tidak valid.");
  const v = await pendingOf(userId, datasetId, versionId);
  if (!v) return notFound();
  if (v.status !== "AWAITING_CONFIRM" || v.mode !== "PERIOD") return fail("INVALID", NOT_PENDING);
  const r = await prisma.$transaction(
    (tx) =>
      commitPeriodInTx(tx, {
        versionId,
        from: "AWAITING_CONFIRM",
        include: parsed.data.include,
        mode: { kind: "confirm", digest: "", ack: { shrink: false, droppedRows: 0 } },
        present: new Set(),
        limits: limitsNow(),
        dryRun: true,
      }),
    TX_OPTIONS,
  );
  if (r.outcome === "gone") return fail("INVALID", NOT_PENDING);
  if (r.outcome !== "preview") return fail("PLAN_STALE", REVIEW_STALE_MESSAGE);
  return {
    ok: true,
    data: {
      versionId,
      fileName: v.originalName,
      plan: r.plan,
      digest: periodPlanDigest(r.plan),
      summary: periodPlanSummary(r.plan),
    },
  };
}

/** Kunci manifest aktif + segmen versi ini yang terbukti ada (HEAD sebelum lock). */
async function presentKeys(datasetId: string, versionId: string): Promise<Set<string>> {
  const [ds, segs] = await Promise.all([
    prisma.dataset.findUnique({
      where: { id: datasetId },
      select: { activeVersion: { select: { sheets: { select: periodSheetSelect } } } },
    }),
    prisma.segment.findMany({
      where: { createdByVersionId: versionId },
      select: { rawKey: true, typed: { select: { typedKey: true } } },
    }),
  ]);
  const keys = [
    ...new Set([
      ...sheetKeys(ds?.activeVersion?.sheets ?? []),
      ...segs.flatMap((g) => [g.rawKey, ...g.typed.map((t) => t.typedKey)]),
    ]),
  ];
  const missing = new Set(await missingKeys(keys, (k) => objectExists(k)));
  return new Set(keys.filter((k) => !missing.has(k)));
}

/**
 * Versi yang segmennya basi (skema aktif berubah) diproses ulang: kembali UPLOADED + antre ingest
 * (percobaan baru membuang segmen lama versi ini). File asli sudah dihapus retensi → tidak bisa.
 */
async function reprocess(datasetId: string, versionId: string): Promise<boolean> {
  const r = await prisma.datasetVersion.updateMany({
    where: { id: versionId, status: "AWAITING_CONFIRM", sourceDeletedAt: null },
    data: { status: "UPLOADED", plan: Prisma.DbNull, errorMessage: null, ingestStage: null },
  });
  if (r.count !== 1) return false;
  await enqueueIngest(versionId, datasetId).catch((e: unknown) =>
    // Versi UPLOADED tanpa job disapu ulang worker saat start (sweepUploaded).
    logger.error(
      { versionId, err: e instanceof Error ? e.message : String(e) },
      "antre ulang unggahan periode gagal",
    ),
  );
  return true;
}

/** "Terapkan" unggahan periode yang menunggu konfirmasi. */
export async function confirmPeriodUpload(
  userId: string,
  datasetId: unknown,
  versionId: unknown,
  payload: unknown,
  ip: string,
): Promise<VersionResult<{ fileName: string; summary: string }>> {
  if (!isIdShape(datasetId) || !isIdShape(versionId)) return notFound();
  const parsed = confirmSchema.safeParse(payload);
  if (!parsed.success)
    return fail("INVALID", parsed.error.issues[0]?.message ?? "Isian tidak valid.");
  const v = await pendingOf(userId, datasetId, versionId);
  if (!v) return notFound();
  if (v.status !== "AWAITING_CONFIRM" || v.mode !== "PERIOD") return fail("INVALID", NOT_PENDING);
  let present: Set<string>;
  try {
    present = await presentKeys(datasetId, versionId);
  } catch (e) {
    logger.warn(
      { datasetId, versionId, err: e instanceof Error ? e.message : String(e) },
      "pemeriksaan file unggahan periode gagal dijalankan",
    );
    return fail(
      "DATASET_BUSY",
      "Penyimpanan data belum bisa diperiksa. Coba lagi beberapa saat lagi.",
    );
  }
  let r: Awaited<ReturnType<typeof commitPeriodInTx>>;
  try {
    r = await prisma.$transaction(
      (tx) =>
        commitPeriodInTx(tx, {
          versionId,
          from: "AWAITING_CONFIRM",
          include: parsed.data.include,
          mode: { kind: "confirm", digest: parsed.data.digest, ack: parsed.data.ack },
          present,
          limits: limitsNow(),
          audit: { actorId: userId, ip },
        }),
      TX_OPTIONS,
    );
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2028") {
      return fail("DATASET_BUSY", "Dataset sedang diubah. Coba lagi sebentar.");
    }
    if (e instanceof IntegrityError) {
      // Fail-closed: file yang dirujuk hilang/tidak cocok → versi gagal, data aktif tidak berubah.
      const message = `${integrityMessage(e.problems)} Unggahan ini tidak diterapkan dan ditandai gagal; data aktif tidak berubah.`;
      await prisma.datasetVersion.updateMany({
        where: { id: versionId, status: "AWAITING_CONFIRM" },
        data: { status: "FAILED", errorMessage: message },
      });
      logger.error(
        { datasetId, versionId, problems: e.problems },
        "unggahan periode gagal integritas",
      );
      return fail("INVALID", message);
    }
    throw e;
  }
  switch (r.outcome) {
    case "activated":
      forgetLocalParquet(r.deletedTypedKeys);
      void announceVersionActivated(redisReady(), versionId, logger);
      logger.info({ datasetId, versionId }, "unggahan periode diterapkan");
      return {
        ok: true,
        data: { fileName: v.originalName ?? "", summary: periodPlanSummary(r.plan) },
      };
    case "plan_stale":
      return fail("PLAN_STALE", PLAN_STALE_MESSAGE);
    case "blocked":
    case "rejected":
      return fail("INVALID", r.message);
    case "stale":
      return (await reprocess(datasetId, versionId))
        ? fail("PLAN_STALE", REPROCESS_MESSAGE)
        : fail("INVALID", REUPLOAD_MESSAGE);
    case "retry":
      return fail(
        "DATASET_BUSY",
        "Data aktif baru saja berubah (mis. skema sheet lain dikoreksi). Coba terapkan lagi.",
      );
    case "gone":
    case "awaiting":
    case "preview":
      return fail("INVALID", NOT_PENDING);
  }
}

/** Konteks panel unggah dataset per periode (T-053); null = versi aktif bukan per periode. */
export interface PeriodUploadContext {
  /** Versi aktif yang dilihat pemilik: `baseVersionId` init (STALE bila berganti). */
  baseVersionId: string;
  grain: "MONTH" | "QUARTER" | "YEAR";
  /** Periode berbeda di data aktif (untuk "Semua N periode akan diganti"). */
  periodCount: number;
  /** Ada sheet bersumber label → pemilih periode wajib diisi sebelum diproses. */
  needsLabel: boolean;
}

/** Hanya pemilik (lainnya null, sama seperti dataset tidak ada). */
export async function periodUploadContext(
  ownerId: string,
  datasetId: string,
): Promise<PeriodUploadContext | null> {
  if (!isIdShape(datasetId)) return null;
  const ds = await prisma.dataset.findFirst({
    where: { id: datasetId, ownerId },
    select: {
      activeVersionId: true,
      activeVersion: { select: { periodGrain: true, sheets: { select: { periodSource: true } } } },
    },
  });
  const a = ds?.activeVersion;
  if (!ds?.activeVersionId || !a?.periodGrain) return null;
  const keys = await prisma.segment.findMany({
    where: {
      datasetId,
      periodKey: { not: null },
      typed: { some: { sheets: { some: { sheet: { versionId: ds.activeVersionId } } } } },
    },
    distinct: ["periodKey"],
    select: { periodKey: true },
  });
  return {
    baseVersionId: ds.activeVersionId,
    grain: a.periodGrain,
    periodCount: keys.length,
    needsLabel: a.sheets.some((s) => s.periodSource === "LABEL"),
  };
}
