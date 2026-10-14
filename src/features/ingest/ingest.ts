/*
 * Ingest tahap raw (flow-kerja B3, T-006). Satu job per versi:
 *   klaim versi → bersihkan sisa percobaan sebelumnya (idempoten) → unduh sumber ke disk temp
 *   (SHA-256 sambil jalan) → xlsx: parser streaming (ADR-0005) per sheet / csv: DuckDB read_csv →
 *   raw.parquet per sheet ke storage + metadata Sheet (headerRow, nama kolom) → tahap "raw" selesai.
 * Tiap batch: cek versi/dataset masih ada (dihapus → berhenti + hapus objek). Gagal permanen (file
 * rusak/melebihi batas) → hapus objek + FAILED dengan pesan sheet/baris. Gagal sementara (storage/DB)
 * → dilempar agar BullMQ mengulang; pengulangan mulai bersih sehingga hasil akhir identik.
 * Versi refresh (dataset sudah punya versi aktif, T-013): sheet yang cocok di-cast dengan skema aktif
 * (refresh.ts) lalu finish memutuskan aktif atau menunggu pemetaan; skema aktif yang berubah selama
 * cast → ingest diulang dengan acuan baru.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { openDuck, type Duck } from "@/lib/duckdb";
import { createSaxParser, DEFAULT_LIMITS, XlsxLimitError, type SaxLimits } from "@/lib/xlsx/parser";
import type { RawValue } from "@/lib/xlsx/types";
import { csvToParquet } from "./csv";
import { CsvFormatError } from "./csv-sniff";
import { columnNames, guessHeaderRow, type ColumnMeta } from "./header";
import type { ColumnSchema } from "./infer";
import { previewOf, type SheetPreview } from "./preview";
import { RawSheetWriter, RowTooLargeError, TooWideError } from "./raw-writer";
import {
  carriedAlias,
  chooseHeader,
  missingSheetIssue,
  planColumns,
  planSheets,
  sheetIssues,
  snapshotRef,
  verdictOf,
  type ActiveSheet,
  type ActiveSnapshot,
  type SnapshotRef,
  type Verdict,
} from "./refresh";
import { headerColumns, writeTyped } from "./typed";

export const INGEST_DEADLINE_MS = 60 * 60 * 1000;
const PROGRESS_EVERY_MS = 5_000;

export interface IngestProgress {
  stage: "unduh" | "baca" | "simpan" | "tipe";
  /** Sheet berjalan di-cast dengan skema aktif (versi refresh), bukan inferensi tipe. */
  refresh: boolean;
  sheet: number;
  sheetName: string | null;
  rows: number;
  /** 0..1 untuk sheet berjalan (xlsx: dari XML yang terbaca); null bila tidak diketahui. */
  fraction: number | null;
  /** Perkiraan total baris (csv: hasil pindai); null bila tidak diketahui. */
  rowsEstimate: number | null;
}

export interface SheetRecord {
  index: number;
  name: string;
  rawRows: number;
  colCount: number;
  headerRow: number;
  columns: ColumnMeta[];
  truncatedCells: number;
  /** Baris mentah awal untuk memilih ulang header (T-008). */
  preview: SheetPreview;
  /** Alias pasangan pemetaan sheet ganti nama yang terbawa dari sheet aktif (T-014, carriedAlias). */
  aliasName?: string | null;
}

/** Versi/dataset sudah dihapus (repo boleh melemparnya saat baris yang ditulis hilang). */
export class DatasetGoneError extends Error {
  constructor(message = "dataset dihapus") {
    super(message);
    this.name = "DatasetGoneError";
  }
}

/** Skema aktif berubah sejak cast (koreksi user/versi lain aktif): sementara, BullMQ mengulang. */
export class StaleSnapshotError extends Error {
  constructor() {
    super("skema aktif berubah selama ingest");
    this.name = "StaleSnapshotError";
  }
}

/**
 * Hasil finish: activated = READY + aktif; awaiting = AWAITING_MAPPING (tidak aktif, T-014);
 * stale = acuan cast basi (tidak ada yang ditulis); gone = versi/dataset hilang atau bukan INGESTING.
 */
export type FinishOutcome = "activated" | "awaiting" | "stale" | "gone";

/** Akses database yang dibutuhkan ingest (implementasi Prisma di worker; palsu di unit test). */
export interface IngestRepo {
  /** `active` = versi aktif dataset (selain versi ini) beserta skema sheet-nya; null = versi pertama. */
  load(
    versionId: string,
  ): Promise<{ datasetId: string; sourceKey: string; active: ActiveSnapshot | null } | null>;
  /** UPLOADED|INGESTING → INGESTING (progress direset). false = versi tidak layak diproses. */
  begin(versionId: string): Promise<boolean>;
  /** Versi dan datasetnya masih ada. */
  exists(versionId: string): Promise<boolean>;
  progress(versionId: string, p: IngestProgress): Promise<void>;
  deleteSheets(versionId: string): Promise<void>;
  /** Melempar DatasetGoneError bila versi sudah hilang. */
  createSheet(versionId: string, s: SheetRecord): Promise<string>;
  /** Melempar DatasetGoneError bila baris sheet sudah hilang (dataset dihapus). */
  setSheetKey(sheetId: string, rawKey: string): Promise<void>;
  /** Typed-1 + skema hasil inferensi; melempar DatasetGoneError bila baris sheet sudah hilang. */
  setTyped(
    sheetId: string,
    data: { typedKey: string; schema: ColumnSchema[]; schemaRevision: number },
  ): Promise<void>;
  /**
   * Semua sheet raw + typed tertulis. Di bawah lock baris Dataset: acuan cast (`snapshot`) basi →
   * "stale"; verdict cocok → READY + aktif (activateVersionInTx); tidak cocok → AWAITING_MAPPING
   * dengan alasan, versi aktif tetap.
   */
  finish(
    versionId: string,
    data: { sha256: string; verdict: Verdict; snapshot: SnapshotRef },
  ): Promise<FinishOutcome>;
  fail(versionId: string, message: string): Promise<void>;
  /** Prefix storage yang gagal dibersihkan → diproses ulang job pembersihan (StorageCleanup). */
  recordCleanup(prefix: string, reason: string): Promise<void>;
}

export interface IngestStorage {
  download(key: string, dest: string): Promise<{ sha256: string; bytes: number }>;
  upload(key: string, path: string, contentType: string): Promise<void>;
  deletePrefix(prefix: string): Promise<number>;
}

export interface IngestOptions {
  tmpRoot: string;
  /** datasetId dari data job: membersihkan prefix walau versi sudah terhapus sebelum dimuat. */
  datasetIdHint?: string;
  /** Batas waktu absolut (epoch ms); default 60 menit dari mulai. */
  deadline?: number;
  limits?: SaxLimits;
  duckMemory?: string;
  /** Ukuran batch baris (default 50k); uji memakai nilai kecil. */
  batchRows?: number;
  /** Uji: buffer baca CSV DuckDB lebih kecil. */
  csvBufferSize?: number;
  /** Uji: dipanggil setelah setiap batch (mis. mensimulasikan worker mati di tengah). */
  afterBatch?: (sheet: number, rows: number) => void | Promise<void>;
}

export type IngestOutcome =
  | { outcome: "done"; sheets: number }
  /** Versi refresh tidak cocok dengan skema aktif: menunggu pemetaan (T-014). */
  | { outcome: "awaiting"; sheets: number; message: string }
  | { outcome: "gone" }
  | { outcome: "skipped" }
  | { outcome: "failed"; message: string };

export class DeadlineError extends Error {}

const PARQUET = "application/vnd.apache.parquet";

export const versionParquetPrefix = (datasetId: string, versionId: string) =>
  `parquet/${datasetId}/${versionId}/`;

/** Pesan user untuk kegagalan permanen; null = sementara (diulang BullMQ). */
export function permanentMessage(e: unknown): string | null {
  if (e instanceof StaleSnapshotError) return null;
  if (
    e instanceof XlsxLimitError ||
    e instanceof CsvFormatError ||
    e instanceof TooWideError ||
    e instanceof RowTooLargeError
  ) {
    return e.message;
  }
  if (e instanceof DeadlineError) {
    return "Pemrosesan file melebihi 60 menit. Pecah file menjadi beberapa bagian lalu unggah lagi.";
  }
  const msg = e instanceof Error ? e.message : String(e);
  // Diperiksa sebelum pola CSV: kegagalan commit appender berawalan "Invalid Input Error".
  // Memori DuckDB habis: deterministik untuk file yang sama (concurrency 1, memory_limit tetap), jadi
  // mengulang hanya membuang waktu. Disk temp penuh tetap sementara (masalah lingkungan, bukan file).
  if (
    /Out of Memory Error|could not allocate block|failed to pin block/i.test(msg) &&
    !/temp(orary)? directory|No space left/i.test(msg)
  ) {
    return "File terlalu berat untuk diproses: memori pemrosesan tidak cukup (biasanya karena kolom sangat banyak atau sel sangat panjang). Hapus kolom yang tidak dipakai atau pecah file, lalu unggah lagi.";
  }
  // Isi file yang tidak valid menurut DuckDB (CSV rusak, kutip tidak tertutup, baris terlalu panjang).
  if (
    /Invalid Input Error|Conversion Error|CSV Error|Could not convert|maximum line size/i.test(msg)
  ) {
    const line = /line[: ]+(\d+)/i.exec(msg)?.[1];
    return `File CSV rusak${line ? ` di sekitar baris ${Number(line).toLocaleString("id-ID")}` : ""}. Periksa tanda kutip dan pemisah kolom, lalu unggah ulang.`;
  }
  return null;
}

/**
 * Pesan gagal + lokasi (T-008 AC 1): bila kegagalan terjadi saat sebuah sheet xlsx sedang diproses,
 * user diberi tahu sheet mana dan nomor baris fisik terakhir yang dibaca. Tanpa lokasi untuk CSV
 * (pesannya sudah menyebut baris dari DuckDB), batas waktu (bukan salah satu sheet), dan pesan parser
 * yang sudah menyebut sheet-nya sendiri (review T-008 L4).
 */
export function failureMessage(
  message: string,
  p: IngestProgress,
  at: { row: number; csv: boolean; deadline: boolean },
): string {
  if (at.csv || at.deadline || !p.sheetName || p.stage === "unduh") return message;
  if (message.includes(`"${p.sheetName}"`)) return message;
  const where =
    p.stage === "baca" && at.row > 0 ? `, sekitar baris ${at.row.toLocaleString("id-ID")}` : "";
  return `Sheet "${p.sheetName}"${where}: ${message}`;
}

/** Hapus prefix versi; bila gagal, catat untuk job pembersihan (tidak pernah melempar). */
export async function cleanupPrefix(
  repo: Pick<IngestRepo, "recordCleanup">,
  storage: Pick<IngestStorage, "deletePrefix">,
  prefix: string,
  reason: string,
) {
  try {
    await storage.deletePrefix(prefix);
  } catch (e) {
    await repo
      .recordCleanup(prefix, `${reason}: ${e instanceof Error ? e.message : String(e)}`)
      .catch(() => {});
  }
}

export async function runIngest(
  versionId: string,
  repo: IngestRepo,
  storage: IngestStorage,
  opts: IngestOptions,
): Promise<IngestOutcome> {
  const v = await repo.load(versionId);
  if (!v) {
    // Versi sudah terhapus (mis. dataset dihapus saat percobaan sebelumnya mengunggah).
    if (opts.datasetIdHint) {
      await cleanupPrefix(
        repo,
        storage,
        versionParquetPrefix(opts.datasetIdHint, versionId),
        "versi hilang",
      );
    }
    return { outcome: "gone" };
  }
  if (!(await repo.begin(versionId))) return { outcome: "skipped" };

  const prefix = versionParquetPrefix(v.datasetId, versionId);
  const deadline = opts.deadline ?? Date.now() + INGEST_DEADLINE_MS;
  const work = mkdtempSync(join(opts.tmpRoot, "ingest-"));
  let duck: Duck | null = null;

  // Nomor baris fisik terakhir yang diterima writer (lokasi pesan gagal; mutasi murah per baris).
  const at = { row: 0 };
  // Progres: snapshot terkini ditulis tiap ≤ 5 detik (juga selama COPY/unggah/parse sharedStrings).
  let current: IngestProgress = {
    stage: "unduh",
    refresh: false,
    sheet: 0,
    sheetName: null,
    rows: 0,
    fraction: null,
    rowsEstimate: null,
  };
  const setProgress = (p: Partial<IngestProgress>) => {
    current = { ...current, ...p };
  };
  const heartbeat = setInterval(() => {
    void repo.progress(versionId, current).catch(() => {});
  }, PROGRESS_EVERY_MS);
  const ensureAlive = async () => {
    if (Date.now() > deadline) throw new DeadlineError("deadline");
    if (!(await repo.exists(versionId))) throw new DatasetGoneError();
  };

  try {
    // Idempoten: sisa percobaan sebelumnya (worker mati/diulang) dibuang lebih dulu.
    await storage.deletePrefix(prefix);
    await repo.deleteSheets(versionId);
    await repo.progress(versionId, current);

    const ext = v.sourceKey.endsWith(".csv") ? "csv" : "xlsx";
    const src = join(work, `source.${ext}`);
    const dl = await storage.download(v.sourceKey, src);
    await ensureAlive();
    setProgress({ stage: "baca" });

    duck = await openDuck({
      path: join(work, "work.duckdb"),
      tmpDir: work,
      memoryLimit: opts.duckMemory,
      // Tabel raw > WIDE_COLS kolom pindah ke DB ber-blok kecil (review T-006 M3).
      widePath: join(work, "wide.duckdb"),
    });
    const sheets =
      ext === "xlsx"
        ? await xlsxSheets(
            duck,
            src,
            work,
            { ...(opts.limits ?? DEFAULT_LIMITS), deadline },
            setProgress,
            ensureAlive,
            opts,
            at,
          )
        : [
            await csvToParquet(
              duck,
              src,
              work,
              ensureAlive,
              (n) => setProgress({ sheetName: "CSV", rowsEstimate: n }),
              { bufferSize: opts.csvBufferSize },
            ),
          ];
    await ensureAlive();

    // Versi refresh: pasangan sheet aktif per sheet baru; sheet aktif yang hilang = tidak cocok.
    const plan = v.active
      ? planSheets(
          sheets.map((s) => s.rec),
          v.active.sheets,
        )
      : null;
    const issues = (plan?.missing ?? []).map(missingSheetIssue);

    // Per sheet: tipe kolom (typed-1) lalu unggah raw + typed + metadata.
    for (const [i, s] of sheets.entries()) {
      const active = plan?.pairs[i] ?? null;
      // Baris header aktif (bisa hasil koreksi user) dicoba lebih dulu; yang dipilih disimpan.
      if (active) {
        Object.assign(s.rec, await refreshHeader(duck, s, active));
        s.rec.aliasName = carriedAlias(s.rec.name, active);
      }
      const cols = active ? planColumns(s.rec.columns, active.schema) : null;
      const at = { sheet: s.rec.index, sheetName: s.rec.name, rows: s.rec.rawRows, fraction: 1 };
      const sheetId = await repo.createSheet(versionId, s.rec);

      // Typed dari raw lokal sebelum diunggah (tanpa unduh ulang) → typed-1.parquet: tipe skema aktif
      // untuk kolom yang cocok, inferensi untuk sheet/kolom baru; kolom kosong (absent, T-014) yang
      // tetap tidak ada di file ditulis ulang kosong tanpa menunggu pemetaan.
      setProgress({ stage: "tipe", refresh: active !== null, ...at });
      const typedPath = join(work, `typed-${s.rec.index}.parquet`);
      const typed = await writeTyped(duck, {
        rawPath: s.path,
        outPath: typedPath,
        source: ext,
        headerRow: s.rec.headerRow,
        colCount: s.rec.colCount,
        columns: s.rec.columns,
        overrides: cols?.overrides,
        absent: cols?.absent,
        watch: ensureAlive,
      });
      if (active && cols) {
        const label = v.active!.sheets.length > 1 ? active.name : null;
        issues.push(...sheetIssues(label, cols, typed.schema, typed.nonEmpty));
      }
      setProgress({ stage: "simpan", ...at });
      const key = `${prefix}${sheetId}/raw.parquet`;
      await storage.upload(key, s.path, PARQUET);
      await repo.setSheetKey(sheetId, key);
      await ensureAlive();
      const typedKey = `${prefix}${sheetId}/typed-1.parquet`;
      await storage.upload(typedKey, typedPath, PARQUET);
      await repo.setTyped(sheetId, { typedKey, schema: typed.schema, schemaRevision: 1 });
      rmSync(typedPath, { force: true });
      await ensureAlive();
    }
    const verdict = verdictOf(issues);
    const done = await repo.finish(versionId, {
      sha256: dl.sha256,
      verdict,
      snapshot: snapshotRef(v.active),
    });
    if (done === "gone") throw new DatasetGoneError();
    if (done === "stale") throw new StaleSnapshotError();
    await repo.progress(versionId, current).catch(() => {});
    return verdict.ok
      ? { outcome: "done", sheets: sheets.length }
      : { outcome: "awaiting", sheets: sheets.length, message: verdict.reason };
  } catch (e) {
    if (e instanceof DatasetGoneError) {
      await cleanupPrefix(repo, storage, prefix, "dataset dihapus saat ingest");
      return { outcome: "gone" };
    }
    const message = permanentMessage(e);
    if (message === null) {
      // Sementara. Bila penyebabnya dataset dihapus di tengah (baris hilang), bersihkan sekarang:
      // percobaan berikutnya tidak lagi tahu datasetId-nya.
      if (!(await repo.exists(versionId).catch(() => true))) {
        await cleanupPrefix(repo, storage, prefix, "dataset dihapus saat ingest");
        return { outcome: "gone" };
      }
      throw e; // BullMQ mengulang dari awal (mulai bersih)
    }
    await cleanupPrefix(repo, storage, prefix, "ingest gagal");
    await repo.deleteSheets(versionId).catch(() => {});
    const located = failureMessage(message, current, {
      row: at.row,
      csv: v.sourceKey.endsWith(".csv"),
      deadline: e instanceof DeadlineError,
    });
    await repo.fail(versionId, located);
    return { outcome: "failed", message: located };
  } finally {
    clearInterval(heartbeat);
    duck?.close();
    rmSync(work, { recursive: true, force: true });
  }
}

/**
 * Header sheet refresh: baris header sheet aktif (dibaca dari raw lokal) lalu tebakan; dipilih yang
 * tidak kehilangan kolom aktif terlihat (refresh.chooseHeader).
 */
async function refreshHeader(
  duck: Duck,
  s: { rec: SheetRecord; path: string },
  active: ActiveSheet,
): Promise<Pick<SheetRecord, "headerRow" | "columns">> {
  const guessed = { headerRow: s.rec.headerRow, columns: s.rec.columns };
  if (active.headerRow === guessed.headerRow) return guessed;
  const columns = await headerColumns(duck, s.path, active.headerRow, s.rec.colCount);
  return chooseHeader([{ headerRow: active.headerRow, columns }, guessed], active.schema);
}

/** xlsx: parser memancarkan baris secara sinkron; antrean dikuras di titik `drain` (≤ satu potongan). */
async function xlsxSheets(
  duck: Duck,
  src: string,
  work: string,
  limits: SaxLimits,
  setProgress: (p: Partial<IngestProgress>) => void,
  ensureAlive: () => Promise<void>,
  opts: IngestOptions,
  at: { row: number },
): Promise<{ rec: SheetRecord; path: string }[]> {
  type Item =
    | { k: "start"; sheet: number; name: string }
    | { k: "row"; row: number; vals: RawValue[] }
    | { k: "end"; sheet: number };
  const queue: Item[] = [];
  const out: { rec: SheetRecord; path: string }[] = [];
  let writer: RawSheetWriter | null = null;
  let name = "";

  const drain = async () => {
    while (queue.length) {
      const it = queue.shift()!;
      if (it.k === "start") {
        name = it.name;
        const sheet = it.sheet;
        setProgress({ sheet, sheetName: name, rows: 0, fraction: 0 });
        at.row = 0;
        writer = await RawSheetWriter.create(
          duck,
          `s${sheet}`,
          async (rows) => {
            setProgress({ rows });
            await ensureAlive();
            await opts.afterBatch?.(sheet, rows);
          },
          { batchLimit: opts.batchRows, watch: ensureAlive },
        );
      } else if (it.k === "row") {
        at.row = it.row;
        await writer!.add(it.row, it.vals);
      } else {
        const w: RawSheetWriter = writer!;
        const path = join(work, `sheet-${it.sheet}.parquet`);
        setProgress({ rows: w.rows, fraction: 1 });
        await w.finish(path);
        const headerRow = guessHeaderRow(w.sample);
        const cols = Math.max(w.colCount, 1);
        out.push({
          path,
          rec: {
            index: it.sheet,
            name,
            rawRows: w.rows,
            colCount: cols,
            headerRow,
            columns: columnNames(w.sample.find((r) => r.row === headerRow)?.vals ?? [], cols),
            truncatedCells: 0,
            preview: previewOf(w.sample, cols),
          },
        });
        writer = null;
        await ensureAlive();
      }
    }
  };

  try {
    const summary = await createSaxParser(limits).parse(
      src,
      {
        sheetNames: [],
        tmpDir: work,
        onSheetStart: (sheet, n) => queue.push({ k: "start", sheet, name: n }),
        onSheetEnd: (sheet) => queue.push({ k: "end", sheet }),
        onProgress: (p) => setProgress({ fraction: p.fraction }),
        drain,
      },
      (_sheet, row, vals) => queue.push({ k: "row", row, vals }),
    );
    await drain();
    for (const s of out) s.rec.truncatedCells = summary?.truncatedBySheet[s.rec.index] ?? 0;
    return out;
  } finally {
    (writer as RawSheetWriter | null)?.close();
  }
}
