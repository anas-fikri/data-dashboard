import "server-only";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { recordAudit } from "@/features/audit/service";
import { isIdShape } from "@/features/datasets/validation";
import type { ColumnSchema } from "@/features/ingest/infer";
import { isoDay, type PeriodGrain, type PeriodSource } from "@/features/ingest/period";
import { parseFrozenPeriodPlan, periodLimits } from "@/features/ingest/period-plan";
import { forgetLocalParquet } from "@/features/query/local-parquet";
import { announceVersionActivated } from "@/features/query/warm";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { redisReady } from "@/lib/redis";
import { objectExists } from "@/lib/storage/objects";
import { NON_TERMINAL_STATUSES } from "@/features/datasets/label";
import { recastInFlightAny } from "@/features/schema/runtime";
import { activateVersionInTx } from "./activation";
import { IntegrityError, integrityMessage, missingKeys } from "./integrity-check";
import {
  activeOf,
  periodSheetSelect,
  sheetKeys,
  writePeriodManifest,
  type FileInfo,
  type PeriodSheetRow,
} from "./period-commit";
import {
  parsePeriodChange,
  periodChangeTitle,
  periodTableRows,
  removeManifest,
  restoreCandidates,
  restoreLimitMessage,
  restoreManifest,
  schemaSignature,
  type ManageVersion,
  type PeriodChange,
  type PeriodTableRow,
  type RestoreCandidate,
  type RestoreSource,
} from "./period-manage-plan";
import type { VersionCode, VersionResult } from "./types";

/*
 * Kelola daftar periode (T-056, rencana G-6 §4.7), pemilik dataset saja (lainnya NOT_FOUND, D2):
 *  - periodOverview: kartu Periode (Periode, Baris per sheet, File, Diunggah oleh, Tanggal) + periode
 *    yang bisa/tidak bisa dipulihkan dari versi siap yang masih tersimpan;
 *  - removePeriod: versi PERIOD_REMOVE yang hanya mengubah manifest, aktif dalam satu transaksi tanpa job
 *    worker (data tidak pernah dihapus di tempat: periode itu tetap ada di versi sebelumnya, jadi bisa
 *    di-rollback / dipulihkan); periode terakhir ditolak (arahkan ke "Ganti semua data");
 *  - restorePeriod: versi PERIOD_RESTORE yang merujuk ulang file typed periode itu dari versi lama yang
 *    masih tersimpan, periode lain tidak berubah; batas periode dihitung seperti unggahan (REJECT).
 * Keduanya: kunci manifest di-HEAD sebelum lock; di bawah lock Dataset (urutan sama dengan aktivasi/
 * commit periode) versi aktif harus = yang dilihat pemilik (PLAN_STALE), tidak ada versi non-terminal
 * (DATASET_BUSY), lalu manifest + gerbang integritas (fail-closed) + aktivasi (sheetMap) + AuditLog.
 */

const TX_OPTIONS = { maxWait: 5_000, timeout: 30_000 };
const PERIOD_KEY = /^\d{4}(?:-(?:0[1-9]|1[0-2])|-Q[1-4])?$/;
/** Versi siap yang dipindai untuk "Pulihkan" (retensi menyimpan 3 + aktif; ini batas aman). */
const RETAINED_MAX = 10;

const fail = <T>(code: VersionCode, message: string): VersionResult<T> => ({
  ok: false,
  code,
  message,
});
const notFound = <T>() => fail<T>("NOT_FOUND", "Dataset tidak ditemukan.");
const BUSY =
  "Tunggu unggahan yang sedang diproses atau menunggu pemetaan/konfirmasi selesai atau dibatalkan, lalu coba lagi.";
const STALE =
  "Data aktif berubah sejak halaman ini dimuat (mis. versi lain diaktifkan). Muat ulang halaman lalu coba lagi.";
const RETRY = "Data aktif baru saja berubah. Coba lagi.";
const RECASTING =
  "Koreksi skema data sedang diterapkan. Tunggu sampai selesai (lihat halaman Skema), lalu coba lagi.";

const keySchema = z.string().regex(PERIOD_KEY, "Periode tidak dikenal.");
const idSchema = z.string().regex(/^[a-z0-9]{20,32}$/, "Versi tidak dikenal.");
const removeSchema = z.object({ periodKey: keySchema, baseVersionId: idSchema }).strict();
const restoreSchema = z
  .object({ periodKey: keySchema, baseVersionId: idSchema, sourceVersionId: idSchema })
  .strict();

/** Sheet versi untuk kartu Periode / kandidat pulihkan (metadata asal segmen). */
const overviewSheetSelect = {
  id: true,
  name: true,
  lineageId: true,
  schema: true,
  periodSource: true,
  periodColumn: true,
  segments: {
    orderBy: { ordinal: "asc" as const },
    select: {
      segmentTyped: {
        select: {
          id: true,
          dataRows: true,
          typedBytes: true,
          segment: {
            select: {
              id: true,
              periodKey: true,
              periodStart: true,
              rawBytes: true,
              originalName: true,
              createdAt: true,
              groupId: true,
              groupPart: true,
              groupSize: true,
              uploadedBy: { select: { name: true, email: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.SheetSelect;

type OverviewSheet = Prisma.SheetGetPayload<{ select: typeof overviewSheetSelect }>;

/** Sheet versi minimum untuk membandingkan periode antarversi (peringatan rollback riwayat versi). */
export const periodSegmentsSelect = {
  id: true,
  name: true,
  lineageId: true,
  periodSource: true,
  periodColumn: true,
  segments: {
    orderBy: { ordinal: "asc" as const },
    select: {
      segmentTyped: {
        select: {
          id: true,
          dataRows: true,
          typedBytes: true,
          segment: {
            select: {
              id: true,
              periodKey: true,
              periodStart: true,
              rawBytes: true,
              groupId: true,
              groupPart: true,
              groupSize: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.SheetSelect;

/** Bentuk minimum sheet yang dibutuhkan model murni (overview dan periodSheetSelect sama-sama cocok). */
interface SheetLike {
  id: string;
  name: string;
  lineageId: string;
  /** Tidak ada = tanda tangan skema kosong (cukup untuk peringatan rollback). */
  schema?: unknown;
  periodSource: PeriodSource | null;
  periodColumn: number | null;
  segments: {
    segmentTyped: {
      id: string;
      dataRows: number | null;
      typedBytes: bigint | null;
      segment: {
        id: string;
        periodKey: string | null;
        periodStart: Date | null;
        rawBytes: bigint | null;
        groupId?: string | null;
        groupPart?: number | null;
        groupSize?: number | null;
      };
    };
  }[];
}

/** Manifest versi → model murni (hanya segmen berperiode). */
export function manageOf(
  id: string,
  grain: PeriodGrain | null,
  sheets: SheetLike[],
): ManageVersion {
  return {
    id,
    grain,
    sheets: sheets.map((s) => ({
      sheetId: s.id,
      lineageId: s.lineageId,
      name: s.name,
      schemaSig: schemaSignature(s.schema as ColumnSchema[] | null),
      periodSource: s.periodSource,
      periodColumn: s.periodColumn,
      segments: s.segments.flatMap(({ segmentTyped: t }) => {
        const start = isoDay(t.segment.periodStart);
        if (!t.segment.periodKey || !start) return [];
        return [
          {
            typedId: t.id,
            segmentId: t.segment.id,
            periodKey: t.segment.periodKey,
            periodStart: start,
            rows: t.dataRows ?? 0,
            bytes: Number(t.segment.rawBytes ?? 0n) + Number(t.typedBytes ?? 0n),
            groupId: t.segment.groupId ?? null,
            groupPart: t.segment.groupPart ?? null,
            groupSize: t.segment.groupSize ?? null,
          },
        ];
      }),
    })),
  };
}

export interface PeriodOverview {
  /** Versi aktif yang dilihat pemilik: dikirim kembali saat hapus/pulihkan (berubah → PLAN_STALE). */
  baseVersionId: string;
  grain: PeriodGrain;
  /** Periode di data aktif, terbaru dulu. */
  rows: PeriodTableRow[];
  /** Periode yang bisa (atau tidak lagi bisa) dipulihkan, terbaru dulu. */
  candidates: RestoreCandidate[];
}

/** Periode yang menurut riwayat versi siap dihapus/diganti/dilepas (isi lamanya mungkin tersimpan). */
function changedKeysOf(
  versions: { mode: string; periodGrain: PeriodGrain | null; plan: unknown }[],
  grain: PeriodGrain,
): { key: string; start: string }[] {
  const out = new Map<string, string>();
  for (const v of versions) {
    if (v.periodGrain !== grain) continue;
    if (v.mode === "PERIOD") {
      for (const e of parseFrozenPeriodPlan(v.plan)?.entries ?? []) {
        if (e.action === "REPLACED" || e.action === "EVICTED") out.set(e.key, e.start);
      }
    } else if (v.mode === "PERIOD_REMOVE" || v.mode === "PERIOD_RESTORE") {
      const c = parsePeriodChange(v.plan);
      if (c && (c.kind === "REMOVE" || c.before !== null)) out.set(c.key, c.start);
    }
  }
  return [...out].map(([key, start]) => ({ key, start }));
}

const uploaderOf = (u: { name: string | null; email: string } | null) =>
  u ? (u.name ?? u.email) : null;

/** Kartu Periode dataset per periode; null = bukan pemilik / tidak ada / data aktif bukan per periode. */
export async function periodOverview(
  userId: string,
  datasetId: string,
): Promise<PeriodOverview | null> {
  if (!isIdShape(datasetId)) return null;
  const ds = await prisma.dataset.findFirst({
    where: { id: datasetId, ownerId: userId },
    select: {
      activeVersionId: true,
      activeVersion: {
        select: {
          id: true,
          periodGrain: true,
          sheets: { orderBy: { index: "asc" }, select: overviewSheetSelect },
        },
      },
    },
  });
  const a = ds?.activeVersion;
  if (!a?.periodGrain) return null;
  const others = await prisma.datasetVersion.findMany({
    where: { datasetId, status: "READY" },
    orderBy: { createdAt: "desc" },
    take: RETAINED_MAX + 1,
    select: {
      id: true,
      mode: true,
      plan: true,
      periodGrain: true,
      originalName: true,
      createdAt: true,
      ingestFinishedAt: true,
      sheets: { orderBy: { index: "asc" }, select: overviewSheetSelect },
    },
  });
  const active = manageOf(a.id, a.periodGrain, a.sheets);
  const rows = periodTableRows(
    a.periodGrain,
    a.sheets.map((s: OverviewSheet) => ({
      name: s.name,
      segments: s.segments.flatMap(({ segmentTyped: t }) => {
        const start = isoDay(t.segment.periodStart);
        if (!t.segment.periodKey || !start) return [];
        return [
          {
            typedId: t.id,
            segmentId: t.segment.id,
            periodKey: t.segment.periodKey,
            periodStart: start,
            rows: t.dataRows ?? 0,
            bytes: 0,
            originalName: t.segment.originalName,
            uploadedBy: uploaderOf(t.segment.uploadedBy),
            createdAt: t.segment.createdAt.toISOString(),
          },
        ];
      }),
    })),
  );
  const retained: RestoreSource[] = others
    .filter((v) => v.id !== a.id)
    .slice(0, RETAINED_MAX)
    .map((v) => {
      const change = parsePeriodChange(v.plan);
      return {
        id: v.id,
        title: v.originalName ?? (change ? periodChangeTitle(change) : null),
        at: (v.ingestFinishedAt ?? v.createdAt).toISOString(),
        version: manageOf(v.id, v.periodGrain, v.sheets),
      };
    });
  return {
    baseVersionId: a.id,
    grain: a.periodGrain,
    rows,
    candidates: restoreCandidates(active, retained, changedKeysOf(others, a.periodGrain)),
  };
}

// ── Hapus / pulihkan ───────────────────────────────────────────────────────────────────────────────

type Tx = Prisma.TransactionClient;

interface ChangeRequest {
  kind: "REMOVE" | "RESTORE";
  periodKey: string;
  baseVersionId: string;
  sourceVersionId: string | null;
}

const versionSheets = { orderBy: { index: "asc" as const }, select: periodSheetSelect };

/** Kunci manifest versi aktif (+ versi asal pulihkan) yang terbukti ada (HEAD sebelum lock). */
async function presentKeys(datasetId: string, versionIds: string[]): Promise<Set<string>> {
  const vs = await prisma.datasetVersion.findMany({
    where: { id: { in: versionIds }, datasetId },
    select: { sheets: { select: periodSheetSelect } },
  });
  const keys = sheetKeys(vs.flatMap((v) => v.sheets));
  const missing = new Set(await missingKeys(keys, (k) => objectExists(k)));
  return new Set(keys.filter((k) => !missing.has(k)));
}

type TxOutcome =
  | { ok: true; versionId: string; change: PeriodChange; deletedTypedKeys: string[] }
  | { ok: false; code: VersionCode; message: string };

async function changeInTx(
  tx: Tx,
  userId: string,
  datasetId: string,
  req: ChangeRequest,
  present: ReadonlySet<string>,
  ip: string,
): Promise<TxOutcome> {
  const [ds] = await tx.$queryRaw<
    {
      activeVersionId: string | null;
      keepPeriods: number | null;
      onLimit: "REJECT" | "EVICT_OLDEST";
    }[]
  >`SELECT "activeVersionId", "keepPeriods", "onLimit" FROM "Dataset"
    WHERE id = ${datasetId} AND "ownerId" = ${userId} FOR UPDATE`;
  if (!ds) return { ok: false, code: "NOT_FOUND", message: "Dataset tidak ditemukan." };
  if (ds.activeVersionId !== req.baseVersionId) {
    return { ok: false, code: "PLAN_STALE", message: STALE };
  }
  const pending = await tx.datasetVersion.count({
    where: { datasetId, status: { in: [...NON_TERMINAL_STATUSES] } },
  });
  if (pending) return { ok: false, code: "DATASET_BUSY", message: BUSY };
  const activeRow = await tx.datasetVersion.findUnique({
    where: { id: req.baseVersionId },
    select: { periodGrain: true, sheets: versionSheets },
  });
  if (!activeRow?.periodGrain) {
    return { ok: false, code: "INVALID", message: "Data aktif tidak disimpan per periode." };
  }
  const grain = activeRow.periodGrain;
  const active = manageOf(req.baseVersionId, grain, activeRow.sheets);
  const files = new Map<string, FileInfo>(activeRow.sheets.flatMap((s) => [...activeOf(s).files]));
  let result: ReturnType<typeof removeManifest>;
  if (req.kind === "REMOVE") {
    result = removeManifest(active, req.periodKey);
  } else {
    const src = await tx.datasetVersion.findFirst({
      where: { id: req.sourceVersionId!, datasetId, status: "READY" },
      select: { periodGrain: true, sheets: versionSheets },
    });
    if (!src) {
      return {
        ok: false,
        code: "INVALID",
        message:
          "Versi lama yang memuat periode ini sudah tidak tersimpan, jadi periode ini tidak bisa dipulihkan. Muat ulang halaman.",
      };
    }
    const source = manageOf(req.sourceVersionId!, src.periodGrain, src.sheets);
    result = restoreManifest(active, source, req.periodKey);
    if (result.ok) {
      const limit = restoreLimitMessage(
        active,
        source,
        req.periodKey,
        { keepPeriods: ds.keepPeriods, onLimit: ds.onLimit },
        periodLimits(env()),
      );
      if (limit) return { ok: false, code: "INVALID", message: limit };
    }
    for (const s of src.sheets) for (const [id, f] of activeOf(s).files) files.set(id, f);
  }
  if (!result.ok) return { ok: false, code: "INVALID", message: result.message };
  // Kunci yang belum terbukti ada (HEAD sebelum lock): manifest berubah di antaranya → coba lagi.
  for (const refs of result.manifest.values()) {
    for (const r of refs) {
      const f = files.get(r.typedId);
      if (!f || !present.has(f.rawKey) || !present.has(f.typedKey)) {
        return { ok: false, code: "DATASET_BUSY", message: RETRY };
      }
    }
  }
  const change: PeriodChange = {
    ...result.change,
    baseVersionId: req.baseVersionId,
    sourceVersionId: req.sourceVersionId,
  };
  const now = new Date();
  const created = await tx.datasetVersion.create({
    data: {
      datasetId,
      status: "READY",
      mode: req.kind === "REMOVE" ? "PERIOD_REMOVE" : "PERIOD_RESTORE",
      periodGrain: grain,
      baseVersionId: req.baseVersionId,
      plan: JSON.parse(JSON.stringify(change)) as Prisma.InputJsonValue,
      // Judul versi tanpa file (seperti "Atur periode"): ringkasan data aktif dan riwayat versi.
      originalName: periodChangeTitle(change),
      uploadedById: userId,
      ingestStage: "typed",
      ingestStartedAt: now,
      ingestFinishedAt: now,
    },
    select: { id: true },
  });
  const { sheetMap } = await writePeriodManifest(tx, {
    versionId: created.id,
    grain,
    rows: activeRow.sheets as PeriodSheetRow[],
    manifest: result.manifest,
    files,
    present,
  });
  const done = await activateVersionInTx(tx, datasetId, created.id, { sheetMap });
  await recordAudit(tx, {
    actorId: userId,
    action: req.kind === "REMOVE" ? "dataset.period.remove" : "dataset.period.restore",
    targetType: "dataset",
    targetId: datasetId,
    meta:
      req.kind === "REMOVE"
        ? {
            from: req.baseVersionId,
            versionId: created.id,
            period: req.periodKey,
            rows: change.beforeRows,
          }
        : {
            from: req.baseVersionId,
            versionId: created.id,
            period: req.periodKey,
            sourceVersionId: req.sourceVersionId,
            beforeRows: change.beforeRows,
            afterRows: change.afterRows,
          },
    ip,
  });
  return { ok: true, versionId: created.id, change, deletedTypedKeys: done.deletedTypedKeys };
}

async function applyChange(
  userId: string,
  datasetId: unknown,
  req: ChangeRequest,
  ip: string,
): Promise<VersionResult<{ label: string; versionId: string }>> {
  if (!isIdShape(datasetId)) return notFound();
  const owned = await prisma.dataset.findFirst({
    where: { id: datasetId, ownerId: userId },
    select: { activeVersionId: true },
  });
  if (!owned) return notFound();
  if (owned.activeVersionId !== req.baseVersionId) return fail("PLAN_STALE", STALE);
  // Koreksi skema (recast) yang antre/berjalan di sheet aktif: versi baru akan membuatnya basi dan
  // perubahan tipe pemilik hilang diam-diam (review L2) → tunggu selesai. Redis/antrean tidak menjawab
  // = belum terbukti aman (fail-closed).
  try {
    const sheets = await prisma.sheet.findMany({
      where: { versionId: req.baseVersionId },
      select: { id: true },
    });
    if (await recastInFlightAny(sheets.map((s) => s.id))) return fail("DATASET_BUSY", RECASTING);
  } catch (e) {
    logger.warn(
      { datasetId, err: e instanceof Error ? e.message : String(e) },
      "cek koreksi skema berjalan gagal",
    );
    return fail("DATASET_BUSY", "Status koreksi skema belum bisa diperiksa. Coba lagi sebentar.");
  }
  let present: Set<string>;
  try {
    present = await presentKeys(datasetId, [
      req.baseVersionId,
      ...(req.sourceVersionId ? [req.sourceVersionId] : []),
    ]);
  } catch (e) {
    logger.warn(
      { datasetId, err: e instanceof Error ? e.message : String(e) },
      "pemeriksaan file periode gagal dijalankan",
    );
    return fail(
      "DATASET_BUSY",
      "Penyimpanan data belum bisa diperiksa. Coba lagi beberapa saat lagi.",
    );
  }
  let r: TxOutcome;
  try {
    r = await prisma.$transaction(
      (tx) => changeInTx(tx, userId, datasetId, req, present, ip),
      TX_OPTIONS,
    );
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2028") {
      return fail("DATASET_BUSY", "Dataset sedang diubah. Coba lagi sebentar.");
    }
    if (e instanceof IntegrityError) {
      // Fail-closed: tidak ada yang ditulis (transaksi batal), data aktif tidak berubah.
      logger.error(
        { datasetId, kind: req.kind, period: req.periodKey, problems: e.problems },
        "perubahan periode gagal integritas",
      );
      return fail(
        "INVALID",
        `${integrityMessage(e.problems)} Perubahan tidak diterapkan; data aktif tidak berubah.`,
      );
    }
    throw e;
  }
  if (!r.ok) return fail(r.code, r.message);
  forgetLocalParquet(r.deletedTypedKeys);
  void announceVersionActivated(redisReady(), r.versionId, logger);
  logger.info(
    { datasetId, versionId: r.versionId, kind: req.kind, period: req.periodKey },
    req.kind === "REMOVE" ? "periode dihapus" : "periode dipulihkan",
  );
  return { ok: true, data: { label: r.change.label, versionId: r.versionId } };
}

const invalid = <T>(e: z.ZodError) =>
  fail<T>("INVALID", e.issues[0]?.message ?? "Isian tidak valid.");

/** "Hapus <periode>": versi PERIOD_REMOVE aktif (manifest saja, tanpa job worker). */
export async function removePeriod(
  userId: string,
  datasetId: unknown,
  payload: unknown,
  ip = "unknown",
): Promise<VersionResult<{ label: string; versionId: string }>> {
  if (!isIdShape(datasetId)) return notFound();
  const p = removeSchema.safeParse(payload);
  if (!p.success) return invalid(p.error);
  return applyChange(userId, datasetId, { kind: "REMOVE", ...p.data, sourceVersionId: null }, ip);
}

/** "Pulihkan <periode>" dari versi siap yang masih tersimpan: versi PERIOD_RESTORE aktif. */
export async function restorePeriod(
  userId: string,
  datasetId: unknown,
  payload: unknown,
  ip = "unknown",
): Promise<VersionResult<{ label: string; versionId: string }>> {
  if (!isIdShape(datasetId)) return notFound();
  const p = restoreSchema.safeParse(payload);
  if (!p.success) return invalid(p.error);
  if (p.data.sourceVersionId === p.data.baseVersionId) {
    return fail("INVALID", "Versi asal sama dengan data aktif.");
  }
  return applyChange(userId, datasetId, { kind: "RESTORE", ...p.data }, ip);
}
