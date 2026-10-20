/*
 * Recast (T-007; dipicu koreksi skema T-008; per segmen T-040): raw.parquet setiap segmen manifest →
 * typed-<rev+1>-<tag>.parquet dengan pilihan user, tanpa membaca file asli.
 *  - Satu recast per sheet: lock Redis recast:<sheetId> berumur pendek yang diperpanjang selama
 *    berjalan (worker mati → lock lepas ≤ 3 menit); lock hilang → recast berhenti tanpa mengganti apa
 *    pun. Deadline 20 menit per segmen (dimulai ulang setiap segmen).
 *  - Tipe/locale/format diputuskan sekali dari gabungan profil raw semua segmen (disimpan per file
 *    typed, SegmentTyped.profile): satu skema, tipe fisik `c<pos>` sama di semua segmen. Segmen yang
 *    file-nya tidak memuat kolom dengan cast berubah memakai file lamanya (kolom yang tidak ada di file
 *    diproyeksikan NULL saat query, T-037).
 *  - Titik lanjut: profil disimpan begitu dibaca, file typed segmen dicatat begitu diunggah (baris
 *    SegmentTyped tertunda, kunci deterministik per job). Percobaan ulang job yang sama (worker mati,
 *    koneksi putus) tidak mengulang segmen yang selesai; hasilnya identik.
 *  - Manifest + pointer diganti dalam satu transaksi hanya setelah semua segmen selesai, file ada, dan
 *    revisi belum berubah. Revisi lama tidak dihapus di sini (manifest versi lain dan rollback tetap
 *    merujuknya; yang tidak dirujuk disapu GC segmen, T-038).
 *  - Prioritas di bawah ingest: sebelum tiap segmen, bila ingest dataset lain berjalan atau job
 *    pemetaan antre (shouldYield), job berhenti dengan "yield" — worker menundanya sebentar dan slot
 *    antrean dipakai yang lain; percobaan berikutnya melanjutkan dari titik lanjut.
 *  - Kolom kosong (absent, T-014) selalu dibawa, juga saat baris header diganti: edit nama/tipe/format/
 *    sembunyi berlaku; ganti tipe hanya mengganti tipe CAST NULL-nya.
 *  - Sheet periode (T-049): `_period` setiap file baru ditulis dari Segment.periodStart (dibekukan saat
 *    unggah) dan diperiksa sebelum diunggah; ganti baris judul dan ubah tipe/format kolom periode
 *    ditolak ("invalid") — keduanya bisa memindahkan baris antarperiode.
 */
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { openDuck, type Duck } from "@/lib/duckdb";
import { acquireLock, extendLock, releaseLock, type LockStore } from "@/lib/lock";
import type { ColumnMeta } from "./header";
import type { ColumnSchema, SourceKind } from "./infer";
import { DatasetGoneError, DeadlineError, type TypedStorage } from "./ingest";
import {
  mergeProfiles,
  packProfile,
  unpackProfile,
  type RawProfile,
  type StoredProfile,
} from "./profile";
import {
  maxSchemaPos,
  parseRecastInput,
  type RecastInput,
  type RecastOutcome,
  type RecastProgress,
} from "./recast-input";
import { IntegrityError, verifyVersionIntegrity } from "@/features/versions/integrity-check";
import { periodFreezeViolation, type SheetPeriod } from "./period";
import {
  canonicalProfile,
  castSignature,
  choiceOf,
  copyTyped,
  headerColumns,
  profileRaw,
  typedFileProblems,
  typedSchema,
  type AbsentColumn,
  type ColumnOverride,
} from "./typed";

export { parseRecastInput, type RecastInput, type RecastOutcome, type RecastProgress };

export const RECAST_LOCK_MS = 3 * 60 * 1000;
export const RECAST_RENEW_MS = 60 * 1000;
/** Batas waktu satu segmen (T-040: per segmen, bukan per job). */
export const RECAST_DEADLINE_MS = 20 * 60 * 1000;
const PARQUET = "application/vnd.apache.parquet";
export const MULTI_HEADER_MESSAGE =
  "Baris judul tidak bisa diganti karena data sheet ini digabung dari beberapa unggahan.";

/** Satu segmen manifest sheet (ADR-0008) beserta file typed yang dirujuk manifest sekarang. */
export interface RecastSegment {
  ordinal: number;
  segmentId: string;
  rawKey: string;
  /** Awal `_row` segmen: sama di setiap recast. 0 = segmen legacy. */
  rowBase: bigint;
  /** null = segmen legacy (rentang belum diukur). */
  maxSrcRow: number | null;
  /** Baris judul file typed manifest (SegmentTyped.headerRow ?? Segment.headerRow, T-gcn8). */
  headerRow: number;
  /** Kolom raw file segmen. */
  colCount: number;
  /** Peta kolom raw → posisi kanonik (Segment.colMap, T-gcn8); kosong = identitas. */
  colMap: number[];
  typed: {
    id: string;
    typedKey: string;
    columns: number[];
    profile: unknown;
    /** Baris data file (T-038); null/tidak ada = file lama. */
    dataRows?: number | null;
  };
  /** Periode segmen (T-049); null/tidak ada = non-periode. */
  periodKey?: string | null;
  /** Awal periode ISO naive = nilai `_period` di file typed segmen. */
  periodStart?: string | null;
  /**
   * Jenis file asal segmen (Segment.sourceKind, T-049): cast segmen memakai jenisnya sendiri — unggahan
   * periode bisa bergantian xlsx/CSV antarbulan (T-052). null/tidak ada = jenis sumber versi.
   */
  sourceKind?: SourceKind | null;
}

export interface RecastSheet {
  versionId: string;
  datasetId: string;
  /** Status versi: hanya READY yang boleh di-recast (ingest masih menulis typed-1 → "busy"). */
  versionStatus: string;
  name: string;
  typedKey: string | null;
  schemaRevision: number;
  headerRow: number;
  colCount: number;
  columns: ColumnMeta[];
  schema: ColumnSchema[] | null;
  source: SourceKind;
  /** Manifest sheet urut ordinal. */
  segments: RecastSegment[];
  /** Mode periode sheet di versinya (T-049); null/tidak ada = non-periode. */
  period?: SheetPeriod | null;
}

/** File typed segmen yang selesai ditulis (titik lanjut), belum dirujuk manifest. */
export interface NewTyped {
  typedKey: string;
  schemaRevision: number;
  columns: number[];
  /** Baris data file (T-038). */
  dataRows: number;
  /** Ukuran file (T-039). */
  typedBytes: number;
  profile: StoredProfile;
  /** Baris judul file ini (T-gcn8): milik file, bukan segmen yang bisa dibagi versi lain. */
  headerRow: number;
}

export interface RecastRepo {
  loadSheet(sheetId: string): Promise<RecastSheet | null>;
  /** Profil raw untuk file typed segmen yang sudah ada (raw imutabel: berlaku selama judulnya sama). */
  saveProfile(typedId: string, profile: StoredProfile): Promise<void>;
  /** File typed tertunda segmen ini dengan kunci ini (percobaan sebelumnya job yang sama). */
  pendingTyped(
    segmentIds: string[],
    typedKeys: string[],
  ): Promise<{ id: string; typedKey: string }[]>;
  /** Catat file typed segmen yang selesai diunggah; idempoten per kunci. */
  addTyped(segmentId: string, t: NewTyped): Promise<string>;
  /** Hapus baris tertunda yang tidak dirujuk manifest mana pun; kembalikan kunci yang terhapus. */
  dropTyped(ids: string[]): Promise<string[]>;
  /**
   * Ganti skema + manifest (file typed per ordinal) + pointer typed (ordinal 0) dalam satu transaksi,
   * bila schemaRevision masih `expectedRevision` (optimistic), manifest belum berubah, dan versi sheet
   * masih versi aktif dataset (T-013). false = revisi/manifest berubah, versi tidak aktif, atau sheet
   * hilang.
   */
  swapTyped(
    sheetId: string,
    expectedRevision: number,
    next: {
      schema: ColumnSchema[];
      schemaRevision: number;
      headerRow: number;
      columns: ColumnMeta[];
      /** `from` = file typed manifest sekarang (diperiksa ulang di transaksi). */
      manifest: { ordinal: number; from: string; typedId: string; typedKey: string }[];
    },
  ): Promise<boolean>;
}

export interface RecastDeps {
  repo: RecastRepo;
  storage: Pick<TypedStorage, "download" | "upload" | "deleteObject" | "exists">;
  lock: LockStore;
  tmpRoot: string;
  duckMemory?: string;
  /** Interval perpanjangan lock (default RECAST_RENEW_MS; uji memakai interval pendek). */
  renewMs?: number;
  /** Dipanggil berkala selama query panjang (mis. cek sheet masih ada); melempar → berhenti. */
  watch?: () => Promise<void>;
  /** Id job antrean: kunci file per job tetap → percobaan ulang melanjutkan segmen yang selesai. */
  jobId?: string;
  /** Progres per segmen; gagal melapor tidak menghentikan recast. */
  progress?: (p: RecastProgress) => Promise<unknown> | void;
  /**
   * true = beri jalan pekerjaan lain sebelum segmen berikutnya (ingest dataset lain berjalan, job
   * pemetaan antre): recast berhenti dengan "yield" dan dilanjutkan percobaan berikutnya.
   */
  shouldYield?: (datasetId: string) => Promise<boolean>;
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

/**
 * Kolom kosong skema sekarang setelah kolom nyata (pos > colCount, urut posisi) dengan override yang
 * berlaku untuk posisinya. Kolom kosong di dalam lebar kanonik (sheet periode yang melebar, T-057)
 * dijaga keepInnerAbsent, bukan ditambahkan lagi di belakang.
 */
function carryAbsent(
  schema: ColumnSchema[] | null,
  overrides: ColumnOverride[],
  colCount: number,
): AbsentColumn[] {
  const by = new Map(overrides.map((o) => [o.pos, o]));
  return (schema ?? [])
    .filter((c) => c.absent && c.pos > colCount)
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

/**
 * Alias judul kolom (T-057) ikut ke revisi baru di posisi yang sama: recast tidak mengubah judul file,
 * jadi judul pengganti yang dikonfirmasi tetap berlaku. Baris judul baru → judul berubah, alias dibuang.
 */
function withAliases(schema: ColumnSchema[], prev: ColumnSchema[] | null): ColumnSchema[] {
  if (!prev) return schema;
  const by = new Map(prev.filter((c) => c.aliases?.length).map((c) => [c.pos, c.aliases!]));
  if (!by.size) return schema;
  return schema.map((c) => (by.has(c.pos) ? { ...c, aliases: by.get(c.pos) } : c));
}

/**
 * Kolom kosong (absent) di dalam lebar kanonik (pos ≤ colCount; sheet periode yang melebar karena kolom
 * baru, T-057): tetap absent di revisi baru (NULL di semua file, tanpa statistik), sehingga unggahan
 * berikutnya tanpa kolom itu tidak meminta pemetaan. Diubah di tempat.
 */
function keepInnerAbsent(
  schema: ColumnSchema[],
  prev: ColumnSchema[] | null,
  colCount: number,
  dataRows: number,
): void {
  const inner = new Set(
    (prev ?? []).filter((c) => c.absent && c.pos <= colCount).map((c) => c.pos),
  );
  if (!inner.size) return;
  for (const c of schema) {
    if (!inner.has(c.pos)) continue;
    Object.assign(c, {
      absent: true,
      nullPct: dataRows > 0 ? 1 : 0,
      distinctCount: 0,
      castFailCount: 0,
      nonEmpty: 0,
    });
  }
}

class LockLostError extends Error {
  constructor() {
    super("lock recast hilang");
    this.name = "LockLostError";
  }
}

class YieldError extends Error {}

/**
 * Recast mengalah pada ingest yang sedang berjalan untuk dataset LAIN. Ingest refresh dataset yang sama
 * tidak ditunggu: recast yang commit lebih dulu membuat ingest itu mengulang dengan koreksi ini (T-013);
 * menunggunya membuat koreksi selalu "stale" (review T-040 M1). Data job lama tanpa datasetId → mengalah.
 */
export const yieldsToIngest = (active: { datasetId?: string }[], datasetId: string) =>
  active.some((j) => j.datasetId !== datasetId);

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

const charsPerRow = (p: RawProfile) =>
  p.dataRows > 0 ? [...p.profiles.values()].reduce((n, x) => n + x.chars, 0) / p.dataRows : 0;

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
  let deadline = Date.now() + RECAST_DEADLINE_MS;
  const watch = async () => {
    if (lockLost) throw new LockLostError();
    if (Date.now() > deadline) throw new DeadlineError("recast");
    await deps.watch?.();
  };
  let work: string | null = null;
  let duck: Duck | null = null;
  /** File typed job ini yang belum aktif: kunci → id baris tertunda (null = belum tercatat). */
  const mine = new Map<string, string | null>();
  /** false = job berakhir tanpa mengaktifkan → milik job ini dihapus; true = boleh dilanjutkan. */
  let keep = true;
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
    if (!s.segments.length) throw new Error(`sheet ${sheetId} tanpa segmen (migrasi T-036?)`);
    // Aturan beku periode (T-049): juga dijaga di sini, bukan hanya di app (job lama/langsung).
    const frozen = periodFreezeViolation(s.period ?? null, {
      headerRow: input.headerRow,
      currentHeaderRow: s.headerRow,
      columns: input.columns,
      schema: s.schema,
    });
    if (frozen) return { outcome: "invalid", message: frozen };
    const period = s.period ?? null;
    if (period && s.segments.some((g) => !g.periodStart)) {
      throw new IntegrityError([`sheet "${s.name}": segmen periode tanpa awal periode`]);
    }
    const multi = s.segments.length > 1;
    const headerRow = input.headerRow ?? s.headerRow;
    const newHeader = headerRow !== s.headerRow;
    // Tiap unggahan punya baris judulnya sendiri; satu nomor baris tidak berlaku untuk semua.
    if (newHeader && multi) return { outcome: "invalid", message: MULTI_HEADER_MESSAGE };
    work = mkdtempSync(join(deps.tmpRoot, "recast-"));
    const dir = work;
    const d = (duck = await openDuck({
      path: join(work, "work.duckdb"),
      tmpDir: work,
      memoryLimit: deps.duckMemory,
    }));
    // Satu raw lokal sekaligus (segmen bisa ratusan MB); satu segmen: profil + tulis memakai unduhan sama.
    let cached: { id: string; path: string } | null = null;
    const rawOf = async (g: RecastSegment) => {
      if (cached?.id === g.segmentId) return cached.path;
      if (cached) rmSync(cached.path, { force: true });
      const path = join(dir, `raw-${g.ordinal}.parquet`);
      await deps.storage.download(g.rawKey, path);
      cached = { id: g.segmentId, path };
      return path;
    };
    // Satu segmen: ukuran dan judul sheet (perilaku sebelum T-040); beberapa: milik tiap segmen.
    const hdr = (g: RecastSegment) => (multi ? g.headerRow : headerRow);
    // Sheet satu segmen yang lebih sempit dari skema (kolom ditambahkan unggahan periode yang kemudian
    // dihapus, T-057): kolom di luar raw file tidak dibaca (NULL), bukan galat "kolom tidak ada".
    const rawCols = (g: RecastSegment) =>
      multi || g.colMap.length
        ? g.colCount
        : g.colCount > 0
          ? Math.min(g.colCount, s.colCount)
          : s.colCount;

    // Header baru: rentang data berubah → nama dari baris itu dan inferensi ulang (pilihan lama
    // tidak dibawa); selain itu pilihan yang sudah berlaku tetap dipakai.
    const columns = newHeader
      ? await headerColumns(d, await rawOf(s.segments[0]!), headerRow, s.colCount)
      : s.columns;
    const base = newHeader || !s.schema ? [] : currentChoices(s.schema);
    const overrides = merge(base, input.columns);
    const absent = carryAbsent(s.schema, overrides, s.colCount);
    const absentMeta = absent.map((a, i) => ({ ...a, pos: s.colCount + i + 1 }));
    const dup = duplicateName([...columns, ...absentMeta], overrides);
    if (dup)
      return { outcome: "invalid", message: `Nama kolom "${dup}" dipakai lebih dari sekali.` };
    const revision = s.schemaRevision + 1;

    /** Sebelum tiap segmen: beri jalan pekerjaan lain bila perlu, lalu progres + tenggat baru. */
    const step = async (p: RecastProgress) => {
      if (lockLost) throw new LockLostError();
      if (await deps.shouldYield?.(s.datasetId).catch(() => false)) throw new YieldError();
      await Promise.resolve(deps.progress?.(p)).catch(() => {});
      deadline = Date.now() + RECAST_DEADLINE_MS;
    };

    // Tahap 1: profil raw segmen yang belum punya (file sebelum T-040), disimpan begitu dibaca.
    const profiles = s.segments.map((g) => unpackProfile(g.typed.profile, hdr(g)));
    const toRead = profiles.filter((p) => !p).length;
    let read = 0;
    for (const [i, g] of s.segments.entries()) {
      if (profiles[i]) continue;
      await step({ phase: "read", current: ++read, total: toRead });
      // Profil berkunci posisi kanonik (peta kolom segmen, T-gcn8), seperti skema.
      const p = canonicalProfile(
        await profileRaw(d, {
          rawPath: await rawOf(g),
          headerRow: hdr(g),
          colCount: rawCols(g),
          watch,
        }),
        g.colMap,
        s.colCount,
      );
      profiles[i] = p;
      // Judul baru: profil milik file revisi baru (disimpan bersamanya), bukan file yang ada.
      if (!newHeader) await deps.repo.saveProfile(g.typed.id, packProfile(hdr(g), p));
    }
    const segProfile = profiles as RawProfile[];
    const schema = withAliases(
      typedSchema(mergeProfiles(segProfile), {
        source: s.source,
        colCount: s.colCount,
        columns,
        overrides,
        absent,
      }),
      newHeader ? null : s.schema,
    );
    keepInnerAbsent(
      schema,
      newHeader ? null : s.schema,
      s.colCount,
      mergeProfiles(segProfile).dataRows,
    );

    // Tahap 2: tulis ulang hanya segmen yang file-nya memuat kolom dengan cast berubah (AC 4).
    const before = new Map((s.schema ?? []).map((c) => [c.pos, castSignature(c, s.source)]));
    const changed = new Set(
      schema.filter((c) => before.get(c.pos) !== castSignature(c, s.source)).map((c) => c.pos),
    );
    const fileCols = (g: RecastSegment) => {
      const has = new Set(g.typed.columns);
      return schema.filter((c) => !has.size || has.has(c.pos));
    };
    const rewrite = s.segments.filter(
      (g) => newHeader || fileCols(g).some((c) => changed.has(c.pos)),
    );
    const tag = (deps.jobId ? createHash("sha256").update(deps.jobId).digest("hex") : token).slice(
      0,
      12,
    );
    const keyOf = (g: RecastSegment) =>
      `${g.rawKey.slice(0, g.rawKey.lastIndexOf("/") + 1)}typed-${revision}-${tag}.parquet`;
    const pending = new Map(
      (
        await deps.repo.pendingTyped(
          rewrite.map((g) => g.segmentId),
          rewrite.map(keyOf),
        )
      ).map((t) => [t.typedKey, t.id]),
    );
    for (const [key, id] of pending) mine.set(key, id);
    const next = new Map<number, { typedId: string; typedKey: string; dataRows: number }>();
    for (const [i, g] of rewrite.entries()) {
      const key = keyOf(g);
      const id = pending.get(key);
      // Selesai di percobaan sebelumnya (worker mati, koneksi putus): tidak diulang (AC 2).
      if (id && (await deps.storage.exists(key))) {
        next.set(g.ordinal, {
          typedId: id,
          typedKey: key,
          dataRows: segProfile[s.segments.indexOf(g)]!.dataRows,
        });
        continue;
      }
      await step({ phase: "write", current: i + 1, total: rewrite.length });
      const p = segProfile[s.segments.indexOf(g)]!;
      const cols = fileCols(g);
      const out = join(dir, `typed-${g.ordinal}.parquet`);
      await copyTyped(d, {
        rawPath: await rawOf(g),
        outPath: out,
        source: g.sourceKind ?? s.source,
        headerRow: hdr(g),
        rowBase: g.rowBase,
        watch,
        rawCols: rawCols(g),
        colMap: g.colMap,
        schema: cols,
        charsPerRow: charsPerRow(p),
        period: period ? g.periodStart : null,
      });
      const bad = await typedFileProblems(
        d,
        out,
        p.dataRows,
        "file hasil koreksi",
        period ? g.periodStart : null,
      );
      if (bad.length) throw new IntegrityError(bad);
      if (!mine.has(key)) mine.set(key, null);
      await deps.storage.upload(key, out, PARQUET);
      const typedId =
        id ??
        (await deps.repo.addTyped(g.segmentId, {
          typedKey: key,
          schemaRevision: revision,
          columns: cols.map((c) => c.pos),
          dataRows: p.dataRows,
          typedBytes: statSync(out).size,
          profile: packProfile(hdr(g), p),
          headerRow: hdr(g),
        }));
      mine.set(key, typedId);
      next.set(g.ordinal, { typedId, typedKey: key, dataRows: p.dataRows });
      rmSync(out, { force: true });
    }

    // Tahap 3: aktif atomik. Gerbang integritas manifest rencana (fail-closed, T-038) lebih dulu.
    const manifest = s.segments.map((g) => {
      const n = next.get(g.ordinal);
      return {
        ordinal: g.ordinal,
        from: g.typed.id,
        typedId: n?.typedId ?? g.typed.id,
        typedKey: n?.typedKey ?? g.typed.typedKey,
        dataRows: n ? n.dataRows : (g.typed.dataRows ?? null),
      };
    });
    const problems = await verifyVersionIntegrity(s.versionId, {
      manifest: async () => [
        {
          id: sheetId,
          name: s.name,
          typedKey: manifest[0]!.typedKey,
          periodGrain: period?.grain ?? null,
          periodSource: period?.source ?? null,
          segments: s.segments.map((g, i) => ({
            ordinal: g.ordinal,
            rawKey: g.rawKey,
            typedKey: manifest[i]!.typedKey,
            rowBase: g.rowBase,
            maxSrcRow: g.maxSrcRow,
            periodKey: g.periodKey ?? null,
            periodStart: g.periodStart ?? null,
            dataRows: manifest[i]!.dataRows,
          })),
        },
      ],
      exists: (k) => deps.storage.exists(k),
    });
    if (problems.length) throw new IntegrityError(problems);
    await watch(); // lock masih milik kita tepat sebelum mengganti pointer
    // Galat di sini (mis. koneksi putus setelah commit) dilempar dengan file tetap ada: percobaan
    // ulang menemukan revisi sudah naik, atau melanjutkan dari file yang sama.
    const swapped = await deps.repo.swapTyped(sheetId, s.schemaRevision, {
      schema,
      schemaRevision: revision,
      headerRow,
      columns,
      manifest: manifest.map(({ ordinal, from, typedId, typedKey }) => ({
        ordinal,
        from,
        typedId,
        typedKey,
      })),
    });
    if (!swapped) {
      keep = false;
      return (await deps.repo.loadSheet(sheetId)) ? { outcome: "stale" } : { outcome: "gone" };
    }
    mine.clear(); // sudah dirujuk manifest aktif
    return { outcome: "done", revision, schema };
  } catch (e) {
    if (e instanceof DatasetGoneError) {
      keep = false;
      return { outcome: "gone" };
    }
    // Lock hilang / memberi jalan: job ditunda lalu diulang → melanjutkan dari file yang tercatat.
    if (e instanceof LockLostError) return { outcome: "busy" };
    if (e instanceof YieldError) return { outcome: "yield" };
    if (e instanceof DeadlineError) {
      keep = false;
      return {
        outcome: "failed",
        message: "Koreksi skema melebihi 20 menit untuk satu bagian data. Coba lagi nanti.",
      };
    }
    if (e instanceof IntegrityError) {
      keep = false;
      return {
        outcome: "failed",
        message: `${e.message} Skema tidak diubah. Coba lagi; bila terulang, hubungi admin.`,
      };
    }
    throw e;
  } finally {
    clearInterval(renew);
    if (!keep && mine.size) await dropMine(deps, mine);
    duck?.close();
    if (work) rmSync(work, { recursive: true, force: true });
    await releaseLock(deps.lock, lockKey, token).catch(() => false);
  }
}

/**
 * Job berakhir tanpa mengaktifkan: hapus baris tertunda job ini lalu file-nya. File hanya dihapus
 * bila barisnya benar terhapus (tidak dirujuk manifest) atau tidak pernah tercatat; gagal → disapu
 * GC/pemeriksaan malam (kunci unik per job, tidak pernah milik recast lain).
 */
async function dropMine(deps: RecastDeps, mine: Map<string, string | null>): Promise<void> {
  const ids = [...mine.values()].filter((id): id is string => id !== null);
  const dropped = ids.length ? await deps.repo.dropTyped(ids).catch(() => [] as string[]) : [];
  const unrecorded = [...mine].filter(([, id]) => id === null).map(([k]) => k);
  for (const key of [...dropped, ...unrecorded]) {
    await deps.storage.deleteObject(key).catch(() => {});
  }
}
