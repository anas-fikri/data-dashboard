/*
 * Rencana periode (T-050, rencana G-6 §4.5 langkah 7 dan §5). Fungsi murni: dari periode aktif,
 * periode file baru, pengaturan dataset, dan batas env, hitung periode yang ditambah / diganti /
 * dilepas / dikecualikan / ditolak beserta baris sebelum → sesudah. Satuannya selalu periode utuh:
 *
 * - Periode yang diganti diganti utuh di setiap sheet yang ada di file (§4.6); sheet yang tidak ada di
 *   file mempertahankan data lamanya. Baris tidak pernah dipotong.
 * - Batas (jumlah periode, baris per sheet, byte per dataset, segmen per sheet) dievaluasi pada
 *   proyeksi aktif − diganti − dikecualikan + baru (§5.1). Bila terlewati, yang harus pergi adalah
 *   awalan TERKECIL dari daftar terurut menurut kunci periode (terlama dulu):
 *     · periode unggahan ini sendiri (tanpa data lama) sudah melewati batas → PERIOD_TOO_LARGE;
 *     · awalan itu memuat periode unggahan ini → PERIOD_OUT_OF_WINDOW (menerimanya berarti melepas
 *       data yang lebih baru);
 *     · onLimit = REJECT → PERIOD_LIMIT + periode yang harus dihapus pemilik;
 *     · onLimit = EVICT_OLDEST → awalan itu dilepas utuh (selalu lewat tinjauan).
 *   Penolakan tidak pernah melepas apa pun: data sesudah = data aktif.
 * - Tanggal adalah teks ISO naive (D8): tidak ada Date lokal, jadi zona waktu tidak berpengaruh.
 *
 * Hasilnya JSON murni dan deterministik (urutan masukan tidak berpengaruh), dibekukan di
 * DatasetVersion.plan (lihat parseFrozenPeriodPlan).
 */
import { z } from "zod";
import type { Env } from "@/lib/env";
import {
  periodKeyOf,
  periodLabel,
  periodStartOf,
  type PeriodGrain,
  type PeriodSource,
} from "./period";

export type OnLimit = "REJECT" | "EVICT_OLDEST";

/** Cara unggahan periode memperlakukan periode yang sudah ada (v1.20, ADR-0011). */
export type UploadMode = "REPLACE" | "APPEND" | "UPSERT";
export const UPLOAD_MODES = ["REPLACE", "APPEND", "UPSERT"] as const;

/**
 * Satu (periode, sheet logis) yang ditulis ulang unggahan Tambah/Perbarui (v1.20): isi barunya = baris lama
 * yang tetap (`kept`) + baris file (`fileRows`). `removed` = baris lama periode ini yang kuncinya ada di file
 * (dibuang, digantikan baris file di periode mana pun); `movedOut` ⊆ removed = yang baris barunya jatuh di
 * periode lain; `updated` = baris file periode ini yang menggantikan baris lama (kunci sama). Tambah: removed =
 * movedOut = updated = 0.
 */
export interface MergePart {
  key: string;
  start: string;
  lineageId: string;
  fileRows: number;
  updated: number;
  kept: number;
  removed: number;
  movedOut: number;
  /** Tambah: file/sheet yang sama sudah pernah masuk (sidik sama) → baris tergandakan (review M3). */
  repeat?: boolean;
  /** Perbarui: baris lama berkunci dobel yang digabung menjadi satu baris file (baris berkurang). */
  collapsed?: number;
}

export interface MergeFacts {
  mode: Exclude<UploadMode, "REPLACE">;
  parts: MergePart[];
  /** Perbarui: kolom kunci per sheet data yang dipakai worker (dibekukan, dicek saat commit). */
  keys?: Record<string, number[]>;
}

/** Isi satu periode di satu sheet logis (lineageId): satu segmen, atau satu kelompok file (T-060). */
export interface PeriodSlice {
  rows: number;
  /** Byte parquet (raw + typed) segmen; perkiraan boleh dipakai untuk penolakan awal. */
  bytes: number;
  /** Segmen yang membentuk isi ini (kelompok file T-060: satu per file); tidak ada = 1. */
  segments?: number;
}

export interface PlanPeriodInput {
  /** Kunci periode (periodKeyOf): "2026-03", "2026-Q1", "2026". */
  key: string;
  /** Awal periode ISO naive (YYYY-MM-DD). */
  start: string;
  /** Per sheet logis (lineageId). */
  sheets: Record<string, PeriodSlice>;
  /** SHA-256 file asal periode aktif (deteksi file identik); null = tidak diketahui. */
  sha256?: string | null;
}

export interface PeriodLimits {
  /** PERIOD_KEEP_DEFAULT: periode disimpan bila pemilik tidak mengatur. */
  keepDefault: number;
  /** PERIOD_KEEP_MAX: batas atas pengaturan pemilik. */
  keepMax: number;
  /** PERIOD_SHEET_MAX_ROWS: baris data per sheet, dijumlah atas semua periode. */
  sheetMaxRows: number;
  /** DATASET_MAX_DATA_BYTES: byte parquet yang dirujuk versi. */
  datasetMaxBytes: number;
  /** PERIOD_SHEET_MAX_SEGMENTS: segmen (= periode) per sheet. */
  sheetMaxSegments: number;
  /** PERIOD_SHRINK_CONFIRM_PCT: penggantian yang menyusut lebih dari ini wajib dikonfirmasi. */
  shrinkConfirmPct: number;
  /** PERIOD_STRAY_PCT: periode file dengan baris < persen ini dari periode terbesar = "nyasar". */
  strayPct: number;
  /** PERIOD_WARN_PCT: ambang peringatan meter. */
  warnPct: number;
}

export interface PeriodPlanInput {
  grain: PeriodGrain;
  source: PeriodSource;
  /** Versi aktif yang menjadi dasar rencana (PLAN_STALE bila berubah sebelum konfirmasi). */
  baseVersionId: string | null;
  active: PlanPeriodInput[];
  incoming: PlanPeriodInput[];
  /** Sheet logis yang ada di file baru: periode yang diganti hanya diganti di sheet-sheet ini. */
  incomingSheets: string[];
  settings: { keepPeriods: number | null; onLimit: OnLimit };
  limits: PeriodLimits;
  /** Periode "kemungkinan nyasar" yang dipilih pemilik untuk dimasukkan (default dikecualikan). */
  include?: string[];
  /**
   * Periode file yang dilewati pemilik di tinjauan (v1.19): data lama periode itu dipertahankan, baris file
   * untuk periode itu tidak disimpan. Menang atas `include`.
   */
  skip?: string[];
  /** SHA-256 file baru. */
  fileSha256?: string | null;
  /** Baris tanpa tanggal valid yang dibuang atas pilihan eksplisit pemilik. */
  droppedRows?: number;
  /**
   * Sheet di file yang tidak berpasangan dengan sheet data aktif (T-052): tidak ikut disimpan, jadi
   * pemilik wajib meninjaunya (nama sheet di file, untuk tampilan).
   */
  ignoredSheets?: string[];
  /**
   * Sheet file berkolom sama yang digabung ke satu sheet data (T-jsmj): selalu ditinjau pemilik sebelum
   * diterapkan (salinan sheet yang tidak sengaja ikut akan menggandakan baris).
   */
  mergedSheets?: MergedSheet[];
  /**
   * Tambah / Perbarui berdasarkan kunci (v1.20): periode yang ditulis ulang + hitungannya. Tidak ada = Ganti.
   * Periode file tidak pernah dikecualikan/dilewati (baris lama yang kuncinya ada di file sudah dibuang di
   * periode lain), jadi `include`/`skip` diabaikan.
   */
  merge?: MergeFacts;
}

/**
 * Sheet file (`from`) yang masuk ke sheet data `sheet` lewat kecocokan kolom (T-jsmj): ≥ 2 = digabung; 1 =
 * dipasangkan karena kolomnya sama walau namanya berbeda. Nama untuk tampilan.
 */
export interface MergedSheet {
  sheet: string;
  from: string[];
}

const LIMIT_NAMES = ["periods", "sheetRows", "datasetBytes", "sheetSegments"] as const;
export type LimitName = (typeof LIMIT_NAMES)[number];

const rowsRecord = z.record(z.string(), z.number().int().nonnegative());
const count = z.number().int().nonnegative();

const entrySchema = z.object({
  key: z.string(),
  start: z.string(),
  label: z.string(),
  /** UPDATED (v1.20): periode ditulis ulang oleh Tambah/Perbarui (baris lama tetap + baris file). */
  action: z.enum(["ADDED", "REPLACED", "UPDATED", "UNCHANGED", "EVICTED", "EXCLUDED", "REJECTED"]),
  /** Periode ada di file ini (termasuk yang dikecualikan/ditolak). */
  fromUpload: z.boolean(),
  /** Periode kemungkinan nyasar (baris < strayPct periode terbesar file). */
  stray: z.boolean(),
  /** Baris per sheet sebelum (null = tidak ada di data aktif) dan sesudah (null = tidak ada). */
  before: rowsRecord.nullable(),
  after: rowsRecord.nullable(),
  beforeRows: count,
  afterRows: count,
  beforeBytes: count,
  afterBytes: count,
  /** Diganti dan menyusut > shrinkConfirmPct di salah satu sheet file. */
  shrink: z.boolean(),
  /** File ini identik (sha256) dengan file asal periode aktif ini. */
  identical: z.boolean(),
  /** Tambah/Perbarui (v1.20): hitungan semua sheet file di periode ini; null = Ganti / tidak disentuh. */
  keyed: z
    .object({
      fileRows: count,
      updated: count,
      kept: count,
      removed: count,
      movedOut: count,
    })
    .nullable()
    .default(null),
});

const mergePartSchema = z.object({
  key: z.string(),
  start: z.string(),
  lineageId: z.string(),
  fileRows: count,
  updated: count,
  kept: count,
  removed: count,
  movedOut: count,
  repeat: z.boolean().default(false),
  collapsed: count.default(0),
});

const limitsSchema = z.object({
  keepDefault: count,
  keepMax: count,
  sheetMaxRows: count,
  datasetMaxBytes: count,
  sheetMaxSegments: count,
  shrinkConfirmPct: count,
  strayPct: count,
  warnPct: count,
});

const usageSchema = z.object({
  limit: z.enum(LIMIT_NAMES),
  /** Sheet terberat untuk batas per sheet; null untuk batas dataset. */
  sheet: z.string().nullable(),
  used: count,
  max: count,
  warn: z.boolean(),
});

export const periodPlanSchema = z.object({
  v: z.literal(1),
  grain: z.enum(["MONTH", "QUARTER", "YEAR"]),
  source: z.enum(["COLUMN", "LABEL"]),
  baseVersionId: z.string().nullable(),
  /** Jumlah periode yang disimpan (pengaturan pemilik dipotong ke keepMax). */
  keep: count,
  onLimit: z.enum(["REJECT", "EVICT_OLDEST"]),
  limits: limitsSchema,
  fileSha256: z.string().nullable(),
  droppedRows: count,
  include: z.array(z.string()),
  /** Periode file yang dilewati pemilik (v1.19); rencana lama tanpa field ini = tidak ada. */
  skip: z.array(z.string()).default([]),
  /** Sheet di file yang tidak ikut disimpan (T-052); rencana lama tanpa field ini = tidak ada. */
  ignoredSheets: z.array(z.string()).default([]),
  /** Sheet file yang digabung ke satu sheet data (T-jsmj); rencana lama tanpa field ini = tidak ada. */
  mergedSheets: z
    .array(z.object({ sheet: z.string(), from: z.array(z.string()).min(1).max(1_024) }))
    .max(1_024)
    .default([]),
  /** Cara unggahan (v1.20); rencana lama tanpa field ini = Ganti. */
  mode: z.enum(UPLOAD_MODES).default("REPLACE"),
  /** Tambah/Perbarui (v1.20): bagian (periode, sheet) yang ditulis ulang; Ganti = []. */
  mergeParts: z.array(mergePartSchema).max(100_000).default([]),
  /** Perbarui: kolom kunci per sheet data saat diproses (T-yg3z); rencana lama = {}. */
  mergeKeys: z.record(z.string(), z.array(z.number().int())).default({}),
  /** Atur ulang periode (T-qqyx): satuan versi dasar yang sudah per periode; tidak ada = aktivasi. */
  resetFrom: z.enum(["MONTH", "QUARTER", "YEAR"]).optional(),
  /**
   * Sheet logis (lineageId) yang ada di file (= masukan incomingSheets, urut): periode yang diganti
   * hanya diganti di sheet ini (T-052 menyusun manifest dan menghitung ulang rencana darinya).
   */
  fileSheets: z.array(z.string()).default([]),
  /** Semua periode aktif ∪ file, urut kunci periode (terlama dulu). */
  entries: z.array(entrySchema),
  totals: z.object({
    before: rowsRecord,
    after: rowsRecord,
    beforeBytes: count,
    afterBytes: count,
    periodsBefore: count,
    periodsAfter: count,
  }),
  /** Pemakaian batas pada data sesudah (bila ditolak: data aktif). */
  usage: z.array(usageSchema),
  rejection: z
    .object({
      code: z.enum(["PERIOD_LIMIT", "PERIOD_TOO_LARGE", "PERIOD_OUT_OF_WINDOW"]),
      limit: z.enum(LIMIT_NAMES),
      sheet: z.string().nullable(),
      used: count,
      max: count,
      /** Periode unggahan yang menjadi pokok penolakan. */
      periods: z.array(z.string()),
      /** PERIOD_LIMIT: periode aktif terlama yang harus dihapus pemilik agar unggahan muat. */
      mustRemove: z.array(z.string()),
      message: z.string(),
    })
    .nullable(),
  /** Alasan tinjauan (AWAITING_CONFIRM); kosong + tanpa penolakan = boleh aktif otomatis. */
  confirm: z.array(
    z.enum([
      "REPLACE",
      "EVICT",
      "SHRINK",
      "STRAY",
      "LABEL",
      "IDENTICAL",
      "DROPPED_ROWS",
      "NO_CHANGE",
      "IGNORED_SHEETS",
      "MERGED_SHEETS",
    ]),
  ),
  autoActivate: z.boolean(),
});

export type PeriodPlan = z.infer<typeof periodPlanSchema>;
export type PeriodPlanEntry = PeriodPlan["entries"][number];
export type PeriodRejection = NonNullable<PeriodPlan["rejection"]>;
export type ConfirmReason = PeriodPlan["confirm"][number];

/** Batas periode dari env (§5.2). */
export function periodLimits(
  e: Pick<
    Env,
    | "PERIOD_KEEP_DEFAULT"
    | "PERIOD_KEEP_MAX"
    | "PERIOD_SHEET_MAX_ROWS"
    | "DATASET_MAX_DATA_BYTES"
    | "PERIOD_SHEET_MAX_SEGMENTS"
    | "PERIOD_SHRINK_CONFIRM_PCT"
    | "PERIOD_STRAY_PCT"
    | "PERIOD_WARN_PCT"
  >,
): PeriodLimits {
  return {
    keepDefault: e.PERIOD_KEEP_DEFAULT,
    keepMax: e.PERIOD_KEEP_MAX,
    sheetMaxRows: e.PERIOD_SHEET_MAX_ROWS,
    datasetMaxBytes: e.DATASET_MAX_DATA_BYTES,
    sheetMaxSegments: e.PERIOD_SHEET_MAX_SEGMENTS,
    shrinkConfirmPct: e.PERIOD_SHRINK_CONFIRM_PCT,
    strayPct: e.PERIOD_STRAY_PCT,
    warnPct: e.PERIOD_WARN_PCT,
  };
}

/** Rencana beku dari kolom DatasetVersion.plan; null bila kosong/bentuk lain (fail-closed). */
export function parseFrozenPeriodPlan(json: unknown): PeriodPlan | null {
  const r = periodPlanSchema.safeParse(json);
  return r.success ? r.data : null;
}

// ---------------------------------------------------------------------------------------------------

interface Unit {
  key: string;
  start: string;
  sheets: Record<string, PeriodSlice>;
  fromUpload: boolean;
}

interface Violation {
  limit: LimitName;
  sheet: string | null;
  used: number;
  max: number;
}

const sortedKeys = (o: Record<string, unknown>) => Object.keys(o).sort();
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const rowsOf = (s: Record<string, PeriodSlice>) => sum(Object.values(s).map((x) => x.rows));
const bytesOf = (s: Record<string, PeriodSlice>) => sum(Object.values(s).map((x) => x.bytes));
const rowsMap = (s: Record<string, PeriodSlice>): Record<string, number> =>
  Object.fromEntries(sortedKeys(s).map((k) => [k, s[k]!.rows]));

function assertCount(v: unknown, what: string, min = 0): asserts v is number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < min) {
    throw new Error(`computePeriodPlan: ${what} harus bilangan bulat ≥ ${min}`);
  }
}

function validate(input: PeriodPlanInput): void {
  const { limits: l } = input;
  assertCount(l.keepDefault, "keepDefault", 1);
  assertCount(l.keepMax, "keepMax", 1);
  assertCount(l.sheetMaxRows, "sheetMaxRows", 1);
  assertCount(l.datasetMaxBytes, "datasetMaxBytes", 1);
  assertCount(l.sheetMaxSegments, "sheetMaxSegments", 1);
  for (const k of ["shrinkConfirmPct", "strayPct", "warnPct"] as const) {
    assertCount(l[k], k);
    if (l[k] > 100) throw new Error(`computePeriodPlan: ${k} harus 0–100`);
  }
  if (input.settings.keepPeriods !== null)
    assertCount(input.settings.keepPeriods, "keepPeriods", 1);
  if (input.droppedRows !== undefined) assertCount(input.droppedRows, "droppedRows");
  const fileSheets = new Set(input.incomingSheets);
  for (const [list, name] of [
    [input.active, "active"],
    [input.incoming, "incoming"],
  ] as const) {
    const seen = new Set<string>();
    for (const p of list) {
      // periodStartOf melempar untuk tanggal yang tidak ada (mis. 2023-02-29).
      if (
        periodStartOf(input.grain, p.start) !== p.start ||
        periodKeyOf(input.grain, p.start) !== p.key
      ) {
        throw new Error(
          `computePeriodPlan: ${name} ${p.key}/${p.start} bukan periode ${input.grain}`,
        );
      }
      if (seen.has(p.key)) throw new Error(`computePeriodPlan: ${name} ${p.key} ganda`);
      seen.add(p.key);
      for (const [sheet, s] of Object.entries(p.sheets)) {
        assertCount(s.rows, `${name} ${p.key} ${sheet}.rows`);
        assertCount(s.bytes, `${name} ${p.key} ${sheet}.bytes`);
        if (s.segments !== undefined)
          assertCount(s.segments, `${name} ${p.key} ${sheet}.segments`, 1);
        if (name === "incoming" && !fileSheets.has(sheet)) {
          throw new Error(
            `computePeriodPlan: sheet ${sheet} periode ${p.key} tidak ada di incomingSheets`,
          );
        }
      }
    }
  }
}

const partKey = (key: string, lineageId: string) => `${key}\u0001${lineageId}`;

/** Fakta Tambah/Perbarui harus sepakat dengan isi periode aktif dan segmen file (bug pemanggil bila tidak). */
function validateMerge(input: PeriodPlanInput): void {
  const m = input.merge;
  if (!m) return;
  if (m.mode !== "APPEND" && m.mode !== "UPSERT") throw new Error("computePeriodPlan: mode merge");
  const fileSheets = new Set(input.incomingSheets);
  const active = new Map(input.active.map((p) => [p.key, p]));
  const incoming = new Map(input.incoming.map((p) => [p.key, p]));
  const seen = new Set<string>();
  for (const x of m.parts) {
    const id = `${x.key}/${x.lineageId}`;
    for (const f of ["fileRows", "updated", "kept", "removed", "movedOut"] as const) {
      assertCount(x[f], `merge ${id}.${f}`);
    }
    if (
      periodStartOf(input.grain, x.start) !== x.start ||
      periodKeyOf(input.grain, x.start) !== x.key
    ) {
      throw new Error(`computePeriodPlan: merge ${id} bukan periode ${input.grain}`);
    }
    if (!fileSheets.has(x.lineageId)) {
      throw new Error(`computePeriodPlan: merge ${id} sheet tidak ada di incomingSheets`);
    }
    if (seen.has(partKey(x.key, x.lineageId)))
      throw new Error(`computePeriodPlan: merge ${id} ganda`);
    seen.add(partKey(x.key, x.lineageId));
    if (x.collapsed !== undefined) assertCount(x.collapsed, `merge ${id}.collapsed`);
    if (x.movedOut > x.removed || x.updated > x.fileRows || (x.collapsed ?? 0) > x.removed) {
      throw new Error(`computePeriodPlan: merge ${id} hitungan tidak masuk akal`);
    }
    if (m.mode === "APPEND" && (x.removed || x.updated)) {
      throw new Error(`computePeriodPlan: merge ${id} Tambah tidak membuang baris`);
    }
    const inc = incoming.get(x.key)?.sheets[x.lineageId]?.rows ?? 0;
    if (inc !== x.fileRows + x.kept) {
      throw new Error(
        `computePeriodPlan: merge ${id} ${inc} baris segmen, fakta ${x.fileRows + x.kept}`,
      );
    }
    const old = active.get(x.key)?.sheets[x.lineageId]?.rows ?? 0;
    if (old !== x.kept + x.removed) {
      throw new Error(
        `computePeriodPlan: merge ${id} ${old} baris aktif, fakta ${x.kept + x.removed}`,
      );
    }
  }
  for (const p of input.incoming) {
    for (const lineage of Object.keys(p.sheets)) {
      if (!seen.has(partKey(p.key, lineage))) {
        throw new Error(`computePeriodPlan: segmen ${p.key}/${lineage} tanpa fakta merge`);
      }
    }
  }
}

/** Batas pertama yang terlewati oleh kumpulan periode (urutan tetap: periode, baris, byte, segmen). */
function violation(units: Unit[], keep: number, l: PeriodLimits): Violation | null {
  return usageOf(units, keep, l).find((u) => u.used > u.max) ?? null;
}

function usageOf(units: Unit[], keep: number, l: PeriodLimits): Violation[] {
  const rows = new Map<string, number>();
  const segs = new Map<string, number>();
  for (const u of units) {
    for (const [sheet, s] of Object.entries(u.sheets)) {
      rows.set(sheet, (rows.get(sheet) ?? 0) + s.rows);
      segs.set(sheet, (segs.get(sheet) ?? 0) + (s.segments ?? 1));
    }
  }
  // Sheet terberat (seri: lineageId terkecil) mewakili batas per sheet.
  const heaviest = (m: Map<string, number>): [string | null, number] =>
    [...m.entries()].reduce<[string | null, number]>(
      (best, [k, v]) =>
        v > best[1] || (v === best[1] && best[0] !== null && k < best[0]) ? [k, v] : best,
      [null, 0],
    );
  const [rowSheet, rowUsed] = heaviest(rows);
  const [segSheet, segUsed] = heaviest(segs);
  return [
    { limit: "periods", sheet: null, used: units.length, max: keep },
    { limit: "sheetRows", sheet: rowSheet, used: rowUsed, max: l.sheetMaxRows },
    {
      limit: "datasetBytes",
      sheet: null,
      used: sum(units.map((u) => bytesOf(u.sheets))),
      max: l.datasetMaxBytes,
    },
    { limit: "sheetSegments", sheet: segSheet, used: segUsed, max: l.sheetMaxSegments },
  ];
}

const fmt = (n: number) => n.toLocaleString("id-ID");
const gb = (n: number) =>
  `${(n / 1024 ** 3).toLocaleString("id-ID", { maximumFractionDigits: 1 })} GB`;

function limitText(v: Violation): string {
  switch (v.limit) {
    case "periods":
      return `batas simpan ${fmt(v.max)} periode`;
    case "sheetRows":
      return `batas ${fmt(v.max)} baris per sheet`;
    case "datasetBytes":
      return `batas ${gb(v.max)} per dataset`;
    case "sheetSegments":
      return `batas ${fmt(v.max)} periode per sheet`;
  }
}

function usedText(v: Violation): string {
  switch (v.limit) {
    case "periods":
      return `${fmt(v.used)} periode`;
    case "sheetRows":
      return `${fmt(v.used)} baris di satu sheet`;
    case "datasetBytes":
      return gb(v.used);
    case "sheetSegments":
      return `${fmt(v.used)} periode di satu sheet`;
  }
}

/**
 * Hitung rencana periode. Melempar Error hanya untuk masukan yang salah bentuk (bug pemanggil): kunci
 * tidak cocok satuan, kunci ganda, angka negatif. Batas yang terlewati bukan exception, melainkan
 * `rejection` di rencana.
 */
export function computePeriodPlan(input: PeriodPlanInput): PeriodPlan {
  validate(input);
  validateMerge(input);
  const { grain, limits } = input;
  const merge = input.merge ?? null;
  const parts = [...(merge?.parts ?? [])].sort(
    (x, y) => x.key.localeCompare(y.key) || x.lineageId.localeCompare(y.lineageId),
  );
  const partsOf = (key: string) => parts.filter((x) => x.key === key);
  // Tambah/Perbarui: (periode, sheet) yang kehilangan semua barisnya tidak punya segmen baru → isian kosong.
  const incomingList: PlanPeriodInput[] = input.incoming.map((p) => ({
    ...p,
    sheets: { ...p.sheets },
  }));
  for (const x of parts) {
    let p = incomingList.find((q) => q.key === x.key);
    if (!p) {
      p = { key: x.key, start: x.start, sheets: {}, sha256: null };
      incomingList.push(p);
    }
    p.sheets[x.lineageId] ??= { rows: 0, bytes: 0 };
  }
  const keep = Math.min(input.settings.keepPeriods ?? limits.keepDefault, limits.keepMax);
  const byStart = <T extends { start: string }>(a: T, b: T) =>
    a.start < b.start ? -1 : a.start > b.start ? 1 : 0;
  const active = new Map([...input.active].sort(byStart).map((p) => [p.key, p]));
  const incoming = new Map([...incomingList].sort(byStart).map((p) => [p.key, p]));
  const fileSheets = new Set(input.incomingSheets);
  // Tambah/Perbarui: periode file tidak bisa dikecualikan/dilewati (baris lama berkunci sama sudah dibuang).
  const include = new Set(merge ? [] : (input.include ?? []));
  // Hanya periode yang punya data lama dan bukan "kemungkinan nyasar" (yang punya pilihannya sendiri).
  const skip = new Set(
    merge ? [] : (input.skip ?? []).filter((k) => active.has(k) && incoming.has(k)),
  );
  /** Baris dari file di periode ini (Tambah/Perbarui: tanpa baris lama yang tetap). */
  const fileRowsOf = (p: PlanPeriodInput) =>
    merge ? sum(partsOf(p.key).map((x) => x.fileRows)) : rowsOf(p.sheets);
  const label = (key: string) => {
    const p = incoming.get(key) ?? active.get(key)!;
    return periodLabel(grain, p.start);
  };
  const list = (keys: string[]) =>
    keys.length <= 3
      ? keys.map(label).join(", ")
      : `${keys.slice(0, 3).map(label).join(", ")} dan ${keys.length - 3} periode lain`;

  // Periode kemungkinan nyasar: baris < strayPct% periode terbesar di file yang sama.
  // Tambah/Perbarui: hanya periode BARU yang bisa nyasar, dan tetap disimpan (wajib ditinjau).
  const maxIncoming = Math.max(0, ...[...incoming.values()].map(fileRowsOf));
  const stray = new Set(
    [...incoming.values()]
      .filter((p) => !merge || !active.has(p.key))
      .filter((p) => fileRowsOf(p) * 100 < limits.strayPct * maxIncoming)
      .map((p) => p.key),
  );
  for (const k of stray) skip.delete(k);
  const included = new Set(
    [...incoming.keys()].filter(
      (k) => !!merge || (!skip.has(k) && (!stray.has(k) || include.has(k))),
    ),
  );

  /** Periode yang diganti: sheet di file memakai data baru (sheet tanpa baris = kosong), sisanya tetap. */
  const merged = (key: string): Record<string, PeriodSlice> => {
    if (merge) {
      // Hanya sheet yang ditulis ulang di periode ini yang berganti; isian kosong = sheet tanpa data periode itu.
      const next: Record<string, PeriodSlice> = { ...(active.get(key)?.sheets ?? {}) };
      for (const x of partsOf(key)) {
        const sl = incoming.get(key)!.sheets[x.lineageId];
        if (sl && sl.rows > 0) next[x.lineageId] = sl;
        else delete next[x.lineageId];
      }
      return next;
    }
    const next: Record<string, PeriodSlice> = {};
    for (const [sheet, s] of Object.entries(active.get(key)?.sheets ?? {})) {
      if (!fileSheets.has(sheet)) next[sheet] = s;
    }
    Object.assign(next, incoming.get(key)!.sheets);
    return next;
  };

  const allKeys = [...new Set([...active.keys(), ...incoming.keys()])].sort((a, b) => {
    const sa = (active.get(a) ?? incoming.get(a))!.start;
    const sb = (active.get(b) ?? incoming.get(b))!.start;
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  });
  const projected: Unit[] = allKeys
    .filter((k) => active.has(k) || included.has(k))
    // Tambah/Perbarui: periode yang semua barisnya pindah ke periode lain hilang.
    .filter((k) => !merge || !included.has(k) || Object.keys(merged(k)).length > 0)
    .map((k) =>
      included.has(k)
        ? { key: k, start: incoming.get(k)!.start, sheets: merged(k), fromUpload: true }
        : { key: k, start: active.get(k)!.start, sheets: active.get(k)!.sheets, fromUpload: false },
    );
  const uploadUnits = projected.filter((u) => u.fromUpload);
  const uploadKeys = uploadUnits.map((u) => u.key);

  let rejection: PeriodRejection | null = null;
  const evicted = new Set<string>();
  const tooLarge = violation(uploadUnits, keep, limits);
  if (tooLarge) {
    const singles = uploadUnits.filter((u) => violation([u], keep, limits));
    const v = singles.length ? violation([singles[0]!], keep, limits)! : tooLarge;
    const periods = singles.length ? singles.map((u) => u.key) : uploadKeys;
    const subject = singles.length
      ? `Periode ${list(periods)}`
      : `Unggahan ini (${fmt(uploadKeys.length)} periode)`;
    rejection = {
      code: "PERIOD_TOO_LARGE",
      ...v,
      periods,
      mustRemove: [],
      message: `${subject} berisi ${usedText(v)}, melebihi ${limitText(v)}. Hubungi admin untuk menaikkan batas, atau unggah hanya sheet/kolom/periode yang diperlukan.`,
    };
  } else {
    // Awalan terkecil (terlama menurut kunci periode) yang harus pergi agar sisanya muat; semua batas
    // monoton terhadap pelepasan, dan daftar kosong selalu muat.
    let k = 0;
    while (violation(projected.slice(k), keep, limits)) k++;
    if (k > 0) {
      // Batas yang mengikat: yang masih terlewati tepat sebelum periode terakhir awalan dilepas
      // (bukan batas pertama proyeksi penuh, yang bisa sudah terpenuhi lebih awal).
      const v = violation(projected.slice(k - 1), keep, limits)!;
      const prefix = projected.slice(0, k);
      // Periode yang dilewati pemilik dijanjikan "data lama tetap": tidak boleh dilepas diam-diam.
      const hit = prefix.filter((u) => u.fromUpload || skip.has(u.key)).map((u) => u.key);
      if (hit.length) {
        rejection = {
          code: "PERIOD_OUT_OF_WINDOW",
          ...v,
          periods: hit,
          mustRemove: [],
          message: `Periode ${list(hit)} di luar ${limitText(v)}: menyimpannya berarti melepas data yang lebih baru.`,
        };
      } else if (input.settings.onLimit === "REJECT") {
        const mustRemove = prefix.map((u) => u.key);
        rejection = {
          code: "PERIOD_LIMIT",
          ...v,
          periods: uploadKeys,
          mustRemove,
          message: `Menyimpan ${uploadKeys.length ? list(uploadKeys) : "unggahan ini"} akan melewati ${limitText(v)}. Hapus periode ${list(mustRemove)} dulu, atau ubah pengaturan "Saat batas tercapai".`,
        };
      } else {
        for (const u of prefix) evicted.add(u.key);
      }
    }
  }

  const fileSha = input.fileSha256 ?? null;
  const ignoredSheets = [...new Set(input.ignoredSheets ?? [])].sort();
  const mergedSheets = [...(input.mergedSheets ?? [])]
    .filter((m) => m.from.length >= 1)
    .map((m) => ({ sheet: m.sheet, from: [...m.from] }))
    .sort((x, y) => x.sheet.localeCompare(y.sheet) || x.from[0]!.localeCompare(y.from[0]!));
  const keyedOf = (key: string): PeriodPlanEntry["keyed"] => {
    const list = partsOf(key);
    if (!merge || !list.length) return null;
    const total = (f: "fileRows" | "updated" | "kept" | "removed" | "movedOut") =>
      sum(list.map((x) => x[f]));
    return {
      fileRows: total("fileRows"),
      updated: total("updated"),
      kept: total("kept"),
      removed: total("removed"),
      movedOut: total("movedOut"),
    };
  };
  const entries: PeriodPlanEntry[] = allKeys.map((key) => {
    const a = active.get(key);
    const inc = incoming.get(key);
    const start = (a ?? inc)!.start;
    let action: PeriodPlanEntry["action"];
    let after: Record<string, PeriodSlice> | null;
    if (evicted.has(key)) {
      // Termasuk periode aktif yang baris file-nya dikecualikan (nyasar): datanya tetap data lama.
      action = "EVICTED";
      after = null;
    } else if (inc && !included.has(key)) {
      action = "EXCLUDED";
      after = a?.sheets ?? null;
    } else if (rejection) {
      action = inc ? "REJECTED" : "UNCHANGED";
      after = a?.sheets ?? null;
    } else if (inc) {
      action = a ? (merge ? "UPDATED" : "REPLACED") : "ADDED";
      const m = merged(key);
      // Tambah/Perbarui: periode yang semua barisnya pindah hilang dari data (Ganti: perilaku lama apa adanya).
      after = !merge || Object.keys(m).length ? m : null;
    } else {
      action = "UNCHANGED";
      after = a!.sheets;
    }
    const shrink =
      // Perbarui (review M2): kunci dobel lama digabung menjadi satu baris file = baris berkurang → selalu
      // ditinjau, di periode mana pun yang membuang baris lama.
      (action === "UPDATED" && partsOf(key).some((x) => (x.collapsed ?? 0) > 0)) ||
      (action === "REPLACED" &&
        [...fileSheets].some((sheet) => {
          const b = a!.sheets[sheet]?.rows ?? 0;
          const n = after?.[sheet]?.rows ?? 0;
          return b > 0 && (b - n) * 100 > b * limits.shrinkConfirmPct;
        }));
    return {
      key,
      start,
      label: periodLabel(grain, start),
      action,
      fromUpload: merge ? !!inc && fileRowsOf(inc) > 0 : !!inc,
      stray: stray.has(key),
      before: a ? rowsMap(a.sheets) : null,
      after: after ? rowsMap(after) : null,
      beforeRows: a ? rowsOf(a.sheets) : 0,
      afterRows: after ? rowsOf(after) : 0,
      beforeBytes: a ? bytesOf(a.sheets) : 0,
      afterBytes: after ? bytesOf(after) : 0,
      shrink,
      // Sidik per periode (kelompok T-060: gabungan file yang memuat periode ini) bila diketahui.
      // Tambah/Perbarui: file yang sama dua kali tidak mengubah apa pun (kunci sama), bukan peringatan.
      identical: merge
        ? partsOf(key).some((x) => x.repeat)
        : !!(inc && a && (inc.sha256 ?? fileSha) && a.sha256 === (inc.sha256 ?? fileSha)),
      keyed: keyedOf(key),
    };
  });

  const resultUnits: Unit[] = allKeys
    .filter((k) => {
      const e = entries.find((x) => x.key === k)!;
      return e.after !== null;
    })
    .map((k) => {
      const e = entries.find((x) => x.key === k)!;
      const fresh = e.action === "ADDED" || e.action === "REPLACED" || e.action === "UPDATED";
      return {
        key: k,
        start: e.start,
        sheets: fresh ? merged(k) : active.get(k)!.sheets,
        fromUpload: fresh,
      };
    });
  const totalRows = (units: Record<string, PeriodSlice>[]) => {
    const m = new Map<string, number>();
    for (const s of units)
      for (const [k, v] of Object.entries(s)) m.set(k, (m.get(k) ?? 0) + v.rows);
    return Object.fromEntries([...m.keys()].sort().map((k) => [k, m.get(k)!]));
  };
  const activeSheets = [...active.values()].map((p) => p.sheets);

  const confirm: ConfirmReason[] = [];
  if (!rejection) {
    const has = (act: PeriodPlanEntry["action"]) => entries.some((e) => e.action === act);
    if (has("REPLACED")) confirm.push("REPLACE");
    if (has("EVICTED")) confirm.push("EVICT");
    if (entries.some((e) => e.shrink)) confirm.push("SHRINK");
    if (stray.size) confirm.push("STRAY");
    if (input.source === "LABEL") confirm.push("LABEL");
    if (entries.some((e) => e.identical)) confirm.push("IDENTICAL");
    if ((input.droppedRows ?? 0) > 0) confirm.push("DROPPED_ROWS");
    if (!has("ADDED") && !has("REPLACED") && !has("UPDATED") && !has("EVICTED"))
      confirm.push("NO_CHANGE");
    if (ignoredSheets.length) confirm.push("IGNORED_SHEETS");
    if (mergedSheets.length) confirm.push("MERGED_SHEETS");
  }

  return {
    v: 1,
    grain,
    source: input.source,
    baseVersionId: input.baseVersionId,
    keep,
    onLimit: input.settings.onLimit,
    limits: limitsSchema.parse(limits),
    fileSha256: fileSha,
    droppedRows: input.droppedRows ?? 0,
    include: [...include].filter((k) => incoming.has(k)).sort(),
    skip: [...skip].sort(),
    ignoredSheets,
    mergedSheets,
    mode: merge?.mode ?? "REPLACE",
    mergeParts: parts.map((x) => ({
      ...x,
      repeat: x.repeat ?? false,
      collapsed: x.collapsed ?? 0,
    })),
    mergeKeys: merge?.keys ? { ...merge.keys } : {},
    fileSheets: [...fileSheets].sort(),
    entries,
    totals: {
      before: totalRows(activeSheets),
      after: totalRows(resultUnits.map((u) => u.sheets)),
      beforeBytes: sum(activeSheets.map(bytesOf)),
      afterBytes: sum(resultUnits.map((u) => bytesOf(u.sheets))),
      periodsBefore: active.size,
      periodsAfter: resultUnits.length,
    },
    usage: usageOf(resultUnits, keep, limits).map((u) => ({
      ...u,
      warn: u.used * 100 >= u.max * limits.warnPct,
    })),
    rejection,
    confirm,
    autoActivate: !rejection && confirm.length === 0,
  };
}
