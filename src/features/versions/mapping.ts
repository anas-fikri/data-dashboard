import "server-only";
import { Prisma } from "@prisma/client";
import { isIdShape } from "@/features/datasets/validation";
import type { ColumnMeta } from "@/features/ingest/header";
import { INFER_THRESHOLD, type ColumnSchema } from "@/features/ingest/infer";
import {
  parseMappingInput,
  validateMapping,
  type MappingReviewIssue,
  type VersionSheet,
} from "@/features/ingest/mapping-input";
import { parsePreview, type SheetPreview } from "@/features/ingest/preview";
import {
  pairedHeader,
  planColumns,
  planSheets,
  snapshotRef,
  typeLabel,
  type ActiveSheet,
} from "@/features/ingest/refresh";
import { RECAST_INFLIGHT_PER_USER } from "@/features/schema/service";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { MAP_VERSION_JOB, mappingQueue, withQueueTimeout } from "@/lib/queue/connection";
import {
  enqueueMapping,
  mappingInFlight,
  mappingLast,
  type MappingEnqueue,
} from "@/lib/queue/versions";
import type {
  MappingJobInfo,
  MappingLast,
  MappingLowCast,
  MappingNewColumn,
  MappingPairPlan,
  MappingSheetView,
  MappingStatus,
  MappingView,
  VersionCode,
  VersionResult,
} from "./types";

export type { MappingStatus };

/*
 * Pemetaan kolom versi yang menunggu pemetaan (T-014), sisi app: tampilan halaman /pemetaan (isu
 * dihitung ulang dari Sheet versi + skema aktif TERKINI, sama dengan aturan refresh T-013), rencana
 * satu pasangan sheet pilihan user (diminta saat dipilih, bukan semua kandidat sekaligus), simpan
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
  colCount: number;
  columns: ColumnMeta[];
  schema: ColumnSchema[] | null;
  preview: SheetPreview | null;
}

/** ≤ 3 contoh nilai unik kolom `pos` dari baris data pratinjau (di bawah baris header `headerRow`). */
function samplesOf(f: FreshSheet, pos: number, headerRow: number): string[] {
  const out = new Set<string>();
  for (const r of f.preview?.rows ?? []) {
    if (out.size === SAMPLE_MAX) break;
    const v = r.row > headerRow ? r.cells[pos - 1] : null;
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

/**
 * Statistik typed-1 kolom ini dihitung dengan pilihan kolom aktif TERKINI (tipe + locale/format yang
 * memengaruhi konversi), sehingga rasio cast-nya tepat untuk tipe yang akan diterapkan.
 */
function sameChoice(s: ColumnSchema, a: ColumnSchema): boolean {
  if (s.type !== a.type) return false;
  if (s.type === "integer" || s.type === "decimal") return s.numberLocale === a.numberLocale;
  if (s.type === "date" || s.type === "timestamp") return s.dateFormat === a.dateFormat;
  return true;
}

/**
 * Rencana satu pasangan sheet aktif ↔ sheet baru (aturan refresh: nama asli + urutan kemunculan).
 * Pasangan user (`userPaired`): header dipilih pairedHeader (sama dengan validasi dan worker) dan
 * tanpa lowCast — statistik typed-1 sheet itu hasil inferensi, bukan tipe aktif; rasio tepat datang
 * dari job ("review"). Pasangan otomatis: lowCast hanya untuk kolom yang tipe typed-1-nya masih sama
 * dengan pilihan aktif terkini (tipe aktif yang berubah setelah unggah juga diperiksa job).
 */
export function pairPlan(active: ActiveSheet, f: FreshSheet, userPaired = false): MappingPairPlan {
  const header = userPaired
    ? pairedHeader(f, active)
    : { headerRow: f.headerRow, columns: f.columns };
  const byPos = new Map((f.schema ?? []).map((s) => [s.pos, s]));
  const plan = planColumns(header.columns, active.schema);
  const names = new Map(plan.overrides.map((o) => [o.pos, o.name]));
  const dataRows = dataRowsOf(f);
  const lowCast: MappingLowCast[] = [];
  if (!userPaired) {
    for (const [pos, a] of plan.matched) {
      const s = byPos.get(pos);
      const low = s && sameChoice(s, a) ? lowCastOf(s, dataRows) : null;
      if (low) lowCast.push({ pos, activePos: a.pos, ...low });
    }
  }
  return {
    newColumns: header.columns.map((c): MappingNewColumn => {
      const s = byPos.get(c.pos);
      return {
        pos: c.pos,
        original: c.original,
        // Nama akhir di versi baru (sama dengan worker): nama aktif bila cocok, nama unik bila tambahan.
        name: names.get(c.pos) ?? s?.name ?? c.name,
        type: s?.type ?? "text",
        ...(s?.numberLocale ? { numberLocale: s.numberLocale } : {}),
        ...(s?.dateFormat ? { dateFormat: s.dateFormat } : {}),
        castFailCount: s?.castFailCount ?? 0,
        ...(typeof s?.nonEmpty === "number" ? { nonEmpty: s.nonEmpty } : {}),
        samples: samplesOf(f, c.pos, header.headerRow),
      };
    }),
    autoMatched: [...plan.matched].map(([newPos, a]) => ({ activePos: a.pos, newPos })),
    // Sama persis dengan validateMapping: kolom kosong (absent) yang tetap hilang dibawa otomatis.
    missing: plan.missing.map((a) => a.pos),
    extra: header.columns.filter((c) => !plan.matched.has(c.pos)).map((c) => c.pos),
    lowCast: lowCast.sort((a, b) => a.pos - b.pos),
    headerRow: header.headerRow,
    headerChanged: header.headerRow !== f.headerRow,
  };
}

/**
 * Pasangan otomatis yang punya kolom cocok non-teks dengan pilihan aktif TERKINI berbeda dari statistik
 * typed-1 (tipe/format aktif diubah setelah unggah): rasionya tidak bisa dihitung di sini, tetapi job
 * tetap memeriksanya ("review"). Sheet seperti itu tetap ditampilkan agar isu review punya baris
 * "Ubah tipe" di halaman.
 */
function choiceChanged(a: ActiveSheet, f: FreshSheet, autoMatched: MappingPairPlan["autoMatched"]) {
  const typed = new Map((f.schema ?? []).map((s) => [s.pos, s]));
  const act = new Map(a.schema.map((c) => [c.pos, c]));
  return autoMatched.some(({ activePos, newPos }) => {
    const c = act.get(activePos);
    const s = typed.get(newPos);
    return c !== undefined && c.type !== "text" && s !== undefined && !sameChoice(s, c);
  });
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
 * hilang, cast < 98 %, atau kolom yang tipe aktifnya berubah setelah unggah (choiceChanged), dan
 * sheet aktif tanpa pasangan (kandidat = sheet baru tanpa pasangan, hanya id/nama/jumlah kolom;
 * rencananya lewat pairPlanAction saat dipilih, sehingga ukuran halaman tidak tumbuh kuadratik
 * terhadap jumlah sheet). Sheet baru tanpa pasangan sendiri bukan masalah (tetap
 * sheet tambahan, T-013).
 */
export function mappingSheets(active: ActiveSheet[], fresh: FreshSheet[]): MappingSheetView[] {
  const sorted = [...fresh].sort((a, b) => a.index - b.index);
  const { pairs } = planSheets(sorted, active);
  const pairOf = new Map<string, FreshSheet>();
  pairs.forEach((a, i) => {
    if (a) pairOf.set(a.id, sorted[i]!);
  });
  const candidates = sorted
    .filter((_, i) => !pairs[i])
    .map((u) => ({ id: u.id, name: u.name, colCount: u.colCount }));
  const out: MappingSheetView[] = [];
  for (const a of [...active].sort((x, y) => x.index - y.index)) {
    const f = pairOf.get(a.id);
    const view = activeView(a);
    if (f) {
      // Header pasangan otomatis sudah dipilih saat ingest (tetap header tersimpan).
      const { headerRow: _row, headerChanged: _changed, ...plan } = pairPlan(a, f);
      if (plan.missing.length || plan.lowCast.length || choiceChanged(a, f, plan.autoMatched)) {
        out.push({ active: view, target: { id: f.id, name: f.name }, candidates: [], ...plan });
      }
      continue;
    }
    out.push({
      active: view,
      target: null,
      candidates,
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
  aliasName: true,
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

/** Yang dibutuhkan validateMapping saja (tanpa skema typed-1). */
const versionSheetSelect = {
  id: true,
  index: true,
  name: true,
  headerRow: true,
  colCount: true,
  columns: true,
  preview: true,
} satisfies Prisma.SheetSelect;

type ActiveRow = Prisma.SheetGetPayload<{ select: typeof activeSheetSelect }>;
type FreshRow = Prisma.SheetGetPayload<{ select: typeof freshSheetSelect }>;
type VersionRow = Prisma.SheetGetPayload<{ select: typeof versionSheetSelect }>;

const activeSheetOf = (s: ActiveRow): ActiveSheet => ({
  ...s,
  schema: (s.schema as ColumnSchema[] | null) ?? [],
});
const freshSheetOf = (s: FreshRow): FreshSheet => ({
  ...s,
  columns: (s.columns as unknown as ColumnMeta[] | null) ?? [],
  schema: (s.schema as ColumnSchema[] | null) ?? null,
  preview: parsePreview(s.preview),
});
const versionSheetOf = (s: VersionRow): VersionSheet => ({
  ...s,
  columns: (s.columns as unknown as ColumnMeta[] | null) ?? [],
  preview: parsePreview(s.preview),
});

const redisDown = (versionId: string, e: unknown, what: string) =>
  logger.warn({ versionId, err: e instanceof Error ? e.message : String(e) }, what);

/** Job pemetaan versi yang sedang antre/berjalan; Redis mati → dianggap tidak ada (simpan tetap dijaga). */
async function runningJob(versionId: string): Promise<string | null> {
  try {
    return await mappingInFlight(versionId);
  } catch (e) {
    redisDown(versionId, e, "status job pemetaan tidak terbaca");
    return null;
  }
}

/** Hasil terakhir job pemetaan versi yang bukan "done" (24 jam); Redis mati → null. */
async function lastJob(versionId: string): Promise<MappingLast | null> {
  try {
    const r = await mappingLast(versionId);
    const status = r ? statusOf("completed", r.result) : null;
    return r && status ? { jobId: r.jobId, ...status } : null;
  } catch (e) {
    redisDown(versionId, e, "hasil terakhir pemetaan tidak terbaca");
    return null;
  }
}

/**
 * Job pemetaan yang sedang diterapkan + hasil terakhir untuk versi dataset milik user yang menunggu
 * pemetaan, atau null (bukan pemilik, tidak ada versi menunggu). Ringan untuk halaman dataset.
 */
export async function mappingJobId(
  userId: string,
  datasetId: string,
): Promise<MappingJobInfo | null> {
  if (!isIdShape(datasetId)) return null;
  const v = await prisma.datasetVersion.findFirst({
    where: { datasetId, status: "AWAITING_MAPPING", dataset: { ownerId: userId } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!v) return null;
  const [jobId, last] = await Promise.all([runningJob(v.id), lastJob(v.id)]);
  return { jobId, last };
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
  const [jobId, last] = await Promise.all([runningJob(v.id), lastJob(v.id)]);
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
    last,
    sheets: mappingSheets(active, v.sheets.map(freshSheetOf)),
  };
}

/**
 * Rencana satu pasangan pilihan user (sheet aktif versi aktif dataset milik user ↔ sheet versi yang
 * menunggu pemetaan), dengan header yang sama dengan validasi/worker. Id lain → NOT_FOUND.
 */
export async function pairPlanFor(
  userId: string,
  datasetId: unknown,
  versionId: unknown,
  activeSheetId: unknown,
  newSheetId: unknown,
): Promise<VersionResult<MappingPairPlan>> {
  if (
    !isIdShape(datasetId) ||
    !isIdShape(versionId) ||
    !isIdShape(activeSheetId) ||
    !isIdShape(newSheetId)
  ) {
    return notFound();
  }
  const ds = await prisma.dataset.findFirst({
    where: { id: datasetId, ownerId: userId },
    select: { activeVersionId: true },
  });
  if (!ds?.activeVersionId) return notFound();
  const [a, f] = await Promise.all([
    prisma.sheet.findFirst({
      where: { id: activeSheetId, versionId: ds.activeVersionId },
      select: activeSheetSelect,
    }),
    prisma.sheet.findFirst({
      where: { id: newSheetId, version: { id: versionId, datasetId, status: "AWAITING_MAPPING" } },
      select: freshSheetSelect,
    }),
  ]);
  if (!a || !f) return notFound();
  return { ok: true, data: pairPlan(activeSheetOf(a), freshSheetOf(f), true) };
}

// ── Simpan ──────────────────────────────────────────────────────────────────────────────────────

const BUSY: Record<Exclude<MappingEnqueue, { ok: true }>["reason"], string> = {
  version: "Pemetaan versi ini sedang diterapkan. Tunggu sampai selesai.",
  user: "Masih ada koreksi skema atau pemetaan Anda yang sedang diproses. Tunggu salah satunya selesai, lalu coba lagi.",
  lock: "Permintaan Anda yang lain sedang dikirim. Coba lagi sebentar.",
};

/**
 * Simpan pemetaan: bentuk payload (murni, tanpa DB) → rate limit → pemilik + versi masih menunggu
 * pemetaan → acuan skema aktif sama (di bawah lock Dataset FOR UPDATE, urutan lock sama dengan
 * aktivasi/buang; berubah → STALE) → keputusan valid (validateMapping) → antre bila versi ini belum
 * punya job dan job recast/pemetaan user yang berjalan < batas per user (DATASET_BUSY). Rate limit
 * sebelum lock dan membaca baris berat: kiriman yang ditolak pun memakan kuota. Lock memegang
 * buang/simpan lain sampai job tercatat, jadi buang yang menyusul membuat job berakhir "gone".
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
  const shape = parseMappingInput(payload);
  if (!shape.ok) return fail(shape.code, shape.message);
  const limited = await rateLimit();
  if (limited) return limited;
  const run = async (tx: Tx): Promise<VersionResult<{ jobId: string }>> => {
    const rows = await tx.$queryRaw<{ activeVersionId: string | null }[]>`
      SELECT "activeVersionId" FROM "Dataset" WHERE id = ${datasetId} AND "ownerId" = ${userId} FOR UPDATE`;
    const ds = rows[0];
    if (!ds) return notFound();
    const v = await tx.datasetVersion.findFirst({
      where: { id: versionId, datasetId },
      select: { status: true, sheets: { select: versionSheetSelect } },
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
    // Acuan skema aktif (STALE) + semua keputusan, terhadap skema aktif di bawah lock ini.
    const checked = validateMapping(shape.input, { sheets: v.sheets.map(versionSheetOf), active });
    if (!checked.ok) return fail(checked.code, checked.message);
    const q = await enqueueMapping(
      { versionId, datasetId, input: checked.input, actorId: userId, ip },
      RECAST_INFLIGHT_PER_USER,
    );
    return q.ok ? { ok: true, data: { jobId: q.jobId } } : fail("DATASET_BUSY", BUSY[q.reason]);
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
  const r = (result ?? null) as {
    outcome?: unknown;
    message?: unknown;
    issues?: unknown;
  } | null;
  const text = typeof r?.message === "string" && r.message ? r.message : null;
  switch (r?.outcome) {
    case "done":
    case "stale":
      return { state: r.outcome };
    case "gone":
      return text ? { state: "gone", message: text } : { state: "gone" };
    case "invalid":
    case "failed":
      return { state: r.outcome, message: text ?? FAILED };
    case "review":
      return {
        state: "review",
        issues: Array.isArray(r.issues) ? (r.issues as MappingReviewIssue[]) : [],
      };
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
  // Job harus milik dataset ini juga, termasuk setelah versinya dibuang ("gone").
  const job = await withQueueTimeout(mappingQueue().getJob(jobId), "status pemetaan");
  if (!job || job.name !== MAP_VERSION_JOB || job.data.datasetId !== datasetId) return null;
  const state = await withQueueTimeout(job.getState(), "status pemetaan");
  return statusOf(state, job.returnvalue);
}
