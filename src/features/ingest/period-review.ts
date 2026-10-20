/*
 * Layar tinjauan unggahan periode (T-054, rencana G-6 §4.5 langkah 5 dan §4.6) — bagian murni, dipakai
 * halaman tinjauan (server) dan formulirnya (klien). Tanpa "server-only": hanya turunan dari rencana
 * beku (PeriodPlan) + nama sheet, jadi tabel, peringatan, dan centang wajib bisa diuji unit.
 *
 *  - reviewRows: tabel Periode | Sekarang | Setelah | Keterangan — hanya periode yang berubah atau
 *    disebut file ini (yang tidak berubah dihitung saja), baris per sheet bila lebih dari satu sheet.
 *  - requiredAcks: centang yang wajib sebelum "Terapkan": menyusut > ambang (dikirim ke server sebagai
 *    ack.shrink), periode dilepas karena batas (penjaga klien; rencananya tetap dicek sidik), dan
 *    "Buang N baris" tanpa tanggal valid (ack.droppedRows).
 *  - keptSheets: sheet data aktif yang tidak ada di file → "Pertahankan data lama sheet itu" (§4.6).
 *  - labelRange: rentang kolom tanggal acuan sheet berlabel; di luar label → peringatan (§4.4).
 */
import { periodLabel, periodStartOf, type PeriodGrain } from "./period";
import type { PeriodPlan, PeriodPlanEntry } from "./period-plan";

const fmt = (n: number) => n.toLocaleString("id-ID");

export interface ReviewSheetName {
  lineageId: string;
  name: string;
}

export type ReviewTone = "added" | "replaced" | "evicted" | "excluded" | "rejected" | "unchanged";

export interface ReviewRow {
  key: string;
  label: string;
  action: PeriodPlanEntry["action"];
  tone: ReviewTone;
  /** null = periode tidak ada di data aktif / tidak ada sesudahnya. */
  before: number | null;
  after: number | null;
  /** Rincian per sheet (hanya bila dataset punya lebih dari satu sheet). */
  sheets: { name: string; before: number | null; after: number | null }[];
  /** Keterangan utama (Baru / Diganti / Dilepas karena batas 24 periode / Dikecualikan …). */
  note: string;
  /** Catatan tambahan (menyusut, identik, kemungkinan nyasar). */
  flags: string[];
  /** Periode kemungkinan nyasar: pemilik memilih Kecualikan (bawaan) / Masukkan. */
  stray: boolean;
  /** Baris periode ini di file (untuk pilihan nyasar). */
  fileRows: number;
}

/** Keterangan pelepasan: batas jumlah periode, atau batas lain (baris/ukuran/segmen). */
export function evictNote(plan: PeriodPlan): string {
  const evicted = plan.entries.filter((x) => x.action === "EVICTED").length;
  return plan.totals.periodsAfter + evicted > plan.keep
    ? `Dilepas karena batas ${fmt(plan.keep)} periode`
    : "Dilepas karena batas penyimpanan";
}

function noteOf(e: PeriodPlanEntry, plan: PeriodPlan): { tone: ReviewTone; note: string } {
  switch (e.action) {
    case "ADDED":
      return { tone: "added", note: "Baru" };
    case "REPLACED":
      return { tone: "replaced", note: "Diganti" };
    case "EVICTED":
      return { tone: "evicted", note: evictNote(plan) };
    case "EXCLUDED":
      return {
        tone: "excluded",
        note: e.beforeRows > 0 ? "Dikecualikan — data lama tetap" : "Dikecualikan",
      };
    case "REJECTED":
      return { tone: "rejected", note: "Ditolak" };
    case "UNCHANGED":
      return { tone: "unchanged", note: "Tidak berubah" };
  }
}

/**
 * Tabel tinjauan: periode yang disebut file atau dilepas, urut periode. `fileRows` = baris file per
 * periode (dari segmen versi tertunda) — rencana tidak menyimpan baris file periode yang dikecualikan.
 */
export function reviewRows(
  plan: PeriodPlan,
  sheets: ReviewSheetName[],
  fileRows: Record<string, number> = {},
): { rows: ReviewRow[]; unchanged: number } {
  const multi = sheets.length > 1;
  const rows: ReviewRow[] = [];
  let unchanged = 0;
  for (const e of plan.entries) {
    if (!e.fromUpload && e.action !== "EVICTED") {
      unchanged++;
      continue;
    }
    const { tone, note } = noteOf(e, plan);
    const flags: string[] = [];
    if (e.shrink) flags.push("Datanya lebih sedikit dari sekarang");
    if (e.identical) flags.push(`File ini identik dengan periode ${e.label}`);
    if (e.stray)
      flags.push("Kemungkinan nyasar: barisnya jauh lebih sedikit dari periode lain di file");
    rows.push({
      key: e.key,
      label: e.label,
      action: e.action,
      tone,
      before: e.before ? e.beforeRows : null,
      after: e.after ? e.afterRows : null,
      sheets: multi
        ? sheets.map((s) => ({
            name: s.name,
            before: e.before ? (e.before[s.lineageId] ?? 0) : null,
            after: e.after ? (e.after[s.lineageId] ?? 0) : null,
          }))
        : [],
      note,
      flags,
      stray: e.stray,
      fileRows: fileRows[e.key] ?? 0,
    });
  }
  return { rows, unchanged };
}

export interface RequiredAck {
  kind: "shrink" | "evict" | "dropped";
  /** Teks centang (diucapkan pembaca layar sebagai label kotak centang). */
  text: string;
}

const names = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} dan ${xs[xs.length - 1]}`;

/** Centang wajib sebelum "Terapkan" (urutan tetap). Rencana yang ditolak tidak butuh centang. */
export function requiredAcks(plan: PeriodPlan): RequiredAck[] {
  if (plan.rejection) return [];
  const out: RequiredAck[] = [];
  const shrink = plan.entries.filter((e) => e.shrink).map((e) => e.label);
  if (shrink.length) {
    out.push({
      kind: "shrink",
      text: `Saya paham ${names(shrink)} diganti dengan data yang lebih sedikit`,
    });
  }
  const evicted = plan.entries.filter((e) => e.action === "EVICTED").map((e) => e.label);
  if (evicted.length) {
    out.push({
      kind: "evict",
      text: `Saya paham ${names(evicted)} dilepas dari data aktif`,
    });
  }
  if (plan.droppedRows > 0) {
    out.push({
      kind: "dropped",
      text: `Buang ${fmt(plan.droppedRows)} baris tanpa tanggal valid`,
    });
  }
  return out;
}

/** Periode aktif yang file asalnya identik (sha256) dengan file ini. */
export function identicalPeriods(plan: PeriodPlan): string[] {
  return plan.entries.filter((e) => e.identical).map((e) => e.label);
}

/** Sheet data aktif yang tidak ada di file ini: datanya dipertahankan (§4.6). */
export function keptSheets(plan: PeriodPlan, sheets: ReviewSheetName[]): string[] {
  const file = new Set(plan.fileSheets);
  return sheets.filter((s) => !file.has(s.lineageId)).map((s) => s.name);
}

export interface LabelRange {
  sheet: string;
  column: string;
  /** Periode label (awal ISO) dan teksnya. */
  start: string;
  period: string;
  /** Tanggal terkecil/terbesar kolom acuan (ISO naive "YYYY-MM-DD"); null = tidak ada tanggal valid. */
  min: string | null;
  max: string | null;
  /** Ada tanggal di luar periode label. */
  outside: boolean;
}

/** Rentang kolom tanggal acuan sheet berlabel; `min`/`max` boleh ber-jam ("YYYY-MM-DD HH:MM:SS"). */
export function labelRange(
  grain: PeriodGrain,
  a: { sheet: string; column: string; start: string; min: string | null; max: string | null },
): LabelRange {
  const day = (s: string | null) => (s ? s.slice(0, 10) : null);
  const min = day(a.min);
  const max = day(a.max);
  const start = periodStartOf(grain, a.start);
  const out = (d: string | null) => d !== null && periodStartOf(grain, d) !== start;
  return {
    sheet: a.sheet,
    column: a.column,
    start,
    period: periodLabel(grain, start),
    min,
    max,
    outside: out(min) || out(max),
  };
}

/** Tanggal ISO naive → "2 Apr 2026" (tanpa zona: dibaca sebagai UTC lalu ditampilkan UTC). */
export function formatNaiveDay(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("id-ID", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
