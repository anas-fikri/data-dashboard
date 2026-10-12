/*
 * Ingest tahap raw (flow-kerja B3, T-006). Satu job per versi:
 *   klaim versi → bersihkan sisa percobaan sebelumnya (idempoten) → unduh sumber ke disk temp
 *   (SHA-256 sambil jalan) → xlsx: parser streaming (ADR-0005) per sheet / csv: DuckDB read_csv →
 *   raw.parquet per sheet ke storage + metadata Sheet (headerRow, nama kolom) → tahap "raw" selesai.
 * Tiap batch: cek versi/dataset masih ada (dihapus → berhenti + hapus objek). Gagal permanen (file
 * rusak/melebihi batas) → hapus objek + FAILED dengan pesan sheet/baris. Gagal sementara (storage/DB)
 * → dilempar agar BullMQ mengulang; pengulangan mulai bersih sehingga hasil akhir identik.
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
import { RawSheetWriter, RowTooLargeError, TooWideError } from "./raw-writer";
import { writeTyped } from "./typed";

export const INGEST_DEADLINE_MS = 60 * 60 * 1000;
const PROGRESS_EVERY_MS = 5_000;

export interface IngestProgress {
  stage: "unduh" | "baca" | "simpan" | "tipe";
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
}

/** Versi/dataset sudah dihapus (repo boleh melemparnya saat baris yang ditulis hilang). */
export class DatasetGoneError extends Error {
  constructor(message = "dataset dihapus") {
    super(message);
    this.name = "DatasetGoneError";
  }
}

/** Akses database yang dibutuhkan ingest (implementasi Prisma di worker; palsu di unit test). */
export interface IngestRepo {
  load(versionId: string): Promise<{ datasetId: string; sourceKey: string } | null>;
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
   * Semua sheet raw + typed tertulis → versi READY dan menjadi versi aktif dataset (mode REPLACE;
   * T-013 menambah cast dengan skema aktif untuk versi refresh). false bila versi sudah hilang.
   */
  finish(versionId: string, data: { sha256: string }): Promise<boolean>;
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
  | { outcome: "gone" }
  | { outcome: "skipped" }
  | { outcome: "failed"; message: string };

export class DeadlineError extends Error {}

const PARQUET = "application/vnd.apache.parquet";

export const versionParquetPrefix = (datasetId: string, versionId: string) =>
  `parquet/${datasetId}/${versionId}/`;

/** Pesan user untuk kegagalan permanen; null = sementara (diulang BullMQ). */
export function permanentMessage(e: unknown): string | null {
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

  // Progres: snapshot terkini ditulis tiap ≤ 5 detik (juga selama COPY/unggah/parse sharedStrings).
  let current: IngestProgress = {
    stage: "unduh",
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

    // Per sheet: tipe kolom (typed-1) lalu unggah raw + typed + metadata.
    for (const s of sheets) {
      const at = { sheet: s.rec.index, sheetName: s.rec.name, rows: s.rec.rawRows, fraction: 1 };
      const sheetId = await repo.createSheet(versionId, s.rec);

      // Typed dari raw lokal sebelum diunggah (tanpa unduh ulang): inferensi → typed-1.parquet.
      setProgress({ stage: "tipe", ...at });
      const typedPath = join(work, `typed-${s.rec.index}.parquet`);
      const typed = await writeTyped(duck, {
        rawPath: s.path,
        outPath: typedPath,
        source: ext,
        headerRow: s.rec.headerRow,
        colCount: s.rec.colCount,
        columns: s.rec.columns,
        watch: ensureAlive,
      });
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
    if (!(await repo.finish(versionId, { sha256: dl.sha256 }))) throw new DatasetGoneError();
    await repo.progress(versionId, current).catch(() => {});
    return { outcome: "done", sheets: sheets.length };
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
    await repo.fail(versionId, message);
    return { outcome: "failed", message };
  } finally {
    clearInterval(heartbeat);
    duck?.close();
    rmSync(work, { recursive: true, force: true });
  }
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
