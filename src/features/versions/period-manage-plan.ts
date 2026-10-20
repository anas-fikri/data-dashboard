/*
 * Kelola daftar periode (T-056, rencana G-6 §4.7–4.8) — bagian murni, dipakai app dan diuji unit:
 *  - catatan perubahan versi PERIOD_REMOVE / PERIOD_RESTORE (dibekukan di DatasetVersion.plan) dan
 *    kalimat riwayatnya ("Februari 2026 dihapus", "Februari 2026 dipulihkan");
 *  - manifest hapus periode: periode itu dilepas dari SETIAP sheet, periode lain merujuk file typed yang
 *    sama (tanpa objek baru); periode terakhir tidak bisa dihapus (arahkan ke "Ganti semua data");
 *  - manifest pulihkan periode: file typed periode itu dari versi lama yang MASIH tersimpan menggantikan
 *    isi periode itu di data aktif (sheet yang tidak memuatnya di versi lama = tanpa data periode itu),
 *    periode lain tidak berubah; skema kolom harus sama (tanpa cast ulang);
 *  - kandidat "Pulihkan" untuk kartu Periode dan peringatan rollback (periode yang ikut hilang).
 * Isi periode dibandingkan per segmen (bukan file typed): recast menulis file typed baru untuk segmen
 * yang sama, datanya tetap sama.
 */
import { z } from "zod";
import type { ColumnSchema } from "@/features/ingest/infer";
import { periodLabel, type PeriodGrain, type PeriodSource } from "@/features/ingest/period";
import { computePeriodPlan, type OnLimit, type PeriodLimits } from "@/features/ingest/period-plan";
import { planInputs, type ManifestRef } from "@/features/ingest/period-upload-plan";

// ── Catatan perubahan ──────────────────────────────────────────────────────────────────────────────

const count = z.number().int().nonnegative();
const rowsRecord = z.record(z.string(), count);

export const periodChangeSchema = z.object({
  v: z.literal(1),
  kind: z.enum(["REMOVE", "RESTORE"]),
  grain: z.enum(["MONTH", "QUARTER", "YEAR"]),
  key: z.string(),
  start: z.string(),
  label: z.string(),
  /** Baris per sheet logis (lineageId) sebelum/sesudah; null = periode tidak ada. */
  before: rowsRecord.nullable(),
  after: rowsRecord.nullable(),
  beforeRows: count,
  afterRows: count,
  /** Versi aktif saat perubahan dibuat. */
  baseVersionId: z.string(),
  /** Pulihkan: versi lama asal file periode itu. */
  sourceVersionId: z.string().nullable(),
  /** Jumlah periode di data sesudah perubahan. */
  periodsAfter: count,
});

export type PeriodChange = z.infer<typeof periodChangeSchema>;

/** Catatan perubahan dari kolom DatasetVersion.plan; null bila bentuk lain (fail-closed). */
export function parsePeriodChange(json: unknown): PeriodChange | null {
  const r = periodChangeSchema.safeParse(json);
  return r.success ? r.data : null;
}

const fmt = (n: number) => n.toLocaleString("id-ID");

/** Kalimat riwayat versi: "Februari 2026 dihapus (12.400 baris)". */
export function periodChangeNote(c: PeriodChange): string {
  if (c.kind === "REMOVE") return `${c.label} dihapus (${fmt(c.beforeRows)} baris)`;
  return c.before === null
    ? `${c.label} dipulihkan (${fmt(c.afterRows)} baris)`
    : `${c.label} dipulihkan (${fmt(c.beforeRows)} → ${fmt(c.afterRows)} baris)`;
}

/** Judul baris riwayat (versi ini tidak punya file unggahan). */
export function periodChangeTitle(c: PeriodChange): string {
  return c.kind === "REMOVE" ? `Hapus periode ${c.label}` : `Pulihkan periode ${c.label}`;
}

// ── Model manifest ─────────────────────────────────────────────────────────────────────────────────

export interface ManageSegment {
  typedId: string;
  segmentId: string;
  periodKey: string;
  periodStart: string;
  rows: number;
  /** Byte raw + typed. */
  bytes: number;
}

export interface ManageSheet {
  sheetId: string;
  lineageId: string;
  name: string;
  /** Tanda tangan tipe kolom (schemaSignature): file typed antarversi hanya bisa dipakai bila sama. */
  schemaSig: string;
  periodSource: PeriodSource | null;
  periodColumn: number | null;
  segments: ManageSegment[];
}

export interface ManageVersion {
  id: string;
  grain: PeriodGrain | null;
  sheets: ManageSheet[];
}

/**
 * Tanda tangan tipe kolom skema sheet: posisi + tipe + penulisan angka/tanggal + penyimpanan desimal +
 * kolom kosong. Nama tampil dan sembunyi tidak memengaruhi isi file typed.
 */
export function schemaSignature(schema: ColumnSchema[] | null | undefined): string {
  return [...(schema ?? [])]
    .sort((a, b) => a.pos - b.pos)
    .map(
      (c) =>
        `${c.pos}:${c.type}:${c.numberLocale ?? ""}:${c.dateFormat ?? ""}:${c.float ? 1 : 0}:${c.absent ? 1 : 0}`,
    )
    .join("|");
}

const byStart = (a: { periodStart: string }, b: { periodStart: string }) =>
  a.periodStart < b.periodStart ? -1 : a.periodStart > b.periodStart ? 1 : 0;

/** Periode di versi: kunci → awal periode, urut awal periode. */
export function periodsOf(v: ManageVersion): Map<string, string> {
  const all = v.sheets.flatMap((s) => s.segments).sort(byStart);
  return new Map(all.map((g) => [g.periodKey, g.periodStart]));
}

/** Isi satu periode: lineage → segmen (identitas data, bukan file typed). */
function contentOf(v: ManageVersion, key: string): Map<string, ManageSegment> {
  const m = new Map<string, ManageSegment>();
  for (const s of v.sheets) {
    const g = s.segments.find((x) => x.periodKey === key);
    if (g) m.set(s.lineageId, g);
  }
  return m;
}

/** Isi periode di dua versi sama untuk sheet logis milik `a` (segmen yang sama atau sama-sama tidak ada). */
function sameContent(a: ManageVersion, b: ManageVersion, key: string): boolean {
  const x = contentOf(a, key);
  const y = contentOf(b, key);
  const lineages = new Set([...a.sheets.map((s) => s.lineageId)]);
  for (const l of lineages) {
    if ((x.get(l)?.segmentId ?? null) !== (y.get(l)?.segmentId ?? null)) return false;
  }
  return true;
}

const ref = (g: ManageSegment, fromUpload: boolean): ManifestRef => ({
  typedId: g.typedId,
  segmentId: g.segmentId,
  periodKey: g.periodKey,
  periodStart: g.periodStart,
  rows: g.rows,
  fromUpload,
});

const rowsByLineage = (c: Map<string, ManageSegment>): Record<string, number> | null =>
  c.size ? Object.fromEntries([...c.keys()].sort().map((l) => [l, c.get(l)!.rows])) : null;
const total = (r: Record<string, number> | null) =>
  r ? Object.values(r).reduce((n, x) => n + x, 0) : 0;

export type ManifestResult =
  | { ok: false; message: string }
  | {
      ok: true;
      manifest: Map<string, ManifestRef[]>;
      change: Omit<PeriodChange, "baseVersionId" | "sourceVersionId">;
    };

export const LAST_PERIOD_MESSAGE =
  "Periode terakhir tidak bisa dihapus. Untuk mengganti seluruh isi dataset, pakai “Ganti semua data…” di panel unggah.";

/** Manifest versi PERIOD_REMOVE: periode `key` dilepas utuh dari setiap sheet. */
export function removeManifest(active: ManageVersion, key: string): ManifestResult {
  if (!active.grain) return { ok: false, message: "Data aktif tidak disimpan per periode." };
  const periods = periodsOf(active);
  const start = periods.get(key);
  if (!start) {
    return { ok: false, message: "Periode ini sudah tidak ada di data aktif. Muat ulang halaman." };
  }
  if (periods.size <= 1) return { ok: false, message: LAST_PERIOD_MESSAGE };
  const manifest = new Map(
    active.sheets.map((s) => [
      s.lineageId,
      s.segments
        .filter((g) => g.periodKey !== key)
        .sort(byStart)
        .map((g) => ref(g, false)),
    ]),
  );
  const before = rowsByLineage(contentOf(active, key));
  return {
    ok: true,
    manifest,
    change: {
      v: 1,
      kind: "REMOVE",
      grain: active.grain,
      key,
      start,
      label: periodLabel(active.grain, start),
      before,
      after: null,
      beforeRows: total(before),
      afterRows: 0,
      periodsAfter: periods.size - 1,
    },
  };
}

export type RestoreBlock = "SAME" | "SCHEMA" | "GRAIN" | "MISSING";

export const RESTORE_TEXT: Record<RestoreBlock, string> = {
  SAME: "Isi periode ini di versi itu sama dengan data aktif.",
  SCHEMA:
    "Tipe kolom sudah berubah sejak versi itu, jadi datanya tidak bisa dipakai langsung. Unggah ulang file periode ini.",
  GRAIN: "Versi itu tidak disimpan dengan satuan periode yang sama dengan data aktif.",
  MISSING: "Versi itu tidak memuat periode ini.",
};

/**
 * Manifest versi PERIOD_RESTORE: isi periode `key` di setiap sheet aktif = isi di versi `source`
 * (file typed yang sama, dirujuk ulang); periode lain = data aktif apa adanya.
 */
export function restoreManifest(
  active: ManageVersion,
  source: ManageVersion,
  key: string,
): ManifestResult & { block?: RestoreBlock } {
  const fail = (block: RestoreBlock) => ({
    ok: false as const,
    block,
    message: RESTORE_TEXT[block],
  });
  if (!active.grain || source.grain !== active.grain) return fail("GRAIN");
  const start = periodsOf(source).get(key);
  if (!start) return fail("MISSING");
  const from = contentOf(source, key);
  // Hanya sheet logis yang masih ada di data aktif; sheet yang sudah tidak ada tidak dipulihkan.
  if (![...from.keys()].some((l) => active.sheets.some((s) => s.lineageId === l))) {
    return fail("MISSING");
  }
  if (sameContent(active, source, key)) return fail("SAME");
  for (const s of active.sheets) {
    if (!from.has(s.lineageId)) continue;
    const src = source.sheets.find((x) => x.lineageId === s.lineageId)!;
    if (
      src.schemaSig !== s.schemaSig ||
      src.periodSource !== s.periodSource ||
      src.periodColumn !== s.periodColumn
    ) {
      return fail("SCHEMA");
    }
  }
  const manifest = new Map(
    active.sheets.map((s) => {
      const keep = s.segments.filter((g) => g.periodKey !== key).map((g) => ref(g, false));
      const g = from.get(s.lineageId);
      return [s.lineageId, [...keep, ...(g ? [ref(g, true)] : [])].sort(byStart)];
    }),
  );
  const activeKeys = periodsOf(active);
  const beforeContent = contentOf(active, key);
  const before = rowsByLineage(beforeContent);
  const afterContent = new Map(
    [...from].filter(([l]) => active.sheets.some((s) => s.lineageId === l)),
  );
  const after = rowsByLineage(afterContent);
  return {
    ok: true,
    manifest,
    change: {
      v: 1,
      kind: "RESTORE",
      grain: active.grain,
      key,
      start,
      label: periodLabel(active.grain, start),
      before,
      after,
      beforeRows: total(before),
      afterRows: total(after),
      periodsAfter: activeKeys.size + (activeKeys.has(key) ? 0 : 1),
    },
  };
}

/**
 * Batas setelah pemulihan (§5.1): dihitung seperti unggahan periode itu dengan onLimit = REJECT —
 * pemulihan tidak pernah melepas periode lain diam-diam. Pesan penolakan, atau null bila muat.
 */
export function restoreLimitMessage(
  active: ManageVersion,
  source: ManageVersion,
  key: string,
  settings: { keepPeriods: number | null; onLimit: OnLimit },
  limits: PeriodLimits,
): string | null {
  if (!active.grain) return null;
  const toActive = (v: ManageVersion) =>
    v.sheets.map((s) => ({
      sheetId: s.sheetId,
      lineageId: s.lineageId,
      name: s.name,
      schemaRevision: 0,
      segments: s.segments.map((g) => ({ ...g, sha256: null })),
    }));
  const lineages = active.sheets.map((s) => s.lineageId);
  const incoming = source.sheets
    .filter((s) => lineages.includes(s.lineageId))
    .flatMap((s) =>
      s.segments.filter((g) => g.periodKey === key).map((g) => ({ ...g, lineageId: s.lineageId })),
    );
  const inputs = planInputs(toActive(active), incoming);
  const plan = computePeriodPlan({
    grain: active.grain,
    source: "COLUMN",
    baseVersionId: active.id,
    active: inputs.active,
    incoming: inputs.incoming,
    incomingSheets: lineages,
    settings: { keepPeriods: settings.keepPeriods, onLimit: "REJECT" },
    limits,
  });
  if (!plan.rejection) return null;
  return plan.rejection.code === "PERIOD_LIMIT"
    ? plan.rejection.message.replace("Menyimpan", "Memulihkan")
    : plan.rejection.message;
}

// ── Kandidat "Pulihkan" ────────────────────────────────────────────────────────────────────────────

export interface RestoreSource {
  id: string;
  /** Nama file / judul versi. */
  title: string | null;
  /** ISO 8601: kapan versi itu selesai diproses/dibuat. */
  at: string;
  version: ManageVersion;
}

export interface RestoreCandidate {
  key: string;
  start: string;
  label: string;
  /** MISSING = tidak ada di data aktif; CHANGED = isi data aktif berbeda. */
  state: "MISSING" | "CHANGED";
  /** Versi asal yang dipakai "Pulihkan"; null = tidak ada yang bisa dipakai. */
  source: { id: string; title: string | null; at: string; rows: number } | null;
  /** Alasan aksi tidak tersedia (source null). */
  unavailable: string | null;
}

export const RETAINED_GONE =
  "Tidak bisa dipulihkan: versi lama yang memuatnya sudah dihapus otomatis (sistem menyimpan 3 versi siap terakhir).";

/**
 * Periode yang bisa dipulihkan dari versi siap yang masih tersimpan (terbaru dulu = isi sebelum
 * perubahan terakhir), ditambah periode yang menurut riwayat dihapus/diganti/dilepas tetapi isi lamanya
 * sudah tidak tersimpan (aksi tidak tersedia + penjelasannya). Urut awal periode, terbaru dulu.
 */
export function restoreCandidates(
  active: ManageVersion,
  retained: RestoreSource[],
  changedKeys: { key: string; start: string }[],
): RestoreCandidate[] {
  if (!active.grain) return [];
  const grain = active.grain;
  const activeKeys = periodsOf(active);
  const out = new Map<string, RestoreCandidate>();
  const keys = new Map<string, string>();
  for (const r of retained) {
    if (r.version.grain !== grain) continue;
    for (const [k, start] of periodsOf(r.version)) if (!keys.has(k)) keys.set(k, start);
  }
  for (const [key, start] of keys) {
    let blocked: RestoreBlock | null = null;
    for (const r of retained) {
      const m = restoreManifest(active, r.version, key);
      if (m.ok) {
        out.set(key, {
          key,
          start,
          label: periodLabel(grain, start),
          state: activeKeys.has(key) ? "CHANGED" : "MISSING",
          source: { id: r.id, title: r.title, at: r.at, rows: m.change.afterRows },
          unavailable: null,
        });
        break;
      }
      if (m.block === "SCHEMA") blocked ??= "SCHEMA";
    }
    if (!out.has(key) && blocked) {
      out.set(key, {
        key,
        start,
        label: periodLabel(grain, start),
        state: activeKeys.has(key) ? "CHANGED" : "MISSING",
        source: null,
        unavailable: RESTORE_TEXT[blocked],
      });
    }
  }
  for (const c of changedKeys) {
    if (out.has(c.key)) continue;
    out.set(c.key, {
      key: c.key,
      start: c.start,
      label: periodLabel(grain, c.start),
      state: activeKeys.has(c.key) ? "CHANGED" : "MISSING",
      source: null,
      unavailable: RETAINED_GONE,
    });
  }
  return [...out.values()].sort((a, b) => (a.start < b.start ? 1 : a.start > b.start ? -1 : 0));
}

// ── Peringatan rollback ────────────────────────────────────────────────────────────────────────────

const listText = (labels: string[]) =>
  labels.length <= 1
    ? (labels[0] ?? "")
    : `${labels.slice(0, -1).join(", ")} dan ${labels[labels.length - 1]}`;

/**
 * Peringatan saat versi `target` diaktifkan (rollback) menggantikan `active` (§4.8): periode yang ikut
 * hilang dari data aktif, yang kembali ke isi versi itu, dan kembali ke mode biasa. null = tidak ada
 * perubahan periode yang perlu disebut.
 */
export function rollbackWarning(
  active: ManageVersion | null,
  target: ManageVersion,
): string | null {
  if (!active?.grain) return null;
  if (!target.grain) {
    return "Data kembali ke mode biasa (tidak disimpan per periode); semua periode dari versi sekarang tidak dipakai lagi.";
  }
  const grain = active.grain;
  const a = periodsOf(active);
  const t = periodsOf(target);
  const label = (start: string) => periodLabel(grain, start);
  const lost = [...a].filter(([k]) => !t.has(k)).map(([, s]) => label(s));
  const changed = [...a]
    .filter(([k]) => t.has(k) && !sameContent(active, target, k))
    .map(([, s]) => label(s));
  const back = [...t].filter(([k]) => !a.has(k)).map(([, s]) => periodLabel(target.grain!, s));
  const parts: string[] = [];
  if (lost.length) parts.push(`${listText(lost)} ikut hilang dari data aktif.`);
  if (changed.length) parts.push(`${listText(changed)} kembali ke isi versi ini.`);
  if (back.length) parts.push(`${listText(back)} kembali ke data aktif.`);
  if (!parts.length) return null;
  if (lost.length || changed.length) {
    parts.push("Isi sekarang tetap bisa dipulihkan selama versi aktif sekarang masih tersimpan.");
  }
  return parts.join(" ");
}

// ── Kartu Periode ──────────────────────────────────────────────────────────────────────────────────

export interface PeriodSegmentMeta extends ManageSegment {
  originalName: string | null;
  uploadedBy: string | null;
  /** ISO 8601: kapan segmen ditulis (unggahan file periode itu). */
  createdAt: string;
}

export interface PeriodTableRow {
  key: string;
  start: string;
  label: string;
  /** Baris per sheet yang memuat periode ini (urut sheet). */
  sheets: { name: string; rows: number }[];
  rows: number;
  files: string[];
  uploadedBy: string[];
  /** ISO 8601 terbaru di antara segmen periode ini. */
  uploadedAt: string;
}

/** Baris kartu Periode dari manifest aktif (urut awal periode, terbaru dulu). */
export function periodTableRows(
  grain: PeriodGrain,
  sheets: { name: string; segments: PeriodSegmentMeta[] }[],
): PeriodTableRow[] {
  const by = new Map<string, PeriodTableRow>();
  for (const s of sheets) {
    for (const g of s.segments) {
      const row = by.get(g.periodKey) ?? {
        key: g.periodKey,
        start: g.periodStart,
        label: periodLabel(grain, g.periodStart),
        sheets: [],
        rows: 0,
        files: [],
        uploadedBy: [],
        uploadedAt: g.createdAt,
      };
      row.sheets.push({ name: s.name, rows: g.rows });
      row.rows += g.rows;
      if (g.originalName && !row.files.includes(g.originalName)) row.files.push(g.originalName);
      if (g.uploadedBy && !row.uploadedBy.includes(g.uploadedBy)) row.uploadedBy.push(g.uploadedBy);
      if (g.createdAt > row.uploadedAt) row.uploadedAt = g.createdAt;
      by.set(g.periodKey, row);
    }
  }
  return [...by.values()].sort((a, b) => (a.start < b.start ? 1 : a.start > b.start ? -1 : 0));
}
