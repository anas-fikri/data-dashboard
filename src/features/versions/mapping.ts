import "server-only";
import { Prisma } from "@prisma/client";
import { isIdShape } from "@/features/datasets/validation";
import type { ColumnMeta } from "@/features/ingest/header";
import { INFER_THRESHOLD, type ColumnSchema } from "@/features/ingest/infer";
import { validateMapping } from "@/features/ingest/mapping-input";
import { parsePreview, type SheetPreview } from "@/features/ingest/preview";
import {
  planColumns,
  planSheets,
  snapshotRef,
  typeLabel,
  type ActiveSheet,
} from "@/features/ingest/refresh";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { MAP_VERSION_JOB, mappingQueue, withQueueTimeout } from "@/lib/queue/connection";
import { enqueueMapping, mappingInFlight } from "@/lib/queue/versions";
import type {
  MappingJobState,
  MappingLowCast,
  MappingNewColumn,
  MappingPlanView,
  MappingSheetView,
  MappingView,
  VersionCode,
  VersionResult,
} from "./types";

/*
 * Pemetaan kolom versi yang menunggu pemetaan (T-014), sisi app: tampilan halaman /pemetaan (isu
 * dihitung ulang dari Sheet versi + skema aktif TERKINI, sama dengan aturan refresh T-013), simpan
 * keputusan (divalidasi di bawah lock Dataset, lalu job map-version di antrean recast), dan status job
 * untuk polling. Pemilik saja; lainnya NOT_FOUND (D2). Versi tetap AWAITING_MAPPING sampai worker
 * commit, jadi gagal di mana pun = bisa disimpan ulang atau dibuang.
 */

/** Sama dengan service.ts: aktivasi/pemetaan menunggu lock Dataset paling lama 5 s. */
const TX_OPTIONS = { maxWait: 5_000, timeout: 30_000 };
const SAMPLE_MAX = 3;
const JOB_ID = /^[A-Za-z0-9_:-]{1,64}$/;

type Tx = Prisma.TransactionClient;

const fail = <T>(code: VersionCode, message: string): VersionResult<T> => ({
  ok: false,
  code,
  message,
});
const notFound = <T>() => fail<T>("NOT_FOUND", "Versi data tidak ditemukan.");

// ── Tampilan (murni) ────────────────────────────────────────────────────────────────────────────

/** Sheet versi yang menunggu pemetaan, seperti tersimpan setelah ingest. */
export interface FreshSheet {
  id: string;
  index: number;
  name: string;
  headerRow: number;
  rawRows: number;
  columns: ColumnMeta[];
  schema: ColumnSchema[] | null;
  preview: SheetPreview | null;
}

/** ≤ 3 contoh nilai unik kolom `pos` dari baris data pratinjau (di bawah baris header). */
function samplesOf(f: FreshSheet, pos: number): string[] {
  const out = new Set<string>();
  for (const r of f.preview?.rows ?? []) {
    if (out.size === SAMPLE_MAX) break;
    const v = r.row > f.headerRow ? r.cells[pos - 1] : null;
    if (v != null && v.trim() !== "") out.add(v);
  }
  return [...out];
}

/** Baris data perkiraan: baris tersimpan dikurangi baris tersimpan di atas/di header. */
function dataRowsOf(f: FreshSheet): number {
  const above = f.preview
    ? f.preview.rows.filter((r) => r.row <= f.headerRow).length
    : Math.min(f.headerRow, f.rawRows);
  return Math.max(0, f.rawRows - above);
}

/**
 * Kolom cocok non-teks yang < 98 % nilainya lolos cast (aturan sheetIssues). Penyebut tepat dari
 * `nonEmpty`; skema lama tanpanya: diperkirakan dari nullPct × baris data.
 */
export function lowCastOf(
  s: ColumnSchema,
  dataRows: number,
): Pick<MappingLowCast, "pct" | "typeLabel" | "approx"> | null {
  if (s.type === "text") return null;
  const approx = typeof s.nonEmpty !== "number";
  const n = approx
    ? Math.max(s.castFailCount, Math.round((1 - s.nullPct) * dataRows))
    : (s.nonEmpty ?? 0);
  if (n === 0) return null;
  const ok = n - s.castFailCount;
  if (ok / n >= INFER_THRESHOLD) return null;
  // Persen bulat ke bawah: 97,9 % tidak pernah tampil "98%".
  return { pct: Math.floor((ok * 100) / n) / 100, typeLabel: typeLabel(s), approx };
}

/** Rencana satu pasangan sheet aktif ↔ sheet baru (aturan refresh: nama asli + urutan kemunculan). */
export function pairPlan(active: ActiveSheet, f: FreshSheet): MappingPlanView {
  const byPos = new Map((f.schema ?? []).map((s) => [s.pos, s]));
  const plan = planColumns(f.columns, active.schema);
  const dataRows = dataRowsOf(f);
  const lowCast: MappingLowCast[] = [];
  for (const [pos, a] of plan.matched) {
    const s = byPos.get(pos);
    const low = s ? lowCastOf(s, dataRows) : null;
    if (low) lowCast.push({ pos, activePos: a.pos, ...low });
  }
  return {
    newColumns: f.columns.map((c): MappingNewColumn => {
      const s = byPos.get(c.pos);
      return {
        pos: c.pos,
        original: c.original,
        name: s?.name ?? c.name,
        type: s?.type ?? "text",
        castFailCount: s?.castFailCount ?? 0,
        ...(typeof s?.nonEmpty === "number" ? { nonEmpty: s.nonEmpty } : {}),
        samples: samplesOf(f, c.pos),
      };
    }),
    autoMatched: [...plan.matched].map(([newPos, a]) => ({ activePos: a.pos, newPos })),
    // Sama persis dengan validateMapping: kolom kosong (absent) yang tetap hilang dibawa otomatis.
    missing: plan.missing.map((a) => a.pos),
    extra: f.columns.filter((c) => !plan.matched.has(c.pos)).map((c) => c.pos),
    lowCast: lowCast.sort((a, b) => a.pos - b.pos),
  };
}

const activeView = (a: ActiveSheet): MappingSheetView["active"] => ({
  id: a.id,
  name: a.name,
  schemaRevision: a.schemaRevision,
  columns: [...a.schema]
    .sort((x, y) => x.pos - y.pos)
    .map((c) => ({
      pos: c.pos,
      name: c.name,
      original: c.original,
      type: c.type,
      numberLocale: c.numberLocale,
      dateFormat: c.dateFormat,
      hidden: c.hidden,
      absent: c.absent === true,
    })),
});

/**
 * Sheet aktif yang perlu keputusan, urut sheet aktif: pasangan otomatis dengan kolom terlihat yang
 * hilang atau cast < 98 %, dan sheet aktif tanpa pasangan (kandidat = sheet baru tanpa pasangan,
 * masing-masing dengan rencananya). Sheet baru tanpa pasangan sendiri bukan masalah (tetap sheet
 * tambahan, T-013).
 */
export function mappingSheets(active: ActiveSheet[], fresh: FreshSheet[]): MappingSheetView[] {
  const sorted = [...fresh].sort((a, b) => a.index - b.index);
  const { pairs } = planSheets(sorted, active);
  const pairOf = new Map<string, FreshSheet>();
  pairs.forEach((a, i) => {
    if (a) pairOf.set(a.id, sorted[i]!);
  });
  const unpaired = sorted.filter((_, i) => !pairs[i]);
  const out: MappingSheetView[] = [];
  for (const a of [...active].sort((x, y) => x.index - y.index)) {
    const f = pairOf.get(a.id);
    const view = activeView(a);
    if (f) {
      const plan = pairPlan(a, f);
      if (plan.missing.length || plan.lowCast.length) {
        out.push({ active: view, target: { id: f.id, name: f.name }, candidates: [], ...plan });
      }
      continue;
    }
    out.push({
      active: view,
      target: null,
      candidates: unpaired.map((u) => ({ id: u.id, name: u.name, ...pairPlan(a, u) })),
      newColumns: [],
      autoMatched: [],
      missing: view.columns.filter((c) => !c.hidden && !c.absent).map((c) => c.pos),
      extra: [],
      lowCast: [],
    });
  }
  return out;
}

// ── DB ──────────────────────────────────────────────────────────────────────────────────────────

const activeSheetSelect = {
  id: true,
  name: true,
  index: true,
  headerRow: true,
  schemaRevision: true,
  schema: true,
} satisfies Prisma.SheetSelect;

const freshSheetSelect = {
  id: true,
  index: true,
  name: true,
  headerRow: true,
  rawRows: true,
  colCount: true,
  columns: true,
  schema: true,
  preview: true,
} satisfies Prisma.SheetSelect;

type ActiveRow = Prisma.SheetGetPayload<{ select: typeof activeSheetSelect }>;
type FreshRow = Prisma.SheetGetPayload<{ select: typeof freshSheetSelect }>;

const activeSheetOf = (s: ActiveRow): ActiveSheet => ({
  ...s,
  schema: (s.schema as ColumnSchema[] | null) ?? [],
});
const freshSheetOf = (s: FreshRow): FreshSheet & { colCount: number } => ({
  ...s,
  columns: (s.columns as unknown as ColumnMeta[] | null) ?? [],
  schema: (s.schema as ColumnSchema[] | null) ?? null,
  preview: parsePreview(s.preview),
});

/** Job pemetaan versi yang sedang antre/berjalan; Redis mati → dianggap tidak ada (simpan tetap dijaga). */
async function runningJob(versionId: string): Promise<string | null> {
  try {
    return await mappingInFlight(versionId);
  } catch (e) {
    logger.warn(
      { versionId, err: e instanceof Error ? e.message : String(e) },
      "status job pemetaan tidak terbaca",
    );
    return null;
  }
}

/**
 * Tampilan halaman pemetaan: null = bukan pemilik/tidak ada (notFound); { none } = tidak ada versi yang
 * menunggu pemetaan (sudah dipetakan, dibuang, atau tab lain).
 */
export async function mappingView(userId: string, datasetId: string): Promise<MappingView | null> {
  if (!isIdShape(datasetId)) return null;
  const ds = await prisma.dataset.findFirst({
    where: { id: datasetId, ownerId: userId },
    select: {
      id: true,
      name: true,
      activeVersion: {
        select: { id: true, originalName: true, sheets: { select: activeSheetSelect } },
      },
      versions: {
        where: { status: "AWAITING_MAPPING" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          originalName: true,
          createdAt: true,
          sourceDeletedAt: true,
          sheets: { select: freshSheetSelect },
        },
      },
    },
  });
  if (!ds) return null;
  const v = ds.versions[0];
  const a = ds.activeVersion;
  if (!v || !a) return { none: true, datasetId: ds.id, datasetName: ds.name };
  const active = a.sheets.map(activeSheetOf);
  const jobId = await runningJob(v.id);
  return {
    none: false,
    datasetId: ds.id,
    datasetName: ds.name,
    awaiting: {
      id: v.id,
      fileName: v.originalName,
      createdAt: v.createdAt.toISOString(),
      sourceDeleted: v.sourceDeletedAt !== null,
    },
    active: { id: a.id, fileName: a.originalName },
    base: snapshotRef({ versionId: a.id, sheets: active }),
    applying: jobId !== null,
    jobId,
    sheets: mappingSheets(active, v.sheets.map(freshSheetOf)),
  };
}

// ── Simpan ──────────────────────────────────────────────────────────────────────────────────────

const applying = <T>() =>
  fail<T>("DATASET_BUSY", "Pemetaan versi ini sedang diterapkan. Tunggu sampai selesai.");

/**
 * Simpan pemetaan: pemilik + versi masih menunggu pemetaan → acuan skema aktif sama (di bawah lock
 * Dataset FOR UPDATE, urutan lock sama dengan aktivasi/buang; berubah → STALE) → keputusan valid
 * (validateMapping) → belum ada job pemetaan versi ini (DATASET_BUSY) → rate limit (hanya untuk
 * keputusan valid) → masuk antrean. Lock memegang buang/simpan lain sampai job tercatat, jadi buang
 * yang menyusul membuat job berakhir "gone".
 */
export async function submitMapping(
  userId: string,
  datasetId: unknown,
  versionId: unknown,
  payload: unknown,
  ip: string,
  rateLimit: () => Promise<VersionResult<never> | null>,
): Promise<VersionResult<{ jobId: string }>> {
  if (!isIdShape(datasetId) || !isIdShape(versionId)) return notFound();
  const run = async (tx: Tx): Promise<VersionResult<{ jobId: string }>> => {
    const rows = await tx.$queryRaw<{ activeVersionId: string | null }[]>`
      SELECT "activeVersionId" FROM "Dataset" WHERE id = ${datasetId} AND "ownerId" = ${userId} FOR UPDATE`;
    const ds = rows[0];
    if (!ds) return notFound();
    const v = await tx.datasetVersion.findFirst({
      where: { id: versionId, datasetId },
      select: { status: true, sheets: { select: freshSheetSelect } },
    });
    if (!v) return notFound();
    if (v.status !== "AWAITING_MAPPING") {
      return fail("INVALID", "Versi ini sudah tidak menunggu pemetaan. Muat ulang halaman.");
    }
    const active = ds.activeVersionId
      ? {
          versionId: ds.activeVersionId,
          sheets: (
            await tx.sheet.findMany({
              where: { versionId: ds.activeVersionId },
              select: activeSheetSelect,
            })
          ).map(activeSheetOf),
        }
      : null;
    // Bentuk + acuan skema aktif (STALE) + semua keputusan, terhadap skema aktif di bawah lock ini.
    const checked = validateMapping(payload, { sheets: v.sheets.map(freshSheetOf), active });
    if (!checked.ok) return fail(checked.code, checked.message);
    // Dicek sebelum rate limit (kiriman ganda tidak memakan kuota); enqueue menjaga balapan (SET NX).
    if (await mappingInFlight(versionId)) return applying();
    const limited = await rateLimit();
    if (limited) return limited;
    const jobId = await enqueueMapping({
      versionId,
      datasetId,
      input: checked.input,
      actorId: userId,
      ip,
    });
    return jobId ? { ok: true, data: { jobId } } : applying();
  };
  try {
    const r = await prisma.$transaction(run, TX_OPTIONS);
    if (r.ok) logger.info({ datasetId, versionId, jobId: r.data.jobId }, "pemetaan kolom antre");
    return r;
  } catch (e) {
    // Antrean lock Dataset melewati batas waktu (aktivasi/buang lain berjalan).
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2028") {
      return fail("DATASET_BUSY", "Dataset sedang diubah. Coba lagi sebentar.");
    }
    throw e;
  }
}

// ── Status job ──────────────────────────────────────────────────────────────────────────────────

export interface MappingStatus {
  state: MappingJobState;
  message?: string;
}

/** Termasuk menunggu ulang setelah percobaan gagal (attempts tersisa). */
const QUEUED = new Set(["waiting", "prioritized", "waiting-children", "delayed"]);
const FAILED =
  "Pemetaan gagal diterapkan. Versi ini tetap menunggu pemetaan: simpan lagi, atau buang versi ini.";

/**
 * State BullMQ + hasil job → status UI; null = job tidak dikenal (sudah dibersihkan antrean) → 404,
 * halaman memuat ulang dari DB. Hasil "busy"/tak dikenal belum final → antre.
 */
export function statusOf(state: string, result: unknown): MappingStatus | null {
  if (QUEUED.has(state)) return { state: "queued" };
  if (state === "active") return { state: "running" };
  if (state === "failed") return { state: "failed", message: FAILED };
  if (state !== "completed") return null;
  const r = (result ?? null) as { outcome?: unknown; message?: unknown } | null;
  const message = typeof r?.message === "string" && r.message ? r.message : FAILED;
  switch (r?.outcome) {
    case "done":
    case "stale":
    case "gone":
      return { state: r.outcome };
    case "invalid":
    case "failed":
      return { state: r.outcome, message };
    case undefined:
      return { state: "failed", message: FAILED };
    default:
      return { state: "queued" };
  }
}

/**
 * Status job pemetaan untuk polling: dataset milik user dan job map-version milik dataset itu; selain
 * itu null (404 yang sama, id job tidak bisa dipakai menebak aktivitas user lain).
 */
export async function mappingStatus(
  userId: string,
  datasetId: unknown,
  jobId: unknown,
): Promise<MappingStatus | null> {
  if (!isIdShape(datasetId) || typeof jobId !== "string" || !JOB_ID.test(jobId)) return null;
  const owned = await prisma.dataset.count({ where: { id: datasetId, ownerId: userId } });
  if (!owned) return null;
  // Bukan mappingJob(): job harus milik dataset ini juga, termasuk setelah versinya dibuang ("gone").
  const job = await withQueueTimeout(mappingQueue().getJob(jobId), "status pemetaan");
  if (!job || job.name !== MAP_VERSION_JOB || job.data.datasetId !== datasetId) return null;
  const state = await withQueueTimeout(job.getState(), "status pemetaan");
  return statusOf(state, job.returnvalue);
}
