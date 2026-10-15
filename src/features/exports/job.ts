/*
 * Job ekspor di worker (T-017). Urutan:
 *  1. baris Export QUEUED/RUNNING → RUNNING (selain itu dilewati: idempoten terhadap ulangan job);
 *  2. akses dicek ulang (repo.widget dengan peran sekarang) + resolver yang sama dengan /api/query —
 *     filter dashboard divalidasi lagi terhadap kolom yang diizinkan (D6), preset tanggal memakai waktu
 *     permintaan (E9), typed.parquet diambil dari versi aktif SAAT INI (E13);
 *  3. parquet diunduh ke direktori kerja; DuckDB ekspor (512 MB, 2 thread, akses berkas hanya direktori
 *     kerja) menghitung baris (> batas → EXPORT_TOO_LARGE, E5) lalu menulis CSV (COPY) atau XLSX
 *     (streaming), semua di bawah tenggat EXPORT_DEADLINE_MS (watched);
 *  4. unggah ke exports/<userId>/<id>.<ext> dengan Content-Type/Disposition, DONE + expiresAt, lalu
 *     jadwalkan hapus objek saat kedaluwarsa.
 * Galat yang dikenal → FAILED dengan pesan per peran (tanpa galat mentah DuckDB/S3); galat lain dilempar
 * (BullMQ mengulang sekali; gagal final → FAILED umum di worker).
 */
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { DuckDBConnection } from "@duckdb/node-api";
import { forRole, resolveWidget, type QueryDeps } from "@/features/query/service";
import type { OutColumn } from "@/features/query/spec";
import { lit, openDuck, watched, type Duck } from "@/lib/duckdb";
import { exportKey } from "@/lib/storage/exports";
import { writeCsv } from "./csv";
import { contentDisposition, sheetName } from "./filename";
import { exportParamsSchema } from "./schema";
import { exportCodeOf, MIME, type ExportFormat, type ExportStatus } from "./service";
import { buildExportCount, buildExportSql, exportColumns } from "./sql";
import { EXPORT_CODES, type ExportFormatInput } from "./types";
import { writeXlsx, type XlsxColumn } from "./xlsx";

export interface ExportJobRow {
  id: string;
  userId: string;
  dashboardId: string | null;
  widgetId: string | null;
  format: ExportFormat;
  status: ExportStatus;
  params: unknown;
  fileName: string | null;
  /** Objek hasil (terisi saat DONE). */
  key: string | null;
  /** Judul widget sekarang (nama sheet XLSX); null bila widget sudah dihapus. */
  title: string | null;
}

export interface ExportJobRepo {
  load(id: string): Promise<ExportJobRow | null>;
  /** QUEUED/RUNNING → RUNNING (+ startedAt); false bila status sudah lain atau baris hilang. */
  start(id: string): Promise<boolean>;
  /** RUNNING → DONE dengan objek + kedaluwarsa; false bila baris hilang/berubah (objek dihapus pemanggil). */
  finish(
    id: string,
    done: { key: string; rows: number; bytes: number; finishedAt: Date; expiresAt: Date },
  ): Promise<boolean>;
  /** QUEUED/RUNNING → FAILED (pesan sudah aman untuk user). */
  fail(id: string, code: string, message: string): Promise<void>;
  /** Baris masih ada (user/ekspor belum dihapus) — dipanggil watchdog. */
  exists(id: string): Promise<boolean>;
}

export interface ExportStorage {
  download(key: string, dest: string, signal?: AbortSignal): Promise<unknown>;
  upload(
    key: string,
    path: string,
    contentType: string,
    opts: { contentDisposition?: string },
  ): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface ExportJobDeps {
  repo: ExportJobRepo;
  query: Pick<QueryDeps, "repo">;
  storage: ExportStorage;
  /** Jadwalkan hapus objek setelah `delayMs` (job maintenance delete-export). */
  scheduleDelete(exportId: string, key: string, delayMs: number): Promise<void>;
  tmpRoot: string;
  maxRows: number;
  ttlMs: number;
  deadlineMs: number;
  now?: () => Date;
  /** memory_limit DuckDB ekspor (default 512MB, E12). */
  duckMemory?: string;
}

export type ExportOutcome =
  | { outcome: "done"; rows: number; bytes: number }
  | { outcome: "failed"; code: string }
  | { outcome: "skipped" };

class ExportDeadlineError extends Error {
  constructor() {
    super("tenggat ekspor terlewati");
    this.name = "ExportDeadlineError";
  }
}

class ExportGoneError extends Error {
  constructor() {
    super("ekspor dihapus saat diproses");
    this.name = "ExportGoneError";
  }
}

/** Awalan direktori kerja job ekspor di tmpRoot worker. */
const WORK_PREFIX = "export-";

/** Sisa direktori kerja ekspor dari proses yang mati (dipanggil saat worker mulai). */
export function removeStaleExportDirs(tmpRoot: string): number {
  let n = 0;
  for (const name of readdirSync(tmpRoot)) {
    if (!name.startsWith(WORK_PREFIX)) continue;
    rmSync(join(tmpRoot, name), { recursive: true, force: true });
    n++;
  }
  return n;
}

export const tooLargeMessage = (n: number, max: number) =>
  `Hasil ${n.toLocaleString("id-ID")} baris melebihi batas ${max.toLocaleString("id-ID")} baris. Persempit filter lalu ekspor lagi.`;
export const TIMEOUT_MESSAGE = "Ekspor melebihi batas waktu. Persempit filter lalu ekspor lagi.";
const GONE_MESSAGE = "Widget tidak ditemukan atau akses ke dashboard sudah dicabut.";
const HEAVY_MESSAGE =
  "Ekspor terlalu berat untuk diproses. Persempit filter atau kurangi kolom, lalu ekspor lagi.";

/** Jenis sel XLSX per tipe kolom keluaran. */
export function xlsxColumn(c: OutColumn): XlsxColumn {
  switch (c.type) {
    case "text":
      return { label: c.label, kind: "text" };
    case "boolean":
      return { label: c.label, kind: "boolean" };
    case "date":
      return { label: c.label, kind: "date" };
    case "timestamp":
      return { label: c.label, kind: "timestamp" };
    case "duration":
      return { label: c.label, kind: "duration" };
    default:
      return { label: c.label, kind: "number" };
  }
}

/**
 * DuckDB khusus job ekspor: memori kecil (worker juga menjalankan ingest/recast, risiko D7), spill ke
 * direktori kerja, dan akses berkas dikunci ke direktori kerja (berbeda dengan openDuck biasa) — SQL
 * hanya berisi identifier program + nilai terikat, tapi COPY TO tetap tidak bisa menulis ke luar.
 */
export async function openExportDuck(work: string, memoryLimit = "512MB"): Promise<Duck> {
  const duck = await openDuck({
    path: ":memory:",
    tmpDir: work,
    memoryLimit,
    threads: 2,
    maxTempSize: "4GB",
  });
  try {
    await duck.conn.run(
      `SET allowed_directories = [${lit(work.endsWith("/") ? work : `${work}/`)}]`,
    );
    await duck.conn.run("SET enable_external_access = false");
    await duck.conn.run("SET lock_configuration = true");
  } catch (e) {
    duck.close();
    throw e;
  }
  return duck;
}

async function countRows(
  conn: DuckDBConnection,
  sql: string,
  params: Record<string, string | number | boolean>,
) {
  const r = await conn.runAndReadAll(sql, params);
  return Number(r.getRows()[0]?.[0] ?? 0);
}

export async function runExportJob(exportId: string, deps: ExportJobDeps): Promise<ExportOutcome> {
  const { repo } = deps;
  const row = await repo.load(exportId);
  if (!row || (row.status !== "QUEUED" && row.status !== "RUNNING")) return { outcome: "skipped" };
  const failWith = async (code: string, message: string): Promise<ExportOutcome> => {
    await repo.fail(row.id, code, message);
    return { outcome: "failed", code };
  };
  const ext: ExportFormatInput | null =
    row.format === "CSV" ? "csv" : row.format === "XLSX" ? "xlsx" : null;
  if (!ext || !row.widgetId || !row.dashboardId) {
    return failWith(EXPORT_CODES.NOT_FOUND, GONE_MESSAGE);
  }
  const params = exportParamsSchema.safeParse(row.params);
  if (!params.success) return failWith(EXPORT_CODES.INVALID, "Parameter ekspor tidak valid.");
  if (!(await repo.start(row.id))) return { outcome: "skipped" };

  // Akses dicek ulang dengan peran SEKARANG (pencabutan setelah permintaan berlaku di sini).
  const w = await deps.query.repo.widget(row.userId, row.widgetId);
  if (!w || w.dashboardId !== row.dashboardId)
    return failWith(EXPORT_CODES.NOT_FOUND, GONE_MESSAGE);
  const requestedAt = new Date(params.data.requestedAt);
  const resolved = await resolveWidget(
    w,
    { dashboardFilters: params.data.dashboardFilters, sort: params.data.sort, page: 0 },
    { repo: deps.query.repo, now: () => requestedAt },
  );
  if (!resolved.ok) {
    const f = forRole(w.role, resolved);
    return failWith(exportCodeOf(f.code), f.message);
  }

  const deadline = Date.now() + deps.deadlineMs;
  const key = exportKey(row.userId, row.id, ext);
  const work = mkdtempSync(join(deps.tmpRoot, WORK_PREFIX));
  let duck: Duck | null = null;
  let uploaded = false;
  try {
    const src = join(work, "typed.parquet");
    await deps.storage.download(
      resolved.sheet.typedKey,
      src,
      AbortSignal.timeout(Math.max(1, deadline - Date.now())),
    );
    if (Date.now() > deadline) throw new ExportDeadlineError();
    const d = (duck = await openExportDuck(work, deps.duckMemory));
    const watch = async () => {
      if (Date.now() > deadline) throw new ExportDeadlineError();
      if (!(await repo.exists(row.id))) throw new ExportGoneError();
    };

    const count = buildExportCount(resolved, src);
    if (count) {
      const n = await watched(d, watch, () => countRows(d.conn, count.sql, count.params));
      if (n > deps.maxRows) {
        return await failWith(EXPORT_CODES.EXPORT_TOO_LARGE, tooLargeMessage(n, deps.maxRows));
      }
    }
    const built = buildExportSql(resolved, src, ext, deps.maxRows);
    const cols = exportColumns(resolved);
    const out = join(work, `ekspor.${ext}`);
    const rows = await watched(d, watch, async () => {
      if (ext === "csv") {
        return writeCsv(d.conn, built, cols, join(work, "body.csv"), out);
      }
      const result = await d.conn.stream(built.sql, built.params);
      return writeXlsx(
        out,
        { sheetName: sheetName(row.title ?? ""), columns: cols.map(xlsxColumn) },
        result.yieldRowsJs() as AsyncIterable<unknown[][]>,
      );
    });
    await watch();
    const bytes = (await stat(out)).size;
    const fileName = row.fileName ?? `ekspor.${ext}`;
    await deps.storage.upload(key, out, MIME[ext], {
      contentDisposition: contentDisposition(fileName),
    });
    uploaded = true;
    const finishedAt = deps.now?.() ?? new Date();
    const expiresAt = new Date(finishedAt.getTime() + deps.ttlMs);
    // Baris hilang/berubah (user dihapus, atau run lain sudah DONE) → finally memutuskan hapus objek.
    if (!(await repo.finish(row.id, { key, rows, bytes, finishedAt, expiresAt }))) {
      return { outcome: "skipped" };
    }
    uploaded = false;
    // Gagal menjadwalkan tidak menggagalkan ekspor: sapuan export-cleanup tiap 5 menit menutupnya.
    await deps.scheduleDelete(row.id, key, deps.ttlMs).catch(() => {});
    return { outcome: "done", rows, bytes };
  } catch (e) {
    if (e instanceof ExportGoneError) return { outcome: "skipped" };
    if (e instanceof ExportDeadlineError || Date.now() > deadline) {
      return failWith(EXPORT_CODES.EXPORT_TIMEOUT, TIMEOUT_MESSAGE);
    }
    if (/Out of Memory Error/i.test(e instanceof Error ? e.message : String(e))) {
      return failWith(EXPORT_CODES.EXPORT_FAILED, HEAVY_MESSAGE);
    }
    throw e;
  } finally {
    if (uploaded && !(await referencedByDone(repo, row.id, key))) {
      await deps.storage.remove(key).catch(() => {});
    }
    duck?.close();
    rmSync(work, { recursive: true, force: true });
  }
}

/**
 * Objek `key` dipakai baris DONE (review T-017 INT-1)? Semua run ekspor yang sama mengunggah ke key yang
 * sama: run yang kalah/tumpang tindih (lock BullMQ lepas → replika lain menjalankan ulang) atau finish()
 * yang sudah commit tapi koneksinya putus tidak boleh menghapus objek yang ditunjuk baris DONE. Baca ulang
 * gagal → dianggap dipakai (objek dibiarkan; sapuan yatim export-cleanup > 2 jam yang membereskannya).
 */
async function referencedByDone(repo: ExportJobRepo, id: string, key: string): Promise<boolean> {
  try {
    const cur = await repo.load(id);
    return cur?.status === "DONE" && cur.key === key;
  } catch {
    return true;
  }
}
