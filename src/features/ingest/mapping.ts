/*
 * Penerapan pemetaan kolom (T-014, job "map-version" di antrean recast). Versi tetap AWAITING_MAPPING
 * selama job berjalan dan bila gagal (bisa dikirim ulang); hanya commit yang mengubahnya.
 *  - Satu job per versi: lock Redis map:<versionId> yang diperpanjang (pola recast); deadline 60 menit.
 *  - Validasi ulang (validateMapping) dengan skema aktif TERKINI; acuan berubah → "stale".
 *  - Per pasangan sheet: unduh raw.parquet saja (file asli tidak pernah dibaca), override dari skema aktif
 *    terkini + keputusan user, baris header aktif dicoba lagi (chooseHeader) bila keputusan tetap utuh
 *    di header itu, tulis typed-<rev+1>-<token>.parquet dengan kolom kosong (absent), unggah.
 *  - Commit satu transaksi (repo): acuan + status dijaga, sheet diganti, READY + aktif dengan sheetMap,
 *    AuditLog dataset.version.map. typed lama dihapus 1 jam kemudian.
 *  - Hasil selain done → file yang diunggah job ini dihapus.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { openDuck, type Duck } from "@/lib/duckdb";
import { acquireLock, extendLock, releaseLock, type LockStore } from "@/lib/lock";
import type { ColumnMeta } from "./header";
import type { ColumnSchema, SourceKind } from "./infer";
import { DatasetGoneError, DeadlineError, permanentMessage, type IngestStorage } from "./ingest";
import {
  planPair,
  validateMapping,
  type MappingOutcome,
  type PairCast,
  type PairPlan,
  type VersionSheet,
} from "./mapping-input";
import { OLD_TYPED_TTL_MS, RECAST_LOCK_MS, RECAST_RENEW_MS } from "./recast";
import { chooseHeader, type ActiveSnapshot, type SnapshotRef } from "./refresh";
import { headerColumns, writeTyped } from "./typed";

export const MAPPING_DEADLINE_MS = 60 * 60 * 1000;
const PARQUET = "application/vnd.apache.parquet";

/** Hasil satu percobaan; "busy" (versi sedang dipetakan proses lain) ditunda worker, bukan hasil akhir. */
export type MappingRun = MappingOutcome | { outcome: "busy" };

export interface MappingVersionSheet extends VersionSheet {
  headerRow: number;
  rawKey: string;
  typedKey: string | null;
  schemaRevision: number;
}

export interface MappingVersion {
  datasetId: string;
  status: string;
  source: SourceKind;
  sheets: MappingVersionSheet[];
  /** Versi aktif dataset (selain versi ini) beserta skemanya. */
  active: ActiveSnapshot | null;
}

export interface MappingSheetUpdate {
  id: string;
  expectedRevision: number;
  typedKey: string;
  schema: ColumnSchema[];
  schemaRevision: number;
  headerRow: number;
  columns: ColumnMeta[];
}

export interface MappingCommit {
  base: SnapshotRef;
  sheets: MappingSheetUpdate[];
  sheetMap: Record<string, string>;
  actorId: string;
  ip: string;
  meta: { mapped: number; nulls: number; droppedSheets: string[] };
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
}

export interface MappingDeps {
  repo: MappingRepo;
  storage: Pick<IngestStorage, "download" | "upload" | "deletePrefix">;
  lock: LockStore;
  scheduleDelete(key: string, delayMs: number): Promise<void>;
  tmpRoot: string;
  duckMemory?: string;
  renewMs?: number;
}

export interface MappingJob {
  versionId: string;
  input: unknown;
  actorId: string;
  ip: string;
}

class LockLostError extends Error {
  constructor() {
    super("lock pemetaan hilang");
    this.name = "LockLostError";
  }
}

/**
 * Header sheet: baris header aktif (bisa koreksi user) dipilih chooseHeader bila berbeda dari yang
 * tersimpan, tetapi dipakai hanya bila keputusan user (dibuat atas header tersimpan) tetap sah di sana;
 * selain itu header tersimpan beserta rencana yang sudah divalidasi.
 */
async function pickHeader(
  duck: Duck,
  rawPath: string,
  s: MappingVersionSheet,
  p: PairPlan,
): Promise<PairCast & { headerRow: number; columns: ColumnMeta[] }> {
  const stored = { ...p, headerRow: s.headerRow, columns: s.columns };
  if (p.active.headerRow === s.headerRow) return stored;
  const columns = await headerColumns(duck, rawPath, p.active.headerRow, s.colCount);
  const candidates = [
    { headerRow: p.active.headerRow, columns },
    { headerRow: s.headerRow, columns: s.columns },
  ];
  if (chooseHeader(candidates, p.active.schema).headerRow === s.headerRow) return stored;
  const r = planPair(columns, s.colCount, p.active, p.decision);
  return "error" in r ? stored : { ...r, headerRow: p.active.headerRow, columns };
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
    // Percobaan sebelumnya sudah commit lalu gagal sesudahnya (mis. menjadwalkan hapus): selesai.
    if (v.status === "READY") return { outcome: "done" };
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
    const old: string[] = [];
    for (const p of plan.pairs) {
      const s = v.sheets.find((x) => x.id === p.target.id)!;
      const rawPath = join(work, `raw-${s.index}.parquet`);
      const outPath = join(work, `typed-${s.index}.parquet`);
      await deps.storage.download(s.rawKey, rawPath);
      await watch();
      const h = await pickHeader(duck, rawPath, s, p);
      const revision = s.schemaRevision + 1;
      const typed = await writeTyped(duck, {
        rawPath,
        outPath,
        source: v.source,
        headerRow: h.headerRow,
        colCount: s.colCount,
        columns: h.columns,
        overrides: h.overrides,
        absent: h.absent,
        watch,
      });
      const dir = s.rawKey.slice(0, s.rawKey.lastIndexOf("/") + 1);
      const typedKey = `${dir}typed-${revision}-${token.slice(0, 12)}.parquet`;
      await deps.storage.upload(typedKey, outPath, PARQUET);
      uploaded.push(typedKey);
      rmSync(rawPath, { force: true });
      rmSync(outPath, { force: true });
      if (s.typedKey) old.push(s.typedKey);
      updates.push({
        id: s.id,
        expectedRevision: s.schemaRevision,
        typedKey,
        schema: typed.schema,
        schemaRevision: revision,
        headerRow: h.headerRow,
        columns: h.columns,
      });
      await watch();
    }

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
    for (const key of old) await deps.scheduleDelete(key, OLD_TYPED_TTL_MS);
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
    const message = permanentMessage(e);
    if (message !== null) return { outcome: "failed", message };
    throw e; // sementara (storage/DB): BullMQ mengulang, versi tetap AWAITING_MAPPING
  } finally {
    clearInterval(renew);
    for (const key of uploaded) await deps.storage.deletePrefix(key).catch(() => 0);
    duck?.close();
    if (work) rmSync(work, { recursive: true, force: true });
    await releaseLock(deps.lock, lockKey, token).catch(() => false);
  }
}
