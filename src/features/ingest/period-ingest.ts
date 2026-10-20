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
 */
import { mkdtempSync, rmSync, statSync } from "node:fs";
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
import { computePeriodPlan, type OnLimit, type PeriodLimits, type PeriodPlan } from "./period-plan";
import { labelReferenceColumn, periodSql, validDateSql } from "./period-setup-plan";
import { REVIEW_MAX, validatePeriodMapping, type MappingReviewIssue } from "./mapping-input";
import {
  castIssues,
  castProblems,
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
}

export interface PeriodIngestLoad {
  datasetId: string;
  sourceKey: string;
  originalName: string | null;
  /** Satuan versi (dari versi aktif saat init). */
  grain: PeriodGrain | null;
  /** Awal periode untuk sheet bersumber label (ISO naive); null = tanpa label. */
  label: string | null;
  /** Versi aktif yang dilihat pemilik saat init. */
  baseVersionId: string | null;
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
    d: { sha256: string; reason: string; ignoredSheets: string[] },
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

const one = async (duck: Duck, sql: string): Promise<unknown[]> =>
  (await duck.conn.runAndReadAll(sql)).getRows()[0] ?? [];

interface Item {
  s: { rec: SheetRecord; path: string };
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
): Item {
  return {
    s,
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

    const ext: SourceKind = v.sourceKey.endsWith(".csv") ? "csv" : "xlsx";
    const src = join(work, `source.${ext}`);
    const dl = await storage.download(v.sourceKey, src);
    await ensureAlive();
    setProgress({ stage: "baca" });
    duck = await openDuck({
      path: join(work, "work.duckdb"),
      tmpDir: work,
      memoryLimit: opts.duckMemory,
      threads: opts.duckThreads,
      widePath: join(work, "wide.duckdb"),
    });
    const d = duck;
    const sheets =
      ext === "xlsx"
        ? await xlsxSheets(
            d,
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
              d,
              src,
              work,
              ensureAlive,
              (n) => setProgress({ sheetName: "CSV", rowsEstimate: n }),
              { bufferSize: opts.csvBufferSize },
            ),
          ];
    await ensureAlive();

    // 1. Pasangan sheet + kolom (hanya sheet aktif yang punya sumber periode bisa menerima data).
    const usable = a.sheets.filter((s) => s.periodSource);
    const plan = planSheets(
      sheets.map((s) => s.rec),
      usable,
    );
    const ignored: string[] = [];
    const items: Item[] = [];
    const issues: string[] = [];
    for (const [i, s] of sheets.entries()) {
      const pair = (plan.pairs[i] as PeriodActiveSheet | null) ?? null;
      if (!pair) {
        ignored.push(s.rec.name);
        continue;
      }
      Object.assign(s.rec, await refreshHeader(d, s, pair));
      const label = usable.length > 1 ? pair.name : null;
      const cp = periodColumnPlan(
        s.rec.columns,
        pair.schema,
        pair.colCount,
        pair.periodSource === "COLUMN" ? pair.periodColumn : null,
        label,
      );
      issues.push(...cp.issues);
      items.push(itemOf(s, pair, cp));
    }
    /** Versi menunggu pemetaan: sheet raw saja (tanpa typed/manifest), versi aktif tidak berubah. */
    const awaitMapping = async (found: string[]): Promise<IngestOutcome> => {
      const verdict = verdictOf(found);
      const reason = verdict.ok ? "" : verdict.reason;
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
          sha256: dl.sha256,
          sourceKind: ext,
          period: null,
        });
        created.push(id);
        await storage.upload(rawKey, it.s.path, PARQUET);
        await repo.createRawSheet(versionId, it.s.rec, it.pair.lineageId, id, rawKey);
        await ensureAlive();
      }
      if (
        !(await repo.awaitMapping(versionId, { sha256: dl.sha256, reason, ignoredSheets: ignored }))
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
      return await awaitMapping(issues);
    }
    const core = await processPeriodItems({
      d,
      work,
      versionId,
      v,
      a,
      grain,
      ext,
      sha256: dl.sha256,
      items,
      ignored,
      multi: usable.length > 1,
      deps,
      created,
      watch: ensureAlive,
      setProgress,
      acceptCast: false,
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
            csv: v.sourceKey.endsWith(".csv"),
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
  /** Jenis file asal segmen baru (cast memakai jenisnya). */
  ext: SourceKind;
  sha256: string;
  items: Item[];
  /** Sheet file yang tidak berpasangan (tidak disimpan). */
  ignored: string[];
  /** Dataset punya lebih dari satu sheet periode (nama sheet di pesan). */
  multi: boolean;
  deps: Pick<PeriodIngestDeps, "storage" | "limits"> & {
    repo: Pick<PeriodIngestRepo, "allocateRows" | "createSegment" | "addTyped">;
  };
  /** Id segmen yang dibuat (pembersihan saat gagal). */
  created: string[];
  watch: () => Promise<void>;
  setProgress: (p: Partial<IngestProgress>) => void;
  /** Pemetaan dengan persetujuan pemilik (T-057): nilai yang tidak cocok menjadi kosong. */
  acceptCast: boolean;
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
  const { d, work, versionId, v, a, grain, ext, items, deps } = c;
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
    await assignPeriods(d, it, grain, ext, v.label, ensureAlive);
  }

  // 3. Tolak lebih awal (byte = batas bawah: raw saja, typed belum ditulis).
  const facts: UploadFacts = {
    grain,
    source: items.some((it) => it.pair.periodSource === "LABEL") ? "LABEL" : "COLUMN",
    fileSheets: [...new Set(items.map((it) => it.pair.lineageId))],
    droppedRows: items.reduce((n, it) => n + it.missing, 0),
    ignoredSheets: ignored,
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
        }));
      }),
    ).incoming,
    incomingSheets: facts.fileSheets,
    settings: v.settings,
    limits: deps.limits,
    fileSha256: facts.fileSha256,
    droppedRows: facts.droppedRows,
    ignoredSheets: facts.ignoredSheets,
  });
  if (early.rejection) throw new PeriodUploadError(early.rejection.message);

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
    const found = castProblems(it.schema, all, it.colMap, ext);
    issues.push(...castIssues(it.schema, all, it.colMap, ext, label));
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
  if (issues.length && !c.acceptCast) return { kind: "cast", issues, review };

  // 5. Segmen per periode (raw + typed skema aktif + `_period`).
  setProgress({ stage: "tipe", fraction: null });
  const incoming: IncomingSegmentRef[] = [];
  const keys: string[] = [];
  for (const it of items) {
    const hr = Math.trunc(it.s.rec.headerRow);
    for (const p of it.periods) {
      const seg = profiles.get(it)!.get(p.start)!;
      const key = periodKeyOf(grain, p.start);
      const label = `sheet "${it.s.rec.name}" periode ${periodLabel(grain, p.start)}`;
      if (seg.profile.dataRows !== p.rows) {
        throw new IntegrityError([
          `${label}: ${seg.profile.dataRows} baris tertulis, ${p.rows} baris dihitung`,
        ]);
      }
      const rowBase = await repo.allocateRows(it.pair.lineageId, seg.maxSrcRow);
      const typedPath = join(work, `typed-${it.s.rec.index}-${key}.parquet`);
      const chars = [...seg.profile.profiles.values()].reduce((n, x) => n + x.chars, 0);
      await copyTyped(d, {
        rawPath: seg.raw,
        outPath: typedPath,
        source: ext,
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
      const id = newSegmentId();
      const sp = segmentPrefix(v.datasetId, id);
      const rawKey = `${sp}raw.parquet`;
      const typedKey = `${sp}typed-${it.pair.schemaRevision}.parquet`;
      const rawBytes = statSync(seg.raw).size;
      const typedBytes = statSync(typedPath).size;
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
        sha256: dl.sha256,
        sourceKind: ext,
        period: { key, start: p.start, minDate: p.lo, maxDate: p.hi },
      });
      created.push(id);
      await storage.upload(rawKey, seg.raw, PARQUET);
      await storage.upload(typedKey, typedPath, PARQUET);
      const typedId = await repo.addTyped(id, {
        typedKey,
        schemaRevision: it.pair.schemaRevision,
        columns: [...new Set(it.schema.map((x) => x.pos))].sort((x, y) => x - y),
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
      });
      keys.push(rawKey, typedKey);
      rmSync(typedPath, { force: true });
      if (seg.raw !== it.s.path) rmSync(seg.raw, { force: true });
      await ensureAlive();
    }
  }

  // 6. Gerbang integritas kunci (HEAD di luar lock); commit di bawah lock Dataset oleh pemanggil.
  const all = [...new Set([...keys, ...a.sheets.flatMap((s) => s.keys)])];
  const missing = await missingKeys(all, (k) => storage.exists(k));
  if (missing.length) throw new IntegrityError(missing.map((k) => `file data tidak ada: ${k}`));
  const changes: SheetSchemaChange[] = items.flatMap((it) =>
    it.change
      ? [
          {
            ...withAddedStats(it.change, merged.get(it)!),
            lineageId: it.pair.lineageId,
            baseRevision: it.pair.schemaRevision,
          },
        ]
      : [],
  );
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
  "load" | "allocateRows" | "createSegment" | "addTyped" | "recordCleanup"
> {
  /** Sheet raw versi yang menunggu pemetaan + fakta file dari ingest; null = versi tidak ada. */
  rawSheets(versionId: string): Promise<{
    sheets: PeriodRawSheet[];
    sha256: string;
    ignoredSheets: string[];
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
      items.push(itemOf({ rec, path }, pair, cp));
    }
    if (!items.length) return { outcome: "invalid", message: NO_SHEET_MESSAGE };
    const core = await processPeriodItems({
      d,
      work,
      versionId,
      v,
      a,
      grain,
      ext,
      sha256: raw.sha256,
      items,
      ignored: raw.ignoredSheets,
      multi: usable.length > 1,
      deps: { repo, storage, limits: deps.limits },
      created,
      watch: opts.watch,
      setProgress: () => {},
      acceptCast: check.input.acknowledge === true,
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
  const table = `assign_${Math.trunc(it.s.rec.index)}`;
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
  const table = `assign_${Math.trunc(it.s.rec.index)}`;
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
    const out = join(work, `seg-${it.s.rec.index}-${k}-raw.parquet`);
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
    const out = join(work, `missing-${it.s.rec.index}-raw.parquet`);
    await subset("p IS NULL", out);
    extra.push(await profileOf(out));
    rmSync(out, { force: true });
  }
  return { segments, extra };
}
