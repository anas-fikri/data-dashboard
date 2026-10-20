/*
 * Job ekspor di worker (T-017). Urutan:
 *  1. baris Export QUEUED/RUNNING → RUNNING (selain itu dilewati: idempoten terhadap ulangan job);
 *  2. akses dicek ulang (repo.widget dengan peran sekarang) + resolver yang sama dengan /api/query —
 *     filter dashboard divalidasi lagi terhadap kolom yang diizinkan (D6), preset tanggal memakai waktu
 *     permintaan (E9), typed.parquet diambil dari versi aktif SAAT INI (E13);
 *  3. parquet diunduh ke direktori kerja; DuckDB ekspor (EXPORT_DUCKDB_MEMORY, 2 thread, akses berkas hanya direktori
 *     kerja) menghitung baris (> batas → EXPORT_TOO_LARGE, E5) lalu menulis CSV (COPY) atau XLSX
 *     (streaming), semua di bawah tenggat EXPORT_DEADLINE_MS (watched);
 *  4. unggah ke exports/<userId>/<id>.<ext> dengan Content-Type/Disposition, DONE + expiresAt, lalu
 *     jadwalkan hapus objek saat kedaluwarsa.
 * T-046: baris dengan sheetId = "Unduh tampilan" Lihat data — langkah 2 memakai resolver grid (pemilik/
 * editor, versi aktif, tampilan dicocokkan lagi dengan skema) dan SQL sheet-sql.ts (baris + urutan sama
 * dengan grid); langkah 3–4 sama. Batas baris XLSX = min(EXPORT_MAX_ROWS, 1.048.575).
 * Galat yang dikenal → FAILED dengan pesan per peran (tanpa galat mentah DuckDB/S3); galat lain dilempar
 * (BullMQ mengulang sekali; gagal final → FAILED umum di worker).
 */
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { DuckDBConnection, DuckDBValue } from "@duckdb/node-api";
import { buildGridCountSql, isPlainWindow } from "@/features/query/grid";
import type { GridRepo } from "@/features/query/grid-service";
import {
  forRole,
  resolveWidget,
  sourceOf,
  type QueryDeps,
  type ResolvedWidget,
} from "@/features/query/service";
import { sheetSource, sourceKeys, withSegments, type ParquetSource } from "@/features/query/source";
import type { BuiltSql } from "@/features/query/sql";
import type { OutColumn } from "@/features/query/spec";
import { lit, openDuck, watched, type Duck } from "@/lib/duckdb";
import { exportKey } from "@/lib/storage/exports";
import { writeCsv } from "./csv";
import { contentDisposition, sheetName } from "./filename";
import { writePivotExport } from "./pivot";
import { exportParamsSchema, sheetExportParamsSchema } from "./schema";
import {
  exportCodeOf,
  MIME,
  resolveSheetView,
  type ExportFormat,
  type ExportStatus,
} from "./service";
import {
  buildSheetExportSegmentSql,
  buildSheetExportSql,
  segmentOrdered,
  sheetExportColumns,
} from "./sheet-sql";
import { buildExportCount, buildExportSql, exportColumns } from "./sql";
import { EXPORT_CODES, XLSX_MAX_DATA_ROWS, type ExportFormatInput } from "./types";
import { writeXlsx, type XlsxColumn } from "./xlsx";

export interface ExportJobRow {
  id: string;
  userId: string;
  dashboardId: string | null;
  widgetId: string | null;
  /** Ekspor tampilan Lihat data (T-046); undefined di baris uji lama = widget. */
  sheetId?: string | null;
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
    /** rows null untuk PDF (T-018: bukan file baris). */
    done: { key: string; rows: number | null; bytes: number; finishedAt: Date; expiresAt: Date },
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
  /** Resolver sheet "Lihat data" (T-046): wajib untuk ekspor tampilan. */
  grid?: GridRepo;
  storage: ExportStorage;
  /** Jadwalkan hapus objek setelah `delayMs` (job maintenance delete-export). */
  scheduleDelete(exportId: string, key: string, delayMs: number): Promise<void>;
  tmpRoot: string;
  maxRows: number;
  ttlMs: number;
  deadlineMs: number;
  now?: () => Date;
  /** memory_limit DuckDB ekspor (env EXPORT_DUCKDB_MEMORY, default 768MB — review INT-R2-1). */
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
const INVALID_PARAMS = "Parameter ekspor tidak valid.";
const HEAVY_MESSAGE =
  "Ekspor terlalu berat untuk diproses. Persempit filter atau kurangi kolom, lalu ekspor lagi.";

/** Jenis sel XLSX per tipe kolom keluaran. */
export function xlsxColumn(c: Pick<OutColumn, "label" | "type">): XlsxColumn {
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
export async function openExportDuck(work: string, memoryLimit = "768MB"): Promise<Duck> {
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

/**
 * Ukuran row group parquet kerja = row group typed.parquet sumber (ingest sudah menyesuaikannya dengan
 * lebar baris): bawaan DuckDB 122.880 baris kehabisan memori di 768MB untuk tabel teks panjang (±4,7 rb
 * karakter per baris), sedangkan ROW_GROUP_SIZE_BYTES ditolak saat preserve_insertion_order aktif
 * (review T-017 INT-R4-1).
 */
export async function rowGroupOf(conn: DuckDBConnection, src: string): Promise<number> {
  const r = await conn.runAndReadAll(
    `SELECT max(row_group_num_rows) FROM parquet_metadata(${lit(src)})`,
  );
  const n = Number(r.getRows()[0]?.[0] ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 122_880) : 122_880;
}

async function countRows(conn: DuckDBConnection, sql: string, params: Record<string, DuckDBValue>) {
  const r = await conn.runAndReadAll(sql, params);
  return Number(r.getRows()[0]?.[0] ?? 0);
}

/** Penghasil isi file: tabel pivot tersusun, atau SELECT baris (widget tabel/KPI/grafik, tampilan). */
type Producer =
  | { kind: "pivot"; resolved: ResolvedWidget }
  | {
      kind: "rows";
      /** Jumlah baris sebelum menulis (null = sudah dibatasi rencana). */
      count(src: string, seg: (b: BuiltSql) => BuiltSql): BuiltSql | null;
      select(
        src: string,
        seg: (b: BuiltSql) => BuiltSql,
        paths: string[],
        maxRows: number,
      ): BuiltSql;
      cols: Pick<OutColumn, "key" | "label" | "type">[];
      tooLarge(n: number, max: number): string;
    };

interface Prepared {
  source: ParquetSource;
  /** Nama sheet XLSX. */
  title: string;
  producer: Producer;
}

type Prep = { ok: true; prepared: Prepared } | { ok: false; code: string; message: string };

/** Batas baris efektif: XLSX tidak pernah lebih dari 1.048.575 baris data (satu sheet Excel). */
export const maxRowsFor = (ext: ExportFormatInput, maxRows: number) =>
  ext === "xlsx" ? Math.min(maxRows, XLSX_MAX_DATA_ROWS) : maxRows;

/** Pesan tampilan Lihat data melewati batas (T-046 AC2): sebut batasnya + sarankan saringan. */
export function sheetTooLargeMessage(n: number, max: number, ext: ExportFormatInput): string {
  const f = (x: number) => x.toLocaleString("id-ID");
  const excel =
    ext === "xlsx" ? ` File Excel (XLSX) paling banyak ${f(XLSX_MAX_DATA_ROWS)} baris data.` : "";
  return `Tampilan ini ${f(n)} baris, melebihi batas unduhan ${f(max)} baris.${excel} Saring data dulu lalu unduh lagi; file tidak pernah dipotong.`;
}

/** Ekspor widget (T-017): akses dicek ulang dengan peran SEKARANG + resolver /api/query. */
async function prepareWidget(
  row: ExportJobRow & { widgetId: string; dashboardId: string },
  ext: ExportFormatInput,
  deps: ExportJobDeps,
): Promise<Prep> {
  const params = exportParamsSchema.safeParse(row.params);
  if (!params.success) return { ok: false, code: EXPORT_CODES.INVALID, message: INVALID_PARAMS };
  const w = await deps.query.repo.widget(row.userId, row.widgetId);
  if (!w || w.dashboardId !== row.dashboardId) {
    return { ok: false, code: EXPORT_CODES.NOT_FOUND, message: GONE_MESSAGE };
  }
  const requestedAt = new Date(params.data.requestedAt);
  const resolved = await resolveWidget(
    w,
    {
      dashboardFilters: params.data.dashboardFilters,
      pivotFilters: params.data.pivotFilters,
      sort: params.data.sort,
      page: 0,
    },
    { repo: deps.query.repo, now: () => requestedAt },
  );
  if (!resolved.ok) {
    const f = forRole(w.role, resolved);
    return { ok: false, code: exportCodeOf(f.code), message: f.message };
  }
  const producer: Producer =
    resolved.planned.kind === "pivot"
      ? { kind: "pivot", resolved }
      : {
          kind: "rows",
          count: (src, seg) => {
            const c = buildExportCount(resolved, src);
            return c && seg(c);
          },
          select: (src, seg, _paths, max) => seg(buildExportSql(resolved, src, ext, max)),
          cols: exportColumns(resolved),
          tooLarge: tooLargeMessage,
        };
  return {
    ok: true,
    prepared: { source: sourceOf(resolved.sheet), title: row.title ?? "", producer },
  };
}

/**
 * Ekspor tampilan Lihat data (T-046): akses pemilik/editor + versi aktif dicek ulang SEKARANG (viewer /
 * akses dicabut → FORBIDDEN, versi berganti → VERSION_CHANGED — baris dua versi tidak pernah tercampur),
 * tampilan dicocokkan lagi dengan skema, preset tanggal saringan memakai waktu permintaan.
 */
async function prepareSheet(
  row: ExportJobRow & { sheetId: string },
  ext: ExportFormatInput,
  deps: ExportJobDeps,
): Promise<Prep> {
  const params = sheetExportParamsSchema.safeParse(row.params);
  if (!params.success || !deps.grid) {
    return { ok: false, code: EXPORT_CODES.INVALID, message: INVALID_PARAMS };
  }
  const requestedAt = new Date(params.data.requestedAt);
  const v = await resolveSheetView(row.userId, row.sheetId, params.data, deps.grid, requestedAt);
  if (!v.ok) return { ok: false, code: v.code, message: v.message };
  const { sheet, plan } = v;
  const segs = sheet.segments;
  const source = sheetSource({
    typedKey: sheet.typedKey!,
    schema: sheet.schema,
    segments: segs.map(({ typedKey, legacyRow, columns }) => ({ typedKey, legacyRow, columns })),
  });
  const names = new Map(sheet.schema.map((c) => [c.pos, c.name]));
  const bySegment = typeof source !== "string" && segmentOrdered(plan, segs);
  return {
    ok: true,
    prepared: {
      source,
      title: sheet.title ?? "",
      producer: {
        kind: "rows",
        count: (src, seg) => seg(buildGridCountSql(isPlainWindow(plan) ? null : plan, src)),
        select: (src, seg, paths, max) =>
          bySegment && typeof source !== "string"
            ? buildSheetExportSegmentSql(plan, source.files, paths, ext, max)
            : seg(buildSheetExportSql(plan, src, ext, max)),
        cols: sheetExportColumns(plan, names),
        tooLarge: (n, max) => sheetTooLargeMessage(n, max, ext),
      },
    },
  };
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
  const sheetId = row.sheetId ?? null;
  const widget = row.widgetId && row.dashboardId ? row.widgetId : null;
  if (!ext || (!sheetId && !widget)) return failWith(EXPORT_CODES.NOT_FOUND, GONE_MESSAGE);
  // Parameter rusak ditolak sebelum RUNNING (baris lama/rusak → gagal bersih, bukan galat DuckDB).
  const paramsOk = sheetId
    ? sheetExportParamsSchema.safeParse(row.params).success
    : exportParamsSchema.safeParse(row.params).success;
  if (!paramsOk) return failWith(EXPORT_CODES.INVALID, INVALID_PARAMS);
  if (!(await repo.start(row.id))) return { outcome: "skipped" };

  // Akses dicek ulang dengan peran SEKARANG (pencabutan setelah permintaan berlaku di sini).
  const prep = sheetId
    ? await prepareSheet({ ...row, sheetId }, ext, deps)
    : await prepareWidget(
        { ...row, widgetId: row.widgetId!, dashboardId: row.dashboardId! },
        ext,
        deps,
      );
  if (!prep.ok) return failWith(prep.code, prep.message);
  const { source, title, producer } = prep.prepared;
  const maxRows = maxRowsFor(ext, deps.maxRows);

  const deadline = Date.now() + deps.deadlineMs;
  const key = exportKey(row.userId, row.id, ext);
  const work = mkdtempSync(join(deps.tmpRoot, WORK_PREFIX));
  let duck: Duck | null = null;
  let uploaded = false;
  try {
    // Semua segmen manifest sheet (T-037) diunduh ke direktori kerja; satu segmen = typed.parquet.
    const keys = sourceKeys(source);
    const paths = keys.map((_, i) =>
      join(work, keys.length === 1 ? "typed.parquet" : `typed-${i}.parquet`),
    );
    for (const [i, k] of keys.entries()) {
      await deps.storage.download(
        k,
        paths[i]!,
        AbortSignal.timeout(Math.max(1, deadline - Date.now())),
      );
      if (Date.now() > deadline) throw new ExportDeadlineError();
    }
    const src = paths[0]!;
    const seg = (b: BuiltSql): BuiltSql =>
      typeof source === "string" ? b : withSegments(b, source.files, paths, source.schema);
    const d = (duck = await openExportDuck(work, deps.duckMemory));
    const watch = async () => {
      if (Date.now() > deadline) throw new ExportDeadlineError();
      if (!(await repo.exists(row.id))) throw new ExportGoneError();
    };

    const out = join(work, `ekspor.${ext}`);
    let rows: number;
    if (producer.kind === "pivot") {
      // Pivot (T-9bc2): tabel tersusun seperti layar (batas tampil 200 × 40), bukan SELECT datar.
      const resolved = producer.resolved;
      rows = await watched(d, watch, () =>
        writePivotExport(d.conn, resolved, src, ext, out, sheetName(title), seg),
      );
    } else {
      const count = producer.count(src, seg);
      if (count) {
        const n = await watched(d, watch, () => countRows(d.conn, count.sql, count.params));
        if (n > maxRows) {
          return await failWith(EXPORT_CODES.EXPORT_TOO_LARGE, producer.tooLarge(n, maxRows));
        }
      }
      const built = producer.select(src, seg, paths, maxRows);
      const cols = producer.cols;
      rows = await watched(d, watch, async () => {
        if (ext === "csv") {
          return writeCsv(d.conn, built, cols, join(work, "body.csv"), out);
        }
        // Sort penuh lewat COPY ke parquet kerja dulu, lalu dibaca berurutan: stream() langsung atas
        // SELECT terurut kehabisan memori pada tabel lebar 1 juta baris di 768MB, COPY tidak (review
        // T-017 INT-R3-1).
        const sorted = join(work, "sorted.parquet");
        const groupRows = await rowGroupOf(d.conn, src);
        await d.conn.run(
          `COPY (${built.sql}) TO ${lit(sorted)} (FORMAT parquet, ROW_GROUP_SIZE ${groupRows})`,
          built.params,
        );
        const result = await d.conn.stream(`SELECT * FROM read_parquet(${lit(sorted)})`);
        return writeXlsx(
          out,
          { sheetName: sheetName(title), columns: cols.map(xlsxColumn) },
          result.yieldRowsJs() as AsyncIterable<unknown[][]>,
        );
      });
    }
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
 * Dipakai juga job PDF (T-018).
 */
export async function referencedByDone(
  repo: Pick<ExportJobRepo, "load">,
  id: string,
  key: string,
): Promise<boolean> {
  try {
    const cur = await repo.load(id);
    return cur?.status === "DONE" && cur.key === key;
  } catch {
    return true;
  }
}
