/*
 * Penerapan pemetaan kolom (T-014, job "map-version" di antrean recast). Versi tetap AWAITING_MAPPING
 * selama job berjalan dan bila gagal (bisa dikirim ulang); hanya commit yang mengubahnya.
 *  - Satu job per versi: lock Redis map:<versionId> yang diperpanjang (pola recast); deadline 60 menit.
 *  - Validasi ulang (validateMapping) dengan skema aktif TERKINI; acuan berubah → "stale".
 *  - Per pasangan sheet: unduh raw.parquet saja (file asli tidak pernah dibaca), override dari skema aktif
 *    terkini + keputusan user, header dari rencana validasi (pasangan user: pairedHeader, sama dengan
 *    halaman/app), tulis typed-<rev+1>-<token>.parquet dengan kolom kosong (absent), unggah.
 *  - Sebelum commit: rasio cast tepat tiap kolom non-teks yang cocok/dipetakan dengan tipe yang
 *    diterapkan; ada yang < 98 % dan input tanpa acknowledge → "review" (≤ 50 kolom, terburuk dulu),
 *    tanpa commit. User mengirim ulang dengan acknowledge (atau cast lain).
 *  - Commit satu transaksi (repo): acuan + status dijaga, sheet diganti (pasangan user mendapat alias
 *    akar silsilah nama sheet aktif), READY + aktif dengan sheetMap, AuditLog dataset.version.map
 *    (+ id job).
 *    typed lama dihapus 1 jam kemudian.
 *  - Versi sudah READY saat dimuat: "done" hanya bila commit-nya oleh job ini; selain itu "gone".
 *  - Hasil selain done → file yang diunggah job ini dihapus.
 */
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { openDuck, type Duck } from "@/lib/duckdb";
import { acquireLock, extendLock, releaseLock, type LockStore } from "@/lib/lock";
import type { ColumnMeta } from "./header";
import { INFER_THRESHOLD, type ColumnSchema, type SourceKind } from "./infer";
import { DatasetGoneError, DeadlineError, permanentMessage, type TypedStorage } from "./ingest";
import {
  REVIEW_MAX,
  validateMapping,
  type MappingOutcome,
  type MappingReviewIssue,
  type PairPlan,
  type VersionSheet,
} from "./mapping-input";
import {
  IntegrityError,
  verifyVersionIntegrity,
  type ManifestSheet,
} from "@/features/versions/integrity-check";
import { RECAST_LOCK_MS, RECAST_RENEW_MS } from "./recast";
import { lineageRoot, typeLabel, type ActiveSnapshot, type SnapshotRef } from "./refresh";
import { maxSourceRow, typedFileProblems, writeTyped } from "./typed";

export const MAPPING_DEADLINE_MS = 60 * 60 * 1000;
const PARQUET = "application/vnd.apache.parquet";
/** Versi sudah READY oleh simpan lain (job lain): keputusan job ini tidak diterapkan. */
export const ALREADY_MAPPED_MESSAGE =
  "Versi ini sudah dipetakan oleh penyimpanan lain, jadi pemetaan ini tidak diterapkan. Periksa skema versi aktif.";

/** Hasil satu percobaan; "busy" (versi sedang dipetakan proses lain) ditunda worker, bukan hasil akhir. */
export type MappingRun = MappingOutcome | { outcome: "busy" };

export interface MappingVersionSheet extends VersionSheet {
  rawKey: string;
  typedKey: string | null;
  schemaRevision: number;
  /** Sheet logis saat ingest (ADR-0008) dan segmen manifest-nya (awal `_row`). */
  lineageId?: string;
  segment?: { id: string; rowBase: bigint } | null;
}

export interface MappingVersion {
  datasetId: string;
  status: string;
  source: SourceKind;
  sheets: MappingVersionSheet[];
  /** Versi aktif dataset (selain versi ini) beserta skemanya. */
  active: ActiveSnapshot | null;
  /** Versi READY: id job pemetaan yang meng-commit-nya (AuditLog), null bila tidak diketahui. */
  mappedBy?: string | null;
}

export interface MappingSheetUpdate {
  id: string;
  expectedRevision: number;
  typedKey: string;
  schema: ColumnSchema[];
  schemaRevision: number;
  headerRow: number;
  columns: ColumnMeta[];
  /**
   * Sheet yang dipasangkan user: akar silsilah nama sheet aktif pasangannya (alias sheet aktif bila
   * ada, selain itu namanya; Sheet.aliasName, T-014), lihat lineageRoot.
   */
  aliasName?: string;
  /**
   * Dipasangkan dengan sheet aktif dari sheet logis lain (ADR-0008, T-036): lineage sheet aktif dibawa,
   * segmen sheet ini mendapat awal `_row` baru dari lineage itu (typed ditulis ulang dengannya).
   */
  lineage?: { lineageId: string; segmentId: string; rowBase: bigint; maxSrcRow: number };
  /** Baris data file typed baru (T-038). */
  dataRows: number;
  /** Ukuran file typed baru (T-039). */
  typedBytes: number;
}

export interface MappingCommit {
  base: SnapshotRef;
  sheets: MappingSheetUpdate[];
  sheetMap: Record<string, string>;
  actorId: string;
  ip: string;
  meta: { mapped: number; nulls: number; droppedSheets: string[]; jobId?: string };
}

export interface MappingRepo {
  load(versionId: string): Promise<MappingVersion | null>;
  /** Versi masih ada dan masih AWAITING_MAPPING. */
  alive(versionId: string): Promise<boolean>;
  /**
   * Satu transaksi (Dataset FOR UPDATE lebih dulu): acuan basi → "stale"; versi bukan AWAITING_MAPPING
   * → "gone"; selain itu sheet diganti, READY + aktif (sheetMap), AuditLog.
   */
  commit(versionId: string, d: MappingCommit): Promise<"done" | "stale" | "gone">;
  /** Gerbang integritas gagal (T-038): AWAITING_MAPPING → FAILED dengan pesan; versi aktif tetap. */
  fail(versionId: string, message: string): Promise<void>;
  /** Manifest versi saat ini (T-038); null = versi tidak ada. */
  manifest(versionId: string): Promise<ManifestSheet[] | null>;
  /** Sama dengan IngestRepo.allocateRows: awal `_row` baru dari lineage (naik atomik). */
  allocateRows(lineageId: string, span: number): Promise<bigint>;
}

export interface MappingDeps {
  repo: MappingRepo;
  storage: Pick<TypedStorage, "download" | "upload" | "deleteObject" | "exists">;
  lock: LockStore;
  tmpRoot: string;
  duckMemory?: string;
  renewMs?: number;
}

export interface MappingJob {
  versionId: string;
  input: unknown;
  actorId: string;
  ip: string;
  /** Id job BullMQ: dicatat saat commit agar percobaan ulang job yang sama tahu commit itu miliknya. */
  jobId?: string;
}

class LockLostError extends Error {
  constructor() {
    super("lock pemetaan hilang");
    this.name = "LockLostError";
  }
}

/**
 * Kolom cocok/dipetakan non-teks yang < 98 % nilainya lolos cast dengan tipe yang diterapkan (n =
 * nilai non-kosong; n = 0 lolos), dari skema typed yang baru ditulis.
 */
export function reviewIssues(p: PairPlan, schema: ColumnSchema[]): MappingReviewIssue[] {
  const byPos = new Map(schema.map((c) => [c.pos, c]));
  const out: MappingReviewIssue[] = [];
  for (const pos of p.checked) {
    const c = byPos.get(pos);
    const n = c?.nonEmpty ?? 0;
    if (!c || c.type === "text" || n === 0) continue;
    const ok = n - c.castFailCount;
    if (ok / n >= INFER_THRESHOLD) continue;
    out.push({
      sheet: p.active.name,
      column: c.name,
      header: c.original,
      // Persen bulat ke bawah: 97,9 % tidak pernah tampil "98%".
      pct: Math.floor((ok * 100) / n) / 100,
      typeLabel: typeLabel(c),
    });
  }
  return out;
}

export async function applyMapping(job: MappingJob, deps: MappingDeps): Promise<MappingRun> {
  const lockKey = `map:${job.versionId}`;
  const token = await acquireLock(deps.lock, lockKey, RECAST_LOCK_MS);
  if (!token) return { outcome: "busy" };
  let lockLost = false;
  const renew = setInterval(() => {
    extendLock(deps.lock, lockKey, token, RECAST_LOCK_MS)
      .then((ok) => {
        if (!ok) lockLost = true;
      })
      .catch(() => {});
  }, deps.renewMs ?? RECAST_RENEW_MS);
  const deadline = Date.now() + MAPPING_DEADLINE_MS;
  const watch = async () => {
    if (lockLost) throw new LockLostError();
    if (Date.now() > deadline) throw new DeadlineError("pemetaan");
    if (!(await deps.repo.alive(job.versionId))) throw new DatasetGoneError();
  };
  let work: string | null = null;
  let duck: Duck | null = null;
  // File percobaan ini yang belum menjadi typed aktif (dihapus di finally).
  let uploaded: string[] = [];
  try {
    const v = await deps.repo.load(job.versionId);
    if (!v) return { outcome: "gone" };
    // Percobaan sebelumnya job INI sudah commit lalu gagal sesudahnya (mis. menjadwalkan hapus):
    // selesai. Di-commit job lain → keputusan job ini tidak pernah diterapkan.
    if (v.status === "READY") {
      return job.jobId && v.mappedBy === job.jobId
        ? { outcome: "done" }
        : { outcome: "gone", message: ALREADY_MAPPED_MESSAGE };
    }
    if (v.status !== "AWAITING_MAPPING") return { outcome: "gone" };
    const check = validateMapping(job.input, { sheets: v.sheets, active: v.active });
    if (!check.ok) {
      return check.code === "STALE"
        ? { outcome: "stale" }
        : { outcome: "invalid", message: check.message };
    }
    const { plan } = check;

    work = mkdtempSync(join(deps.tmpRoot, "mapping-"));
    duck = await openDuck({
      path: join(work, "work.duckdb"),
      tmpDir: work,
      memoryLimit: deps.duckMemory,
    });
    const updates: MappingSheetUpdate[] = [];
    const issues: MappingReviewIssue[] = [];
    for (const p of plan.pairs) {
      const s = v.sheets.find((x) => x.id === p.target.id)!;
      const rawPath = join(work, `raw-${s.index}.parquet`);
      const outPath = join(work, `typed-${s.index}.parquet`);
      await deps.storage.download(s.rawKey, rawPath);
      await watch();
      const revision = s.schemaRevision + 1;
      // Pasangan dari sheet logis lain (dipasangkan user): `_row` baru dari lineage sheet aktif.
      let rowBase = s.segment?.rowBase ?? 0n;
      let lineage: MappingSheetUpdate["lineage"];
      const carried = p.active.lineageId;
      if (carried && s.segment && s.lineageId !== carried) {
        const maxSrcRow = await maxSourceRow(duck, rawPath);
        rowBase = await deps.repo.allocateRows(carried, maxSrcRow);
        lineage = { lineageId: carried, segmentId: s.segment.id, rowBase, maxSrcRow };
      }
      const typed = await writeTyped(duck, {
        rawPath,
        outPath,
        source: v.source,
        headerRow: p.headerRow,
        colCount: s.colCount,
        columns: p.columns,
        overrides: p.overrides,
        absent: p.absent,
        watch,
        rowBase,
      });
      issues.push(...reviewIssues(p, typed.schema));
      const bad = await typedFileProblems(duck, outPath, typed.dataRows, `sheet "${s.name}"`);
      if (bad.length) throw new IntegrityError(bad);
      const dir = s.rawKey.slice(0, s.rawKey.lastIndexOf("/") + 1);
      const typedKey = `${dir}typed-${revision}-${token.slice(0, 12)}.parquet`;
      const typedBytes = statSync(outPath).size;
      await deps.storage.upload(typedKey, outPath, PARQUET);
      uploaded.push(typedKey);
      rmSync(rawPath, { force: true });
      rmSync(outPath, { force: true });
      updates.push({
        id: s.id,
        expectedRevision: s.schemaRevision,
        typedKey,
        schema: typed.schema,
        schemaRevision: revision,
        headerRow: p.headerRow,
        columns: p.columns,
        ...(p.userPaired ? { aliasName: lineageRoot(p.active) } : {}),
        ...(lineage ? { lineage } : {}),
        dataRows: typed.dataRows,
        typedBytes,
      });
      await watch();
    }

    if (issues.length && !check.input.acknowledge) {
      // Terburuk dulu (sort stabil: urutan sheet lalu posisi untuk persen yang sama).
      issues.sort((a, b) => a.pct - b.pct);
      return { outcome: "review", issues: issues.slice(0, REVIEW_MAX) };
    }

    // Gerbang integritas sebelum aktivasi (T-038), atas manifest yang AKAN aktif: manifest sekarang
    // dengan file typed baru setiap sheet yang dipetakan (sheet lain versi ini ikut diperiksa).
    const current = await deps.repo.manifest(job.versionId);
    if (!current) return { outcome: "gone" };
    const planned = current.map((sh): ManifestSheet => {
      const u = updates.find((x) => x.id === sh.id);
      if (!u) return sh;
      return {
        ...sh,
        typedKey: u.typedKey,
        segments: sh.segments.map((g, i) =>
          i === 0
            ? {
                ...g,
                typedKey: u.typedKey,
                ...(u.lineage
                  ? { rowBase: u.lineage.rowBase, maxSrcRow: u.lineage.maxSrcRow }
                  : {}),
              }
            : g,
        ),
      };
    });
    const problems = await verifyVersionIntegrity(job.versionId, {
      manifest: async () => planned,
      exists: (k) => deps.storage.exists(k),
    });
    if (problems.length) throw new IntegrityError(problems);
    await watch(); // lock masih milik kita tepat sebelum commit
    let r: "done" | "stale" | "gone";
    try {
      r = await deps.repo.commit(job.versionId, {
        base: check.input.base,
        sheets: updates,
        sheetMap: plan.sheetMap,
        actorId: job.actorId,
        ip: job.ip,
        meta: {
          mapped: plan.pairs.reduce((n, p) => n + p.mapped, 0),
          nulls: plan.pairs.reduce((n, p) => n + p.nulls, 0),
          droppedSheets: plan.dropped.map((s) => s.name),
          ...(job.jobId ? { jobId: job.jobId } : {}),
        },
      });
    } catch (e) {
      // Commit bisa sudah terjadi sebelum koneksi putus: jangan hapus file yang mungkin sudah aktif.
      const now = await deps.repo.load(job.versionId).catch(() => undefined);
      if (now === undefined || now?.status === "READY") uploaded = [];
      throw e;
    }
    if (r !== "done") return { outcome: r };
    uploaded = [];
    // Typed lama tidak lagi dirujuk manifest → disapu GC segmen setelah masa tenggang (T-038).
    return { outcome: "done" };
  } catch (e) {
    if (e instanceof DatasetGoneError) return { outcome: "gone" };
    if (e instanceof LockLostError) return { outcome: "busy" };
    if (e instanceof DeadlineError) {
      return {
        outcome: "failed",
        message: "Penerapan pemetaan melebihi 60 menit. Coba simpan lagi nanti.",
      };
    }
    if (e instanceof IntegrityError) {
      const message = `${e.message} Pemetaan tidak diterapkan dan data aktif tidak berubah; versi ini ditandai gagal. Unggah ulang file; bila terulang, hubungi admin.`;
      await deps.repo.fail(job.versionId, message);
      return { outcome: "failed", message };
    }
    const message = permanentMessage(e);
    if (message !== null) return { outcome: "failed", message };
    throw e; // sementara (storage/DB): BullMQ mengulang, versi tetap AWAITING_MAPPING
  } finally {
    clearInterval(renew);
    for (const key of uploaded) await deps.storage.deleteObject(key).catch(() => {});
    duck?.close();
    if (work) rmSync(work, { recursive: true, force: true });
    await releaseLock(deps.lock, lockKey, token).catch(() => false);
  }
}
