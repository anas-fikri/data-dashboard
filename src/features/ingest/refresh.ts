/*
 * Versi refresh (T-013, flow-kerja A4/D4): file baru untuk dataset yang sudah punya versi aktif di-cast
 * dengan skema aktif per nama asli, tanpa inferensi, sehingga koreksi user (tipe, format, nama tampil,
 * sembunyi) terbawa. Murni; eksekusi di ingest.ts, keputusan aktivasi di repo.finish.
 *  - Sheet: lewat nama ternormalisasi (atau satu-satunya sheet bila keduanya satu sheet), aturan yang
 *    sama dengan remap widget; nama alias sheet aktif (pasangan pemetaan T-014) juga dicocokkan. Sheet
 *    baru tanpa pasangan diinferensi biasa.
 *  - Kolom: nama asli ternormalisasi + urutan kemunculannya ("Total" ke-2 ↔ "Total" ke-2; judul kosong
 *    dicocokkan urut di antara yang kosong). Kolom tambahan diinferensi tetapi disembunyikan.
 *  - Cocok = semua sheet aktif ada, semua kolom terlihat ada, dan tiap kolom non-teks yang cocok
 *    ≥ 98% nilainya lolos konversi; selain itu versi menunggu pemetaan (T-014) dengan alasan.
 *  - Kolom kosong (absent, T-014) yang tetap tidak ada di file ditulis ulang kosong (bukan "hilang");
 *    bila kembali di file, kolom itu cocok lewat judul asli dan menjadi kolom nyata lagi.
 */
import { columnKeys, matchSheet, normName } from "@/features/widgets/remap";
import { MAX_COLUMN } from "@/features/widgets/spec";
import { baseName, columnNames, uniqueName, type ColumnMeta } from "./header";
import { INFER_THRESHOLD, type ColumnSchema, type ColumnType } from "./infer";
import { PREVIEW_CHARS, type SheetPreview } from "./preview";
import { choiceOf, type ColumnOverride } from "./typed";

/** Sheet versi aktif yang menjadi acuan cast. */
export interface ActiveSheet {
  id: string;
  name: string;
  /**
   * Akar silsilah nama sheet (T-014, sheet ganti nama yang dipasangkan user): nama sheet sebelum
   * rantai ganti nama pertama, sehingga V1 → V2 → V3 tetap saling cocok (matchSheet). Sheet file baru
   * dengan nama itu tetap berpasangan. null/kosong = tidak ada.
   */
  aliasName?: string | null;
  index: number;
  headerRow: number;
  schemaRevision: number;
  schema: ColumnSchema[];
}

export interface ActiveSnapshot {
  versionId: string;
  sheets: ActiveSheet[];
}

/** Acuan yang dipakai cast; finish membandingkannya di bawah lock (berubah → ulang ingest). */
export interface SnapshotRef {
  activeVersionId: string | null;
  sheets: { id: string; schemaRevision: number }[];
}

export type Verdict = { ok: true } | { ok: false; reason: string };

/** Batas alasan yang disimpan (errorMessage) dan jumlah masalah yang disebut satu per satu. */
const REASON_MAX = 500;
const LISTED = 5;
const LABEL_MAX = 60;

export function snapshotRef(active: ActiveSnapshot | null): SnapshotRef {
  return {
    activeVersionId: active?.versionId ?? null,
    sheets: (active?.sheets ?? []).map((s) => ({ id: s.id, schemaRevision: s.schemaRevision })),
  };
}

/** Versi aktif dan revisi skema tiap sheet-nya masih sama dengan acuan cast. */
export function sameSnapshot(a: SnapshotRef, b: SnapshotRef): boolean {
  if (a.activeVersionId !== b.activeVersionId || a.sheets.length !== b.sheets.length) return false;
  const rev = new Map(b.sheets.map((s) => [s.id, s.schemaRevision]));
  return a.sheets.every((s) => rev.get(s.id) === s.schemaRevision);
}

/**
 * Pasangan sheet aktif untuk tiap sheet baru (urutan input; null = sheet tambahan) dan sheet aktif yang
 * tidak ada di file baru. Satu sheet baru tidak pernah dipasangkan dua kali. Dua tahap: semua pasangan
 * nama sama lebih dulu, baru alias/fallback satu-sheet (matchSheet) untuk sheet aktif yang belum
 * berpasangan dan hanya ke sheet baru yang masih bebas — alias sheet aktif mana pun tidak pernah
 * merebut sheet baru milik sheet aktif lain yang namanya sama (tidak bergantung urutan sheet).
 */
export function planSheets(
  fresh: { name: string }[],
  active: ActiveSheet[],
): { pairs: (ActiveSheet | null)[]; missing: ActiveSheet[] } {
  const pairs: (ActiveSheet | null)[] = fresh.map(() => null);
  const named = fresh.map((f, i) => ({ name: f.name, i }));
  const sorted = [...active].sort((x, y) => x.index - y.index);
  const exact = new Set<string>();
  for (const a of sorted) {
    const hit = named.filter((n) => normName(n.name) === normName(a.name));
    if (hit.length === 1 && !pairs[hit[0]!.i]) {
      pairs[hit[0]!.i] = a;
      exact.add(a.id);
    }
  }
  const missing: ActiveSheet[] = [];
  for (const a of sorted) {
    if (exact.has(a.id)) continue;
    const m = matchSheet(a, named, active.length);
    if (m && !pairs[m.i]) pairs[m.i] = a;
    else missing.push(a);
  }
  return { pairs, missing };
}

export interface ColumnPlan {
  /** Satu per kolom file baru; kolom yang cocok selalu membawa tipe aktif (tanpa inferensi). */
  overrides: ColumnOverride[];
  /** Kolom aktif per posisi di file baru. */
  matched: Map<number, ColumnSchema>;
  /** Kolom aktif terlihat yang tidak ada di file baru (kolom tersembunyi yang hilang diabaikan). */
  missing: ColumnSchema[];
  /**
   * Kolom kosong (absent, T-014) terlihat yang tetap tidak ada di file baru: ditulis ulang kosong tanpa
   * keputusan baru (urut posisi aktif). Melewati MAX_COLUMN → masuk `missing` (perlu pemetaan).
   */
  absent: ColumnSchema[];
}

export function planColumns(columns: ColumnMeta[], active: ColumnSchema[]): ColumnPlan {
  const act = [...active].sort((a, b) => a.pos - b.pos);
  const actKeys = columnKeys(act.map((c) => c.original));
  const byKey = new Map(actKeys.map((k, i) => [k, act[i]!]));
  const newKeys = columnKeys(columns.map((c) => c.original));
  const matched = new Map<number, ColumnSchema>();
  columns.forEach((c, i) => {
    const a = byKey.get(newKeys[i]!);
    if (a) matched.set(c.pos, a);
  });
  const found = new Set(matched.values());
  // Nama tampil kolom tambahan tidak boleh bentrok dengan nama akhir mana pun (cocok, dipetakan,
  // kosong — T-014): semua nama skema aktif dicadangkan.
  const used = new Set(act.map((a) => a.name.toLowerCase()));
  const overrides = columns.map((c): ColumnOverride => {
    const a = matched.get(c.pos);
    if (a) return choiceOf(a, c.pos);
    return { pos: c.pos, name: uniqueName(baseName(c.original, c.pos), used), hidden: true };
  });
  const lost = act.filter((a) => !a.hidden && !found.has(a));
  const absent = lost.filter((a) => a.absent);
  if (columns.length + absent.length > MAX_COLUMN) {
    return { overrides, matched, missing: lost, absent: [] };
  }
  return { overrides, matched, missing: lost.filter((a) => !a.absent), absent };
}

/**
 * Baris header versi refresh: kandidat pertama (baris header sheet aktif, lalu tebakan) tanpa kolom
 * terlihat yang hilang; bila semua kehilangan kolom, yang paling sedikit (seri → kandidat lebih awal).
 */
export function chooseHeader<T extends { columns: ColumnMeta[] }>(
  candidates: T[],
  active: ColumnSchema[],
): T {
  let best = candidates[0]!;
  let fewest = Infinity;
  for (const c of candidates) {
    const n = planColumns(c.columns, active).missing.length;
    if (n === 0) return c;
    if (n < fewest) {
      best = c;
      fewest = n;
    }
  }
  return best;
}

/**
 * Akar silsilah nama sheet aktif `a` (T-014): aliasnya bila ada (selalu akar), selain itu namanya
 * sendiri. Sheet yang dipasangkan user dengan `a` mendapat ini sebagai alias, sehingga ganti nama
 * berantai (V1 → V2 → V3) tetap menunjuk nama V1 dan alias semua versi di rantai itu sama.
 */
export function lineageRoot(a: Pick<ActiveSheet, "name" | "aliasName">): string {
  return a.aliasName?.trim() ? a.aliasName : a.name;
}

/**
 * Alias sheet versi baru yang berpasangan otomatis dengan sheet aktif `a` (T-014): nama sama → alias
 * (akar silsilah) sheet aktif terbawa (V1 → V2 dipetakan → V3 → rollback ke V1 tetap cocok); cocok
 * lewat alias (nama akar kembali) → tanpa alias, karena sheet itu sendiri sudah bernama akar (versi
 * di antaranya tetap cocok lewat aliasnya); fallback satu-sheet → tanpa alias.
 */
export function carriedAlias(
  name: string,
  a: Pick<ActiveSheet, "name" | "aliasName">,
): string | null {
  return normName(name) === normName(a.name) && a.aliasName?.trim() ? a.aliasName : null;
}

/** Sheet versi baru yang header-nya bisa dipilih ulang dari pratinjau tersimpan. */
export interface HeaderSource {
  headerRow: number;
  colCount: number;
  columns: ColumnMeta[];
  preview: SheetPreview | null;
}

/**
 * Header sheet versi baru yang dipasangkan USER dengan sheet aktif (T-014, sheet ganti nama; ingest
 * belum mencoba baris header aktif karena tidak tahu pasangannya): baris header sheet aktif (bisa
 * koreksi user) dibentuk dari pratinjau tersimpan, lalu dipilih dengan aturan chooseHeader terhadap
 * header tersimpan. Pratinjau hanya dipakai bila hasilnya sama persis dengan header dari raw.parquet:
 * baris itu ada di pratinjau, semua kolom termuat (≤ 50 kolom), dan tidak ada sel yang mungkin
 * terpotong; selain itu header tersimpan. Satu fungsi murni untuk halaman, validasi app, dan worker,
 * sehingga keputusan kolom selalu merujuk kolom yang sama.
 */
export function pairedHeader(
  s: HeaderSource,
  active: Pick<ActiveSheet, "headerRow" | "schema">,
): { headerRow: number; columns: ColumnMeta[] } {
  const stored = { headerRow: s.headerRow, columns: s.columns };
  if (active.headerRow === s.headerRow) return stored;
  const row = s.preview?.rows.find((r) => r.row === active.headerRow);
  const exact =
    row !== undefined &&
    row.cells.length >= s.colCount &&
    row.cells.every((c) => c === null || c.length < PREVIEW_CHARS);
  if (!exact) return stored;
  const columns = columnNames(row.cells, s.colCount);
  return chooseHeader([{ headerRow: active.headerRow, columns }, stored], active.schema);
}

const clip = (s: string) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > LABEL_MAX ? `${t.slice(0, LABEL_MAX - 1)}…` : t;
};

/** Kolom untuk pesan: nama tampil, plus judul di file bila user sudah menggantinya dan nama sheet. */
function columnRef(c: ColumnSchema, sheet: string | null): string {
  const notes: string[] = [];
  if (c.original.trim() !== "" && normName(c.original) !== normName(c.name)) {
    notes.push(`judul di file "${clip(c.original)}"`);
  }
  if (sheet !== null) notes.push(`sheet ${clip(sheet)}`);
  return `Kolom "${clip(c.name)}"${notes.length ? ` (${notes.join(", ")})` : ""}`;
}

/** Sama dengan label tipe di halaman skema (components/schema/labels.ts), plus format yang dipakai. */
const TYPE_LABEL: Record<ColumnType, string> = {
  text: "Teks",
  integer: "Bilangan bulat",
  decimal: "Angka desimal",
  date: "Tanggal",
  timestamp: "Tanggal & jam",
  duration: "Durasi",
  boolean: "Ya / Tidak",
};

export function typeLabel(c: ColumnSchema): string {
  const base = TYPE_LABEL[c.type];
  if (c.type === "date" || c.type === "timestamp") {
    return `${base} (${c.dateFormat === "serial" ? "nomor seri Excel" : (c.dateFormat ?? "yyyy-mm-dd")})`;
  }
  if (c.type === "integer" || c.type === "decimal") {
    const id = c.numberLocale === "id";
    const sample = c.type === "integer" ? (id ? "1.234" : "1,234") : id ? "1.234,56" : "1,234.56";
    return `${base} (format ${sample})`;
  }
  return base;
}

export const missingSheetIssue = (a: ActiveSheet) =>
  `Sheet "${clip(a.name)}" tidak ada di file baru.`;

/**
 * Masalah satu sheet yang cocok: kolom terlihat yang hilang, lalu kolom non-teks yang cocok dengan
 * rasio lolos konversi < 98% (n = nilai non-kosong; n = 0 dianggap lolos). `sheet` = nama sheet untuk
 * pesan (null bila dataset hanya satu sheet).
 */
export function sheetIssues(
  sheet: string | null,
  plan: ColumnPlan,
  schema: ColumnSchema[],
  nonEmpty: number[],
): string[] {
  const out = plan.missing.map((a) => `${columnRef(a, sheet)} tidak ada di file baru.`);
  for (const s of schema) {
    const a = plan.matched.get(s.pos);
    const n = nonEmpty[s.pos - 1] ?? 0;
    if (!a || s.type === "text" || n === 0) continue;
    const ok = n - s.castFailCount;
    if (ok / n >= INFER_THRESHOLD) continue;
    // Dibulatkan ke bawah (bilangan bulat, tanpa galat pecahan): 97,9% tidak pernah tampil "98%".
    const pct = Math.floor((ok * 100) / n);
    out.push(`${columnRef(a, sheet)} hanya ${pct}% nilai yang cocok dengan tipe ${typeLabel(s)}.`);
  }
  return out;
}

/** Tanpa masalah → cocok; selain itu alasan ≤ 500 karakter (≤ 5 masalah disebut, sisanya dihitung). */
export function verdictOf(issues: string[]): Verdict {
  if (issues.length === 0) return { ok: true };
  const rest = issues.length - LISTED;
  const reason = `${issues.slice(0, LISTED).join(" ")}${rest > 0 ? ` Dan ${rest} masalah lainnya.` : ""}`;
  return {
    ok: false,
    reason: reason.length > REASON_MAX ? `${reason.slice(0, REASON_MAX - 1)}…` : reason,
  };
}
