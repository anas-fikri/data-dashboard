/*
 * Job "Atur periode" (T-051, rencana G-6 §4.4 langkah 2; job "period-setup" di antrean ingest, jobId =
 * versionId): memecah data versi aktif menjadi satu segmen per periode sebagai versi PERIOD_SETUP, lalu
 * mengaktifkannya. Biaya O(total) sekali; versi lama tetap tersimpan, jadi rollback mengembalikan
 * dataset ke mode biasa.
 *  - Acuan dipin: versi dasar (baseVersionId) + revisi skema tiap sheet. Berubah sebelum aktivasi →
 *    FAILED dengan ajakan meninjau ulang (tidak pernah diterapkan ke basis yang salah).
 *  - Per sheet: unduh raw + typed segmen dasar (tepat satu segmen per sheet), tetapkan periode setiap
 *    baris data dari file typed (kolom tanggal bertipe: date_trunc satuan, naive D8; label: satu periode
 *    untuk semua baris), lalu per periode tulis raw baru (baris judul + baris periode itu, nomor baris
 *    fisik tetap) dan typed dengan skema yang SAMA (`_period` = awal periode, `_row` baru dari lineage).
 *  - Sebaran yang dihitung job harus sama persis dengan yang ditinjau pemilik (baris per periode per
 *    sheet + baris tanpa tanggal valid). Baris tanpa tanggal valid hanya dibuang bila jumlahnya sama
 *    dengan pilihan eksplisit "Buang N baris"; selain itu FAILED, data aktif tidak berubah.
 *  - Setiap file diperiksa (typedFileProblems: baris, `_row` unik, `_period`), lalu gerbang integritas
 *    versi, lalu aktivasi di bawah lock Dataset (+ AuditLog dataset.period.activate).
 *  - Percobaan ulang mulai bersih: sheet/segmen percobaan sebelumnya versi ini dihapus dulu.
 */
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { lit, openDuck, watched, type Duck } from "@/lib/duckdb";
import { newSegmentId, segmentPrefix } from "@/features/versions/segment-keys";
import {
  IntegrityError,
  verifyVersionIntegrity,
  type ManifestSheet,
} from "@/features/versions/integrity-check";
import type { ColumnSchema, SourceKind } from "./infer";
import {
  DatasetGoneError,
  DeadlineError,
  INGEST_DEADLINE_MS,
  permanentMessage,
  type IngestProgress,
  type TypedStorage,
} from "./ingest";
import { isIsoDate, periodKeyOf, periodLabel, type PeriodGrain, type PeriodSource } from "./period";
import { packProfile, type StoredProfile } from "./profile";
import { copyParquet } from "./raw-writer";
import {
  PERIOD_SETUP_JOB,
  PERIOD_SETUP_STAGE,
  periodColumnOf,
  periodSql,
  validDateSql,
} from "./period-setup-plan";
import type { SnapshotRef } from "./refresh";
import { copyTyped, maxSourceRow, profileRaw, typedFileProblems } from "./typed";

const PARQUET = "application/vnd.apache.parquet";
export { PERIOD_SETUP_JOB, PERIOD_SETUP_STAGE };

/** Pilihan per sheet yang sudah ditinjau (dibekukan di data job). */
export interface SetupSheetChoice {
  sheetId: string;
  source: PeriodSource;
  /** Posisi kanonik kolom tanggal (COLUMN). */
  column: number | null;
  /** Awal periode semua baris (LABEL). */
  label: string | null;
  /** Sebaran yang ditinjau: baris per awal periode + baris tanpa tanggal valid. */
  expected: { periods: Record<string, number>; missing: number };
}

export interface PeriodSetupJobData {
  versionId: string;
  datasetId: string;
  baseVersionId: string;
  grain: PeriodGrain;
  /** Revisi skema sheet versi dasar saat ditinjau (PLAN_STALE bila berubah). */
  base: SnapshotRef;
  sheets: SetupSheetChoice[];
  /** "Buang N baris" yang dicentang pemilik (= jumlah semua `expected.missing`). */
  dropMissing: number;
  actorId: string;
  ip: string;
}

/** Segmen manifest sheet dasar (tepat satu untuk aktivasi periode). */
export interface SetupSourceSegment {
  segmentId: string;
  rawKey: string;
  typedKey: string;
  /** Typed lama (T-036): `_row` = baris fisik, tanpa `_src_row`. */
  legacyRow: boolean;
  /** Baris judul file typed (SegmentTyped.headerRow ?? Segment.headerRow). */
  headerRow: number;
  colCount: number;
  colMap: number[];
  sourceKind: SourceKind;
  sha256: string | null;
  originalName: string | null;
  /** Pengunggah file asal (T-056); tidak ada/null = tidak diketahui. */
  uploadedById?: string | null;
  dataRows: number | null;
}

export interface SetupSourceSheet {
  id: string;
  index: number;
  name: string;
  aliasName: string | null;
  lineageId: string;
  /** Raw sheet di versi dasar (dibawa apa adanya untuk sheet tanpa data typed). */
  rawKey: string;
  headerRow: number;
  colCount: number;
  columns: unknown;
  truncatedCells: number;
  preview: unknown;
  rawRows: number;
  schemaRevision: number;
  schema: ColumnSchema[] | null;
  typedKey: string | null;
  segments: SetupSourceSegment[];
}

export interface SetupLoad {
  datasetId: string;
  status: string;
  mode: string;
  /** Versi dasar beserta sheet-nya; null = versi dasar sudah tidak ada. */
  base: { id: string; sheets: SetupSourceSheet[] } | null;
}

export interface NewSetupSegment {
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
  periodKey: string;
  periodStart: string;
  /** Tanggal terkecil/terbesar kolom periode (naive "YYYY-MM-DD HH:MM:SS"); null = label. */
  minDate: string | null;
  maxDate: string | null;
  sha256: string | null;
  originalName: string | null;
  /** Pengunggah file asal segmen sumber (T-056); null = tidak diketahui. */
  uploadedById?: string | null;
  sourceKind: SourceKind;
}

export interface NewSetupSheet {
  from: SetupSourceSheet;
  /** null = sheet tanpa data typed (disalin tanpa manifest). */
  periodSource: PeriodSource | null;
  periodColumn: number | null;
  rawRows: number;
  /** Urut periode (ordinal = indeks). */
  segments: {
    segmentId: string;
    rawKey: string;
    typedKey: string;
    dataRows: number;
    typedBytes: number;
    profile: StoredProfile;
  }[];
}

export interface PeriodSetupRepo {
  load(versionId: string, baseVersionId: string): Promise<SetupLoad | null>;
  /** INGESTING (tahap period-setup) → mulai; false = versi tidak layak diproses. */
  begin(versionId: string): Promise<boolean>;
  /** Versi masih ada dan masih INGESTING. */
  alive(versionId: string): Promise<boolean>;
  progress(versionId: string, p: IngestProgress): Promise<void>;
  /** Hapus sheet + segmen percobaan sebelumnya versi ini; id segmen yang dihapus. */
  deleteAttempt(versionId: string): Promise<string[]>;
  allocateRows(lineageId: string, span: number): Promise<bigint>;
  createSegment(versionId: string, d: NewSetupSegment): Promise<void>;
  /** Sheet + file typed + manifest versi ini (versi tetap INGESTING, belum aktif). */
  writeSheets(versionId: string, sheets: NewSetupSheet[]): Promise<Record<string, string>>;
  manifest(versionId: string): Promise<ManifestSheet[] | null>;
  /**
   * Di bawah lock Dataset: acuan basi → "stale"; versi bukan INGESTING → "gone"; selain itu READY +
   * aktif (sheetMap) + AuditLog dataset.period.activate.
   */
  finish(
    versionId: string,
    d: {
      base: SnapshotRef;
      sheetMap: Record<string, string>;
      actorId: string;
      ip: string;
      meta: Record<string, unknown>;
    },
  ): Promise<"activated" | "stale" | "gone">;
  /** INGESTING → FAILED; false = versi sudah di status lain. */
  fail(versionId: string, message: string): Promise<boolean>;
  recordCleanup(prefix: string, reason: string): Promise<void>;
}

export interface PeriodSetupDeps {
  repo: PeriodSetupRepo;
  storage: TypedStorage;
  tmpRoot: string;
  duckMemory?: string;
  duckThreads?: number;
  /** Uji: batas waktu absolut (epoch ms). */
  deadline?: number;
}

export type PeriodSetupOutcome =
  | { outcome: "done"; sheets: number; periods: number }
  | { outcome: "failed"; message: string }
  | { outcome: "gone" | "skipped" };

export const SETUP_STALE_MESSAGE =
  "Data aktif berubah sejak ditinjau (versi lain diaktifkan atau skema diubah), jadi periode tidak diterapkan dan data aktif tidak berubah. Buka “Atur periode” lagi untuk meninjau ulang.";
const SETUP_DEADLINE_MESSAGE =
  "Pengaturan periode melebihi 60 menit dan dibatalkan; data aktif tidak berubah. Coba lagi nanti atau hubungi admin.";

/** Galat permanen dengan pesan untuk pemilik (data aktif tidak berubah). */
export class SetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SetupError";
  }
}

const one = async (duck: Duck, sql: string): Promise<unknown[]> =>
  (await duck.conn.runAndReadAll(sql)).getRows()[0] ?? [];

/** Teks timestamp naive DuckDB → nilai kolom @db.Timestamp (UTC tanpa geser). */
export const naiveToDate = (s: string | null): Date | null =>
  s ? new Date(`${s.replace(" ", "T")}Z`) : null;

export async function runPeriodSetup(
  job: PeriodSetupJobData,
  deps: PeriodSetupDeps,
): Promise<PeriodSetupOutcome> {
  const { repo, storage } = deps;
  const { versionId } = job;
  const deadline = deps.deadline ?? Date.now() + INGEST_DEADLINE_MS;
  const watch = async () => {
    if (Date.now() > deadline) throw new DeadlineError("atur periode");
    if (!(await repo.alive(versionId))) throw new DatasetGoneError();
  };
  const v = await repo.load(versionId, job.baseVersionId);
  if (!v) return { outcome: "gone" };
  if (v.status !== "INGESTING" || v.mode !== "PERIOD_SETUP") return { outcome: "skipped" };
  if (!(await repo.begin(versionId))) return { outcome: "skipped" };

  const work = mkdtempSync(join(deps.tmpRoot, "ingest-period-"));
  let duck: Duck | null = null;
  const created: string[] = [];
  /** finish dipanggil lalu gagal: status commit tidak diketahui → objek tidak boleh dihapus. */
  let committing = false;
  const cleanupSegments = async (ids: string[], reason: string) => {
    if (committing) return;
    for (const id of ids) {
      const prefix = segmentPrefix(v.datasetId, id);
      await storage
        .deletePrefix(prefix)
        .catch((e: unknown) =>
          repo
            .recordCleanup(prefix, `${reason}: ${e instanceof Error ? e.message : String(e)}`)
            .catch(() => {}),
        );
    }
  };
  try {
    // Percobaan sebelumnya (worker mati / galat sementara): mulai bersih.
    await cleanupSegments(await repo.deleteAttempt(versionId), "atur periode diulang");
    if (!v.base) throw new SetupError(SETUP_STALE_MESSAGE);
    const choices = new Map(job.sheets.map((c) => [c.sheetId, c]));
    // Setiap sheet ber-data harus punya pilihan yang ditinjau (dan sebaliknya).
    const dataSheets = v.base.sheets.filter((s) => s.typedKey);
    if (
      dataSheets.length !== job.sheets.length ||
      dataSheets.some((s) => !choices.has(s.id)) ||
      job.base.activeVersionId !== v.base.id
    ) {
      throw new SetupError(SETUP_STALE_MESSAGE);
    }
    const rev = new Map(job.base.sheets.map((s) => [s.id, s.schemaRevision]));
    if (v.base.sheets.some((s) => rev.get(s.id) !== s.schemaRevision)) {
      throw new SetupError(SETUP_STALE_MESSAGE);
    }
    const expectedMissing = job.sheets.reduce((n, c) => n + c.expected.missing, 0);
    if (expectedMissing !== job.dropMissing) {
      throw new SetupError(
        "Baris tanpa tanggal valid belum dipilih untuk dibuang. Tinjau ulang di “Atur periode”.",
      );
    }

    duck = await openDuck({
      path: join(work, "work.duckdb"),
      tmpDir: work,
      memoryLimit: deps.duckMemory,
      threads: deps.duckThreads,
    });
    const out: NewSetupSheet[] = [];
    const periods = new Set<string>();
    let dropped = 0;
    for (const [i, s] of v.base.sheets.entries()) {
      const choice = choices.get(s.id);
      if (!choice) {
        out.push({
          from: s,
          periodSource: null,
          periodColumn: null,
          rawRows: s.rawRows,
          segments: [],
        });
        continue;
      }
      const at = { sheet: i, sheetName: s.name, rows: s.rawRows, fraction: null };
      await repo
        .progress(versionId, { stage: "simpan", refresh: true, rowsEstimate: null, ...at })
        .catch(() => {});
      const r = await splitSheet(duck, job, v.datasetId, s, choice, work, deps, watch, created);
      dropped += r.dropped;
      r.periods.forEach((p) => periods.add(p));
      out.push(r.sheet);
      await watch();
    }
    if (dropped !== job.dropMissing) {
      throw new SetupError(
        "Jumlah baris tanpa tanggal valid berbeda dengan yang ditinjau. Tinjau ulang di “Atur periode”.",
      );
    }
    const sheetMap = await repo.writeSheets(versionId, out);
    // Gerbang integritas (fail-closed) sebelum aktivasi: manifest periode + semua kunci ada.
    const problems = await verifyVersionIntegrity(versionId, {
      manifest: (id) => repo.manifest(id),
      exists: (k) => storage.exists(k),
    });
    if (problems.length) throw new IntegrityError(problems);
    await watch();
    let done: Awaited<ReturnType<PeriodSetupRepo["finish"]>>;
    try {
      done = await repo.finish(versionId, {
        base: job.base,
        sheetMap,
        actorId: job.actorId,
        ip: job.ip,
        meta: {
          versionId,
          grain: job.grain,
          periods: periods.size,
          droppedRows: dropped,
          sheets: job.sheets.map((c) => ({
            sheetId: c.sheetId,
            source: c.source,
            column: c.column,
            label: c.label,
          })),
        },
      });
    } catch (e) {
      // Commit bisa sudah masuk sebelum koneksi putus: objek segmen mungkin milik versi yang kini
      // aktif — jangan dihapus di sini (percobaan ulang yang belum commit membersihkan lewat
      // deleteAttempt; segmen yatim disapu audit malam).
      committing = true;
      throw e;
    }
    if (done === "gone") throw new DatasetGoneError();
    if (done === "stale") throw new SetupError(SETUP_STALE_MESSAGE);
    return { outcome: "done", sheets: out.length, periods: periods.size };
  } catch (e) {
    if (e instanceof DatasetGoneError) {
      await cleanupSegments(created, "atur periode dibatalkan");
      return { outcome: "gone" };
    }
    const message =
      e instanceof SetupError
        ? e.message
        : e instanceof DeadlineError
          ? SETUP_DEADLINE_MESSAGE
          : e instanceof IntegrityError
            ? `${e.message} Periode tidak diterapkan dan data aktif tidak berubah. Coba lagi; bila terulang, hubungi admin.`
            : permanentMessage(e);
    if (message === null) {
      if (!(await repo.alive(versionId).catch(() => true))) {
        await cleanupSegments(created, "atur periode dibatalkan");
        return { outcome: "gone" };
      }
      throw e; // sementara: BullMQ mengulang (percobaan berikutnya mulai bersih)
    }
    if (!(await repo.fail(versionId, message))) return { outcome: "skipped" };
    const removed = await repo.deleteAttempt(versionId).catch(() => [] as string[]);
    await cleanupSegments([...new Set([...created, ...removed])], "atur periode gagal");
    return { outcome: "failed", message };
  } finally {
    duck?.close();
    rmSync(work, { recursive: true, force: true });
  }
}

/** Satu sheet → segmen per periode (diunggah + baris Segment), sesuai sebaran yang ditinjau. */
async function splitSheet(
  duck: Duck,
  job: PeriodSetupJobData,
  datasetId: string,
  s: SetupSourceSheet,
  choice: SetupSheetChoice,
  work: string,
  deps: PeriodSetupDeps,
  watch: () => Promise<void>,
  created: string[],
): Promise<{ sheet: NewSetupSheet; periods: string[]; dropped: number }> {
  const label = `sheet "${s.name}"`;
  if (s.segments.length !== 1) {
    throw new SetupError(
      `Sheet “${s.name}” sudah terdiri dari beberapa bagian data; atur periode hanya untuk data biasa. Ganti semua data untuk memakai pengaturan periode lain.`,
    );
  }
  const g = s.segments[0]!;
  const schema = s.schema ?? [];
  const rawPath = join(work, `raw-${s.index}.parquet`);
  const typedPath = join(work, `typed-${s.index}.parquet`);
  await deps.storage.download(g.rawKey, rawPath);
  await deps.storage.download(g.typedKey, typedPath);
  await watch();
  const src = g.legacyRow ? "_row" : "_src_row";
  let assign: string;
  /** Kolom periode di file typed baru (COLUMN): setiap baris harus jatuh di periode segmennya. */
  let periodCol: string | null = null;
  if (choice.source === "COLUMN") {
    const c = periodColumnOf(schema, choice.column);
    if (!c) throw new SetupError(SETUP_STALE_MESSAGE);
    const col = `c${Math.trunc(c.pos)}`;
    periodCol = col;
    const ok = validDateSql(col);
    assign = `SELECT CAST(${src} AS BIGINT) AS src,
        CASE WHEN ${ok} THEN ${periodSql(job.grain, col)} END AS p,
        CASE WHEN ${ok} THEN CAST(${col} AS TIMESTAMP) END AS d
      FROM read_parquet(${lit(typedPath)})`;
  } else {
    if (!choice.label || !isIsoDate(choice.label)) throw new SetupError(SETUP_STALE_MESSAGE);
    assign = `SELECT CAST(${src} AS BIGINT) AS src, DATE '${choice.label}' AS p,
        CAST(NULL AS TIMESTAMP) AS d FROM read_parquet(${lit(typedPath)})`;
  }
  await duck.conn.run(`CREATE OR REPLACE TABLE assign AS ${assign}`);
  const counts = (
    await watched(duck, watch, () =>
      duck.conn.runAndReadAll(
        `SELECT strftime(p, '%Y-%m-%d') AS p, count(*) AS n,
            strftime(min(d), '%Y-%m-%d %H:%M:%S') AS lo, strftime(max(d), '%Y-%m-%d %H:%M:%S') AS hi
         FROM assign WHERE p IS NOT NULL GROUP BY 1 ORDER BY 1`,
      ),
    )
  ).getRowObjects() as { p: string; n: bigint | number; lo: string | null; hi: string | null }[];
  const missing = Number((await one(duck, `SELECT count(*) FROM assign WHERE p IS NULL`))[0]);
  // Sebaran harus sama persis dengan yang ditinjau (baris per periode + tanpa tanggal valid).
  const got = Object.fromEntries(counts.map((r) => [r.p, Number(r.n)]));
  const want = choice.expected.periods;
  const same =
    missing === choice.expected.missing &&
    Object.keys(got).length === Object.keys(want).length &&
    Object.entries(got).every(([k, n]) => want[k] === n);
  if (!same) {
    throw new SetupError(
      `Sebaran periode sheet “${s.name}” berbeda dengan yang ditinjau. Tinjau ulang di “Atur periode”.`,
    );
  }

  if (!counts.length) {
    // Tinjau sudah menolak sheet tanpa periode; data berubah di antaranya → jangan tulis sheet kosong.
    throw new SetupError(
      `Sheet “${s.name}” tidak punya baris data bertanggal valid, jadi tidak bisa dibagi per periode. Tinjau ulang di “Atur periode”.`,
    );
  }
  const hr = Math.trunc(g.headerRow);
  const sheet: NewSetupSheet = {
    from: s,
    periodSource: choice.source,
    periodColumn: choice.source === "COLUMN" ? choice.column : null,
    rawRows: 0,
    segments: [],
  };
  for (const [k, r] of counts.entries()) {
    const start = r.p;
    const n = Number(r.n);
    const key = periodKeyOf(job.grain, start);
    const segRaw = join(work, `seg-${s.index}-${k}-raw.parquet`);
    const segTyped = join(work, `seg-${s.index}-${k}-typed.parquet`);
    // Baris judul (dan di atasnya) + baris periode ini, nomor baris fisik apa adanya.
    await watched(duck, watch, () =>
      copyParquet(
        duck,
        `SELECT r.* FROM read_parquet(${lit(rawPath)}) r
         WHERE r._row <= ${hr} OR r._row IN (SELECT src FROM assign WHERE p = DATE '${start}')
         ORDER BY r._row`,
        segRaw,
        g.colCount + 1,
      ),
    );
    const rawRows = Number(
      (await one(duck, `SELECT count(*) FROM read_parquet(${lit(segRaw)})`))[0],
    );
    const maxSrcRow = await maxSourceRow(duck, segRaw);
    const profile = await profileRaw(duck, {
      rawPath: segRaw,
      headerRow: hr,
      colCount: g.colCount,
      watch,
    });
    if (profile.dataRows !== n) {
      throw new IntegrityError([
        `${label} periode ${key}: ${profile.dataRows} baris tertulis, ${n} baris ditinjau`,
      ]);
    }
    const rowBase = await deps.repo.allocateRows(s.lineageId, maxSrcRow);
    const chars = [...profile.profiles.values()].reduce((a, p) => a + p.chars, 0);
    await copyTyped(duck, {
      rawPath: segRaw,
      outPath: segTyped,
      source: g.sourceKind,
      headerRow: hr,
      watch,
      rowBase,
      rawCols: g.colCount,
      colMap: g.colMap,
      schema,
      charsPerRow: profile.dataRows > 0 ? chars / profile.dataRows : 0,
      period: start,
    });
    const bad = await typedFileProblems(
      duck,
      segTyped,
      n,
      `${label} periode ${periodLabel(job.grain, start)}`,
      start,
    );
    // Periode ditetapkan dari file typed LAMA, nilai baru di-cast ulang dari raw: keduanya harus
    // sepakat (cast berubah → baris di periode salah). Satu saja yang meleset → versi gagal.
    if (periodCol) {
      const off = Number(
        (
          await one(
            duck,
            `SELECT count(*) FILTER (WHERE NOT coalesce(${validDateSql(periodCol)} AND ${periodSql(job.grain, periodCol)} = DATE '${start}', false))
             FROM read_parquet(${lit(segTyped)})`,
          )
        )[0],
      );
      if (off > 0) {
        bad.push(
          `${label} periode ${periodLabel(job.grain, start)}: ${off} baris tanggalnya tidak masuk periode ini`,
        );
      }
    }
    if (bad.length) throw new IntegrityError(bad);
    const id = newSegmentId();
    const prefix = segmentPrefix(datasetId, id);
    const rawKey = `${prefix}raw.parquet`;
    const typedKey = `${prefix}typed-${s.schemaRevision}.parquet`;
    // Baris Segment SEBELUM objek diunggah: kegagalan selalu tahu objek mana miliknya.
    await deps.repo.createSegment(job.versionId, {
      id,
      lineageId: s.lineageId,
      rawKey,
      rawBytes: statSync(segRaw).size,
      rawRows,
      headerRow: hr,
      colCount: g.colCount,
      colMap: g.colMap,
      rowBase,
      maxSrcRow,
      periodKey: key,
      periodStart: start,
      minDate: r.lo,
      maxDate: r.hi,
      sha256: g.sha256,
      originalName: g.originalName,
      uploadedById: g.uploadedById ?? null,
      sourceKind: g.sourceKind,
    });
    created.push(id);
    await deps.storage.upload(rawKey, segRaw, PARQUET);
    await deps.storage.upload(typedKey, segTyped, PARQUET);
    sheet.rawRows += rawRows;
    sheet.segments.push({
      segmentId: id,
      rawKey,
      typedKey,
      dataRows: n,
      typedBytes: statSync(segTyped).size,
      profile: packProfile(hr, profile),
    });
    rmSync(segRaw, { force: true });
    rmSync(segTyped, { force: true });
    await watch();
  }
  await duck.conn.run("DROP TABLE IF EXISTS assign");
  rmSync(rawPath, { force: true });
  rmSync(typedPath, { force: true });
  return { sheet, periods: counts.map((r) => r.p), dropped: missing };
}
