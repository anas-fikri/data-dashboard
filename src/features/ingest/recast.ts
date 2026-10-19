/*
 * Recast (T-007; dipicu koreksi skema T-008): raw.parquet → typed-<rev+1>-<token>.parquet dengan
 * pilihan user, tanpa membaca file asli.
 *  - Satu recast per sheet: lock Redis recast:<sheetId> berumur pendek yang diperpanjang selama
 *    berjalan (worker mati → lock lepas ≤ 3 menit); lock hilang → recast berhenti tanpa mengganti apa
 *    pun. Deadline 20 menit < umur lock yang terus diperpanjang.
 *  - Kunci file unik per percobaan: percobaan yang kalah hanya menghapus file miliknya sendiri.
 *  - Pointer typedKey diganti hanya setelah file baru lengkap dan revisi belum berubah; file lama
 *    dihapus 1 jam kemudian (job) agar query yang sedang membaca revisi lama tetap selesai.
 *  - Kolom kosong (absent, T-014) selalu dibawa, juga saat baris header diganti: edit nama/tipe/format/
 *    sembunyi berlaku; ganti tipe hanya mengganti tipe CAST NULL-nya.
 */
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { openDuck, type Duck } from "@/lib/duckdb";
import { acquireLock, extendLock, releaseLock, type LockStore } from "@/lib/lock";
import type { ColumnMeta } from "./header";
import type { ColumnSchema, SourceKind } from "./infer";
import { DatasetGoneError, DeadlineError, type TypedStorage } from "./ingest";
import {
  maxSchemaPos,
  parseRecastInput,
  type RecastInput,
  type RecastOutcome,
} from "./recast-input";
import { IntegrityError } from "@/features/versions/integrity-check";
import {
  choiceOf,
  headerColumns,
  typedFileProblems,
  writeTyped,
  type AbsentColumn,
  type ColumnOverride,
} from "./typed";

export { parseRecastInput, type RecastInput, type RecastOutcome };

export const RECAST_LOCK_MS = 3 * 60 * 1000;
export const RECAST_RENEW_MS = 60 * 1000;
export const RECAST_DEADLINE_MS = 20 * 60 * 1000;
const PARQUET = "application/vnd.apache.parquet";

export interface RecastSheet {
  versionId: string;
  /** Status versi: hanya READY yang boleh di-recast (ingest masih menulis typed-1 → "busy"). */
  versionStatus: string;
  rawKey: string;
  typedKey: string | null;
  schemaRevision: number;
  headerRow: number;
  colCount: number;
  columns: ColumnMeta[];
  schema: ColumnSchema[] | null;
  source: SourceKind;
  /** Awal `_row` segmen manifest sheet (ADR-0008): sama di setiap recast. 0 = segmen legacy. */
  rowBase?: bigint;
}

export interface RecastRepo {
  loadSheet(sheetId: string): Promise<RecastSheet | null>;
  /**
   * Ganti pointer typed bila schemaRevision masih `expectedRevision` (optimistic) dan versi sheet masih
   * versi aktif dataset (T-013: versi refresh tidak boleh aktif tanpa koreksi ini). false = revisi
   * sudah berubah, versi tidak lagi aktif, atau sheet hilang.
   */
  swapTyped(
    sheetId: string,
    expectedRevision: number,
    next: {
      typedKey: string;
      schema: ColumnSchema[];
      schemaRevision: number;
      headerRow: number;
      columns: ColumnMeta[];
      /** Baris data file (T-038). */
      dataRows: number;
      /** Ukuran file (T-039). */
      typedBytes: number;
    },
  ): Promise<boolean>;
}

export interface RecastDeps {
  repo: RecastRepo;
  storage: Pick<TypedStorage, "download" | "upload" | "deleteObject">;
  lock: LockStore;
  tmpRoot: string;
  duckMemory?: string;
  /** Interval perpanjangan lock (default RECAST_RENEW_MS; uji memakai interval pendek). */
  renewMs?: number;
  /** Dipanggil berkala selama query panjang (mis. cek sheet masih ada); melempar → berhenti. */
  watch?: () => Promise<void>;
}

/** Pilihan yang sudah berlaku di skema sekarang, sebagai dasar override recast berikutnya. */
function currentChoices(schema: ColumnSchema[]): ColumnOverride[] {
  return schema.map((c) => choiceOf(c));
}

function merge(base: ColumnOverride[], changes: ColumnOverride[] = []): ColumnOverride[] {
  const m = new Map(base.map((o) => [o.pos, o]));
  for (const c of changes) m.set(c.pos, { ...m.get(c.pos), ...c });
  return [...m.values()];
}

/** Kolom kosong skema sekarang (urut posisi) dengan override yang berlaku untuk posisinya. */
function carryAbsent(schema: ColumnSchema[] | null, overrides: ColumnOverride[]): AbsentColumn[] {
  const by = new Map(overrides.map((o) => [o.pos, o]));
  return (schema ?? [])
    .filter((c) => c.absent)
    .sort((a, b) => a.pos - b.pos)
    .map((c) => {
      const o = by.get(c.pos);
      const type = o?.type ?? c.type;
      return {
        name: o?.name?.trim() || c.name,
        original: c.original,
        type,
        numberLocale: o?.numberLocale ?? c.numberLocale,
        dateFormat: o?.dateFormat ?? c.dateFormat,
        float: type === c.type ? c.float : undefined,
        hidden: o?.hidden ?? c.hidden,
      };
    });
}

class LockLostError extends Error {
  constructor() {
    super("lock recast hilang");
    this.name = "LockLostError";
  }
}

/** Nama tampil akhir yang dipakai lebih dari sekali (tidak peka kapital), atau null. */
function duplicateName(columns: ColumnMeta[], overrides: ColumnOverride[]): string | null {
  const names = new Map(columns.map((c) => [c.pos, c.name]));
  for (const o of overrides) if (o.name?.trim()) names.set(o.pos, o.name.trim());
  const seen = new Set<string>();
  for (const n of names.values()) {
    const k = n.toLowerCase();
    if (seen.has(k)) return n;
    seen.add(k);
  }
  return null;
}

export async function recastSheet(
  sheetId: string,
  rawInput: unknown,
  deps: RecastDeps,
): Promise<RecastOutcome> {
  const lockKey = `recast:${sheetId}`;
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
  const deadline = Date.now() + RECAST_DEADLINE_MS;
  const watch = async () => {
    if (lockLost) throw new LockLostError();
    if (Date.now() > deadline) throw new DeadlineError("recast");
    await deps.watch?.();
  };
  let work: string | null = null;
  let duck: Duck | null = null;
  let uploaded: string | null = null;
  try {
    const s = await deps.repo.loadSheet(sheetId);
    if (!s) return { outcome: "gone" };
    if (s.versionStatus === "UPLOADED" || s.versionStatus === "INGESTING")
      return { outcome: "busy" };
    if (s.versionStatus !== "READY") return { outcome: "gone" };
    const parsed = parseRecastInput(rawInput, maxSchemaPos(s.colCount, s.schema));
    if (!parsed.success) {
      return {
        outcome: "invalid",
        message: parsed.error.issues[0]?.message ?? "input tidak valid",
      };
    }
    const input: RecastInput = parsed.data;
    if (input.baseRevision !== undefined && input.baseRevision !== s.schemaRevision) {
      return { outcome: "stale" };
    }
    work = mkdtempSync(join(deps.tmpRoot, "recast-"));
    const rawPath = join(work, "raw.parquet");
    await deps.storage.download(s.rawKey, rawPath);
    duck = await openDuck({
      path: join(work, "work.duckdb"),
      tmpDir: work,
      memoryLimit: deps.duckMemory,
    });

    const headerRow = input.headerRow ?? s.headerRow;
    const newHeader = headerRow !== s.headerRow;
    // Header baru: rentang data berubah → nama dari baris itu dan inferensi ulang (pilihan lama
    // tidak dibawa); selain itu pilihan yang sudah berlaku tetap dipakai.
    const columns = newHeader
      ? await headerColumns(duck, rawPath, headerRow, s.colCount)
      : s.columns;
    const base = newHeader || !s.schema ? [] : currentChoices(s.schema);
    const overrides = merge(base, input.columns);
    const absent = carryAbsent(s.schema, overrides);
    const absentMeta = absent.map((a, i) => ({ ...a, pos: s.colCount + i + 1 }));
    const dup = duplicateName([...columns, ...absentMeta], overrides);
    if (dup)
      return { outcome: "invalid", message: `Nama kolom "${dup}" dipakai lebih dari sekali.` };
    const revision = s.schemaRevision + 1;
    const outPath = join(work, `typed-${revision}.parquet`);
    const typed = await writeTyped(duck, {
      rawPath,
      outPath,
      source: s.source,
      headerRow,
      colCount: s.colCount,
      columns,
      overrides,
      absent,
      watch,
      rowBase: s.rowBase ?? 0n,
    });
    const bad = await typedFileProblems(duck, outPath, typed.dataRows, "file hasil koreksi");
    if (bad.length) throw new IntegrityError(bad);

    const dir = s.rawKey.slice(0, s.rawKey.lastIndexOf("/") + 1);
    const typedKey = `${dir}typed-${revision}-${token.slice(0, 12)}.parquet`;
    await deps.storage.upload(typedKey, outPath, PARQUET);
    uploaded = typedKey;
    await watch(); // lock masih milik kita tepat sebelum mengganti pointer
    let swapped: boolean;
    try {
      swapped = await deps.repo.swapTyped(sheetId, s.schemaRevision, {
        typedKey,
        schema: typed.schema,
        schemaRevision: revision,
        headerRow,
        columns,
        dataRows: typed.dataRows,
        typedBytes: statSync(outPath).size,
      });
    } catch (e) {
      // UPDATE bisa sudah commit sebelum koneksi putus: jangan hapus file yang mungkin sudah aktif.
      // Bila tidak bisa dipastikan, biarkan (paling buruk objek yatim di prefix versi, ikut terhapus
      // bersama versi/dataset).
      const now = await deps.repo.loadSheet(sheetId).catch(() => undefined);
      if (now === undefined || now?.typedKey === typedKey) uploaded = null;
      throw e;
    }
    if (!swapped) {
      return (await deps.repo.loadSheet(sheetId)) ? { outcome: "stale" } : { outcome: "gone" };
    }
    uploaded = null; // sudah menjadi typed aktif
    // Revisi lama tidak dihapus di sini: tidak lagi dirujuk manifest → disapu GC segmen setelah masa
    // tenggang (T-038), jadi query yang masih membacanya selesai dan rollback tidak kehilangan data.
    return { outcome: "done", revision, schema: typed.schema };
  } catch (e) {
    if (e instanceof DatasetGoneError) return { outcome: "gone" };
    if (e instanceof LockLostError) return { outcome: "busy" };
    if (e instanceof DeadlineError) {
      return { outcome: "failed", message: "Koreksi skema melebihi 20 menit. Coba lagi nanti." };
    }
    if (e instanceof IntegrityError) {
      return {
        outcome: "failed",
        message: `${e.message} Skema tidak diubah. Coba lagi; bila terulang, hubungi admin.`,
      };
    }
    throw e;
  } finally {
    clearInterval(renew);
    // File percobaan ini yang tidak menjadi typed aktif (kunci unik: tidak pernah milik recast lain).
    if (uploaded) await deps.storage.deleteObject(uploaded).catch(() => {});
    duck?.close();
    if (work) rmSync(work, { recursive: true, force: true });
    await releaseLock(deps.lock, lockKey, token).catch(() => false);
  }
}
