import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { recordAudit } from "@/features/audit/service";
import { NON_TERMINAL_STATUSES } from "@/features/datasets/label";
import { isIdShape } from "@/features/datasets/validation";
import type { ColumnSchema } from "@/features/ingest/infer";
import { periodLimits, type OnLimit } from "@/features/ingest/period-plan";
import type { PeriodSetupJobData } from "@/features/ingest/period-setup";
import {
  buildSetupPreview,
  GRAIN_LABEL,
  MISSING_SAMPLES,
  PERIOD_SETUP_STAGE,
  periodColumnOf,
  periodSettingsSchema,
  periodSql,
  periodSetupSchema,
  SETUP_MAX_PERIODS,
  setupDigestSource,
  type PeriodSetupInput,
  type SetupPreview,
  type SheetDistribution,
  validDateSql,
} from "@/features/ingest/period-setup-plan";
import type { PeriodGrain } from "@/features/ingest/period";
import { runOnParquet, sourceOf, type QueryDeps } from "@/features/query/service";
import { queryDeps } from "@/features/query/runtime";
import type { SegmentFile } from "@/features/query/source";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { enqueuePeriodSetup } from "@/lib/queue/versions";
import type { VersionCode, VersionResult } from "./types";

/*
 * "Atur periode" (T-051, rencana G-6 §4.4) — sisi app, pemilik dataset saja (lainnya NOT_FOUND, D2):
 *  - periodSetupView: data halaman (sheet + kolom tanggal, pengaturan, batas admin, keadaan dataset).
 *  - previewPeriodSetup ("Tinjau"): sebaran baris per periode lewat mesin query (sumber = manifest
 *    sheet aktif, tanpa SQL dari klien; kolom dari skema), baris tanpa tanggal valid + ≤ 20 contoh
 *    nomor baris, meter batas, proyeksi kapasitas. Tidak ada data yang berubah.
 *  - applyPeriodSetup ("Terapkan"): Tinjau dihitung ulang di server (klien tidak dipercaya), "Buang N
 *    baris" wajib sama dengan jumlah baris tanpa tanggal valid, lalu di bawah lock Dataset: acuan
 *    (versi aktif + revisi skema) belum berubah dan tidak ada versi belum terminal → versi
 *    PERIOD_SETUP (INGESTING, rencana beku) + pengaturan dataset disimpan; job worker yang memecah dan
 *    mengaktifkannya (AuditLog dataset.period.activate saat aktif).
 *  - savePeriodSettings: "Simpan N periode" (≤ PERIOD_KEEP_MAX) + "Saat batas tercapai" (AuditLog).
 */

const TX_OPTIONS = { maxWait: 5_000, timeout: 30_000 };

const fail = <T>(code: VersionCode, message: string): VersionResult<T> => ({
  ok: false,
  code,
  message,
});
const notFound = <T>() => fail<T>("NOT_FOUND", "Dataset tidak ditemukan.");
const BUSY_MESSAGE =
  "Tunggu file yang sedang diproses, atau versi yang menunggu pemetaan/konfirmasi diselesaikan atau dibuang, sebelum mengatur periode.";
const STALE_MESSAGE =
  "Data aktif berubah sejak ditinjau (versi lain diaktifkan atau skema diubah). Tinjau ulang sebelum menerapkan.";
const REVIEW_STALE_MESSAGE = "Data berubah sejak ditinjau. Tinjau ulang sebelum menerapkan.";
const ALREADY_PERIOD =
  "Dataset ini sudah menyimpan data per periode. Untuk memakai sumber atau satuan periode lain, ganti semua data.";
const MULTI_SEGMENT =
  "Data sheet ini sudah terdiri dari beberapa bagian, jadi periode belum bisa diatur dari data ini. Ganti semua data lalu atur periode.";

/** Kolom tanggal yang bisa menjadi sumber periode satu sheet. */
export interface SetupDateColumn {
  pos: number;
  name: string;
  type: "date" | "timestamp";
}

export interface PeriodSetupSheet {
  id: string;
  name: string;
  dateColumns: SetupDateColumn[];
  /** Mode periode sheet sekarang (dataset sudah per periode). */
  periodSource: "COLUMN" | "LABEL" | null;
  periodColumnName: string | null;
}

export interface PeriodSetupView {
  datasetId: string;
  datasetName: string;
  /**
   * empty = belum ada data aktif; busy = ada versi belum terminal; ready = bisa diatur; period =
   * versi aktif sudah per periode (hanya pengaturan).
   */
  state: "empty" | "busy" | "ready" | "period";
  grain: PeriodGrain | null;
  /** Jumlah periode di versi aktif (mode periode). */
  periodCount: number;
  sheets: PeriodSetupSheet[];
  settings: { keepPeriods: number | null; onLimit: OnLimit };
  limits: { keepDefault: number; keepMax: number };
}

const limitsNow = () => periodLimits(env());

/** Data halaman "Atur periode"; null = bukan pemilik / tidak ada (404). */
export async function periodSetupView(
  userId: string,
  datasetId: unknown,
): Promise<PeriodSetupView | null> {
  if (!isIdShape(datasetId)) return null;
  const ds = await prisma.dataset.findFirst({
    where: { id: datasetId, ownerId: userId },
    select: {
      id: true,
      name: true,
      keepPeriods: true,
      onLimit: true,
      activeVersion: {
        select: {
          periodGrain: true,
          sheets: {
            orderBy: { index: "asc" },
            select: {
              id: true,
              name: true,
              typedKey: true,
              schema: true,
              periodSource: true,
              periodColumn: true,
              segments: {
                select: { segmentTyped: { select: { segment: { select: { periodKey: true } } } } },
              },
            },
          },
        },
      },
    },
  });
  if (!ds) return null;
  const pending = await prisma.datasetVersion.count({
    where: { datasetId: ds.id, status: { in: [...NON_TERMINAL_STATUSES] } },
  });
  const a = ds.activeVersion;
  const l = limitsNow();
  const sheets = (a?.sheets ?? [])
    .filter((s) => s.typedKey)
    .map((s): PeriodSetupSheet => {
      const schema = (s.schema as ColumnSchema[] | null) ?? [];
      const dateColumns = schema
        .filter((c) => periodColumnOf(schema, c.pos))
        .map((c) => ({ pos: c.pos, name: c.name, type: c.type as "date" | "timestamp" }));
      return {
        id: s.id,
        name: s.name,
        dateColumns,
        periodSource: s.periodSource,
        periodColumnName:
          s.periodSource === "COLUMN"
            ? (schema.find((c) => c.pos === s.periodColumn)?.name ?? null)
            : null,
      };
    });
  const keys = new Set(
    (a?.sheets ?? []).flatMap((s) =>
      s.segments.flatMap((m) => m.segmentTyped.segment.periodKey ?? []),
    ),
  );
  return {
    datasetId: ds.id,
    datasetName: ds.name,
    state: !a ? "empty" : a.periodGrain ? "period" : pending ? "busy" : "ready",
    grain: a?.periodGrain ?? null,
    periodCount: keys.size,
    sheets,
    settings: { keepPeriods: ds.keepPeriods, onLimit: ds.onLimit },
    limits: { keepDefault: l.keepDefault, keepMax: l.keepMax },
  };
}

interface BaseSheet {
  id: string;
  name: string;
  lineageId: string;
  schemaRevision: number;
  typedKey: string | null;
  schema: ColumnSchema[] | null;
  segments: (SegmentFile & { bytes: number })[];
}
interface Base {
  versionId: string;
  periodGrain: PeriodGrain | null;
  sheets: BaseSheet[];
}

/** Versi aktif READY milik user beserta manifest sheet-nya; null = bukan pemilik / tanpa data. */
async function loadBase(userId: string, datasetId: string): Promise<Base | "none" | null> {
  const ds = await prisma.dataset.findFirst({
    where: { id: datasetId, ownerId: userId },
    select: {
      activeVersion: {
        select: {
          id: true,
          status: true,
          periodGrain: true,
          sheets: {
            orderBy: { index: "asc" },
            select: {
              id: true,
              name: true,
              lineageId: true,
              schemaRevision: true,
              typedKey: true,
              schema: true,
              segments: {
                orderBy: { ordinal: "asc" },
                select: {
                  segmentTyped: {
                    select: {
                      typedKey: true,
                      legacyRow: true,
                      columns: true,
                      typedBytes: true,
                      segment: { select: { rawBytes: true } },
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
  if (!ds) return null;
  const a = ds.activeVersion;
  if (!a || a.status !== "READY") return "none";
  return {
    versionId: a.id,
    periodGrain: a.periodGrain,
    sheets: a.sheets.map((s) => ({
      id: s.id,
      name: s.name,
      lineageId: s.lineageId,
      schemaRevision: s.schemaRevision,
      typedKey: s.typedKey,
      schema: (s.schema as ColumnSchema[] | null) ?? null,
      segments: s.segments.map(({ segmentTyped: t }) => ({
        typedKey: t.typedKey,
        legacyRow: t.legacyRow,
        columns: t.columns,
        bytes: Number(t.typedBytes ?? 0n) + Number(t.segment.rawBytes ?? 0n),
      })),
    })),
  };
}

type Distribution = { ok: true; sheet: SheetDistribution } | { ok: false; message: string };

const n = (v: unknown) => Number(v ?? 0);

/** Sebaran baris satu sheet lewat mesin query (sewa file cache app, slot user, batas waktu). */
async function distribution(
  userId: string,
  deps: QueryDeps,
  s: BaseSheet,
  choice: PeriodSetupInput["sheets"][number],
  grain: PeriodGrain,
  label: string | null,
): Promise<Distribution> {
  if (!s.typedKey || !s.schema || s.segments.length !== 1) {
    return { ok: false, message: `Sheet “${s.name}”: ${MULTI_SEGMENT}` };
  }
  const col = choice.source === "COLUMN" ? periodColumnOf(s.schema, choice.column) : null;
  if (choice.source === "COLUMN" && !col) {
    return {
      ok: false,
      message: `Kolom periode sheet “${s.name}” harus kolom bertipe tanggal. Muat ulang halaman.`,
    };
  }
  const src = s.segments.every((f) => f.legacyRow) ? "_row" : "_src_row";
  const source = sourceOf({ typedKey: s.typedKey, schema: s.schema, segments: s.segments });
  const r = await runOnParquet(userId, source, deps, async (path, exec) => {
    const q = (sql: string) => exec({ sql, params: { path } });
    if (!col) {
      const total = n((await q(`SELECT count(*) FROM read_parquet($path)`)).rows[0]?.[0]);
      return {
        total,
        periods: total > 0 ? [{ start: label!, rows: total }] : [],
        missing: 0,
        samples: [],
      };
    }
    const c = `c${Math.trunc(col.pos)}`;
    const ok = validDateSql(c);
    const periods = await q(
      `SELECT strftime(${periodSql(grain, c)}, '%Y-%m-%d') AS p, count(*) AS n
       FROM read_parquet($path) WHERE ${ok} GROUP BY 1 ORDER BY 1 LIMIT ${SETUP_MAX_PERIODS + 1}`,
    );
    const counts = await q(
      `SELECT count(*), count(*) FILTER (WHERE NOT ${ok}) FROM read_parquet($path)`,
    );
    const missing = n(counts.rows[0]?.[1]);
    const samples = missing
      ? (
          await q(
            `SELECT ${src} FROM read_parquet($path) WHERE NOT ${ok} ORDER BY 1 LIMIT ${MISSING_SAMPLES}`,
          )
        ).rows.map((x) => n(x[0]))
      : [];
    return {
      total: n(counts.rows[0]?.[0]),
      periods: periods.rows.map((x) => ({ start: String(x[0]), rows: n(x[1]) })),
      missing,
      samples,
    };
  });
  if (!r.ok) return { ok: false, message: r.message };
  if (r.value.periods.length > SETUP_MAX_PERIODS) {
    return {
      ok: false,
      message: `Kolom “${col!.name}” di sheet “${s.name}” menghasilkan lebih dari ${SETUP_MAX_PERIODS} periode. Periksa isi kolom tanggalnya atau pilih satuan yang lebih besar.`,
    };
  }
  return {
    ok: true,
    sheet: {
      sheetId: s.id,
      lineageId: s.lineageId,
      name: s.name,
      source: choice.source,
      column: col ? { pos: col.pos, name: col.name } : null,
      totalRows: r.value.total,
      periods: r.value.periods,
      missing: r.value.missing,
      missingSamples: r.value.samples,
      bytes: s.segments.reduce((a, g) => a + g.bytes, 0),
    },
  };
}

type Checked = { input: PeriodSetupInput; base: Base; preview: SetupPreview };

/** Validasi + Tinjau (dipakai Tinjau dan Terapkan). */
async function check(
  userId: string,
  datasetId: unknown,
  payload: unknown,
  deps?: QueryDeps,
): Promise<VersionResult<Checked>> {
  if (!isIdShape(datasetId)) return notFound();
  const limits = limitsNow();
  const parsed = periodSetupSchema(limits.keepMax).safeParse(payload);
  if (!parsed.success) {
    return fail("INVALID", parsed.error.issues[0]?.message ?? "Isian tidak valid.");
  }
  const input = parsed.data;
  const base = await loadBase(userId, datasetId);
  if (!base) return notFound();
  if (base === "none") {
    return fail("INVALID", "Dataset belum punya data aktif yang siap. Unggah data dulu.");
  }
  if (base.periodGrain) return fail("INVALID", ALREADY_PERIOD);
  const dataSheets = base.sheets.filter((s) => s.typedKey);
  const choices = new Map(input.sheets.map((c) => [c.sheetId, c]));
  if (dataSheets.length !== input.sheets.length || dataSheets.some((s) => !choices.has(s.id))) {
    return fail("STALE", "Daftar sheet dataset berubah. Muat ulang halaman.");
  }
  const d = deps ?? (await queryDeps());
  const sheets: SheetDistribution[] = [];
  for (const s of dataSheets) {
    const r = await distribution(userId, d, s, choices.get(s.id)!, input.grain, input.label);
    if (!r.ok) return fail("INVALID", r.message);
    sheets.push(r.sheet);
  }
  const preview = buildSetupPreview({
    grain: input.grain,
    baseVersionId: base.versionId,
    sheets,
    settings: { keepPeriods: input.keepPeriods, onLimit: input.onLimit },
    limits,
    dropMissing: input.dropMissing,
  });
  preview.digest = createHash("sha256")
    .update(setupDigestSource(input.grain, base.versionId, sheets))
    .digest("hex");
  return { ok: true, data: { input, base, preview } };
}

/** "Tinjau": sebaran + proyeksi, tanpa mengubah data. */
export async function previewPeriodSetup(
  userId: string,
  datasetId: unknown,
  payload: unknown,
  deps?: QueryDeps,
): Promise<VersionResult<SetupPreview>> {
  const r = await check(userId, datasetId, payload, deps);
  return r.ok ? { ok: true, data: r.data.preview } : r;
}

const settingsMeta = (s: { keepPeriods: number | null; onLimit: OnLimit }) => ({
  keepPeriods: s.keepPeriods,
  onLimit: s.onLimit,
});

/** "Terapkan": versi PERIOD_SETUP + job worker; data aktif baru berubah saat job selesai. */
export async function applyPeriodSetup(
  userId: string,
  datasetId: unknown,
  payload: unknown,
  ip: string,
  deps?: QueryDeps,
): Promise<VersionResult<{ versionId: string }>> {
  const r = await check(userId, datasetId, payload, deps);
  if (!r.ok) return r;
  const { input, base, preview } = r.data;
  // Terapkan hanya untuk tinjauan yang dilihat pemilik: versi dasar dan sebaran harus sama persis.
  if (!input.reviewed) return fail("INVALID", "Tinjau dulu sebelum menerapkan.");
  if (input.reviewed.baseVersionId !== base.versionId || input.reviewed.digest !== preview.digest) {
    return fail("STALE", REVIEW_STALE_MESSAGE);
  }
  if (preview.blockers.length) return fail("INVALID", preview.blockers[0]!);
  if (input.dropMissing !== preview.missingTotal) {
    return fail(
      "INVALID",
      preview.missingTotal > 0
        ? `Ada ${preview.missingTotal.toLocaleString("id-ID")} baris tanpa tanggal valid. Pilih “Buang ${preview.missingTotal.toLocaleString("id-ID")} baris” untuk melanjutkan, atau perbaiki datanya lalu unggah ulang.`
        : "Tidak ada baris tanpa tanggal valid lagi. Tinjau ulang sebelum menerapkan.",
    );
  }
  const id = datasetId as string;
  const label = input.label;
  const job: Omit<PeriodSetupJobData, "versionId"> = {
    datasetId: id,
    baseVersionId: base.versionId,
    grain: input.grain,
    base: {
      activeVersionId: base.versionId,
      sheets: base.sheets.map((s) => ({ id: s.id, schemaRevision: s.schemaRevision })),
    },
    sheets: preview.sheets.map((s) => ({
      sheetId: s.sheetId,
      source: s.source,
      column: s.column?.pos ?? null,
      label: s.source === "LABEL" ? label : null,
      expected: {
        periods: Object.fromEntries(s.periods.map((p) => [p.start, p.rows])),
        missing: s.missing,
      },
    })),
    dropMissing: preview.missingTotal,
    actorId: userId,
    ip,
  };
  let created: string;
  try {
    const t = await prisma.$transaction(async (tx): Promise<VersionResult<string>> => {
      const rows = await tx.$queryRaw<
        { activeVersionId: string | null; keepPeriods: number | null; onLimit: OnLimit }[]
      >`SELECT "activeVersionId", "keepPeriods", "onLimit" FROM "Dataset"
        WHERE id = ${id} AND "ownerId" = ${userId} FOR UPDATE`;
      const ds = rows[0];
      if (!ds) return notFound();
      if (ds.activeVersionId !== base.versionId) return fail("STALE", STALE_MESSAGE);
      const sheets = await tx.sheet.findMany({
        where: { versionId: base.versionId },
        select: { id: true, schemaRevision: true },
      });
      const rev = new Map(sheets.map((s) => [s.id, s.schemaRevision]));
      if (
        sheets.length !== base.sheets.length ||
        base.sheets.some((s) => rev.get(s.id) !== s.schemaRevision)
      ) {
        return fail("STALE", STALE_MESSAGE);
      }
      const pending = await tx.datasetVersion.count({
        where: { datasetId: id, status: { in: [...NON_TERMINAL_STATUSES] } },
      });
      if (pending) return fail("DATASET_BUSY", BUSY_MESSAGE);
      const v = await tx.datasetVersion.create({
        data: {
          datasetId: id,
          status: "INGESTING",
          mode: "PERIOD_SETUP",
          periodGrain: input.grain,
          ingestStage: PERIOD_SETUP_STAGE,
          originalName: `Atur periode (${GRAIN_LABEL[input.grain]})`,
          uploadedById: userId,
          plan: preview.plan as unknown as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      const next = settingsMeta(input);
      const prev = settingsMeta(ds);
      if (next.keepPeriods !== prev.keepPeriods || next.onLimit !== prev.onLimit) {
        await tx.dataset.update({ where: { id }, data: next });
        await recordAudit(tx, {
          actorId: userId,
          action: "dataset.period.settings",
          targetType: "dataset",
          targetId: id,
          meta: { from: prev, to: next },
          ip,
        });
      }
      return { ok: true, data: v.id };
    }, TX_OPTIONS);
    if (!t.ok) return t;
    created = t.data;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2028") {
      return fail("DATASET_BUSY", "Dataset sedang diubah. Coba lagi sebentar.");
    }
    throw e;
  }
  try {
    await enqueuePeriodSetup({ ...job, versionId: created });
  } catch (e) {
    // Antrean tidak bisa dihubungi: versi tidak boleh menahan dataset (D4) — tandai gagal sekarang.
    logger.error(
      { datasetId: id, versionId: created, err: e instanceof Error ? e.message : String(e) },
      "job atur periode tidak masuk antrean",
    );
    await prisma.datasetVersion.updateMany({
      where: { id: created, status: "INGESTING" },
      data: {
        status: "FAILED",
        errorMessage:
          "Antrean pemrosesan tidak tersedia, jadi periode tidak diterapkan. Coba lagi.",
        ingestFinishedAt: new Date(),
      },
    });
    return fail("DATASET_BUSY", "Antrean pemrosesan tidak tersedia. Coba lagi beberapa saat lagi.");
  }
  logger.info(
    { datasetId: id, versionId: created, periods: preview.plan.totals.periodsAfter },
    "atur periode antre",
  );
  return { ok: true, data: { versionId: created } };
}

/** Pengaturan periode dataset ("Simpan N periode", "Saat batas tercapai"). */
export async function savePeriodSettings(
  userId: string,
  datasetId: unknown,
  payload: unknown,
  ip: string,
): Promise<VersionResult<{ keepPeriods: number | null; onLimit: OnLimit }>> {
  if (!isIdShape(datasetId)) return notFound();
  const parsed = periodSettingsSchema(limitsNow().keepMax).safeParse(payload);
  if (!parsed.success) {
    return fail("INVALID", parsed.error.issues[0]?.message ?? "Isian tidak valid.");
  }
  const next = settingsMeta(parsed.data);
  try {
    return await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ keepPeriods: number | null; onLimit: OnLimit }[]>`
        SELECT "keepPeriods", "onLimit" FROM "Dataset"
        WHERE id = ${datasetId} AND "ownerId" = ${userId} FOR UPDATE`;
      const ds = rows[0];
      if (!ds) return notFound();
      const prev = settingsMeta(ds);
      if (prev.keepPeriods !== next.keepPeriods || prev.onLimit !== next.onLimit) {
        await tx.dataset.update({ where: { id: datasetId }, data: next });
        await recordAudit(tx, {
          actorId: userId,
          action: "dataset.period.settings",
          targetType: "dataset",
          targetId: datasetId,
          meta: { from: prev, to: next },
          ip,
        });
      }
      return { ok: true as const, data: next };
    }, TX_OPTIONS);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2028") {
      return fail("DATASET_BUSY", "Dataset sedang diubah. Coba lagi sebentar.");
    }
    throw e;
  }
}
