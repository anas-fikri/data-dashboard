/*
 * "Atur periode" (T-051, rencana G-6 §4.4 "Mengaktifkan periode pada data yang sudah ada"). Bagian
 * murni, dipakai app (Tinjau/Terapkan) dan worker (job PERIOD_SETUP), juga tipe untuk komponen klien:
 *  - skema masukan (zod): satuan, sumber periode per sheet (kolom tanggal atau label), pengaturan
 *    dataset "Simpan N periode" (≤ PERIOD_KEEP_MAX) dan "Saat batas tercapai", jumlah baris tanpa
 *    tanggal valid yang dibuang atas pilihan eksplisit pemilik;
 *  - buildSetupPreview: sebaran baris per periode → rencana computePeriodPlan (data aktif dianggap
 *    "unggahan" ke dataset periode kosong; periode kecil TIDAK dikecualikan — semua baris ikut), meter
 *    batas, proyeksi kapasitas, dan alasan "Terapkan" nonaktif. Tidak ada yang berubah di sini.
 */
import { z } from "zod";
import type { ColumnSchema } from "./infer";
import {
  computePeriodPlan,
  type LimitName,
  type OnLimit,
  type PeriodLimits,
  type PeriodPlan,
  type PlanPeriodInput,
} from "./period-plan";
import {
  isIsoDate,
  periodKeyOf,
  periodLabel,
  periodStartOf,
  type PeriodGrain,
  type PeriodSource,
} from "./period";

/** Nama job di antrean ingest (jobId = versionId) dan ingestStage versi PERIOD_SETUP. */
export const PERIOD_SETUP_JOB = "period-setup";
export const PERIOD_SETUP_STAGE = "period-setup";

/** Contoh nomor baris tanpa tanggal valid yang ditampilkan (rencana §4.4). */
export const MISSING_SAMPLES = 20;
/** Periode berbeda per sheet yang dibaca saat Tinjau; lebih dari ini → ditolak (data tanggal kacau). */
export const SETUP_MAX_PERIODS = 600;
/** Tahun yang dianggap tanggal valid (di luar ini = baris tanpa tanggal valid). */
export const VALID_YEAR_MIN = 1000;
export const VALID_YEAR_MAX = 9999;

export const GRAINS = ["MONTH", "QUARTER", "YEAR"] as const satisfies readonly PeriodGrain[];
export const GRAIN_LABEL: Record<PeriodGrain, string> = {
  MONTH: "per bulan",
  QUARTER: "per kuartal",
  YEAR: "per tahun",
};

const ID = /^[a-z0-9]{20,32}$/;
const UNIT: Record<PeriodGrain, string> = { MONTH: "month", QUARTER: "quarter", YEAR: "year" };

/** Ekspresi tanggal valid untuk kolom bertipe date/timestamp `c<pos>` (dibagi dengan Tinjau). */
export function validDateSql(col: string): string {
  return `(${col} IS NOT NULL AND year(${col}) BETWEEN ${VALID_YEAR_MIN} AND ${VALID_YEAR_MAX})`;
}

/** `date_trunc` satuan → DATE (naive). */
export function periodSql(grain: PeriodGrain, col: string): string {
  return `CAST(date_trunc('${UNIT[grain]}', ${col}) AS DATE)`;
}

/** Kolom tanggal yang sah untuk sumber periode: bertipe date/timestamp dan ada di file. */
export function periodColumnOf(
  schema: ColumnSchema[] | null,
  pos: number | null,
): ColumnSchema | null {
  const c = (schema ?? []).find((x) => x.pos === pos);
  return c && !c.absent && (c.type === "date" || c.type === "timestamp") ? c : null;
}

/**
 * Kolom tanggal acuan sheet bersumber label (T-054, rencana §4.4): kolom date/timestamp pertama (posisi
 * kanonik terkecil) yang ada di file; null = sheet tanpa kolom tanggal. Min/max-nya dicatat di
 * Segment.minDate/maxDate segmen berlabel dan dibandingkan dengan label di layar tinjauan.
 */
export function labelReferenceColumn(schema: ColumnSchema[] | null): ColumnSchema | null {
  return (
    [...(schema ?? [])]
      .sort((a, b) => a.pos - b.pos)
      .find((c) => !c.absent && (c.type === "date" || c.type === "timestamp")) ?? null
  );
}

/** Pengaturan dataset (rencana §5.2): hanya boleh ≤ batas admin. */
export function periodSettingsSchema(keepMax: number) {
  return z
    .object({
      keepPeriods: z
        .number({ message: "Jumlah periode harus angka bulat." })
        .int("Jumlah periode harus angka bulat.")
        .min(1, "Simpan paling sedikit 1 periode.")
        .max(keepMax, `Simpan paling banyak ${keepMax.toLocaleString("id-ID")} periode.`)
        .nullable(),
      onLimit: z.enum(["REJECT", "EVICT_OLDEST"], { message: "Pilihan batas tidak dikenal." }),
    })
    .strict();
}
export type PeriodSettingsInput = z.infer<ReturnType<typeof periodSettingsSchema>>;

/** Masukan Tinjau/Terapkan. `label` = awal periode data sekarang untuk sheet bersumber label. */
export function periodSetupSchema(keepMax: number) {
  return periodSettingsSchema(keepMax)
    .extend({
      grain: z.enum(GRAINS, { message: "Satuan periode tidak dikenal." }),
      sheets: z
        .array(
          z
            .object({
              sheetId: z.string().regex(ID, "Sheet tidak dikenal."),
              source: z.enum(["COLUMN", "LABEL"], { message: "Sumber periode tidak dikenal." }),
              column: z.number().int().min(1).max(100_000).nullable(),
            })
            .strict(),
        )
        .min(1, "Pilih sumber periode untuk setiap sheet.")
        .max(500),
      label: z.string().max(10).nullable(),
      /** Tinjauan yang diterapkan (Terapkan): versi dasar + sidik sebaran yang dilihat pemilik. */
      reviewed: z
        .object({
          baseVersionId: z.string().regex(ID, "Tinjauan tidak dikenal."),
          digest: z.string().regex(/^[0-9a-f]{64}$/, "Tinjauan tidak dikenal."),
        })
        .strict()
        .nullable()
        .optional(),
      /** Baris tanpa tanggal valid yang dibuang ("Buang N baris"); 0 = tidak ada yang dibuang. */
      dropMissing: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    })
    .strict()
    .superRefine((v, ctx) => {
      const seen = new Set<string>();
      for (const [i, s] of v.sheets.entries()) {
        if (seen.has(s.sheetId)) {
          ctx.addIssue({ code: "custom", path: ["sheets", i], message: "Sheet ganda." });
        }
        seen.add(s.sheetId);
        if (s.source === "COLUMN" && s.column === null) {
          ctx.addIssue({
            code: "custom",
            path: ["sheets", i, "column"],
            message: "Pilih kolom tanggal.",
          });
        }
      }
      if (v.sheets.some((s) => s.source === "LABEL")) {
        if (
          !v.label ||
          !isIsoDate(v.label) ||
          periodStartOf(v.grain, v.label) !== v.label ||
          Number(v.label.slice(0, 4)) < VALID_YEAR_MIN
        ) {
          ctx.addIssue({
            code: "custom",
            path: ["label"],
            message: "Pilih periode untuk data sekarang.",
          });
        }
      }
    });
}
export type PeriodSetupInput = z.infer<ReturnType<typeof periodSetupSchema>>;

/** Sebaran satu sheet (hasil query Tinjau, atau hitungan job). */
export interface SheetDistribution {
  sheetId: string;
  /** Sheet logis (lineageId): kunci per sheet di rencana. */
  lineageId: string;
  name: string;
  source: PeriodSource;
  /** Kolom periode (source COLUMN). */
  column: { pos: number; name: string } | null;
  /** Baris data sheet. */
  totalRows: number;
  /** Baris per awal periode (ISO naive), urut. */
  periods: { start: string; rows: number }[];
  /** Baris tanpa tanggal valid (kosong, gagal cast, atau tahun di luar 1000–9999). */
  missing: number;
  /** ≤ MISSING_SAMPLES nomor baris di file (baris fisik), naik. */
  missingSamples: number[];
  /** Byte parquet (raw + typed) sheet sekarang: perkiraan byte per periode. */
  bytes: number;
}

export interface CapacityProjection {
  /** Rata-rata baris per periode di sheet terberat. */
  avgRows: number;
  /** Sheet terberat (nama) untuk kalimat proyeksi. */
  sheetName: string | null;
  /** Perkiraan jumlah periode yang muat. */
  capacity: number;
  /** Batas yang paling dulu tercapai. */
  binding: LimitName;
  /** Periode lagi sebelum batas (capacity − periode sekarang, ≥ 0). */
  remaining: number;
}

export interface SetupPreview {
  grain: PeriodGrain;
  baseVersionId: string;
  sheets: SheetDistribution[];
  /** Rencana: data sekarang sebagai periode-periode (ADDED), meter `usage`, `rejection`. */
  plan: PeriodPlan;
  projection: CapacityProjection | null;
  missingTotal: number;
  /** Alasan "Terapkan" nonaktif selain pilihan "Buang N baris" (kosong = boleh, bila tanpa sisa). */
  blockers: string[];
  /** Pemilik wajib mencentang "Buang N baris" (missingTotal > 0). */
  needsDrop: boolean;
  /**
   * Sidik tinjauan (sha256 heksa, diisi server dari setupDigestSource): Terapkan mengirimnya kembali
   * bersama baseVersionId; berbeda dengan hitungan ulang → STALE (data berubah sejak ditinjau).
   */
  digest: string;
}

/** Teks kanonik yang disidik: satuan, versi dasar, sumber + sebaran + baris tanpa tanggal per sheet. */
export function setupDigestSource(
  grain: PeriodGrain,
  baseVersionId: string,
  sheets: SheetDistribution[],
): string {
  return JSON.stringify([
    grain,
    baseVersionId,
    [...sheets]
      .sort((a, b) => (a.sheetId < b.sheetId ? -1 : a.sheetId > b.sheetId ? 1 : 0))
      .map((s) => [
        s.sheetId,
        s.source,
        s.column?.pos ?? null,
        s.totalRows,
        s.missing,
        s.periods.map((p) => [p.start, p.rows]),
      ]),
  ]);
}

const fmt = (n: number) => n.toLocaleString("id-ID");
const gb = (n: number) =>
  `${(n / 1024 ** 3).toLocaleString("id-ID", { maximumFractionDigits: 1 })} GB`;

/** Kalimat penolakan untuk aktivasi (bukan "unggahan"): pemilik tahu apa yang bisa diubah. */
export function setupRejectionMessage(
  r: NonNullable<PeriodPlan["rejection"]>,
  keepMax: number,
  sheetName: (lineageId: string | null) => string,
): string {
  switch (r.limit) {
    case "periods":
      return r.used > keepMax
        ? `Data sekarang terbagi menjadi ${fmt(r.used)} periode, melebihi batas admin ${fmt(keepMax)} periode. Pilih satuan periode yang lebih besar, atau hubungi admin.`
        : `Data sekarang terbagi menjadi ${fmt(r.used)} periode, melebihi pengaturan "Simpan ${fmt(r.max)} periode". Naikkan jumlahnya (maksimal ${fmt(keepMax)}) atau pilih satuan yang lebih besar.`;
    case "sheetRows":
      return `Sheet “${sheetName(r.sheet)}” berisi ${fmt(r.used)} baris, melebihi batas ${fmt(r.max)} baris per sheet. Hubungi admin untuk menaikkan batas.`;
    case "datasetBytes":
      return `Data sekarang sekitar ${gb(r.used)}, melebihi batas ${gb(r.max)} per dataset. Hubungi admin untuk menaikkan batas.`;
    case "sheetSegments":
      return `Sheet “${sheetName(r.sheet)}” terbagi menjadi ${fmt(r.used)} periode, melebihi batas ${fmt(r.max)} periode per sheet. Pilih satuan periode yang lebih besar.`;
  }
}

/** Rencana input computePeriodPlan dari sebaran sheet (byte dibagi menurut proporsi baris). */
export function setupPlanInput(
  grain: PeriodGrain,
  sheets: SheetDistribution[],
): { incoming: PlanPeriodInput[]; incomingSheets: string[] } {
  const byKey = new Map<string, PlanPeriodInput>();
  for (const s of sheets) {
    const rows = s.periods.reduce((n, p) => n + p.rows, 0);
    for (const p of s.periods) {
      if (p.rows <= 0) continue;
      const key = periodKeyOf(grain, p.start);
      const e = byKey.get(key) ?? { key, start: p.start, sheets: {} };
      e.sheets[s.lineageId] = {
        rows: p.rows,
        bytes: rows > 0 ? Math.round((s.bytes * p.rows) / Math.max(rows, s.totalRows)) : 0,
      };
      byKey.set(key, e);
    }
  }
  return {
    incoming: [...byKey.values()],
    incomingSheets: [...new Set(sheets.map((s) => s.lineageId))],
  };
}

/** Proyeksi kapasitas jujur (rencana §5.4): rata-rata per periode terhadap setiap batas. */
export function capacityProjection(
  sheets: Pick<SheetDistribution, "name" | "periods" | "bytes">[],
  keep: number,
  limits: PeriodLimits,
): CapacityProjection | null {
  const keys = new Set<string>();
  let heaviest: { name: string; avg: number } | null = null;
  let bytes = 0;
  for (const s of sheets) {
    const n = s.periods.filter((p) => p.rows > 0);
    n.forEach((p) => keys.add(p.start));
    bytes += s.bytes;
    if (!n.length) continue;
    const avg = n.reduce((a, p) => a + p.rows, 0) / n.length;
    if (!heaviest || avg > heaviest.avg) heaviest = { name: s.name, avg };
  }
  if (!keys.size || !heaviest) return null;
  const avgBytes = bytes / keys.size;
  const caps: [LimitName, number][] = [
    ["periods", keep],
    ["sheetRows", Math.floor(limits.sheetMaxRows / Math.max(1, heaviest.avg))],
    ["datasetBytes", avgBytes > 0 ? Math.floor(limits.datasetMaxBytes / avgBytes) : Infinity],
    ["sheetSegments", limits.sheetMaxSegments],
  ];
  const [binding, capacity] = caps.reduce((a, b) => (b[1] < a[1] ? b : a));
  return {
    avgRows: Math.round(heaviest.avg),
    sheetName: sheets.length > 1 ? heaviest.name : null,
    capacity,
    binding,
    remaining: Math.max(0, capacity - keys.size),
  };
}

/**
 * Tinjau (murni): rencana + alasan "Terapkan" nonaktif. `dropMissing` hanya memengaruhi rencana beku
 * (droppedRows); centang "Buang N baris" diperiksa pemanggil terhadap `missingTotal`.
 */
export function buildSetupPreview(a: {
  grain: PeriodGrain;
  baseVersionId: string;
  sheets: SheetDistribution[];
  settings: { keepPeriods: number | null; onLimit: OnLimit };
  limits: PeriodLimits;
  dropMissing: number;
}): SetupPreview {
  const { incoming, incomingSheets } = setupPlanInput(a.grain, a.sheets);
  const source: PeriodSource = a.sheets.some((s) => s.source === "COLUMN") ? "COLUMN" : "LABEL";
  const plan = computePeriodPlan({
    grain: a.grain,
    source,
    baseVersionId: a.baseVersionId,
    active: [],
    incoming,
    incomingSheets,
    settings: a.settings,
    limits: a.limits,
    // Semua periode ikut, termasuk yang kecil: tidak ada baris yang hilang diam-diam (§4.4).
    include: incoming.map((p) => p.key),
    droppedRows: a.dropMissing,
  });
  const names = new Map(a.sheets.map((s) => [s.lineageId, s.name]));
  const blockers: string[] = [];
  if (plan.rejection) {
    blockers.push(
      setupRejectionMessage(plan.rejection, a.limits.keepMax, (id) => names.get(id ?? "") ?? "?"),
    );
  }
  for (const s of a.sheets) {
    if (s.totalRows === 0) {
      // Segmen periode butuh periode; sheet kosong tidak bisa dibawa tanpa merusak widget/grid-nya.
      blockers.push(
        `Sheet “${s.name}” tidak berisi baris data, jadi tidak bisa dibagi per periode. Isi datanya, atau hapus sheet kosong itu dari file lalu ganti semua data, sebelum mengatur periode.`,
      );
    } else if (s.periods.every((p) => p.rows <= 0)) {
      blockers.push(`Sheet “${s.name}” tidak punya baris dengan tanggal valid di kolom periode.`);
    }
  }
  const missingTotal = a.sheets.reduce((n, s) => n + s.missing, 0);
  return {
    grain: a.grain,
    baseVersionId: a.baseVersionId,
    sheets: a.sheets,
    plan,
    projection: capacityProjection(a.sheets, plan.keep, a.limits),
    missingTotal,
    blockers,
    needsDrop: missingTotal > 0,
    digest: "",
  };
}

/** Label periode untuk tampilan (klien juga memakainya). */
export const setupPeriodLabel = (grain: PeriodGrain, start: string) => periodLabel(grain, start);

/** Ringkasan riwayat versi PERIOD_SETUP dari rencana beku (null bila rencana tidak terbaca). */
export function setupHistoryNote(plan: PeriodPlan | null): string | null {
  if (!plan) return null;
  const parts = [
    `Mode periode diaktifkan (${GRAIN_LABEL[plan.grain]})`,
    `${fmt(plan.totals.periodsAfter)} periode`,
  ];
  if (plan.droppedRows > 0) {
    parts.push(`${fmt(plan.droppedRows)} baris tanpa tanggal valid dibuang atas pilihan pemilik`);
  }
  return parts.join(" · ");
}
