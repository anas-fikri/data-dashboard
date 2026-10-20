import "server-only";
import { Prisma } from "@prisma/client";
import { recordAudit } from "@/features/audit/service";
import { isoDay, type PeriodGrain, type PeriodSource } from "@/features/ingest/period";
import {
  parseFrozenPeriodPlan,
  type OnLimit,
  type PeriodLimits,
  type PeriodPlan,
} from "@/features/ingest/period-plan";
import type { ColumnSchema } from "@/features/ingest/infer";
import {
  decidePeriodCommit,
  factsOf,
  periodPlanSummary,
  type ActivePeriodSheet,
  type CommitMode,
  type IncomingSegmentRef,
  type ManifestRef,
  type UploadFacts,
} from "@/features/ingest/period-upload-plan";
import { sameSnapshot, type SnapshotRef } from "@/features/ingest/refresh";
import { activateVersionInTx } from "./activation";
import { prismaManifest } from "./integrity";
import { IntegrityError, verifyVersionIntegrity, type ManifestSheet } from "./integrity-check";

/*
 * Commit unggahan periode (T-052, rencana G-6 §4.5 langkah 4–5), dipakai worker (selesai diproses:
 * aktif otomatis atau menunggu konfirmasi) dan app ("Terapkan"). Pemanggil membuka transaksi; di sini:
 *  1. versi masih di status yang diharapkan, lalu lock baris Dataset FOR UPDATE (urutan kunci sama
 *     dengan ingest finish/aktivasi/hapus dataset);
 *  2. acuan cast: versi aktif + revisi skema sheet sama dengan yang dipakai menulis segmen baru (worker:
 *     snapshot; app: rencana beku + revisi file typed segmen baru) — berubah → "stale";
 *  3. rencana dihitung ulang dari manifest aktif + pengaturan dataset + batas sekarang
 *     (decidePeriodCommit; autoActivate rencana beku tidak pernah dipercaya);
 *  4. manifest versi ditulis ulang menurut rencana (periode lama = file typed yang sama, tanpa objek
 *     baru), gerbang integritas (metadata + kunci yang sudah di-HEAD pemanggil, fail-closed);
 *  5. READY + aktif (sheetMap sheet aktif → sheet versi ini) atau AWAITING_CONFIRM + rencana beku.
 */

type Tx = Prisma.TransactionClient;

/** Sheet versi aktif lengkap: disalin ke versi baru + metadata manifest periode. */
export const periodSheetSelect = {
  id: true,
  index: true,
  name: true,
  aliasName: true,
  lineageId: true,
  rawKey: true,
  rawRows: true,
  colCount: true,
  headerRow: true,
  columns: true,
  truncatedCells: true,
  preview: true,
  typedKey: true,
  schemaRevision: true,
  schema: true,
  periodSource: true,
  periodColumn: true,
  segments: {
    orderBy: { ordinal: "asc" as const },
    select: {
      ordinal: true,
      segmentTyped: {
        select: {
          id: true,
          typedKey: true,
          dataRows: true,
          typedBytes: true,
          schemaRevision: true,
          segment: {
            select: {
              id: true,
              rawKey: true,
              rawRows: true,
              rawBytes: true,
              rowBase: true,
              maxSrcRow: true,
              periodKey: true,
              periodStart: true,
              sha256: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.SheetSelect;

export type PeriodSheetRow = Prisma.SheetGetPayload<{ select: typeof periodSheetSelect }>;

/** Lokasi file satu file typed (manifest + gerbang integritas). */
interface FileInfo {
  rawKey: string;
  typedKey: string;
  rawRows: number;
  rowBase: bigint;
  maxSrcRow: number | null;
}

/** Metadata periode sheet aktif (rencana) + lokasi file per file typed. */
export function activeOf(s: PeriodSheetRow): ActivePeriodSheet & { files: Map<string, FileInfo> } {
  const files = new Map<string, FileInfo>();
  const segments = s.segments.flatMap(({ segmentTyped: t }) => {
    const g = t.segment;
    files.set(t.id, {
      rawKey: g.rawKey,
      typedKey: t.typedKey,
      rawRows: g.rawRows,
      rowBase: g.rowBase,
      maxSrcRow: g.maxSrcRow,
    });
    const start = isoDay(g.periodStart);
    if (!g.periodKey || !start) return [];
    return [
      {
        typedId: t.id,
        segmentId: g.id,
        periodKey: g.periodKey,
        periodStart: start,
        rows: t.dataRows ?? 0,
        bytes: Number(g.rawBytes ?? 0n) + Number(t.typedBytes ?? 0n),
        sha256: g.sha256,
      },
    ];
  });
  return {
    sheetId: s.id,
    lineageId: s.lineageId,
    name: s.name,
    schemaRevision: s.schemaRevision,
    segments,
    files,
  };
}

/** Segmen periode yang ditulis versi ini (file baru) + lokasi file; schemaRevision file typed-nya. */
async function incomingOf(
  tx: Tx,
  versionId: string,
): Promise<{
  refs: IncomingSegmentRef[];
  files: Map<string, FileInfo>;
  revisions: Map<string, number>;
} | null> {
  const rows = await tx.segment.findMany({
    where: { createdByVersionId: versionId, periodKey: { not: null } },
    select: {
      id: true,
      lineageId: true,
      periodKey: true,
      periodStart: true,
      rawKey: true,
      rawRows: true,
      rawBytes: true,
      rowBase: true,
      maxSrcRow: true,
      typed: {
        select: {
          id: true,
          typedKey: true,
          dataRows: true,
          typedBytes: true,
          schemaRevision: true,
        },
      },
    },
  });
  const refs: IncomingSegmentRef[] = [];
  const files = new Map<string, FileInfo>();
  const revisions = new Map<string, number>();
  for (const g of rows) {
    const start = isoDay(g.periodStart);
    // Tepat satu file typed per segmen baru (ditulis worker); selain itu bentuk tidak dikenal.
    if (g.typed.length !== 1 || !g.periodKey || !start) return null;
    const t = g.typed[0]!;
    if (t.dataRows === null) return null;
    const rev = revisions.get(g.lineageId);
    if (rev !== undefined && rev !== t.schemaRevision) return null;
    revisions.set(g.lineageId, t.schemaRevision);
    refs.push({
      typedId: t.id,
      segmentId: g.id,
      lineageId: g.lineageId,
      periodKey: g.periodKey,
      periodStart: start,
      rows: t.dataRows,
      bytes: Number(g.rawBytes ?? 0n) + Number(t.typedBytes ?? 0n),
    });
    files.set(t.id, {
      rawKey: g.rawKey,
      typedKey: t.typedKey,
      rawRows: g.rawRows,
      rowBase: g.rowBase,
      maxSrcRow: g.maxSrcRow,
    });
  }
  return { refs, files, revisions };
}

export interface PeriodCommitArgs {
  versionId: string;
  /** Status versi yang diharapkan (worker: INGESTING; app: AWAITING_CONFIRM). */
  from: "INGESTING" | "AWAITING_CONFIRM";
  /** Worker: acuan cast yang dipakai menulis segmen. */
  snapshot?: SnapshotRef;
  /** Worker: fakta file; app: dari rencana beku. */
  facts?: UploadFacts;
  /** Worker: SHA-256 file (dicatat di versi). */
  sha256?: string;
  /** Periode "nyasar" yang dimasukkan pemilik. */
  include: string[];
  mode: CommitMode;
  /** Kunci yang sudah terbukti ada di storage (HEAD sebelum transaksi). */
  present: ReadonlySet<string>;
  limits: PeriodLimits;
  /** "Terapkan" pemilik: AuditLog dataset.period.confirm. */
  audit?: { actorId: string; ip: string };
  /** Tinjauan: rencana hitung ulang saja — tanpa lock dan tanpa tulisan apa pun. */
  dryRun?: boolean;
}

export type PeriodTxResult =
  | { outcome: "activated"; plan: PeriodPlan; deletedTypedKeys: string[]; datasetId: string }
  | { outcome: "awaiting"; plan: PeriodPlan }
  | { outcome: "rejected"; plan: PeriodPlan; message: string }
  | { outcome: "plan_stale"; plan: PeriodPlan }
  | { outcome: "blocked"; plan: PeriodPlan; message: string }
  /** Acuan cast berubah (versi aktif/revisi skema): segmen baru harus ditulis ulang. */
  | { outcome: "stale" }
  | { outcome: "gone" }
  /** dryRun: rencana yang akan dikonfirmasi (sidik dihitung pemanggil). */
  | { outcome: "preview"; plan: PeriodPlan };

/** Lihat komentar berkas. Melempar IntegrityError (transaksi batal) bila manifest tidak lolos. */
export async function commitPeriodInTx(tx: Tx, a: PeriodCommitArgs): Promise<PeriodTxResult> {
  const v = await tx.datasetVersion.findUnique({
    where: { id: a.versionId },
    select: {
      datasetId: true,
      status: true,
      mode: true,
      periodGrain: true,
      sha256: true,
      plan: true,
    },
  });
  if (!v) return { outcome: "gone" };
  type DsRow = { activeVersionId: string | null; keepPeriods: number | null; onLimit: OnLimit };
  const [ds] = a.dryRun
    ? await tx.$queryRaw<DsRow[]>`
        SELECT "activeVersionId", "keepPeriods", "onLimit" FROM "Dataset" WHERE id = ${v.datasetId}`
    : await tx.$queryRaw<DsRow[]>`
        SELECT "activeVersionId", "keepPeriods", "onLimit" FROM "Dataset" WHERE id = ${v.datasetId} FOR UPDATE`;
  if (!ds || v.status !== a.from || v.mode !== "PERIOD") return { outcome: "gone" };
  const frozen = parseFrozenPeriodPlan(v.plan);
  const facts = a.facts ?? (frozen ? factsOf(frozen) : null);
  if (!facts) return { outcome: "stale" };
  const activeVersion = ds.activeVersionId
    ? await tx.datasetVersion.findUnique({
        where: { id: ds.activeVersionId },
        select: {
          periodGrain: true,
          sheets: { orderBy: { index: "asc" }, select: periodSheetSelect },
        },
      })
    : null;
  if (!ds.activeVersionId || !activeVersion?.periodGrain) return { outcome: "stale" };
  if (activeVersion.periodGrain !== v.periodGrain || facts.grain !== v.periodGrain) {
    return { outcome: "stale" };
  }
  const rows = activeVersion.sheets;
  const now: SnapshotRef = {
    activeVersionId: ds.activeVersionId,
    sheets: rows.map((s) => ({ id: s.id, schemaRevision: s.schemaRevision })),
  };
  if (a.snapshot && !sameSnapshot(a.snapshot, now)) return { outcome: "stale" };
  // Rencana beku dihitung terhadap versi aktif tempat segmen di-cast (app: tidak ada snapshot).
  if (!a.snapshot && frozen?.baseVersionId !== ds.activeVersionId) return { outcome: "stale" };
  const incoming = await incomingOf(tx, a.versionId);
  if (!incoming) return { outcome: "stale" };
  const byLineage = new Map(rows.map((s) => [s.lineageId, s]));
  for (const [lineage, rev] of incoming.revisions) {
    const s = byLineage.get(lineage);
    // Segmen baru di-cast dengan skema revisi lain (koreksi skema setelah diproses) → tulis ulang.
    if (!s || s.schemaRevision !== rev || !s.periodSource) return { outcome: "stale" };
  }
  const active = rows.map(activeOf);
  const d = decidePeriodCommit({
    facts,
    activeVersionId: ds.activeVersionId,
    active,
    incoming: incoming.refs,
    settings: { keepPeriods: ds.keepPeriods, onLimit: ds.onLimit },
    limits: a.limits,
    include: a.include,
    mode: a.mode,
  });
  if (a.dryRun) return { outcome: "preview", plan: d.plan };
  const frozenJson = (p: PeriodPlan) => JSON.parse(JSON.stringify(p)) as Prisma.InputJsonValue;
  if (d.decision === "plan_stale") {
    await tx.datasetVersion.updateMany({
      where: { id: a.versionId, status: a.from },
      data: { plan: frozenJson(d.plan) },
    });
    return { outcome: "plan_stale", plan: d.plan };
  }
  if (d.decision === "blocked") return { outcome: "blocked", plan: d.plan, message: d.message };
  if (d.decision === "reject") return { outcome: "rejected", plan: d.plan, message: d.message };

  // Manifest versi ini menurut rencana: sheet aktif disalin, file typed dirujuk (bukan disalin).
  const files = new Map([...active.flatMap((s) => [...s.files]), ...incoming.files]);
  await tx.sheet.deleteMany({ where: { versionId: a.versionId } });
  const sheetMap: Record<string, string> = {};
  const manifest: ManifestSheet[] = [];
  const typedIds: string[] = [];
  for (const s of rows) {
    const refs: ManifestRef[] = d.manifest.get(s.lineageId) ?? [];
    const info = refs.map((r) => {
      const f = files.get(r.typedId);
      if (!f)
        throw new IntegrityError([`sheet "${s.name}": file periode ${r.periodKey} tidak dikenal`]);
      return f;
    });
    const created = await tx.sheet.create({
      data: {
        versionId: a.versionId,
        lineageId: s.lineageId,
        index: s.index,
        name: s.name,
        aliasName: s.aliasName,
        rawKey: info[0]?.rawKey ?? s.rawKey,
        rawRows: info.length ? info.reduce((n, f) => n + f.rawRows, 0) : s.rawRows,
        colCount: s.colCount,
        headerRow: s.headerRow,
        columns: s.columns as Prisma.InputJsonValue,
        truncatedCells: s.truncatedCells,
        preview: s.preview === null ? Prisma.DbNull : (s.preview as Prisma.InputJsonValue),
        typedKey: info[0]?.typedKey ?? (refs.length ? null : s.segments.length ? null : s.typedKey),
        schemaRevision: s.schemaRevision,
        schema: s.schema === null ? Prisma.DbNull : (s.schema as Prisma.InputJsonValue),
        periodSource: s.periodSource as PeriodSource | null,
        periodColumn: s.periodColumn,
      },
      select: { id: true, typedKey: true },
    });
    sheetMap[s.id] = created.id;
    if (refs.length) {
      await tx.sheetSegment.createMany({
        data: refs.map((r, ordinal) => ({
          sheetId: created.id,
          segmentTypedId: r.typedId,
          ordinal,
        })),
      });
    }
    typedIds.push(...refs.map((r) => r.typedId));
    manifest.push({
      id: created.id,
      name: s.name,
      typedKey: created.typedKey,
      periodGrain: v.periodGrain as PeriodGrain,
      periodSource: s.periodSource,
      segments: refs.map((r, ordinal) => {
        const f = info[ordinal]!;
        return {
          ordinal,
          rawKey: f.rawKey,
          typedKey: f.typedKey,
          rowBase: f.rowBase,
          maxSrcRow: f.maxSrcRow,
          periodKey: r.periodKey,
          periodStart: r.periodStart,
          dataRows: r.rows,
        };
      }),
    });
  }
  // Gerbang integritas (fail-closed) di dalam lock: verifyVersionIntegrity atas manifest yang BARU
  // ditulis di transaksi ini (dibaca ulang) + kunci yang sudah terbukti ada (HEAD sebelum lock).
  const problems = await verifyVersionIntegrity(a.versionId, {
    manifest: (id) => prismaManifest(id, tx),
    exists: async (k) => a.present.has(k),
  });
  // Selisih manifest yang dibaca ulang dengan yang direncanakan (baris per periode) = galat juga.
  const written = await prismaManifest(a.versionId, tx);
  for (const s of manifest) {
    const w = written?.find((x) => x.id === s.id);
    const same =
      w?.segments.length === s.segments.length &&
      w.segments.every((g, i) => {
        const p = s.segments.find((x) => x.ordinal === g.ordinal) ?? s.segments[i]!;
        return (
          g.typedKey === p.typedKey && g.periodKey === p.periodKey && g.dataRows === p.dataRows
        );
      });
    if (!same) problems.push(`sheet "${s.name}": manifest tertulis berbeda dengan rencana`);
  }
  if (problems.length) throw new IntegrityError(problems);
  // Dirujuk lagi (bisa sudah ditandai GC): tanda dibuang sekarang, sebelum versi lain dibuang retensi.
  await tx.segmentTyped.updateMany({
    where: { id: { in: typedIds }, unreferencedAt: { not: null } },
    data: { unreferencedAt: null },
  });
  await tx.segment.updateMany({
    where: { typed: { some: { id: { in: typedIds } } }, unreferencedAt: { not: null } },
    data: { unreferencedAt: null },
  });
  const activate = d.decision === "activate";
  const r = await tx.datasetVersion.updateMany({
    where: { id: a.versionId, status: a.from },
    data: {
      status: activate ? "READY" : "AWAITING_CONFIRM",
      plan: frozenJson(d.plan),
      errorMessage: null,
      ...(a.from === "INGESTING"
        ? { ingestStage: "typed", ingestFinishedAt: new Date(), sha256: a.sha256 ?? v.sha256 }
        : {}),
    },
  });
  if (r.count !== 1) throw new Error("status versi periode berubah di tengah commit");
  if (!activate) return { outcome: "awaiting", plan: d.plan };
  const done = await activateVersionInTx(tx, v.datasetId, a.versionId, { sheetMap });
  if (a.audit) {
    await recordAudit(tx, {
      actorId: a.audit.actorId,
      action: "dataset.period.confirm",
      targetType: "dataset",
      targetId: v.datasetId,
      meta: {
        from: ds.activeVersionId,
        versionId: a.versionId,
        summary: periodPlanSummary(d.plan),
        include: d.plan.include,
        droppedRows: d.plan.droppedRows,
      },
      ip: a.audit.ip,
    });
  }
  return {
    outcome: "activated",
    plan: d.plan,
    deletedTypedKeys: done.deletedTypedKeys,
    datasetId: v.datasetId,
  };
}

/** Kunci raw/typed manifest sheet aktif (HEAD sebelum transaksi). */
export const sheetKeys = (rows: Pick<PeriodSheetRow, "segments">[]): string[] => [
  ...new Set(
    rows.flatMap((s) =>
      s.segments.flatMap(({ segmentTyped: t }) => [t.segment.rawKey, t.typedKey]),
    ),
  ),
];

/** Schema helper (kolom JSON → ColumnSchema[]). */
export const schemaOf = (s: unknown): ColumnSchema[] => (s as ColumnSchema[] | null) ?? [];
