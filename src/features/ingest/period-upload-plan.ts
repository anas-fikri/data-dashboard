/*
 * Unggahan periode (T-052, rencana G-6 §4.5–4.6, §4.9) — bagian murni, dipakai worker (ingest periode)
 * dan app (tinjauan/"Terapkan"):
 *  - periodColumnPlan: kolom file baru → posisi kanonik skema aktif (peta kolom segmen, T-gcn8) +
 *    masalah yang membuat versi menunggu pemetaan (kolom terlihat hilang, kolom periode hilang, kolom
 *    kosong yang kembali ada). Cast selalu memakai skema aktif tanpa inferensi (D4).
 *  - validateColMap: peta kolom yang ditulis ke Segment.colMap harus sah (canonicalProfile/copyTyped
 *    membuang posisi di luar jumlah kolom kanonik — peta yang salah = data hilang diam-diam).
 *  - castIssues: vonis cast 98% dihitung HANYA atas baris file baru (bukan gabungan periode lama).
 *  - planInputs/buildPeriodManifest: rencana computePeriodPlan dari metadata manifest aktif + segmen
 *    baru, lalu manifest versi baru per sheet logis (periode yang tidak berubah merujuk file typed yang
 *    sama — tidak ada objek baru untuk periode lama).
 *  - periodPlanDigest/periodPlanSummary: sidik rencana yang dilihat pemilik (PLAN_STALE bila berbeda)
 *    dan kalimat riwayat ("April 2026 ditambahkan (12.950 baris)").
 */
import { createHash } from "node:crypto";
import type { ColumnMeta } from "./header";
import { INFER_THRESHOLD, okCount, type ColumnSchema, type SourceKind } from "./infer";
import {
  computePeriodPlan,
  type PeriodPlan,
  type PeriodPlanEntry,
  type PlanPeriodInput,
} from "./period-plan";
import type { RawProfile } from "./profile";
import { columnRef, planColumns, typeLabel } from "./refresh";

// ── Kolom ───────────────────────────────────────────────────────────────────────────────────────────

export interface PeriodColumnPlan {
  /**
   * colMap[pos-1] = kolom raw `c<n>` file baru untuk posisi kanonik `pos` (0 = tidak ada di file);
   * panjang = jumlah kolom kanonik sheet. [] = identitas (urutan dan jumlah kolom sama persis).
   */
  colMap: number[];
  /** Masalah yang membuat versi menunggu pemetaan (kosong = cocok). */
  issues: string[];
  /** Kolom file baru yang tidak cocok dengan kolom aktif (tetap tersimpan di raw, tidak di typed). */
  extra: number;
}

/**
 * Pasangkan kolom file baru (judul asli + urutan kemunculan, aturan refresh T-013) dengan skema aktif
 * sheet periode. `sheetColCount` = kolom kanonik sheet (Sheet.colCount); `periodColumn` = posisi
 * kanonik kolom periode (sumber kolom) atau null.
 */
export function periodColumnPlan(
  columns: ColumnMeta[],
  schema: ColumnSchema[],
  sheetColCount: number,
  periodColumn: number | null,
  sheet: string | null,
): PeriodColumnPlan {
  const plan = planColumns(columns, schema);
  const issues = plan.missing.map((a) => `${columnRef(a, sheet)} tidak ada di file baru.`);
  const map = Array.from({ length: Math.max(0, Math.trunc(sheetColCount)) }, () => 0);
  for (const [newPos, a] of plan.matched) {
    if (a.absent) {
      // Kolom yang dikosongkan saat pemetaan kembali ada: datanya butuh keputusan pemetaan (T-057),
      // bukan NULL diam-diam.
      issues.push(`${columnRef(a, sheet)} kembali ada di file baru dan perlu dipetakan.`);
      continue;
    }
    if (a.pos < 1 || a.pos > map.length) {
      issues.push(`${columnRef(a, sheet)} perlu dipetakan ulang.`);
      continue;
    }
    map[a.pos - 1] = newPos;
  }
  if (periodColumn !== null) {
    const pc = schema.find((c) => c.pos === periodColumn);
    const mapped = pc && periodColumn >= 1 && periodColumn <= map.length && map[periodColumn - 1];
    if (!pc) issues.push(`Kolom periode sheet${sheet ? ` ${sheet}` : ""} tidak dikenal.`);
    else if (!mapped && !plan.missing.includes(pc)) {
      issues.push(`${columnRef(pc, sheet)} (kolom periode) tidak ada di file baru.`);
    }
  }
  const identity = columns.length === map.length && map.every((n, i) => n === i + 1);
  const used = new Set(map.filter((n) => n > 0));
  return {
    colMap: identity ? [] : map,
    issues,
    extra: columns.filter((c) => !used.has(c.pos)).length,
  };
}

/**
 * Masalah peta kolom (T-gcn8): panjang = kolom kanonik, setiap nilai 0..kolom raw, nilai > 0 unik.
 * [] = sah. Identitas ([]) hanya sah bila jumlah kolom raw = kolom kanonik.
 */
export function validateColMap(
  colMap: number[],
  sheetColCount: number,
  rawColCount: number,
  label: string,
): string[] {
  if (!colMap.length) {
    return rawColCount === sheetColCount
      ? []
      : [
          `${label}: peta kolom identitas untuk ${rawColCount} kolom file, ${sheetColCount} kolom data`,
        ];
  }
  const out: string[] = [];
  if (colMap.length !== sheetColCount) {
    out.push(`${label}: peta kolom ${colMap.length} posisi, ${sheetColCount} kolom data`);
  }
  const seen = new Set<number>();
  for (const n of colMap) {
    if (!Number.isInteger(n) || n < 0 || n > rawColCount) {
      out.push(`${label}: peta kolom merujuk kolom file ${n} di luar 1..${rawColCount}`);
    } else if (n > 0) {
      if (seen.has(n)) out.push(`${label}: kolom file ${n} dipetakan dua kali`);
      seen.add(n);
    }
  }
  if (!seen.size) out.push(`${label}: tidak ada kolom file yang terpetakan`);
  return out;
}

/**
 * Vonis cast atas baris file baru saja (AC 2): kolom non-teks yang terpetakan dengan nilai lolos
 * konversi < 98% → masalah. `profile` = profil kanonik (berkunci posisi skema).
 */
export function castIssues(
  schema: ColumnSchema[],
  profile: RawProfile,
  colMap: number[],
  source: SourceKind,
  sheet: string | null,
): string[] {
  const out: string[] = [];
  for (const c of [...schema].sort((a, b) => a.pos - b.pos)) {
    if (c.absent || c.type === "text") continue;
    if (colMap.length && !(colMap[c.pos - 1]! > 0)) continue;
    const p = profile.profiles.get(`c${c.pos}`);
    const n = p?.n ?? 0;
    if (!p || n === 0) continue;
    const ok = Math.min(n, okCount(p, c, source));
    if (ok / n >= INFER_THRESHOLD) continue;
    const pct = Math.floor((ok * 100) / n);
    out.push(
      `${columnRef(c, sheet)} hanya ${pct}% nilai di file baru yang cocok dengan tipe ${typeLabel(c)}.`,
    );
  }
  return out;
}

// ── Rencana + manifest ──────────────────────────────────────────────────────────────────────────────

/** Satu file typed periode di manifest versi aktif. */
export interface ActiveSegmentRef {
  /** SegmentTyped.id (dirujuk ulang apa adanya oleh versi baru). */
  typedId: string;
  segmentId: string;
  periodKey: string;
  periodStart: string;
  rows: number;
  /** Byte raw + typed. */
  bytes: number;
  sha256: string | null;
}

/** Sheet logis versi aktif (mode periode). */
export interface ActivePeriodSheet {
  sheetId: string;
  lineageId: string;
  name: string;
  schemaRevision: number;
  segments: ActiveSegmentRef[];
}

/** Segmen baru dari file unggahan (satu per periode per sheet logis, baris > 0). */
export interface IncomingSegmentRef {
  typedId: string;
  segmentId: string;
  lineageId: string;
  periodKey: string;
  periodStart: string;
  rows: number;
  bytes: number;
}

const byStart = <T extends { periodStart: string }>(a: T, b: T) =>
  a.periodStart < b.periodStart ? -1 : a.periodStart > b.periodStart ? 1 : 0;

/** Periode → sheet logis → isi (rows/bytes), dan sha256 file asal bila sama di semua sheet. */
function group(
  segs: {
    lineageId: string;
    periodKey: string;
    periodStart: string;
    rows: number;
    bytes: number;
    sha256?: string | null;
  }[],
): PlanPeriodInput[] {
  const by = new Map<string, PlanPeriodInput & { shas: Set<string | null> }>();
  for (const g of [...segs].sort(byStart)) {
    const e = by.get(g.periodKey) ?? {
      key: g.periodKey,
      start: g.periodStart,
      sheets: {},
      shas: new Set<string | null>(),
    };
    if (e.sheets[g.lineageId]) {
      throw new Error(`periode ${g.periodKey} muncul dua kali di sheet logis ${g.lineageId}`);
    }
    e.sheets[g.lineageId] = { rows: g.rows, bytes: g.bytes };
    e.shas.add(g.sha256 ?? null);
    by.set(g.periodKey, e);
  }
  return [...by.values()].map(({ shas, ...p }) => ({
    ...p,
    sha256: shas.size === 1 ? [...shas][0]! : null,
  }));
}

/** Masukan computePeriodPlan dari manifest aktif dan segmen file baru. */
export function planInputs(
  active: ActivePeriodSheet[],
  incoming: IncomingSegmentRef[],
): { active: PlanPeriodInput[]; incoming: PlanPeriodInput[] } {
  return {
    active: group(active.flatMap((s) => s.segments.map((g) => ({ ...g, lineageId: s.lineageId })))),
    incoming: group(incoming),
  };
}

export interface ManifestRef {
  typedId: string;
  segmentId: string;
  periodKey: string;
  periodStart: string;
  rows: number;
  /** File typed dari unggahan ini (bukan rujukan ulang periode lama). */
  fromUpload: boolean;
}

/**
 * Manifest versi baru per sheet logis menurut rencana (urut awal periode): periode ditambah/diganti
 * memakai segmen file baru di sheet yang ada di file, selain itu file typed periode lama apa adanya;
 * periode yang dilepas tidak ikut. Jumlah baris setiap sheet harus sama dengan `after` rencana —
 * selisih = galat (rencana dan segmen tidak sepakat; tidak pernah diaktifkan).
 */
export function buildPeriodManifest(
  plan: PeriodPlan,
  active: ActivePeriodSheet[],
  incoming: IncomingSegmentRef[],
): Map<string, ManifestRef[]> {
  if (plan.rejection) throw new Error("rencana yang ditolak tidak punya manifest");
  const file = new Set(plan.fileSheets);
  const out = new Map<string, ManifestRef[]>();
  const entries = [...plan.entries].sort((a, b) =>
    a.start < b.start ? -1 : a.start > b.start ? 1 : 0,
  );
  for (const s of active) {
    const refs: ManifestRef[] = [];
    for (const e of entries) {
      if (e.after === null) continue;
      const fresh = (e.action === "ADDED" || e.action === "REPLACED") && file.has(s.lineageId);
      const want = e.after[s.lineageId] ?? 0;
      const ref: ManifestRef | null = fresh
        ? pick(
            incoming.find((g) => g.lineageId === s.lineageId && g.periodKey === e.key),
            true,
          )
        : pick(
            s.segments.find((g) => g.periodKey === e.key),
            false,
          );
      if ((ref?.rows ?? 0) !== want) {
        throw new Error(
          `manifest ${s.name} periode ${e.key}: ${ref?.rows ?? 0} baris, rencana ${want} baris`,
        );
      }
      if (ref) refs.push(ref);
    }
    out.set(s.lineageId, refs);
  }
  return out;
}

function pick(
  g:
    | { typedId: string; segmentId: string; periodKey: string; periodStart: string; rows: number }
    | undefined,
  fromUpload: boolean,
): ManifestRef | null {
  return g
    ? {
        typedId: g.typedId,
        segmentId: g.segmentId,
        periodKey: g.periodKey,
        periodStart: g.periodStart,
        rows: g.rows,
        fromUpload,
      }
    : null;
}

/** JSON dengan kunci objek terurut (sidik stabil walau urutan field berbeda). */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

/** Sidik rencana (sha256 heksa): yang dikonfirmasi pemilik harus sama dengan hitungan ulang server. */
export function periodPlanDigest(plan: PeriodPlan): string {
  return createHash("sha256").update(canonical(plan)).digest("hex");
}

const fmt = (n: number) => n.toLocaleString("id-ID");

function entryText(e: PeriodPlanEntry, plan: PeriodPlan): string | null {
  switch (e.action) {
    case "ADDED":
      return `${e.label} ditambahkan (${fmt(e.afterRows)} baris)`;
    case "REPLACED":
      return `${e.label} diganti (${fmt(e.beforeRows)} → ${fmt(e.afterRows)} baris)`;
    case "EVICTED": {
      const evicted = plan.entries.filter((x) => x.action === "EVICTED").length;
      return plan.totals.periodsAfter + evicted > plan.keep
        ? `${e.label} dilepas (batas ${fmt(plan.keep)} periode)`
        : `${e.label} dilepas (batas penyimpanan)`;
    }
    case "EXCLUDED":
      return `${e.label} dikecualikan (kemungkinan nyasar)`;
    default:
      return null;
  }
}

/** Kalimat riwayat/notifikasi rencana unggahan periode (urut periode). */
export function periodPlanSummary(plan: PeriodPlan): string {
  const parts = plan.entries.map((e) => entryText(e, plan)).filter((x): x is string => !!x);
  if (plan.droppedRows > 0)
    parts.push(`${fmt(plan.droppedRows)} baris tanpa tanggal valid dibuang`);
  for (const s of plan.ignoredSheets) parts.push(`sheet “${s}” tidak disimpan`);
  return parts.length ? parts.join(" · ") : "Tidak ada periode yang berubah";
}

/** Persetujuan eksplisit yang wajib ada saat "Terapkan" (selain sidik rencana). */
export interface PeriodAck {
  /** "Saya paham … diganti dengan data yang lebih sedikit". */
  shrink: boolean;
  /** "Buang N baris" tanpa tanggal valid: N harus sama dengan rencana. */
  droppedRows: number;
}

/** Alasan "Terapkan" ditolak untuk rencana ini (null = boleh). Pesan Bahasa Indonesia. */
export function confirmBlocker(plan: PeriodPlan, ack: PeriodAck): string | null {
  if (plan.rejection) return plan.rejection.message;
  if (plan.confirm.includes("NO_CHANGE")) {
    return "Tidak ada periode yang berubah dengan pilihan ini. Batalkan unggahan, atau pilih “Masukkan” untuk periode yang dikecualikan.";
  }
  if (plan.confirm.includes("SHRINK") && !ack.shrink) {
    const names = plan.entries.filter((e) => e.shrink).map((e) => e.label);
    return `Centang “Saya paham ${names.join(", ")} diganti dengan data yang lebih sedikit” untuk melanjutkan.`;
  }
  if (plan.droppedRows !== ack.droppedRows) {
    return plan.droppedRows > 0
      ? `Ada ${fmt(plan.droppedRows)} baris tanpa tanggal valid. Pilih “Buang ${fmt(plan.droppedRows)} baris” untuk melanjutkan, atau perbaiki file lalu unggah ulang.`
      : "Jumlah baris yang dibuang tidak cocok dengan rencana. Tinjau ulang.";
  }
  return null;
}

// ── Keputusan commit (worker "aktif otomatis" dan app "Terapkan") ───────────────────────────────────

/** Fakta file unggahan yang tidak bergantung pada data aktif (dibekukan bersama rencana). */
export interface UploadFacts {
  grain: PeriodPlan["grain"];
  source: PeriodPlan["source"];
  /** Sheet logis yang ada di file. */
  fileSheets: string[];
  droppedRows: number;
  ignoredSheets: string[];
  fileSha256: string | null;
}

/** Fakta file dari rencana beku (versi AWAITING_CONFIRM). */
export const factsOf = (plan: PeriodPlan): UploadFacts => ({
  grain: plan.grain,
  source: plan.source,
  fileSheets: plan.fileSheets,
  droppedRows: plan.droppedRows,
  ignoredSheets: plan.ignoredSheets,
  fileSha256: plan.fileSha256,
});

export type CommitMode =
  /** Worker setelah file diproses: aktif hanya bila rencana murni menambah dan `allowAuto`. */
  | { kind: "auto"; allowAuto: boolean }
  /** Pemilik menekan "Terapkan": rencana hitung ulang harus sama dengan yang dilihatnya. */
  | { kind: "confirm"; digest: string; ack: PeriodAck };

export type CommitDecision =
  | { decision: "activate"; plan: PeriodPlan; manifest: Map<string, ManifestRef[]> }
  | { decision: "await"; plan: PeriodPlan; manifest: Map<string, ManifestRef[]> }
  | { decision: "reject"; plan: PeriodPlan; message: string }
  | { decision: "plan_stale"; plan: PeriodPlan }
  | { decision: "blocked"; plan: PeriodPlan; message: string };

/**
 * Rencana SELALU dihitung ulang dari data aktif + pengaturan dataset + batas saat ini (tidak pernah
 * memercayai `autoActivate` rencana beku), lalu:
 *  - auto: penolakan → reject; aktif otomatis hanya bila rencana hitung ulang `autoActivate` dan
 *    `allowAuto` (versi dasar init = versi aktif); selain itu menunggu konfirmasi;
 *  - confirm: sidik berbeda → plan_stale (pemilik melihat rencana baru); penolakan/centang yang kurang →
 *    blocked; selain itu activate.
 */
export function decidePeriodCommit(a: {
  facts: UploadFacts;
  activeVersionId: string;
  active: ActivePeriodSheet[];
  incoming: IncomingSegmentRef[];
  settings: { keepPeriods: number | null; onLimit: "REJECT" | "EVICT_OLDEST" };
  limits: Parameters<typeof computePeriodPlan>[0]["limits"];
  include: string[];
  mode: CommitMode;
}): CommitDecision {
  const inputs = planInputs(a.active, a.incoming);
  const plan = computePeriodPlan({
    grain: a.facts.grain,
    source: a.facts.source,
    baseVersionId: a.activeVersionId,
    active: inputs.active,
    incoming: inputs.incoming,
    incomingSheets: a.facts.fileSheets,
    settings: a.settings,
    limits: a.limits,
    include: a.include,
    fileSha256: a.facts.fileSha256,
    droppedRows: a.facts.droppedRows,
    ignoredSheets: a.facts.ignoredSheets,
  });
  if (a.mode.kind === "confirm") {
    if (periodPlanDigest(plan) !== a.mode.digest) return { decision: "plan_stale", plan };
    const blocker = confirmBlocker(plan, a.mode.ack);
    if (blocker) return { decision: "blocked", plan, message: blocker };
    return {
      decision: "activate",
      plan,
      manifest: buildPeriodManifest(plan, a.active, a.incoming),
    };
  }
  if (plan.rejection) return { decision: "reject", plan, message: plan.rejection.message };
  const manifest = buildPeriodManifest(plan, a.active, a.incoming);
  return plan.autoActivate && a.mode.allowAuto
    ? { decision: "activate", plan, manifest }
    : { decision: "await", plan, manifest };
}
