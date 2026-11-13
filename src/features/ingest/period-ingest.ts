/*
 * Ingest unggahan periode (T-052, rencana G-6 §4.5 langkah 3–5): versi mode PERIOD pada dataset yang
 * versi aktifnya per periode. Hanya file baru yang di-parse dan di-cast; periode lama dirujuk ulang
 * (tidak ada objek baru untuk periode yang tidak berubah).
 *  1. Parse file ke raw lokal (sama dengan ingest biasa), pasangkan sheet dengan sheet aktif (nama/alias),
 *     baris judul + kolom → posisi kanonik skema aktif (peta kolom per segmen, divalidasi; judul
 *     alias tersimpan ikut dicocokkan, T-057). Kolom terlihat hilang / kolom periode hilang →
 *     AWAITING_MAPPING (dipetakan lewat runPeriodMapping, T-057). Kolom tambahan → kolom tersembunyi
 *     baru (posisi kanonik baru, periode lama NULL lewat proyeksi; perubahan skema dibawa commit).
 *  2. Tetapkan periode setiap baris: sumber kolom = date_trunc(satuan, kolom periode di-cast dengan
 *     skema aktif); sumber label = label pilihan pemilik saat init. Hitung baris per periode.
 *  3. Tolak lebih awal bila melewati batas (computePeriodPlan atas jumlah baris tepat + byte batas
 *     bawah): label = setelah parse, kolom = setelah query hitung per periode — sebelum typing.
 *  4. Vonis cast 98% HANYA atas baris file baru (profil semua baris file, termasuk yang tanpa tanggal).
 *     Gagal → AWAITING_MAPPING (raw tersimpan, tanpa typed).
 *  5. Tulis satu segmen per periode per sheet (raw baris judul + baris periode, typed dengan skema aktif,
 *     `_period` = awal periode), periksa file (baris, `_row` unik, `_period`, tanggal ∈ periode).
 *  6. Commit di bawah lock Dataset (repo.commit → decidePeriodCommit): rencana dihitung ulang dari data
 *     aktif + pengaturan saat itu, manifest versi = periode lama dirujuk ulang + segmen baru, gerbang
 *     integritas, lalu aktif otomatis (murni menambah, dalam batas, kolom, tanpa peringatan, versi dasar
 *     init = versi aktif) atau AWAITING_CONFIRM dengan rencana beku; penolakan → FAILED.
 * Percobaan ulang mulai bersih (sheet/segmen percobaan sebelumnya dihapus). Commit yang statusnya tidak
 * diketahui (koneksi putus) tidak pernah diikuti penghapusan objek.
 *
 * Kelompok file satu periode (T-060, rencana G-6 §4.6 P-28): versi dengan beberapa file sumber diproses
 * SEKALIGUS sebagai satu versi — setiap file di-parse dan dipecah per periode seperti biasa, satu segmen
 * per file per periode per sheet (Segment.groupId/groupPart/groupSize), rencana memperlakukan semua file
 * sebagai satu unggahan (periode yang ada di file mana pun diganti UTUH oleh gabungan semua file), lalu
 * satu commit. Tidak ada aktivasi sebagian: file mana pun gagal / butuh pemetaan → seluruh kelompok gagal
 * dan data aktif tidak berubah (pemetaan kolom kelompok tidak didukung; samakan judul kolom).
 */
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { lit, openDuck, watched, type Duck } from "@/lib/duckdb";
import { DEFAULT_LIMITS } from "@/lib/xlsx/parser";
import { IntegrityError, missingKeys } from "@/features/versions/integrity-check";
import { newSegmentId, segmentPrefix } from "@/features/versions/segment-keys";
import { csvToParquet } from "./csv";
import { typedParts, type ColumnSchema, type SourceKind } from "./infer";
import {
  cleanupPrefix,
  DatasetGoneError,
  DeadlineError,
  failureMessage,
  INGEST_DEADLINE_MS,
  permanentMessage,
  refreshHeader,
  StaleSnapshotError,
  versionParquetPrefix,
  xlsxSheets,
  type IngestOptions,
  type IngestOutcome,
  type IngestProgress,
  type SheetRecord,
  type TypedStorage,
} from "./ingest";
import { isIsoDate, periodKeyOf, periodLabel, type PeriodGrain, type PeriodSource } from "./period";
import {
  computePeriodPlan,
  type OnLimit,
  type PeriodLimits,
  type PeriodPlan,
  type UploadMode,
} from "./period-plan";
import {
  keyMerge,
  KeyMergeError,
  type CopySource,
  type FileSeg,
  type KeptCopy,
} from "./period-keymerge";
import { labelReferenceColumn, periodSql, validDateSql } from "./period-setup-plan";
import { REVIEW_MAX, validatePeriodMapping, type MappingReviewIssue } from "./mapping-input";
import {
  castIssues,
  castProblems,
  combinedSha256,
  periodColumnPlan,
  planInputs,
  validateColMap,
  withAddedStats,
  type ActivePeriodSheet,
  type IncomingSegmentRef,
  type PeriodColumnPlan,
  type SheetSchemaChange,
  type UploadFacts,
} from "./period-upload-plan";
import { mergeProfiles, packProfile, type RawProfile, type StoredProfile } from "./profile";
import { copyParquet } from "./raw-writer";
import { normName } from "@/features/widgets/remap";
import { isContinuation } from "./merge-sheets";
import { headerSignature, pickMergeTarget, type MergeCandidate } from "./period-merge";
import type { MergedSheet } from "./period-plan";
import { planSheets, typeLabel, verdictOf, type ActiveSheet, type SnapshotRef } from "./refresh";
import { canonicalProfile, copyTyped, maxSourceRow, profileRaw, typedFileProblems } from "./typed";

const PARQUET = "application/vnd.apache.parquet";
const PROGRESS_EVERY_MS = 5_000;

/** Sheet aktif dataset periode (acuan cast + manifest). */
export interface PeriodActiveSheet extends ActiveSheet, ActivePeriodSheet {
  lineageId: string;
  colCount: number;
  periodSource: PeriodSource | null;
  periodColumn: number | null;
  /** Kunci raw/typed per file typed manifest (gerbang integritas: semua harus ada). */
  keys: string[];
  /** Kolom kunci sheet data (SheetLineage.keyColumns, v1.20); kosong = tanpa kunci. */
  keyColumns: number[];
}

/** Satu file sumber versi (kelompok file T-060: urut nomor file 1..n). */
export interface PeriodSourceFile {
  key: string;
  name: string | null;
}

export interface PeriodIngestLoad {
  datasetId: string;
  sourceKey: string;
  originalName: string | null;
  /**
   * File sumber (T-060). Satu file = [{ sourceKey, originalName }]; > 1 = kelompok file satu periode
   * (diproses sebagai satu versi). Tidak ada = satu file sourceKey.
   */
  sources?: PeriodSourceFile[];
  /** Satuan versi (dari versi aktif saat init). */
  grain: PeriodGrain | null;
  /** Awal periode untuk sheet bersumber label (ISO naive); null = tanpa label. */
  label: string | null;
  /** Versi aktif yang dilihat pemilik saat init. */
  baseVersionId: string | null;
  /** Cara unggahan (v1.20, DatasetVersion.uploadMode); tidak ada = Ganti. */
  uploadMode?: UploadMode;
  /** Versi aktif sekarang (null = tidak ada). */
  active: {
    versionId: string;
    grain: PeriodGrain | null;
    sheets: PeriodActiveSheet[];
  } | null;
  settings: { keepPeriods: number | null; onLimit: OnLimit };
}

/** Segmen periode baru (atau raw saja untuk versi yang menunggu pemetaan). */
export interface PeriodSegmentRecord {
  id: string;
  lineageId: string;
  rawKey: string;
  rawBytes: number;
  rawRows: number;
  headerRow: number;
  colCount: number;
  colMap: number[];
  rowBase: bigint;
  maxSrcRow: number;
  sha256: string;
  sourceKind: SourceKind;
  /** null = raw saja (menunggu pemetaan). */
  period: { key: string; start: string; minDate: string | null; maxDate: string | null } | null;
  /** Nama file asal (kelompok file T-060: nama file bagian ini); tidak ada = nama file versi. */
  originalName?: string | null;
  /** Kelompok file satu periode (T-060); tidak ada/null = satu file. */
  group?: { id: string; part: number; size: number } | null;
  /** Pengunggah (salinan Tambah/Perbarui: pengunggah segmen asal); tidak ada = pengunggah versi. */
  uploadedById?: string | null;
}

export interface PeriodTypedRecord {
  typedKey: string;
  schemaRevision: number;
  columns: number[];
  dataRows: number;
  typedBytes: number;
  profile: StoredProfile;
  headerRow: number;
}

export interface PeriodCommitInput {
  /** Acuan cast (versi aktif + revisi skema per sheet): berubah → "stale" (ingest diulang). */
  snapshot: SnapshotRef;
  sha256: string;
  facts: UploadFacts;
  /** Versi dasar init = versi aktif saat diproses (syarat aktif otomatis). */
  allowAuto: boolean;
  /** Kunci yang sudah terbukti ada (HEAD) — gerbang integritas di dalam lock tanpa I/O storage. */
  present: string[];
  /** Perubahan skema sheet (T-057: kolom baru, alias) yang dibawa ke versi baru. */
  changes: SheetSchemaChange[];
}

export type PeriodCommitResult =
  | { outcome: "activated" | "awaiting"; plan: PeriodPlan }
  | { outcome: "rejected"; message: string }
  | { outcome: "stale" }
  | { outcome: "gone" };

export interface PeriodIngestRepo {
  load(versionId: string): Promise<PeriodIngestLoad | null>;
  /** UPLOADED|INGESTING (mode PERIOD) → INGESTING. false = versi tidak layak diproses. */
  begin(versionId: string): Promise<boolean>;
  exists(versionId: string): Promise<boolean>;
  progress(versionId: string, p: IngestProgress): Promise<void>;
  /** Sheet + segmen percobaan sebelumnya versi ini; id segmen yang dihapus. */
  deleteSheets(versionId: string): Promise<string[]>;
  allocateRows(lineageId: string, span: number): Promise<bigint>;
  /** Data segmen lama manifest aktif (salinan Tambah/Perbarui, v1.20). */
  copySources(typedIds: string[]): Promise<CopySource[]>;
  /** Versi lain dataset ini yang sudah diterapkan (READY) dengan sidik file yang sama (Tambah berulang). */
  appliedBefore(versionId: string, sha256: string): Promise<boolean>;
  /** Baris Segment SEBELUM objeknya diunggah; DatasetGoneError bila versi hilang. */
  createSegment(versionId: string, d: PeriodSegmentRecord): Promise<void>;
  /** File typed segmen baru (belum di manifest mana pun); id SegmentTyped. */
  addTyped(segmentId: string, t: PeriodTypedRecord): Promise<string>;
  /** Sheet raw saja untuk versi yang menunggu pemetaan (lineage sheet aktif pasangannya). */
  createRawSheet(
    versionId: string,
    s: SheetRecord,
    lineageId: string,
    segmentId: string,
    rawKey: string,
  ): Promise<void>;
  /**
   * INGESTING → AWAITING_MAPPING dengan alasan (versi aktif tidak berubah); sheet file yang diabaikan
   * disimpan untuk rencana setelah pemetaan (T-057).
   */
  awaitMapping(
    versionId: string,
    d: { sha256: string; reason: string; ignoredSheets: string[]; mergedSheets?: MergedSheet[] },
  ): Promise<boolean>;
  /** Lihat PeriodCommitInput / decidePeriodCommit. */
  commit(versionId: string, d: PeriodCommitInput): Promise<PeriodCommitResult>;
  /** UPLOADED|INGESTING → FAILED; false = versi sudah di status lain. */
  fail(versionId: string, message: string): Promise<boolean>;
  recordCleanup(prefix: string, reason: string): Promise<void>;
}

export interface PeriodIngestDeps {
  repo: PeriodIngestRepo;
  storage: TypedStorage;
  limits: PeriodLimits;
}

/** Galat permanen dengan pesan untuk pemilik (data aktif tidak berubah). */
export class PeriodUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PeriodUploadError";
  }
}

export const NOT_PERIOD_MESSAGE =
  "Dataset ini tidak lagi menyimpan data per periode (versi aktif berubah), jadi file tidak ditambahkan sebagai periode. Unggah ulang file.";
export const LABEL_MISSING_MESSAGE =
  "Periode untuk sheet berlabel belum dipilih. Unggah ulang file dan pilih periodenya.";
export const NO_SHEET_MESSAGE =
  "Tidak ada sheet di file yang cocok dengan sheet data periode dataset ini (nama sheet berbeda). Samakan nama sheet, atau ganti semua data.";

/** Kelompok file (T-060) yang butuh pemetaan kolom / vonis cast: tidak didukung, seluruhnya gagal. */
export const groupMappingMessage = (detail: string) =>
  `Kelompok file tidak diproses: ${detail}. Kelompok file harus cocok dengan kolom data aktif tanpa pemetaan — samakan judul dan isi kolom semua file, lalu unggah ulang kelompoknya. Data aktif tidak berubah.`;

/**
 * Sheet gabungan satu file (T-jsmj) yang nilai kolomnya tidak lolos vonis cast: layar tinjauan nilai hanya
 * mengenal satu sheet per sheet data, jadi seluruh unggahan gagal dengan alasannya.
 */
export const mergeReviewMessage = (detail: string) =>
  `Unggahan dengan sheet gabungan tidak diproses: ${detail}. Bila file berisi sheet yang digabung, semua sheet harus cocok dengan kolom data aktif — perbaiki nilai/judul kolomnya di file, atau unggah sheet itu sebagai file terpisah. Data aktif tidak berubah.`;

/** Dua file kelompok berisi sama persis (sha256 sama, review M1). */
export const groupDuplicateMessage = (a: string, b: string) =>
  `Kelompok file tidak diproses: “${a}” dan “${b}” berisi sama persis, sehingga barisnya akan tergandakan. Hapus salah satunya, lalu unggah ulang kelompoknya. Data aktif tidak berubah.`;

/** File sumber versi (kelompok T-060 atau satu file). */
export const sourcesOf = (
  v: Pick<PeriodIngestLoad, "sources" | "sourceKey" | "originalName">,
): PeriodSourceFile[] => v.sources ?? [{ key: v.sourceKey, name: v.originalName }];

export const GROUP_UNREADABLE_MESSAGE =
  "Daftar file kelompok tidak terbaca, jadi kelompok tidak diproses. Unggah ulang kelompoknya. Data aktif tidak berubah.";

const one = async (duck: Duck, sql: string): Promise<unknown[]> =>
  (await duck.conn.runAndReadAll(sql)).getRows()[0] ?? [];

/** File asal item (kelompok T-060: nomor file 1..n; satu file: 1). */
interface ItemFile {
  part: number;
  name: string | null;
  sha256: string;
  ext: SourceKind;
}

interface Item {
  s: { rec: SheetRecord; path: string };
  file: ItemFile;
  /**
   * Nomor bagian di sheet logis (1..n, urut file lalu sheet): Segment.groupPart. Unik per sheet logis, jadi
   * beberapa file (T-060) maupun beberapa sheet satu file (T-jsmj) di periode yang sama tetap satu kelompok.
   */
  part: number;
  /** Sidik asal segmen: sidik file, atau file + sheet bila beberapa sheet file ini masuk ke sheet data yang sama. */
  sha256: string;
  /** Nama asal segmen (kelompok/gabungan); null = nama file versi. */
  originalName: string | null;
  /** Penanda unik item untuk nama tabel/berkas kerja (file + sheet). */
  tag: string;
  pair: PeriodActiveSheet;
  colMap: number[];
  /** Lebar kanonik sheet versi baru (panjang peta kolom; T-057 kolom baru menambahnya). */
  width: number;
  /** Skema cast segmen baru: skema aktif + alias + kolom baru (T-057). */
  schema: ColumnSchema[];
  /** Perubahan skema sheet yang dibawa ke versi baru (T-057); null = skema aktif apa adanya. */
  change: PeriodColumnPlan["change"];
  /** Jumlah kolom raw file (c1..c<rawCols>). */
  rawCols: number;
  rawBytes: number;
  periods: { start: string; rows: number; lo: string | null; hi: string | null }[];
  missing: number;
}

/** Item dari sheet file + rencana kolomnya. */
function itemOf(
  s: { rec: SheetRecord; path: string },
  pair: PeriodActiveSheet,
  cp: PeriodColumnPlan,
  file: ItemFile,
  part: number,
): Item {
  return {
    s,
    file,
    part,
    sha256: file.sha256,
    originalName: file.name,
    tag: `${Math.trunc(file.part)}_${Math.trunc(s.rec.index)}`,
    pair,
    colMap: cp.colMap,
    width: cp.colCount,
    schema: cp.schema,
    change: cp.change,
    rawCols: s.rec.colCount,
    rawBytes: statSync(s.path).size,
    periods: [],
    missing: 0,
  };
}

export async function runPeriodIngest(
  versionId: string,
  deps: PeriodIngestDeps,
  opts: IngestOptions,
): Promise<IngestOutcome> {
  const { repo, storage } = deps;
  const v = await repo.load(versionId);
  if (!v) {
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
  const created: string[] = [];
  /** commit dipanggil lalu gagal: statusnya tidak diketahui → objek tidak boleh dihapus. */
  let committing = false;
  const cleanupSegments = async (ids: string[], reason: string) => {
    if (committing) return;
    for (const id of new Set(ids)) {
      await cleanupPrefix(repo, storage, segmentPrefix(v.datasetId, id), reason);
    }
  };
  const deadline = opts.deadline ?? Date.now() + INGEST_DEADLINE_MS;
  const work = mkdtempSync(join(opts.tmpRoot, "ingest-"));
  let duck: Duck | null = null;
  const at = { row: 0 };
  let current: IngestProgress = {
    stage: "unduh",
    refresh: true,
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
    await storage.deletePrefix(prefix);
    for (const id of await repo.deleteSheets(versionId)) {
      await storage.deletePrefix(segmentPrefix(v.datasetId, id));
    }
    await repo.progress(versionId, current);
    const a = v.active;
    if (!a || !a.grain || a.grain !== v.grain) throw new PeriodUploadError(NOT_PERIOD_MESSAGE);
    const grain = a.grain;
    if (a.sheets.some((s) => s.periodSource === "LABEL") && !(v.label && isIsoDate(v.label))) {
      throw new PeriodUploadError(LABEL_MISSING_MESSAGE);
    }

    const files = sourcesOf(v);
    if (!files.length) throw new PeriodUploadError(GROUP_UNREADABLE_MESSAGE);
    /** Kelompok file satu periode (T-060): satu versi dari beberapa file. */
    const grouped = files.length > 1;
    duck = await openDuck({
      path: join(work, "work.duckdb"),
      tmpDir: work,
      memoryLimit: opts.duckMemory,
      threads: opts.duckThreads,
      widePath: join(work, "wide.duckdb"),
    });
    const d = duck;
    // 1. Pasangan sheet + kolom per file (hanya sheet aktif yang punya sumber periode bisa menerima data).
    const usable = a.sheets.filter((s) => s.periodSource);
    const ignored: string[] = [];
    /** Sheet file yang digabung ke satu sheet data (T-jsmj), per file. */
    const merged: MergedSheet[] = [];
    /** Nomor bagian terakhir per sheet logis (Item.part). */
    const parts = new Map<string, number>();
    const items: Item[] = [];
    const issues: string[] = [];
    const fileShas: string[] = [];
    for (const [i, f] of files.entries()) {
      const ext: SourceKind = f.key.endsWith(".csv") ? "csv" : "xlsx";
      const dir = grouped ? join(work, `part-${i + 1}`) : work;
      if (grouped) mkdirSync(dir, { recursive: true });
      const src = join(dir, `source.${ext}`);
      setProgress({ stage: "unduh" });
      const dl = await storage.download(f.key, src);
      // Kelompok (T-060, review M1): file yang sama dua kali (mis. salinan "maret-2 (1).csv") akan
      // menggandakan baris periode itu → seluruh kelompok ditolak.
      const twin = fileShas.indexOf(dl.sha256);
      if (grouped && twin >= 0) {
        throw new PeriodUploadError(
          groupDuplicateMessage(files[twin]!.name ?? `file ${twin + 1}`, f.name ?? `file ${i + 1}`),
        );
      }
      fileShas.push(dl.sha256);
      await ensureAlive();
      setProgress({ stage: "baca" });
      const sheets =
        ext === "xlsx"
          ? await xlsxSheets(
              d,
              src,
              dir,
              { ...(opts.limits ?? DEFAULT_LIMITS), deadline },
              setProgress,
              ensureAlive,
              opts,
              at,
            )
          : [
              await csvToParquet(
                d,
                src,
                dir,
                ensureAlive,
                (n) => setProgress({ sheetName: "CSV", rowsEstimate: n }),
                { bufferSize: opts.csvBufferSize },
              ),
            ];
      // Raw parquet sudah ditulis: file sumber lokal (dan salinan UTF-8 CSV) tidak dibutuhkan lagi
      // (disk kerja kelompok, review L2).
      if (grouped) {
        rmSync(src, { force: true });
        rmSync(join(dir, "source-utf8.csv"), { force: true });
      }
      await ensureAlive();
      const file: ItemFile = { part: i + 1, name: f.name, sha256: dl.sha256, ext };
      const plan = planSheets(
        sheets.map((x) => x.rec),
        usable,
      );
      // Kelompok (review L3): sheet disebut per file.
      const shown = (sh: { rec: SheetRecord }) =>
        grouped ? `${sh.rec.name} (${f.name ?? `file ${i + 1}`})` : sh.rec.name;
      const fromFile = new Map<string, string[]>();
      const add = (sh: (typeof sheets)[number], pair: PeriodActiveSheet) => {
        const label = usable.length > 1 ? pair.name : null;
        const cp = periodColumnPlan(
          sh.rec.columns,
          pair.schema,
          pair.colCount,
          pair.periodSource === "COLUMN" ? pair.periodColumn : null,
          label,
        );
        issues.push(...cp.issues.map((x) => (grouped ? `“${f.name ?? "file"}”: ${x}` : x)));
        if (cp.issues.length) needsMapping = true;
        const part = (parts.get(pair.lineageId) ?? 0) + 1;
        parts.set(pair.lineageId, part);
        const it = itemOf(sh, pair, cp, file, part);
        items.push(it);
        fileItems.push(it);
        fromFile.set(pair.lineageId, [...(fromFile.get(pair.lineageId) ?? []), shown(sh)]);
      };
      let needsMapping = false;
      const fileItems: Item[] = [];
      /** Sheet data yang menerima sheet file lewat kecocokan kolom (bukan nama) — selalu ditinjau. */
      const byColumns = new Set<string>();
      const extras: (typeof sheets)[number][] = [];
      const primary = new Map<string, string>();
      for (const [j, sh] of sheets.entries()) {
        const pair = (plan.pairs[j] as PeriodActiveSheet | null) ?? null;
        if (!pair) {
          extras.push(sh);
          continue;
        }
        Object.assign(sh.rec, await refreshHeader(d, sh, pair));
        primary.set(pair.lineageId, headerSignature(sh.rec.columns));
        add(sh, pair);
      }
      // T-jsmj: sheet tambahan berkolom sama digabung ke sheet data yang sama (satu kelompok per periode).
      // Ada sheet yang butuh pemetaan kolom → tidak menggabung (layar pemetaan hanya mengenal satu sheet file
      // per sheet data): sheet tambahan diabaikan dengan pemberitahuan, seperti sebelum v1.19.
      // v1.19.1: sheet lanjutan tanpa judul memakai judul sheet sebelumnya (berantai), seluruh barisnya data.
      const leaderOf = new Map<number, number>();
      for (const sh of extras) {
        const j = sheets.indexOf(sh);
        const lead = j > 0 ? (leaderOf.get(j - 1) ?? j - 1) : -1;
        if (lead >= 0 && isContinuation(sheets[lead]!.rec, sh.rec, opts.continuationMinRows)) {
          sh.rec.headerRow = 0;
          sh.rec.columns = sheets[lead]!.rec.columns.map((c) => ({ ...c }));
          leaderOf.set(j, lead);
        }
      }
      for (const sh of extras) {
        if (needsMapping) {
          const name = shown(sh);
          if (!ignored.includes(name)) ignored.push(name);
          rmSync(sh.path, { force: true });
          continue;
        }
        const headers = new Map<string, Awaited<ReturnType<typeof refreshHeader>>>();
        const candidates: MergeCandidate[] = [];
        const lead = leaderOf.get(sheets.indexOf(sh));
        // Leader tidak disimpan → lanjutannya juga tidak (review L-a: tanpa baris sebelumnya).
        if (lead !== undefined && ignored.includes(shown(sheets[lead]!))) {
          const name = shown(sh);
          if (!ignored.includes(name)) ignored.push(name);
          rmSync(sh.path, { force: true });
          continue;
        }
        for (const pair of usable) {
          // Lanjutan: judul dari leader SETELAH judul leader dibaca ulang (review L1), tanpa baris judul sendiri.
          const h =
            lead !== undefined
              ? { headerRow: 0, columns: sheets[lead]!.rec.columns.map((x) => ({ ...x })) }
              : await refreshHeader(d, sh, pair);
          headers.set(pair.lineageId, h);
          const cp = periodColumnPlan(
            h.columns,
            pair.schema,
            pair.colCount,
            pair.periodSource === "COLUMN" ? pair.periodColumn : null,
            null,
          );
          candidates.push({
            lineageId: pair.lineageId,
            sig: headerSignature(h.columns),
            exact: !cp.issues.length && cp.change === null,
          });
        }
        const target = pickMergeTarget(candidates, primary);
        if ("reason" in target) {
          const name = shown(sh);
          if (!ignored.includes(name)) ignored.push(name);
          rmSync(sh.path, { force: true });
          continue;
        }
        const pair = usable.find((x) => x.lineageId === target.lineageId)!;
        Object.assign(sh.rec, headers.get(pair.lineageId)!);
        if (!primary.has(pair.lineageId))
          primary.set(pair.lineageId, headerSignature(sh.rec.columns));
        byColumns.add(pair.lineageId);
        add(sh, pair);
      }
      for (const [lineageId, from] of fromFile) {
        if (from.length < 2 && !byColumns.has(lineageId)) continue;
        // Kemungkinan salinan (T-hgsz): sheet tergabung dengan judul kolom + jumlah baris sama, lalu isi sel
        // sama (sidik isi dihitung hanya untuk kandidat). Sheet lanjutan memakai judul leader → tidak dibandingkan
        // dengan judul saja (review T-hgsz M1: potongan sama besar bukan salinan).
        const seen = new Map<string, string>();
        const copies = new Set<string>();
        const bySig = new Map<string, Item[]>();
        for (const it of fileItems.filter((x) => x.pair.lineageId === lineageId)) {
          const k = `${headerSignature(it.s.rec.columns)}|${it.s.rec.rawRows}`;
          bySig.set(k, [...(bySig.get(k) ?? []), it]);
        }
        for (const group of bySig.values()) {
          if (group.length < 2) continue;
          for (const it of group) {
            const key = await contentPrint(d, it.s.path);
            const name = shown(it.s);
            const first = seen.get(key);
            if (first === undefined) seen.set(key, name);
            else copies.add(first).add(name);
          }
        }
        merged.push({
          sheet: usable.find((x) => x.lineageId === lineageId)!.name,
          from,
          ...(copies.size ? { copies: from.filter((f) => copies.has(f)) } : {}),
        });
        // Beberapa sheet satu file di sheet data yang sama: sidik + nama asal per sheet (deteksi "file
        // identik" per periode tidak tertipu sheet lain di file yang sama; sumber sel menyebut sheet-nya).
        const list = fileItems.filter((it) => it.pair.lineageId === lineageId);
        if (list.length < 2) continue;
        for (const it of list) {
          it.sha256 = createHash("sha256")
            .update(`${it.file.sha256}\0${it.s.rec.name}`)
            .digest("hex");
          it.originalName = `${it.file.name ?? v.originalName ?? "file"} (sheet ${it.s.rec.name})`;
        }
      }
    }
    const ext = items[0]?.file.ext ?? (v.sourceKey.endsWith(".csv") ? "csv" : "xlsx");
    const sha256 = combinedSha256(fileShas) ?? fileShas[0]!;
    /** Versi menunggu pemetaan: sheet raw saja (tanpa typed/manifest), versi aktif tidak berubah. */
    const awaitMapping = async (found: string[]): Promise<IngestOutcome> => {
      const verdict = verdictOf(found);
      const reason = verdict.ok ? "" : verdict.reason;
      // Kelompok file (T-060): pemetaan tidak didukung → seluruh kelompok gagal (tanpa aktivasi).
      if (grouped) throw new PeriodUploadError(groupMappingMessage(reason || found[0]!));
      for (const it of items) {
        const id = newSegmentId();
        const rawKey = `${segmentPrefix(v.datasetId, id)}raw.parquet`;
        await repo.createSegment(versionId, {
          id,
          lineageId: it.pair.lineageId,
          rawKey,
          rawBytes: it.rawBytes,
          rawRows: it.s.rec.rawRows,
          headerRow: it.s.rec.headerRow,
          colCount: it.rawCols,
          colMap: [],
          rowBase: 0n,
          maxSrcRow: await maxSourceRow(d, it.s.path),
          sha256,
          sourceKind: ext,
          period: null,
        });
        created.push(id);
        await storage.upload(rawKey, it.s.path, PARQUET);
        await repo.createRawSheet(versionId, it.s.rec, it.pair.lineageId, id, rawKey);
        await ensureAlive();
      }
      if (
        !(await repo.awaitMapping(versionId, {
          sha256,
          reason,
          ignoredSheets: ignored,
          mergedSheets: merged,
        }))
      ) {
        throw new DatasetGoneError();
      }
      return { outcome: "awaiting", sheets: items.length, message: reason };
    };
    if (!items.length) throw new PeriodUploadError(NO_SHEET_MESSAGE);
    for (const it of items) {
      const bad = validateColMap(it.colMap, it.width, it.rawCols, `sheet "${it.s.rec.name}"`);
      if (bad.length && !issues.length) throw new IntegrityError(bad);
    }
    if (issues.length) {
      return await awaitMapping([...new Set(issues)]);
    }
    const core = await processPeriodItems({
      d,
      work,
      versionId,
      v,
      a,
      grain,
      sha256,
      items,
      ignored,
      merged,
      multi: usable.length > 1,
      // Kelompok: beberapa file (T-060) atau beberapa sheet ke satu sheet data (T-jsmj).
      group: grouped || [...parts.values()].some((n) => n > 1) ? versionId : null,
      multiFile: grouped,
      deps,
      created,
      watch: ensureAlive,
      setProgress,
      acceptCast: false,
      keyCacheDir: join(opts.tmpRoot, "key-index"),
    });
    if (core.kind === "cast") return await awaitMapping(core.issues);

    let r: PeriodCommitResult;
    try {
      r = await repo.commit(versionId, core.input);
    } catch (e) {
      // Commit bisa sudah masuk sebelum koneksi putus: objek mungkin milik versi yang kini aktif.
      // Gerbang integritas melempar dari dalam transaksi → pasti batal, objek boleh dibersihkan.
      if (!(e instanceof IntegrityError)) committing = true;
      throw e;
    }
    if (r.outcome === "gone") throw new DatasetGoneError();
    if (r.outcome === "stale") throw new StaleSnapshotError();
    if (r.outcome === "rejected") throw new PeriodUploadError(r.message);
    await repo.progress(versionId, current).catch(() => {});
    return r.outcome === "activated"
      ? { outcome: "done", sheets: items.length }
      : { outcome: "confirm", sheets: items.length, message: r.plan.confirm.join(",") };
  } catch (e) {
    if (e instanceof DatasetGoneError) {
      await cleanupPrefix(repo, storage, prefix, "dataset dihapus saat ingest");
      await cleanupSegments(created, "dataset dihapus saat ingest");
      return { outcome: "gone" };
    }
    const message = e instanceof PeriodUploadError ? e.message : permanentMessage(e);
    if (message === null) {
      if (!(await repo.exists(versionId).catch(() => true))) {
        await cleanupPrefix(repo, storage, prefix, "dataset dihapus saat ingest");
        await cleanupSegments(created, "dataset dihapus saat ingest");
        return { outcome: "gone" };
      }
      throw e; // sementara (termasuk acuan basi): BullMQ mengulang dari awal
    }
    const located =
      e instanceof IntegrityError || e instanceof PeriodUploadError
        ? message
        : failureMessage(message, current, {
            row: at.row,
            csv: sourcesOf(v).some((f) => f.key.endsWith(".csv")),
            deadline: e instanceof DeadlineError,
          });
    if (!(await repo.fail(versionId, located))) return { outcome: "skipped" };
    // Status FAILED berhasil ditulis (dari INGESTING): commit pasti tidak masuk, objek segmen percobaan
    // ini boleh dihapus walau commit sempat dipanggil.
    committing = false;
    await cleanupPrefix(repo, storage, prefix, "ingest gagal");
    const removed = await repo.deleteSheets(versionId).catch(() => [] as string[]);
    await cleanupSegments([...created, ...removed], "ingest gagal");
    return { outcome: "failed", message: located };
  } finally {
    clearInterval(heartbeat);
    duck?.close();
    rmSync(work, { recursive: true, force: true });
  }
}

interface CoreInput {
  d: Duck;
  work: string;
  versionId: string;
  v: PeriodIngestLoad;
  a: NonNullable<PeriodIngestLoad["active"]>;
  grain: PeriodGrain;
  /** Sidik file unggahan (kelompok T-060: gabungan semua file, combinedSha256). */
  sha256: string;
  /** Item per file per sheet; jenis file + sha256 asal segmen ada di item (Item.file). */
  items: Item[];
  /** Sheet file yang tidak berpasangan (tidak disimpan). */
  ignored: string[];
  /** `ignored` berasal dari jalur pemetaan kolom (T-hgsz): alasan khusus di layar tinjauan. */
  ignoredForMapping?: boolean;
  /** Sheet file yang digabung ke satu sheet data (T-jsmj). */
  merged: MergedSheet[];
  /** Dataset punya lebih dari satu sheet periode (nama sheet di pesan). */
  multi: boolean;
  /**
   * Kelompok satu periode: id kelompok (= id versi) bila ada sheet logis dengan > 1 bagian (beberapa file
   * T-060 atau beberapa sheet T-jsmj); null = satu bagian per sheet logis.
   */
  group: string | null;
  /** Beberapa file sumber (T-060): pesan galat menyebut nama file. */
  multiFile: boolean;
  deps: Pick<PeriodIngestDeps, "storage" | "limits"> & {
    repo: Pick<
      PeriodIngestRepo,
      "allocateRows" | "createSegment" | "addTyped" | "copySources" | "appliedBefore"
    >;
  };
  /** Id segmen yang dibuat (pembersihan saat gagal). */
  created: string[];
  watch: () => Promise<void>;
  setProgress: (p: Partial<IngestProgress>) => void;
  /** Pemetaan dengan persetujuan pemilik (T-057): nilai yang tidak cocok menjadi kosong. */
  acceptCast: boolean;
  /** Direktori indeks kunci lintas job (Perbarui berdasarkan kunci, T-yg3z); tidak ada = tanpa cache. */
  keyCacheDir?: string;
}

/**
 * Sidik isi sheet raw (T-hgsz): jumlah hash per baris tanpa kolom teknis (`_row` dkk.), urutan baris tidak
 * berpengaruh. Hanya untuk sheet kandidat salinan (judul + jumlah baris sama), jadi pemindaian jarang terjadi.
 */
async function contentPrint(d: Duck, rawPath: string): Promise<string> {
  const r = await d.conn.runAndReadAll(
    `SELECT coalesce(sum(hash(x)), 0)::VARCHAR || ':' || count(*)::VARCHAR FROM (SELECT COLUMNS(c -> NOT starts_with(c, '_')) FROM read_parquet(${lit(rawPath)})) x`,
  );
  return String(r.getRows()[0]?.[0] ?? "");
}

/** Kolom < 98 % lolos cast di file baru, dalam bentuk alasan (ingest) dan isu tinjau (pemetaan). */
interface CastFinding {
  issues: string[];
  review: MappingReviewIssue[];
}

/**
 * Langkah 2–6 unggahan periode (ingest file dan pemetaan T-057 memakai jalur yang sama): periode per
 * baris, tolak lebih awal, vonis cast atas baris file baru, segmen per periode (raw + typed + `_period`),
 * gerbang kunci (HEAD di luar lock). Hasil: masukan commit, atau temuan cast (tanpa segmen ditulis).
 */
async function processPeriodItems(
  c: CoreInput,
): Promise<({ kind: "cast" } & CastFinding) | { kind: "commit"; input: PeriodCommitInput }> {
  const { d, work, versionId, v, a, grain, items, deps } = c;
  // Bagian-bagian satu sheet data (beberapa file T-060 / sheet gabungan T-jsmj) wajib membawa perubahan kolom
  // yang sama persis: satu perubahan skema per sheet data dicatat, dan kolom baru yang berbeda antar bagian
  // akan tersimpan di posisi yang salah. Berbeda → seluruh unggahan ditolak sebelum apa pun ditulis.
  // Bagian tanpa perubahan (kolomnya = skema aktif) boleh berdampingan dengan bagian yang menambah kolom:
  // baris bagian itu kosong di kolom baru, seperti periode lama (perilaku v1.18).
  const shape = (ch: NonNullable<Item["change"]>) =>
    JSON.stringify([
      ch.colCount,
      ch.added.map((x) => [x.pos, normName(x.original)]),
      [...ch.normalized].sort((x, y) => x - y),
    ]);
  for (const lineageId of new Set(items.map((it) => it.pair.lineageId))) {
    const parts = items.filter((it) => it.pair.lineageId === lineageId && it.change);
    if (new Set(parts.map((it) => shape(it.change!))).size > 1) {
      const detail = `kolom tambahan berbeda antar ${c.multiFile ? "file" : "sheet"} untuk sheet data “${parts[0]!.pair.name}”`;
      throw new PeriodUploadError(
        c.multiFile ? groupMappingMessage(detail) : mergeReviewMessage(detail),
      );
    }
  }
  const repo = deps.repo;
  const storage = deps.storage;
  const ensureAlive = c.watch;
  const setProgress = c.setProgress;
  const ignored = c.ignored;
  const created = c.created;
  const dl = { sha256: c.sha256 };
  const issues: string[] = [];
  const review: MappingReviewIssue[] = [];
  const merged = new Map<Item, RawProfile>();
  // 2. Periode setiap baris + hitungan per periode (tanpa typing).
  for (const it of items) {
    setProgress({
      stage: "periode",
      sheet: it.s.rec.index,
      sheetName: it.s.rec.name,
      fraction: null,
    });
    await assignPeriods(d, it, grain, it.file.ext, v.label, ensureAlive);
  }
  // Kelompok file (T-060): jumlah file kelompok per (sheet logis, periode) = Segment.groupSize.
  const groupSize = new Map<string, number>();
  for (const it of items) {
    for (const p of it.periods) {
      const k = `${it.pair.lineageId}|${p.start}`;
      groupSize.set(k, (groupSize.get(k) ?? 0) + 1);
    }
  }
  const groupOf = (it: Item, start: string) =>
    c.group
      ? {
          id: c.group,
          part: it.part,
          size: groupSize.get(`${it.pair.lineageId}|${start}`) ?? 0,
        }
      : null;
  const groupRef = (it: Item, start: string) => {
    const g = groupOf(it, start);
    return g ? { groupId: g.id, groupPart: g.part, groupSize: g.size } : {};
  };

  // 3. Tolak lebih awal (byte = batas bawah: raw saja, typed belum ditulis).
  const facts: UploadFacts = {
    grain,
    source: items.some((it) => it.pair.periodSource === "LABEL") ? "LABEL" : "COLUMN",
    fileSheets: [...new Set(items.map((it) => it.pair.lineageId))],
    droppedRows: items.reduce((n, it) => n + it.missing, 0),
    ignoredSheets: ignored,
    ignoredForMapping: c.ignoredForMapping,
    mergedSheets: c.merged,
    fileSha256: dl.sha256,
  };
  const early = computePeriodPlan({
    grain,
    source: facts.source,
    baseVersionId: a.versionId,
    active: planInputs(a.sheets, []).active,
    incoming: planInputs(
      [],
      items.flatMap((it) => {
        const total = it.periods.reduce((n, p) => n + p.rows, 0) + it.missing;
        return it.periods.map((p) => ({
          typedId: "",
          segmentId: "",
          lineageId: it.pair.lineageId,
          periodKey: periodKeyOf(grain, p.start),
          periodStart: p.start,
          rows: p.rows,
          bytes: total > 0 ? Math.floor((it.rawBytes * p.rows) / total) : 0,
          sha256: it.sha256,
          ...groupRef(it, p.start),
        }));
      }),
    ).incoming,
    incomingSheets: facts.fileSheets,
    settings: v.settings,
    limits: deps.limits,
    fileSha256: facts.fileSha256,
    droppedRows: facts.droppedRows,
    ignoredSheets: facts.ignoredSheets,
    ignoredForMapping: facts.ignoredForMapping,
    mergedSheets: facts.mergedSheets,
  });
  // Tambah/Perbarui (T-yg3z L1): rencana awal menghitung seperti Ganti (baris lama belum diketahui) dan bisa
  // menolak keliru; hanya "periode file sendiri terlalu besar" yang pasti — sisanya diputuskan rencana commit.
  if (
    early.rejection &&
    ((v.uploadMode ?? "REPLACE") === "REPLACE" || early.rejection.code === "PERIOD_TOO_LARGE")
  ) {
    throw new PeriodUploadError(early.rejection.message);
  }

  // 4. Profil per periode (+ baris tanpa tanggal) → vonis cast atas baris file baru saja.
  const profiles = new Map<
    Item,
    Map<string, { raw: string; profile: RawProfile; maxSrcRow: number; rawRows: number }>
  >();
  for (const it of items) {
    const per = await segmentRaws(d, it, work, ensureAlive);
    profiles.set(it, per.segments);
    const all = mergeProfiles([...[...per.segments.values()].map((x) => x.profile), ...per.extra]);
    merged.set(it, all);
    const label = c.multi ? it.pair.name : null;
    const ext = it.file.ext;
    const found = castProblems(it.schema, all, it.colMap, ext);
    issues.push(
      ...castIssues(it.schema, all, it.colMap, ext, label).map((x) =>
        c.multiFile
          ? `“${it.file.name ?? "file"}”: ${x}`
          : c.group
            ? `Sheet “${it.s.rec.name}”: ${x}`
            : x,
      ),
    );
    for (const { column, pct } of found) {
      const raw = it.colMap.length ? (it.colMap[column.pos - 1] ?? 0) : column.pos;
      review.push({
        sheet: it.pair.name,
        column: column.name,
        header: it.s.rec.columns.find((x) => x.pos === raw)?.original ?? column.original,
        pct,
        typeLabel: typeLabel(column),
      });
    }
  }
  if (issues.length && !c.acceptCast) {
    const unique = [...new Set(issues)];
    const verdict = verdictOf(unique);
    const reason = verdict.ok ? unique[0]! : verdict.reason;
    // Kelompok file (T-060) / sheet gabungan (T-jsmj): layar tinjauan nilai hanya mengenal satu sheet file per
    // sheet data, jadi tidak pernah aktif sebagian → gagal utuh dengan alasannya.
    if (c.group) {
      throw new PeriodUploadError(
        c.multiFile ? groupMappingMessage(reason) : mergeReviewMessage(reason),
      );
    }
    return { kind: "cast", issues: unique, review };
  }

  // 5. Segmen per periode (raw + typed skema aktif + `_period`). Typed ditulis lokal dulu (5a): Tambah/
  // Perbarui (v1.20) membutuhkan baris file sebelum kelompok periode (bagian file + salinan lama) diketahui.
  setProgress({ stage: "tipe", fraction: null });
  const mode = v.uploadMode ?? "REPLACE";
  /** Kelompok segmen periode: Tambah/Perbarui selalu berkelompok (bagian file + salinan data lama). */
  const groupId = mode !== "REPLACE" ? versionId : c.group;
  const incoming: IncomingSegmentRef[] = [];
  const keys: string[] = [];
  const pending: {
    it: Item;
    p: Item["periods"][number];
    seg: { raw: string; profile: RawProfile; maxSrcRow: number; rawRows: number };
    key: string;
    typedPath: string;
    rowBase: bigint;
    hr: number;
  }[] = [];
  for (const it of items) {
    const hr = Math.trunc(it.s.rec.headerRow);
    for (const p of it.periods) {
      const seg = profiles.get(it)!.get(p.start)!;
      const key = periodKeyOf(grain, p.start);
      const label = `${c.group ? `file "${it.file.name ?? it.file.part}" ` : ""}sheet "${it.s.rec.name}" periode ${periodLabel(grain, p.start)}`;
      if (seg.profile.dataRows !== p.rows) {
        throw new IntegrityError([
          `${label}: ${seg.profile.dataRows} baris tertulis, ${p.rows} baris dihitung`,
        ]);
      }
      const rowBase = await repo.allocateRows(it.pair.lineageId, seg.maxSrcRow);
      const typedPath = join(work, `typed-${it.tag}-${key}.parquet`);
      const chars = [...seg.profile.profiles.values()].reduce((n, x) => n + x.chars, 0);
      await copyTyped(d, {
        rawPath: seg.raw,
        outPath: typedPath,
        source: it.file.ext,
        headerRow: hr,
        watch: ensureAlive,
        rowBase,
        rawCols: it.rawCols,
        colMap: it.colMap,
        schema: it.schema,
        charsPerRow: p.rows > 0 ? chars / p.rows : 0,
        period: p.start,
      });
      const bad = await typedFileProblems(d, typedPath, p.rows, label, p.start);
      const pc = it.pair.periodSource === "COLUMN" ? it.pair.periodColumn : null;
      if (pc !== null) {
        // Periode ditetapkan dari cast kolom periode di raw; file typed harus sepakat baris demi baris.
        const col = `c${Math.trunc(pc)}`;
        const off = Number(
          (
            await one(
              d,
              `SELECT count(*) FILTER (WHERE NOT coalesce(${validDateSql(col)} AND ${periodSql(grain, col)} = DATE '${p.start}', false))
               FROM read_parquet(${lit(typedPath)})`,
            )
          )[0],
        );
        if (off > 0) bad.push(`${label}: ${off} baris tanggalnya tidak masuk periode ini`);
      }
      if (bad.length) throw new IntegrityError(bad);
      pending.push({ it, p, seg, key, typedPath, rowBase, hr });
      await ensureAlive();
    }
  }

  // 5b. Tambah / Perbarui berdasarkan kunci (v1.20): salinan baris lama yang tetap per periode terdampak.
  let copies: KeptCopy[] = [];
  if (mode !== "REPLACE") {
    setProgress({ stage: "periode", sheetName: null, fraction: null });
    try {
      const r = await keyMerge({
        d,
        work,
        mode,
        sheets: a.sheets,
        files: pending.map((x): FileSeg => ({
          lineageId: x.it.pair.lineageId,
          key: x.key,
          start: x.p.start,
          typedPath: x.typedPath,
          rows: x.p.rows,
          label: c.multiFile
            ? `file “${x.it.file.name ?? x.it.file.part}” sheet “${x.it.s.rec.name}”`
            : `sheet “${x.it.s.rec.name}”`,
          sha256: x.it.sha256,
        })),
        sources: (ids) => repo.copySources(ids),
        download: (k, path) => storage.download(k, path),
        watch: ensureAlive,
        allocateRows: (l, span) => repo.allocateRows(l, span),
        // Indeks kunci lintas job di direktori kerja worker (T-yg3z), ≤ 512 MB.
        keyCache: c.keyCacheDir ? { dir: c.keyCacheDir, maxBytes: 512 * 1024 * 1024 } : undefined,
        repeatFile: mode === "APPEND" && (await repo.appliedBefore(versionId, c.sha256)),
      });
      copies = r.copies;
      facts.merge = {
        mode,
        parts: r.parts,
        ...(mode === "UPSERT"
          ? {
              keys: Object.fromEntries(
                [...new Set(pending.map((x) => x.it.pair.lineageId))].map((l) => [
                  l,
                  a.sheets.find((s) => s.lineageId === l)?.keyColumns ?? [],
                ]),
              ),
            }
          : {}),
      };
    } catch (e) {
      if (e instanceof KeyMergeError) throw new PeriodUploadError(e.message);
      throw e;
    }
    for (const x of copies) {
      const k = `${x.lineageId}|${x.start}`;
      groupSize.set(k, (groupSize.get(k) ?? 0) + 1);
    }
  }
  const groupOfSeg = (lineageId: string, start: string, part: number) =>
    groupId ? { id: groupId, part, size: groupSize.get(`${lineageId}|${start}`) ?? 0 } : null;
  const refOf = (g: ReturnType<typeof groupOfSeg>) =>
    g ? { groupId: g.id, groupPart: g.part, groupSize: g.size } : {};

  // 5c. Unggah segmen file baru.
  for (const x of pending) {
    const { it, p, seg, key, typedPath, rowBase, hr } = x;
    const id = newSegmentId();
    const sp = segmentPrefix(v.datasetId, id);
    const rawKey = `${sp}raw.parquet`;
    const typedKey = `${sp}typed-${it.pair.schemaRevision}.parquet`;
    const rawBytes = statSync(seg.raw).size;
    const typedBytes = statSync(typedPath).size;
    const group = groupOfSeg(it.pair.lineageId, p.start, it.part);
    // Baris Segment SEBELUM objek diunggah: kegagalan selalu tahu objek mana miliknya.
    await repo.createSegment(versionId, {
      id,
      lineageId: it.pair.lineageId,
      rawKey,
      rawBytes,
      rawRows: seg.rawRows,
      headerRow: hr,
      colCount: it.rawCols,
      colMap: it.colMap,
      rowBase,
      maxSrcRow: seg.maxSrcRow,
      sha256: it.sha256,
      sourceKind: it.file.ext,
      period: { key, start: p.start, minDate: p.lo, maxDate: p.hi },
      ...(group ? { originalName: it.originalName, group } : {}),
    });
    created.push(id);
    await storage.upload(rawKey, seg.raw, PARQUET);
    await storage.upload(typedKey, typedPath, PARQUET);
    const typedId = await repo.addTyped(id, {
      typedKey,
      schemaRevision: it.pair.schemaRevision,
      columns: [...new Set(it.schema.map((s) => s.pos))].sort((s, t) => s - t),
      dataRows: p.rows,
      typedBytes,
      profile: packProfile(hr, seg.profile),
      headerRow: hr,
    });
    incoming.push({
      typedId,
      segmentId: id,
      lineageId: it.pair.lineageId,
      periodKey: key,
      periodStart: p.start,
      rows: p.rows,
      bytes: rawBytes + typedBytes,
      sha256: it.sha256,
      ...refOf(group),
    });
    keys.push(rawKey, typedKey);
    rmSync(typedPath, { force: true });
    if (seg.raw !== it.s.path) rmSync(seg.raw, { force: true });
    await ensureAlive();
  }
  // Semua segmen file tertulis: raw lokal + tabel periode tidak dibutuhkan lagi (review L2).
  if (c.group) {
    for (const it of items) {
      rmSync(it.s.path, { force: true });
      await d.conn.run(`DROP TABLE IF EXISTS assign_${it.tag}`);
    }
  }

  // 5d. Salinan data lama (Tambah/Perbarui): bagian kelompok setelah bagian file sheet data itu.
  const nextPart = new Map<string, number>();
  for (const it of items) {
    nextPart.set(it.pair.lineageId, Math.max(nextPart.get(it.pair.lineageId) ?? 0, it.part));
  }
  for (const x of copies) {
    const part = (nextPart.get(x.lineageId) ?? 0) + 1;
    nextPart.set(x.lineageId, part);
    const id = newSegmentId();
    const sp = segmentPrefix(v.datasetId, id);
    const rawKey = `${sp}raw.parquet`;
    const typedKey = `${sp}typed-${x.src.schemaRevision}.parquet`;
    const rawBytes = statSync(x.rawPath).size;
    const typedBytes = statSync(x.typedPath).size;
    const group = groupOfSeg(x.lineageId, x.start, part);
    await repo.createSegment(versionId, {
      id,
      lineageId: x.lineageId,
      rawKey,
      rawBytes,
      rawRows: x.rawRows,
      headerRow: x.src.headerRow,
      colCount: x.src.colCount,
      colMap: x.src.colMap,
      // `_row` lama dipertahankan (rentang baris segmen lama; segmen lama tidak dirujuk versi baru).
      rowBase: x.src.rowBase,
      maxSrcRow: x.src.maxSrcRow ?? (await maxSourceRow(d, x.rawPath)),
      sha256: x.src.sha256 ?? dl.sha256,
      sourceKind: x.src.sourceKind,
      period: { key: x.key, start: x.start, minDate: x.minDate, maxDate: x.maxDate },
      originalName: x.src.originalName,
      uploadedById: x.src.uploadedById,
      group,
    });
    created.push(id);
    await storage.upload(rawKey, x.rawPath, PARQUET);
    await storage.upload(typedKey, x.typedPath, PARQUET);
    const typedId = await repo.addTyped(id, {
      typedKey,
      schemaRevision: x.src.schemaRevision,
      columns: x.src.columns,
      dataRows: x.rows,
      typedBytes,
      profile: x.profile,
      headerRow: x.src.typedHeaderRow,
    });
    incoming.push({
      typedId,
      segmentId: id,
      lineageId: x.lineageId,
      periodKey: x.key,
      periodStart: x.start,
      rows: x.rows,
      bytes: rawBytes + typedBytes,
      sha256: x.src.sha256,
      ...refOf(group),
    });
    keys.push(rawKey, typedKey);
    rmSync(x.rawPath, { force: true });
    rmSync(x.typedPath, { force: true });
    await ensureAlive();
  }

  // 6. Gerbang integritas kunci (HEAD di luar lock); commit di bawah lock Dataset oleh pemanggil.
  const all = [...new Set([...keys, ...a.sheets.flatMap((s) => s.keys)])];
  const missing = await missingKeys(all, (k) => storage.exists(k));
  if (missing.length) throw new IntegrityError(missing.map((k) => `file data tidak ada: ${k}`));
  // Satu perubahan skema per sheet data (commit menolak lineage ganda): bagian kelompok/gabungan berbagi
  // judul kolom yang sama, statistik kolom baru dari gabungan profil semua bagiannya.
  const byLineage = new Map<string, Item[]>();
  for (const it of items) {
    byLineage.set(it.pair.lineageId, [...(byLineage.get(it.pair.lineageId) ?? []), it]);
  }
  const changes: SheetSchemaChange[] = [...byLineage.values()].flatMap((list) => {
    const first = list.find((it) => it.change);
    if (!first?.change) return [];
    return [
      {
        ...withAddedStats(first.change, mergeProfiles(list.map((it) => merged.get(it)!))),
        lineageId: first.pair.lineageId,
        baseRevision: first.pair.schemaRevision,
      },
    ];
  });
  return {
    kind: "commit",
    input: {
      snapshot: {
        activeVersionId: a.versionId,
        sheets: a.sheets.map((s) => ({ id: s.id, schemaRevision: s.schemaRevision })),
      },
      sha256: dl.sha256,
      facts,
      allowAuto: v.baseVersionId === a.versionId,
      present: all,
      changes,
    },
  };
}

// ── Pemetaan unggahan periode (T-057) ───────────────────────────────────────────────────────────────

/** Sheet raw versi periode yang menunggu pemetaan (T-052: raw saja, lineage sheet aktif pasangannya). */
export interface PeriodRawSheet extends SheetRecord {
  id: string;
  lineageId: string;
  rawKey: string;
}

export interface PeriodMappingRepo extends Pick<
  PeriodIngestRepo,
  | "load"
  | "allocateRows"
  | "createSegment"
  | "addTyped"
  | "recordCleanup"
  | "copySources"
  | "appliedBefore"
> {
  /** Sheet raw versi yang menunggu pemetaan + fakta file dari ingest; null = versi tidak ada. */
  rawSheets(versionId: string): Promise<{
    sheets: PeriodRawSheet[];
    sha256: string;
    ignoredSheets: string[];
    /** Tidak ada = tidak ada sheet yang digabung. */
    mergedSheets?: MergedSheet[];
  } | null>;
  /**
   * Segmen periode percobaan pemetaan sebelumnya dihapus (hanya selama versi masih AWAITING_MAPPING:
   * commit belum pernah masuk); id segmen yang dihapus.
   */
  deletePeriodSegments(versionId: string): Promise<string[]>;
  /** Commit dari AWAITING_MAPPING (decidePeriodCommit yang sama) + AuditLog dataset.version.map. */
  commit(
    versionId: string,
    d: PeriodCommitInput & {
      audit: { actorId: string; ip: string; meta: Record<string, unknown> };
    },
  ): Promise<PeriodCommitResult>;
  /** Setelah commit: segmen raw saja versi ini tidak dirujuk lagi → baris dihapus; id segmen. */
  dropRawSegments(versionId: string): Promise<string[]>;
}

export interface PeriodMappingDeps {
  repo: PeriodMappingRepo;
  storage: TypedStorage;
  limits: PeriodLimits;
}

export type PeriodMappingResult =
  | { outcome: "done"; activated: boolean }
  | { outcome: "stale" }
  | { outcome: "gone" }
  | { outcome: "invalid"; message: string }
  | { outcome: "failed"; message: string }
  | { outcome: "review"; issues: MappingReviewIssue[] };

export interface PeriodMappingOptions {
  tmpRoot: string;
  duckMemory?: string;
  /** Lock/deadline/versi masih menunggu pemetaan (melempar → berhenti). */
  watch: () => Promise<void>;
  actorId: string;
  ip: string;
  jobId?: string;
}

/**
 * Terapkan pemetaan pada unggahan periode (T-057, rencana G-6 §4.9): raw sheet yang tersimpan saat
 * ingest (file asli tidak dibaca) → peta kolom dari keputusan pemilik (kolom hilang dipetakan atau
 * dikosongkan HANYA untuk periode file ini, kolom tambahan menjadi kolom tersembunyi baru, judul pengganti
 * diingat sebagai alias) → jalur periode yang sama dengan ingest (processPeriodItems: periode per baris,
 * batas, vonis cast, segmen per periode) → commit di bawah lock (aktif otomatis atau menunggu konfirmasi).
 * Periode lama tidak pernah di-cast ulang atau ditulis ulang. Galat sementara / IntegrityError /
 * DatasetGoneError dilempar ke pemanggil (applyMapping); segmen percobaan ini dibersihkan bila commit
 * pasti tidak masuk.
 */
export async function runPeriodMapping(
  versionId: string,
  input: unknown,
  deps: PeriodMappingDeps,
  opts: PeriodMappingOptions,
): Promise<PeriodMappingResult> {
  const { repo, storage } = deps;
  const v = await repo.load(versionId);
  const raw = v ? await repo.rawSheets(versionId) : null;
  if (!v || !raw) return { outcome: "gone" };
  const a = v.active;
  if (!a || !a.grain || a.grain !== v.grain)
    return { outcome: "failed", message: NOT_PERIOD_MESSAGE };
  const check = validatePeriodMapping(input, {
    sheets: raw.sheets.map((s) => ({ ...s, preview: s.preview ?? null })),
    active: { versionId: a.versionId, sheets: a.sheets },
  });
  if (!check.ok) {
    return check.code === "STALE"
      ? { outcome: "stale" }
      : { outcome: "invalid", message: check.message };
  }
  if (a.sheets.some((s) => s.periodSource === "LABEL") && !(v.label && isIsoDate(v.label))) {
    return { outcome: "failed", message: LABEL_MISSING_MESSAGE };
  }
  // Kelompok file (T-060) tidak pernah menunggu pemetaan (gagal utuh di ingest); jaga-jaga saja.
  if (sourcesOf(v).length !== 1) {
    return { outcome: "failed", message: groupMappingMessage("pemetaan kolom kelompok file") };
  }
  const grain = a.grain;
  const ext: SourceKind = v.sourceKey.endsWith(".csv") ? "csv" : "xlsx";
  const usable = a.sheets.filter((s) => s.periodSource);
  const created: string[] = [];
  /** commit dipanggil lalu gagal / sudah masuk: objek segmen tidak boleh dihapus. */
  let committing = false;
  const discard = async (reason: string) => {
    if (committing) return;
    const ids = await repo.deletePeriodSegments(versionId).catch(() => [] as string[]);
    for (const id of new Set([...created, ...ids])) {
      await cleanupPrefix(repo, storage, segmentPrefix(v.datasetId, id), reason);
    }
  };
  const work = mkdtempSync(join(opts.tmpRoot, "period-map-"));
  let duck: Duck | null = null;
  try {
    // Percobaan sebelumnya job ini (worker mati sebelum commit): mulai bersih.
    for (const id of await repo.deletePeriodSegments(versionId)) {
      await storage.deletePrefix(segmentPrefix(v.datasetId, id));
    }
    duck = await openDuck({
      path: join(work, "work.duckdb"),
      tmpDir: work,
      memoryLimit: opts.duckMemory,
    });
    const d = duck;
    const items: Item[] = [];
    const parts = new Map<string, number>();
    for (const s of [...raw.sheets].sort((x, y) => x.index - y.index)) {
      const pair = usable.find((x) => x.lineageId === s.lineageId);
      if (!pair) continue; // validatePeriodMapping: setiap sheet raw berpasangan
      const path = join(work, `raw-${Math.trunc(s.index)}.parquet`);
      await storage.download(s.rawKey, path);
      await opts.watch();
      const label = usable.length > 1 ? pair.name : null;
      const cp = periodColumnPlan(
        s.columns,
        pair.schema,
        pair.colCount,
        pair.periodSource === "COLUMN" ? pair.periodColumn : null,
        label,
        check.decisions.get(pair.id) ?? new Map(),
      );
      if (cp.issues.length) return { outcome: "invalid", message: cp.issues[0]! };
      const bad = validateColMap(cp.colMap, cp.colCount, s.colCount, `sheet "${s.name}"`);
      if (bad.length) throw new IntegrityError(bad);
      const { id: _id, lineageId: _l, rawKey: _k, ...rec } = s;
      const part = (parts.get(pair.lineageId) ?? 0) + 1;
      parts.set(pair.lineageId, part);
      items.push(
        itemOf(
          { rec, path },
          pair,
          cp,
          { part: 1, name: v.originalName, sha256: raw.sha256, ext },
          part,
        ),
      );
    }
    if (!items.length) return { outcome: "invalid", message: NO_SHEET_MESSAGE };
    const core = await processPeriodItems({
      d,
      work,
      versionId,
      v,
      a,
      grain,
      sha256: raw.sha256,
      items,
      ignored: raw.ignoredSheets,
      // Jalur pemetaan: sheet tambahan diabaikan karena ada sheet yang perlu pemetaan (lihat ingest awal).
      ignoredForMapping: true,
      merged: raw.mergedSheets ?? [],
      multi: usable.length > 1,
      // Sheet tergabung (T-jsmj) menunggu pemetaan: tetap satu kelompok per periode.
      group: [...parts.values()].some((n) => n > 1) ? versionId : null,
      multiFile: false,
      deps: { repo, storage, limits: deps.limits },
      created,
      watch: opts.watch,
      setProgress: () => {},
      acceptCast: check.input.acknowledge === true,
      keyCacheDir: join(opts.tmpRoot, "key-index"),
    });
    if (core.kind === "cast") {
      // Terburuk dulu (sort stabil: urutan sheet lalu posisi untuk persen yang sama).
      const issues = [...core.review].sort((x, y) => x.pct - y.pct).slice(0, REVIEW_MAX);
      return { outcome: "review", issues };
    }
    await opts.watch(); // lock masih milik kita tepat sebelum commit
    let r: PeriodCommitResult;
    try {
      r = await repo.commit(versionId, {
        ...core.input,
        audit: {
          actorId: opts.actorId,
          ip: opts.ip,
          meta: {
            mapped: [...check.decisions.values()].reduce(
              (n, m) => n + [...m.values()].filter((x) => x !== null).length,
              0,
            ),
            nulls: [...check.decisions.values()].reduce(
              (n, m) => n + [...m.values()].filter((x) => x === null).length,
              0,
            ),
            added: core.input.changes.reduce((n, ch) => n + ch.added.length, 0),
            period: true,
            ...(opts.jobId ? { jobId: opts.jobId } : {}),
          },
        },
      });
    } catch (e) {
      // Commit bisa sudah masuk sebelum koneksi putus; gerbang integritas melempar dari dalam
      // transaksi → pasti batal, objek boleh dibersihkan.
      if (!(e instanceof IntegrityError)) committing = true;
      throw e;
    }
    if (r.outcome === "gone") {
      await discard("versi dibuang saat pemetaan");
      return { outcome: "gone" };
    }
    if (r.outcome === "stale") {
      await discard("acuan pemetaan basi");
      return { outcome: "stale" };
    }
    if (r.outcome === "rejected") {
      await discard("pemetaan ditolak batas");
      return { outcome: "failed", message: r.message };
    }
    committing = true;
    // Raw saja dari ingest tidak dirujuk lagi (segmen periode baru membawa raw-nya sendiri).
    for (const id of await repo.dropRawSegments(versionId).catch(() => [] as string[])) {
      await cleanupPrefix(repo, storage, segmentPrefix(v.datasetId, id), "raw pemetaan periode");
    }
    return { outcome: "done", activated: r.outcome === "activated" };
  } catch (e) {
    if (e instanceof PeriodUploadError) {
      await discard("pemetaan periode ditolak");
      return { outcome: "failed", message: e.message };
    }
    // Lock pemetaan hilang: job lain mungkin sedang menulis segmen versi ini — jangan sentuh.
    if (!(e instanceof Error && e.name === "LockLostError"))
      await discard("pemetaan periode gagal");
    throw e;
  } finally {
    duck?.close();
    rmSync(work, { recursive: true, force: true });
  }
}

/**
 * Sheet berlabel (T-054): min/max kolom tanggal acuan (labelReferenceColumn) di file baru, di-cast
 * dengan tipe/format skema aktif; null = tanpa kolom acuan atau kolomnya tidak ada di file. Hanya
 * informasi tinjauan ("rentang di luar label") — periode tetap label pilihan pemilik. Disimpan di
 * Segment.minDate/maxDate: untuk sheet berlabel itu rentang kolom acuan, BUKAN rentang periode —
 * pemangkasan segmen (T-058) tidak boleh memakainya sebagai rentang `_period`.
 */
async function labelRefRange(
  d: Duck,
  it: Item,
  source: SourceKind,
  raw: string,
  hr: number,
  watch: () => Promise<void>,
): Promise<{ lo: string | null; hi: string | null } | null> {
  const ref = labelReferenceColumn(it.pair.schema);
  if (!ref) return null;
  const rawCol = it.colMap.length ? (it.colMap[ref.pos - 1] ?? 0) : ref.pos;
  if (!(rawCol > 0)) return null;
  const parts = typedParts(`c${Math.trunc(rawCol)}`, ref, source);
  const r = await watched(d, watch, () =>
    one(
      d,
      `SELECT strftime(min(t), '%Y-%m-%d %H:%M:%S'), strftime(max(t), '%Y-%m-%d %H:%M:%S')
       FROM (SELECT CASE WHEN ${validDateSql("v")} THEN CAST(v AS TIMESTAMP) END AS t
             FROM (SELECT ${parts.outer("a")} AS v
                   FROM (SELECT ${parts.inner} AS a FROM read_parquet(${raw}) WHERE _row > ${hr})))`,
    ),
  );
  const str = (x: unknown) => (typeof x === "string" ? x : null);
  return { lo: str(r[0]), hi: str(r[1]) };
}

/** Kolom periode di raw file baru di-cast dengan tipe/format skema aktif → periode per baris data. */
async function assignPeriods(
  d: Duck,
  it: Item,
  grain: PeriodGrain,
  source: SourceKind,
  label: string | null,
  watch: () => Promise<void>,
): Promise<void> {
  const hr = Math.trunc(it.s.rec.headerRow);
  const raw = lit(it.s.path);
  const table = `assign_${it.tag}`;
  if (it.pair.periodSource === "LABEL") {
    if (!label || !isIsoDate(label)) throw new PeriodUploadError(LABEL_MISSING_MESSAGE);
    await d.conn.run(
      `CREATE OR REPLACE TABLE ${table} AS SELECT CAST(_row AS BIGINT) AS src, DATE '${label}' AS p
       FROM read_parquet(${raw}) WHERE _row > ${hr}`,
    );
    const n = Number((await one(d, `SELECT count(*) FROM ${table}`))[0]);
    const range = n > 0 ? await labelRefRange(d, it, source, raw, hr, watch) : null;
    it.periods =
      n > 0 ? [{ start: label, rows: n, lo: range?.lo ?? null, hi: range?.hi ?? null }] : [];
    it.missing = 0;
    return;
  }
  const pos = it.pair.periodColumn;
  const col: ColumnSchema | undefined = it.pair.schema.find((c) => c.pos === pos);
  if (!col || (col.type !== "date" && col.type !== "timestamp")) {
    throw new PeriodUploadError(
      `Kolom periode sheet “${it.pair.name}” bukan kolom tanggal lagi. Atur ulang periode atau ganti semua data.`,
    );
  }
  const rawCol = it.colMap.length ? it.colMap[col.pos - 1]! : col.pos;
  const parts = typedParts(`c${Math.trunc(rawCol)}`, col, source);
  await watched(d, watch, () =>
    d.conn.run(
      `CREATE OR REPLACE TABLE ${table} AS
       SELECT src, CASE WHEN ${validDateSql("v")} THEN ${periodSql(grain, "v")} END AS p,
              CASE WHEN ${validDateSql("v")} THEN CAST(v AS TIMESTAMP) END AS d
       FROM (SELECT src, ${parts.outer("a")} AS v
             FROM (SELECT CAST(_row AS BIGINT) AS src, ${parts.inner} AS a
                   FROM read_parquet(${raw}) WHERE _row > ${hr}))`,
    ),
  );
  const rows = (
    await d.conn.runAndReadAll(
      `SELECT strftime(p, '%Y-%m-%d') AS p, count(*) AS n,
         strftime(min(d), '%Y-%m-%d %H:%M:%S') AS lo, strftime(max(d), '%Y-%m-%d %H:%M:%S') AS hi
       FROM ${table} WHERE p IS NOT NULL GROUP BY 1 ORDER BY 1`,
    )
  ).getRowObjects() as { p: string; n: bigint | number; lo: string | null; hi: string | null }[];
  it.periods = rows.map((r) => ({ start: r.p, rows: Number(r.n), lo: r.lo, hi: r.hi }));
  it.missing = Number((await one(d, `SELECT count(*) FROM ${table} WHERE p IS NULL`))[0]);
}

/**
 * Raw per periode (baris judul + baris periode itu, nomor baris fisik apa adanya) + profil kanonik;
 * satu periode tanpa baris tanpa tanggal = raw file utuh (tanpa salinan). `extra` = profil baris tanpa
 * tanggal valid (ikut vonis cast, tidak disimpan di segmen mana pun).
 */
async function segmentRaws(
  d: Duck,
  it: Item,
  work: string,
  watch: () => Promise<void>,
): Promise<{
  segments: Map<string, { raw: string; profile: RawProfile; maxSrcRow: number; rawRows: number }>;
  extra: RawProfile[];
}> {
  const hr = Math.trunc(it.s.rec.headerRow);
  const table = `assign_${it.tag}`;
  const profileOf = async (path: string) =>
    canonicalProfile(
      await profileRaw(d, { rawPath: path, headerRow: hr, colCount: it.rawCols, watch }),
      it.colMap,
      it.width,
    );
  const rawRows = async (path: string) =>
    Number((await one(d, `SELECT count(*) FROM read_parquet(${lit(path)})`))[0]);
  const subset = async (where: string, out: string) => {
    await watched(d, watch, () =>
      copyParquet(
        d,
        `SELECT r.* FROM read_parquet(${lit(it.s.path)}) r
         WHERE r._row <= ${hr} OR r._row IN (SELECT src FROM ${table} WHERE ${where})
         ORDER BY r._row`,
        out,
        it.rawCols + 1,
      ),
    );
  };
  const segments = new Map<
    string,
    { raw: string; profile: RawProfile; maxSrcRow: number; rawRows: number }
  >();
  if (it.periods.length === 1 && it.missing === 0) {
    const p = it.periods[0]!;
    segments.set(p.start, {
      raw: it.s.path,
      profile: await profileOf(it.s.path),
      maxSrcRow: await maxSourceRow(d, it.s.path),
      rawRows: it.s.rec.rawRows,
    });
    return { segments, extra: [] };
  }
  for (const [k, p] of it.periods.entries()) {
    if (!isIsoDate(p.start)) throw new Error(`awal periode tidak valid: ${p.start}`);
    const out = join(work, `seg-${it.tag}-${k}-raw.parquet`);
    await subset(`p = DATE '${p.start}'`, out);
    segments.set(p.start, {
      raw: out,
      profile: await profileOf(out),
      maxSrcRow: await maxSourceRow(d, out),
      rawRows: await rawRows(out),
    });
    await watch();
  }
  const extra: RawProfile[] = [];
  if (it.missing > 0) {
    const out = join(work, `missing-${it.tag}-raw.parquet`);
    await subset("p IS NULL", out);
    extra.push(await profileOf(out));
    rmSync(out, { force: true });
  }
  return { segments, extra };
}
