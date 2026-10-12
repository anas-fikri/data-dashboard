/*
 * Recast (T-007; dipicu koreksi skema T-008): raw.parquet → typed-<rev+1>.parquet dengan pilihan user,
 * tanpa membaca file asli. Satu recast per sheet (lock Redis recast:<sheetId>); pointer typedKey
 * diganti hanya setelah file baru lengkap dan revisi belum berubah; file lama dihapus 1 jam kemudian
 * (job, bukan lifecycle) agar query yang sedang membaca revisi lama tetap selesai.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { z } from "zod";
import { join } from "node:path";
import { lit, openDuck, type Duck } from "@/lib/duckdb";
import { acquireLock, releaseLock, type LockStore } from "@/lib/lock";
import type { RawValue } from "@/lib/xlsx/types";
import { columnNames, type ColumnMeta } from "./header";
import type { ColumnSchema, SourceKind } from "./infer";
import { DatasetGoneError, type IngestStorage } from "./ingest";
import { writeTyped, type ColumnOverride } from "./typed";

export const RECAST_LOCK_MS = 30 * 60 * 1000;
export const OLD_TYPED_TTL_MS = 60 * 60 * 1000;
const PARQUET = "application/vnd.apache.parquet";

export interface RecastInput {
  /** Baris header baru (1-based); berbeda dari sekarang → nama dari baris itu + inferensi ulang. */
  headerRow?: number;
  /** Perubahan per kolom (nama tampil, tipe, locale, format tanggal, sembunyikan). */
  columns?: ColumnOverride[];
}

export interface RecastSheet {
  versionId: string;
  rawKey: string;
  typedKey: string | null;
  schemaRevision: number;
  headerRow: number;
  colCount: number;
  columns: ColumnMeta[];
  schema: ColumnSchema[] | null;
  source: SourceKind;
}

export interface RecastRepo {
  loadSheet(sheetId: string): Promise<RecastSheet | null>;
  /**
   * Ganti pointer typed bila schemaRevision masih `expectedRevision` (optimistic). false = revisi
   * sudah berubah atau sheet hilang.
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
    },
  ): Promise<boolean>;
}

export interface RecastDeps {
  repo: RecastRepo;
  storage: Pick<IngestStorage, "download" | "upload" | "deletePrefix">;
  lock: LockStore;
  /** Jadwalkan penghapusan objek (job tertunda). */
  scheduleDelete(key: string, delayMs: number): Promise<void>;
  tmpRoot: string;
  duckMemory?: string;
  /** Dipanggil berkala selama query panjang (mis. cek sheet masih ada); melempar → berhenti. */
  watch?: () => Promise<void>;
}

export type RecastOutcome =
  | { outcome: "done"; revision: number; schema: ColumnSchema[] }
  | { outcome: "busy" }
  | { outcome: "gone" }
  | { outcome: "stale" }
  | { outcome: "invalid"; message: string };

/** Batas baris Excel; headerRow di luar ini pasti tidak ada di raw. */
const MAX_ROW = 1_048_576;

/**
 * Input recast berasal dari user (T-008) dan ikut menentukan SQL: hanya enum dan angka bulat dalam
 * rentang yang diterima (nama tampil tidak pernah masuk SQL). Divalidasi di sini sebagai pertahanan
 * berlapis selain validasi di API.
 */
export function parseRecastInput(input: unknown, colCount: number) {
  const column = z
    .object({
      pos: z.number().int().min(1).max(colCount),
      name: z.string().trim().min(1).max(120).optional(),
      type: z
        .enum(["integer", "decimal", "date", "timestamp", "duration", "boolean", "text"])
        .optional(),
      numberLocale: z.enum(["id", "us"]).optional(),
      dateFormat: z
        .enum([
          "yyyy-mm-dd",
          "dd/mm/yyyy",
          "dd-mm-yyyy",
          "dd.mm.yyyy",
          "yyyy/mm/dd",
          "mm/dd/yyyy",
          "serial",
        ])
        .optional(),
      hidden: z.boolean().optional(),
    })
    .strict();
  return z
    .object({
      headerRow: z.number().int().min(1).max(MAX_ROW).optional(),
      columns: z.array(column).max(colCount).optional(),
    })
    .strict()
    .safeParse(input);
}

/** Pilihan yang sudah berlaku di skema sekarang, sebagai dasar override recast berikutnya. */
function currentChoices(schema: ColumnSchema[]): ColumnOverride[] {
  return schema.map((c) => ({
    pos: c.pos,
    name: c.name,
    type: c.type,
    numberLocale: c.numberLocale,
    dateFormat: c.dateFormat,
    hidden: c.hidden,
  }));
}

function merge(base: ColumnOverride[], changes: ColumnOverride[] = []): ColumnOverride[] {
  const m = new Map(base.map((o) => [o.pos, o]));
  for (const c of changes) m.set(c.pos, { ...m.get(c.pos), ...c });
  return [...m.values()];
}

async function headerValues(duck: Duck, rawPath: string, row: number): Promise<RawValue[]> {
  const r = await duck.conn.runAndReadAll(
    `SELECT * EXCLUDE (_row) FROM read_parquet(${lit(rawPath)}) WHERE _row = ${Math.trunc(row)}`,
  );
  return ((r.getRowsJS()[0] as RawValue[] | undefined) ?? []).map((v) => v ?? null);
}

export async function recastSheet(
  sheetId: string,
  rawInput: unknown,
  deps: RecastDeps,
): Promise<RecastOutcome> {
  const lockKey = `recast:${sheetId}`;
  const token = await acquireLock(deps.lock, lockKey, RECAST_LOCK_MS);
  if (!token) return { outcome: "busy" };
  let work: string | null = null;
  let duck: Duck | null = null;
  try {
    const s = await deps.repo.loadSheet(sheetId);
    if (!s) return { outcome: "gone" };
    const parsed = parseRecastInput(rawInput, s.colCount);
    if (!parsed.success) {
      return {
        outcome: "invalid",
        message: parsed.error.issues[0]?.message ?? "input tidak valid",
      };
    }
    const input: RecastInput = parsed.data;
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
      ? columnNames(await headerValues(duck, rawPath, headerRow), s.colCount)
      : s.columns;
    const base = newHeader || !s.schema ? [] : currentChoices(s.schema);
    const revision = s.schemaRevision + 1;
    const outPath = join(work, `typed-${revision}.parquet`);
    const typed = await writeTyped(duck, {
      rawPath,
      outPath,
      source: s.source,
      headerRow,
      colCount: s.colCount,
      columns,
      overrides: merge(base, input.columns),
      watch: deps.watch ?? (async () => {}),
    });

    const dir = s.rawKey.slice(0, s.rawKey.lastIndexOf("/") + 1);
    const typedKey = `${dir}typed-${revision}.parquet`;
    await deps.storage.upload(typedKey, outPath, PARQUET);
    const swapped = await deps.repo.swapTyped(sheetId, s.schemaRevision, {
      typedKey,
      schema: typed.schema,
      schemaRevision: revision,
      headerRow,
      columns,
    });
    if (!swapped) {
      await deps.storage.deletePrefix(typedKey).catch(() => 0);
      return (await deps.repo.loadSheet(sheetId)) ? { outcome: "stale" } : { outcome: "gone" };
    }
    if (s.typedKey) await deps.scheduleDelete(s.typedKey, OLD_TYPED_TTL_MS);
    return { outcome: "done", revision, schema: typed.schema };
  } catch (e) {
    if (e instanceof DatasetGoneError) return { outcome: "gone" };
    throw e;
  } finally {
    duck?.close();
    if (work) rmSync(work, { recursive: true, force: true });
    await releaseLock(deps.lock, lockKey, token).catch(() => false);
  }
}
