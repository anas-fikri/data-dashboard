/*
 * Ingest unggahan periode (T-052, rencana G-6 §4.5 langkah 3–5): versi mode PERIOD pada dataset yang
 * versi aktifnya per periode. Hanya file baru yang di-parse dan di-cast; periode lama dirujuk ulang
 * (tidak ada objek baru untuk periode yang tidak berubah).
 *  1. Parse file ke raw lokal (sama dengan ingest biasa), pasangkan sheet dengan sheet aktif (nama/alias),
 *     baris judul + kolom → posisi kanonik skema aktif (peta kolom per segmen, divalidasi).
 *     Kolom terlihat hilang / kolom periode hilang → AWAITING_MAPPING (pemetaan periode = T-057).
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
import {
  castIssues,
  periodColumnPlan,
  planInputs,
  validateColMap,
  type ActivePeriodSheet,
  type IncomingSegmentRef,
  type UploadFacts,
} from "./period-upload-plan";
import { mergeProfiles, packProfile, type RawProfile, type StoredProfile } from "./profile";
import { copyParquet } from "./raw-writer";
import { planSheets, verdictOf, type ActiveSheet, type SnapshotRef } from "./refresh";
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
  /** INGESTING → AWAITING_MAPPING dengan alasan (versi aktif tidak berubah). */
  awaitMapping(versionId: string, d: { sha256: string; reason: string }): Promise<boolean>;
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
  /** Jumlah kolom raw file (c1..c<rawCols>). */
  rawCols: number;
  rawBytes: number;
  periods: { start: string; rows: number; lo: string | null; hi: string | null }[];
  missing: number;
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
      items.push({
        s,
        pair,
        colMap: cp.colMap,
        rawCols: s.rec.colCount,
        rawBytes: statSync(s.path).size,
        periods: [],
        missing: 0,
      });
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
      if (!(await repo.awaitMapping(versionId, { sha256: dl.sha256, reason }))) {
        throw new DatasetGoneError();
      }
      return { outcome: "awaiting", sheets: items.length, message: reason };
    };
    if (!items.length) throw new PeriodUploadError(NO_SHEET_MESSAGE);
    for (const it of items) {
      const bad = validateColMap(
        it.colMap,
        it.pair.colCount,
        it.rawCols,
        `sheet "${it.s.rec.name}"`,
      );
      if (bad.length && !issues.length) throw new IntegrityError(bad);
    }
    if (issues.length) {
      return await awaitMapping(issues);
    }

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
      const all = mergeProfiles([
        ...[...per.segments.values()].map((x) => x.profile),
        ...per.extra,
      ]);
      const label = usable.length > 1 ? it.pair.name : null;
      issues.push(...castIssues(it.pair.schema, all, it.colMap, ext, label));
    }
    if (issues.length) return await awaitMapping(issues);

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
          schema: it.pair.schema,
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
          columns: [...new Set(it.pair.schema.map((c) => c.pos))].sort((x, y) => x - y),
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

    // 6. Gerbang integritas kunci (HEAD di luar lock), lalu commit di bawah lock Dataset.
    const all = [...new Set([...keys, ...a.sheets.flatMap((s) => s.keys)])];
    const missing = await missingKeys(all, (k) => storage.exists(k));
    if (missing.length) throw new IntegrityError(missing.map((k) => `file data tidak ada: ${k}`));
    let r: PeriodCommitResult;
    try {
      r = await repo.commit(versionId, {
        snapshot: {
          activeVersionId: a.versionId,
          sheets: a.sheets.map((s) => ({ id: s.id, schemaRevision: s.schemaRevision })),
        },
        sha256: dl.sha256,
        facts,
        allowAuto: v.baseVersionId === a.versionId,
        present: all,
      });
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
      it.pair.colCount,
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
