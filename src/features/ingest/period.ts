/*
 * Model periode (T-049, rencana G-6 §4.3–4.4). Murni: dipakai worker (recast, integritas) dan app
 * (koreksi skema). Satu segmen = satu periode; `_period DATE` di typed segmen = Segment.periodStart,
 * dibekukan saat unggah — recast menulisnya ulang dari metadata, bukan dari data, jadi baris tidak
 * pernah berpindah periode. Mode periode milik versi (periodGrain) dan sheet (periodSource), bukan
 * dataset.
 */
import type { ColumnSchema } from "./infer";
import type { ColumnOverride } from "./typed";

export type PeriodGrain = "MONTH" | "QUARTER" | "YEAR";
export type PeriodSource = "COLUMN" | "LABEL";

/** Mode periode satu sheet; null = sheet/versi non-periode. */
export interface SheetPeriod {
  grain: PeriodGrain;
  source: PeriodSource;
  /** Posisi kanonik kolom periode (source = COLUMN); null untuk LABEL. */
  column: number | null;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Tanggal ISO naive yang valid (YYYY-MM-DD, tanggal benar-benar ada). */
export function isIsoDate(s: string): boolean {
  const m = ISO_DATE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

/** Awal periode yang memuat tanggal ISO `day` (date_trunc satuan, naive). */
export function periodStartOf(grain: PeriodGrain, day: string): string {
  if (!isIsoDate(day)) throw new Error(`tanggal tidak valid: ${day}`);
  const [y, m] = day.split("-") as [string, string];
  if (grain === "YEAR") return `${y}-01-01`;
  if (grain === "QUARTER") {
    const q = Math.floor((Number(m) - 1) / 3) * 3 + 1;
    return `${y}-${String(q).padStart(2, "0")}-01`;
  }
  return `${y}-${m}-01`;
}

/** Kunci periode dari awal periode: "2026-03", "2026-Q1", "2026". */
export function periodKeyOf(grain: PeriodGrain, start: string): string {
  const s = periodStartOf(grain, start);
  const [y, m] = s.split("-") as [string, string];
  if (grain === "YEAR") return y;
  if (grain === "QUARTER") return `${y}-Q${(Number(m) - 1) / 3 + 1}`;
  return `${y}-${m}`;
}

/** Tanggal (UTC tengah malam, kolom @db.Date) → ISO naive; null tetap null. */
export const isoDay = (d: Date | null | undefined): string | null =>
  d ? d.toISOString().slice(0, 10) : null;

/** Mode periode sheet dari kolom DB; null bila versi atau sheet non-periode. */
export function sheetPeriod(
  grain: PeriodGrain | null | undefined,
  source: PeriodSource | null | undefined,
  column: number | null | undefined,
): SheetPeriod | null {
  if (!grain || !source) return null;
  return { grain, source, column: source === "COLUMN" ? (column ?? null) : null };
}

export const PERIOD_HEADER_FROZEN =
  "Baris judul tidak bisa diganti karena sheet ini menyimpan data per periode. Untuk memakai baris judul lain, atur ulang periode atau ganti semua data.";
export const PERIOD_COLUMN_FROZEN =
  "Tipe dan format kolom periode tidak bisa diubah karena menentukan periode setiap baris. Untuk memakai kolom atau format lain, atur ulang periode atau ganti semua data.";

/**
 * Aturan beku mode periode (§4.4): pilih ulang baris judul dan ubah tipe/locale/format kolom periode
 * ditolak, supaya recast tidak bisa memindahkan baris antarperiode. Nama tampil dan sembunyi boleh;
 * nilai yang sama dengan skema sekarang bukan perubahan. Pesan galat (Bahasa Indonesia), atau null.
 */
export function periodFreezeViolation(
  period: SheetPeriod | null,
  change: {
    headerRow?: number;
    currentHeaderRow: number;
    columns?: ColumnOverride[];
    /** Skema sekarang (pembanding); tanpa skema, setiap field cast di kolom periode = perubahan. */
    schema?: Pick<ColumnSchema, "pos" | "type" | "numberLocale" | "dateFormat">[] | null;
  },
): string | null {
  if (!period) return null;
  if (change.headerRow !== undefined && change.headerRow !== change.currentHeaderRow) {
    return PERIOD_HEADER_FROZEN;
  }
  if (period.source === "COLUMN" && period.column !== null) {
    const cur = change.schema?.find((c) => c.pos === period.column);
    const differs = <K extends "type" | "numberLocale" | "dateFormat">(o: ColumnOverride, k: K) =>
      o[k] !== undefined && (!cur || o[k] !== cur[k]);
    const hit = (change.columns ?? []).some(
      (c) =>
        c.pos === period.column &&
        (differs(c, "type") || differs(c, "numberLocale") || differs(c, "dateFormat")),
    );
    if (hit) return PERIOD_COLUMN_FROZEN;
  }
  return null;
}
