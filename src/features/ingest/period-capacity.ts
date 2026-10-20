/*
 * Kapasitas dataset per periode (T-055, rencana G-6 §5.1, §5.4). Fungsi murni:
 *  - periodCapacity: meter pemakaian batas (periode, baris per sheet, byte dataset, periode per sheet)
 *    pada data aktif — dihitung oleh computePeriodPlan yang sama dengan penegakan batas, jadi angka meter
 *    dan putusan tidak pernah berbeda — beserta proyeksi jujur ("±10 bulan").
 *  - uploadEstimate: perkiraan saat init dari ukuran file + rasio byte/baris historis dataset. Hanya
 *    peringatan (§4.5 langkah 2): penegakan sebenarnya terjadi setelah file dibaca (worker) dan saat
 *    commit, pada jumlah baris tepat.
 *  - initPeriodRejection: satu-satunya penolakan batas yang PASTI sebelum byte pertama: unggahan label
 *    pada dataset yang semua sheet-nya bersumber label membawa tepat satu periode yang diketahui, jadi
 *    batas jumlah periode/periode per sheet bisa diputuskan sekarang (baris tambahan hanya memperburuk:
 *    semua batas monoton). Baris dan byte tetap diputuskan setelah file dibaca.
 * Tidak ada pemotongan: semuanya tetap dalam satuan periode utuh.
 */
import { periodKeyOf, type PeriodGrain } from "./period";
import {
  computePeriodPlan,
  type LimitName,
  type OnLimit,
  type PeriodLimits,
  type PeriodPlan,
  type PlanPeriodInput,
} from "./period-plan";
import { capacityProjection, type CapacityProjection } from "./period-setup-plan";

/** Sheet logis data aktif: satu entri per periode (segmen). */
export interface CapacitySheet {
  lineageId: string;
  name: string;
  segments: { periodKey: string; periodStart: string; rows: number; bytes: number }[];
}

export interface PeriodCapacity {
  grain: PeriodGrain;
  /** Periode disimpan (pengaturan pemilik dipotong ke PERIOD_KEEP_MAX). */
  keep: number;
  onLimit: OnLimit;
  /** Periode berbeda di data aktif. */
  periods: number;
  usage: PeriodPlan["usage"];
  /** Ada batas yang pemakaiannya ≥ PERIOD_WARN_PCT: meter dan proyeksi ditampilkan. */
  warn: boolean;
  projection: CapacityProjection | null;
  /** lineageId → nama sheet (hanya bila > 1 sheet; satu sheet tidak perlu disebut). */
  sheetNames: Record<string, string>;
  /** Sheet logis data aktif (perkiraan baris file hanya dibandingkan dengan batas per sheet bila 1). */
  sheetCount: number;
}

/** Masukan computePeriodPlan dari sheet aktif (periode → sheet → baris/byte). */
function activeInputs(grain: PeriodGrain, sheets: CapacitySheet[]): PlanPeriodInput[] {
  const byKey = new Map<string, PlanPeriodInput>();
  for (const s of sheets) {
    for (const g of s.segments) {
      const key = periodKeyOf(grain, g.periodStart);
      const e = byKey.get(key) ?? { key, start: g.periodStart, sheets: {} };
      const cur = e.sheets[s.lineageId];
      e.sheets[s.lineageId] = {
        rows: (cur?.rows ?? 0) + g.rows,
        bytes: (cur?.bytes ?? 0) + g.bytes,
      };
      byKey.set(key, e);
    }
  }
  return [...byKey.values()];
}

export function periodCapacity(a: {
  grain: PeriodGrain;
  sheets: CapacitySheet[];
  settings: { keepPeriods: number | null; onLimit: OnLimit };
  limits: PeriodLimits;
}): PeriodCapacity {
  const active = activeInputs(a.grain, a.sheets);
  const plan = computePeriodPlan({
    grain: a.grain,
    source: "COLUMN",
    baseVersionId: null,
    active,
    incoming: [],
    incomingSheets: [],
    // Meter = data aktif apa adanya: dengan EVICT_OLDEST rencana tanpa unggahan akan "melepas" periode
    // yang sudah melewati batas (mis. Simpan N diturunkan) dan meter menampilkan angka sesudah pelepasan.
    // REJECT tidak pernah melepas, jadi usage = data aktif (review T-055 #1).
    settings: { keepPeriods: a.settings.keepPeriods, onLimit: "REJECT" },
    limits: a.limits,
  });
  const projection = capacityProjection(
    a.sheets.map((s) => ({
      name: s.name,
      periods: s.segments.map((g) => ({ start: g.periodStart, rows: g.rows })),
      bytes: s.segments.reduce((n, g) => n + g.bytes, 0),
    })),
    plan.keep,
    a.limits,
  );
  return {
    grain: a.grain,
    keep: plan.keep,
    onLimit: a.settings.onLimit,
    periods: active.length,
    usage: plan.usage,
    warn: plan.usage.some((u) => u.warn),
    projection,
    sheetCount: a.sheets.length,
    sheetNames:
      a.sheets.length > 1 ? Object.fromEntries(a.sheets.map((s) => [s.lineageId, s.name])) : {},
  };
}

// ── Teks ─────────────────────────────────────────────────────────────────────────────────────────────

export const GRAIN_UNIT: Record<PeriodGrain, string> = {
  MONTH: "bulan",
  QUARTER: "kuartal",
  YEAR: "tahun",
};

const fmt = (n: number) => n.toLocaleString("id-ID");

/** Angka ringkas: "8,2 jt", "10 jt", "1,0 jt"; di bawah sejuta ditulis lengkap ("12.950"). */
export function compactCount(n: number): string {
  if (n < 1_000_000) return fmt(Math.round(n));
  const m = n / 1_000_000;
  return `${m.toLocaleString("id-ID", m < 10 ? { minimumFractionDigits: 1, maximumFractionDigits: 1 } : { maximumFractionDigits: 1 })} jt`;
}

const gbNum = (n: number) =>
  (n / 1024 ** 3).toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const gbMax = (n: number) => (n / 1024 ** 3).toLocaleString("id-ID", { maximumFractionDigits: 1 });

const LIMIT_SHORT: Record<LimitName, string> = {
  periods: "batas simpan periode",
  sheetRows: "batas baris per sheet",
  datasetBytes: "batas ukuran dataset",
  sheetSegments: "batas periode per sheet",
};

/** Satu baris meter: "18 dari 24 periode · 8,2 jt dari 10 jt baris · 11,3 dari 16 GB". */
export function capacityMeterLine(c: PeriodCapacity): string {
  const parts: string[] = [];
  for (const u of c.usage) {
    switch (u.limit) {
      case "periods":
        parts.push(`${fmt(u.used)} dari ${fmt(u.max)} periode`);
        break;
      case "sheetRows": {
        const sheet = u.sheet ? c.sheetNames[u.sheet] : undefined;
        parts.push(
          `${compactCount(u.used)} dari ${compactCount(u.max)} baris${sheet ? ` (sheet “${sheet}”)` : ""}`,
        );
        break;
      }
      case "datasetBytes":
        parts.push(`${gbNum(u.used)} dari ${gbMax(u.max)} GB`);
        break;
      case "sheetSegments":
        // Biasanya jauh di bawah batas (120); hanya disebut bila mendekati.
        if (u.warn) parts.push(`${fmt(u.used)} dari ${fmt(u.max)} periode per sheet`);
        break;
    }
  }
  return parts.join(" · ");
}

/**
 * Proyeksi jujur: "Dengan rata-rata 1,0 jt baris per bulan, dataset ini menyimpan ±10 bulan." +
 * berapa unggahan periode baru lagi sampai batas, dan apa yang terjadi setelahnya.
 */
export function capacityProjectionText(c: PeriodCapacity): string | null {
  const p = c.projection;
  if (!p) return null;
  const unit = GRAIN_UNIT[c.grain];
  const sheet = p.sheetName ? ` (sheet “${p.sheetName}”)` : "";
  const binding = p.binding === "sheetRows" ? "" : ` (${LIMIT_SHORT[p.binding]})`;
  const head = `Dengan rata-rata ${compactCount(p.avgRows)} baris per ${unit}${sheet}, dataset ini menyimpan ±${fmt(p.capacity)} ${unit}${binding}.`;
  const after =
    c.onLimit === "EVICT_OLDEST"
      ? `periode baru berikutnya akan melepas ${unit} terlama (selalu ditinjau dulu)`
      : `periode baru berikutnya ditolak sampai periode lama dihapus`;
  const tail =
    p.remaining > 0
      ? `±${fmt(p.remaining)} unggahan ${unit} baru lagi akan menyentuh batas; setelah itu ${after}.`
      : `Batas sudah tercapai: ${after}.`;
  return `${head} ${tail}`;
}

// ── Perkiraan saat init ──────────────────────────────────────────────────────────────────────────────

export interface UploadEstimate {
  /** Perkiraan baris dari ukuran file (null = belum ada riwayat file sejenis di dataset ini). */
  rows: number | null;
  /** Perkiraan byte parquet setelah diproses. */
  bytes: number;
  /** TOO_LARGE = file sendiri melebihi batas; REJECT/EVICT = data sesudahnya kemungkinan melewati batas. */
  likely: "TOO_LARGE" | "REJECT" | "EVICT" | null;
  message: string;
}

/**
 * Perkiraan unggahan dari ukuran file (hanya peringatan). `bytesPerRow` = rasio historis file sejenis
 * (null = tidak ada); `newPeriod` = file pasti menambah periode baru (false = mengganti periode label
 * yang ada, null = belum diketahui — mode kolom). null bila tidak ada yang perlu diperingatkan.
 */
export function uploadEstimate(a: {
  capacity: PeriodCapacity;
  limits: PeriodLimits;
  fileBytes: number;
  bytesPerRow: number | null;
  parquetRatio: number;
  newPeriod: boolean | null;
}): UploadEstimate | null {
  const { capacity: c, limits: l } = a;
  const rows = a.bytesPerRow && a.bytesPerRow > 0 ? Math.round(a.fileBytes / a.bytesPerRow) : null;
  // Perkiraan baris = seluruh file; batas baris berlaku per sheet, jadi hanya dibandingkan bila dataset
  // satu sheet (file multi-sheet tidak bisa dibagi dengan jujur → tanpa "kemungkinan ditolak" palsu).
  const rowsPerSheet = c.sheetCount === 1 ? rows : null;
  const bytes = Math.round(a.fileBytes * a.parquetRatio);
  const used = (name: LimitName) => c.usage.find((u) => u.limit === name)?.used ?? 0;
  const what =
    rows !== null
      ? `Perkiraan ±${compactCount(rows)} baris di seluruh file (dari ukuran file)`
      : `Perkiraan ±${gbNum(bytes)} GB setelah diproses`;
  let likely: UploadEstimate["likely"] = null;
  let why = "";
  if (rowsPerSheet !== null && rowsPerSheet > l.sheetMaxRows) {
    likely = "TOO_LARGE";
    why = `, melebihi batas ${compactCount(l.sheetMaxRows)} baris per sheet: kemungkinan ditolak`;
  } else if (bytes > l.datasetMaxBytes) {
    likely = "TOO_LARGE";
    why = `, melebihi batas ${gbMax(l.datasetMaxBytes)} GB per dataset: kemungkinan ditolak`;
  } else if (
    a.newPeriod !== false &&
    (c.periods + 1 > c.keep ||
      used("sheetSegments") + 1 > l.sheetMaxSegments ||
      (rowsPerSheet !== null && used("sheetRows") + rowsPerSheet > l.sheetMaxRows) ||
      used("datasetBytes") + bytes > l.datasetMaxBytes)
  ) {
    likely = c.onLimit === "EVICT_OLDEST" ? "EVICT" : "REJECT";
    why =
      likely === "EVICT"
        ? ": periode terlama kemungkinan dilepas utuh (Anda meninjaunya sebelum diterapkan)"
        : `: kemungkinan ditolak${a.newPeriod === null ? " kecuali file ini hanya mengganti periode yang sudah ada" : ""}`;
  } else if (!c.warn) {
    return null;
  } else {
    why = ": masih dalam batas";
  }
  return {
    rows,
    bytes,
    likely,
    message: `${what}${why}. Ini hanya perkiraan; batas diperiksa pasti setelah file dibaca.`,
  };
}

// ── Penolakan pasti saat init (mode label) ───────────────────────────────────────────────────────────

/**
 * Unggahan label pada dataset yang SEMUA sheet-nya bersumber label: periode file = label. Rencana
 * dengan baris 0 di setiap sheet label; penolakan karena batas periode/periode per sheet pasti terulang
 * dengan baris sebenarnya (baris hanya menambah pemakaian), jadi ditolak sebelum byte pertama.
 * null = tidak pasti (diputuskan setelah file dibaca).
 */
export function initPeriodRejection(a: {
  grain: PeriodGrain;
  sheets: CapacitySheet[];
  label: string;
  settings: { keepPeriods: number | null; onLimit: OnLimit };
  limits: PeriodLimits;
}): string | null {
  if (!a.sheets.length) return null;
  const lineages = a.sheets.map((s) => s.lineageId);
  const plan = computePeriodPlan({
    grain: a.grain,
    source: "LABEL",
    baseVersionId: null,
    active: activeInputs(a.grain, a.sheets),
    incoming: [
      {
        key: periodKeyOf(a.grain, a.label),
        start: a.label,
        sheets: Object.fromEntries(lineages.map((id) => [id, { rows: 0, bytes: 0 }])),
      },
    ],
    incomingSheets: lineages,
    settings: a.settings,
    // Sheet mana yang benar-benar berisi baris belum diketahui (slice 0 baris di semua sheet akan
    // menghitung segmen yang mungkin tidak ditulis): batas periode per sheet diputuskan worker.
    limits: { ...a.limits, sheetMaxSegments: Number.MAX_SAFE_INTEGER },
  });
  const r = plan.rejection;
  if (!r || r.limit !== "periods") return null;
  return r.message;
}
