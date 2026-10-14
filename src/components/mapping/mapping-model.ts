import type {
  CastChoice,
  MappingActiveColumn,
  MappingLast,
  MappingLowCast,
  MappingNewColumn,
  MappingPayload,
  MappingPlanView,
  MappingReady,
  MappingReviewIssue,
  MappingSheetView,
} from "./mapping-types";
import type { MappingLocal } from "./use-mapping-job";

/*
 * Model murni halaman pemetaan (T-014): draf keputusan → kemajuan, pilihan kolom satu-ke-satu,
 * kolom baru yang disembunyikan, ringkasan konfirmasi NULL, tahap tinjau cast, dan payload. Diuji
 * unit; server tetap memvalidasi ulang semuanya.
 */

/** Keputusan kolom satu pasangan sheet. */
export interface PairDraft {
  /** Posisi kolom aktif → posisi kolom baru, atau null (kosongkan). Tanpa kunci = belum diputuskan. */
  columns: Record<number, number | null>;
  /** Posisi kolom baru → tipe/format yang berbeda dari pilihan aktif. */
  casts: Record<number, CastChoice>;
}

export interface SheetDraft extends PairDraft {
  /** Hanya sheet aktif tanpa pasangan otomatis: undefined = belum dipilih, null = tidak dipakai lagi. */
  target?: string | null;
  /** Keputusan pasangan lain yang pernah dipilih: kembali ke sheet itu = keputusannya kembali. */
  stash?: Record<string, PairDraft>;
}
/** Draf per id sheet aktif. */
export type MappingDraft = Record<string, SheetDraft>;

/** Rencana pasangan pilihan user yang sudah dimuat (pairPlanAction), per pairKey. */
export type PairPlans = Record<string, MappingPlanView>;
export const pairKey = (activeSheetId: string, newSheetId: string) =>
  `${activeSheetId}>${newSheetId}`;

/** Hasil tahap tinjau per id sheet aktif → posisi kolom aktif. */
export type ReviewFlags = Record<string, Record<number, { pct: number; typeLabel: string }>>;

const BLANK: SheetDraft = Object.freeze({ columns: {}, casts: {} }) as SheetDraft;

export const sheetDraft = (draft: MappingDraft, sheetId: string): SheetDraft =>
  draft[sheetId] ?? BLANK;

/** Kunci keputusan (juga dasar id elemen yang difokuskan saat belum lengkap). */
export const sheetKey = (sheetId: string) => `${sheetId}-sheet`;
export const columnKey = (sheetId: string, pos: number) => `${sheetId}-${pos}`;
export const domId = (key: string) => `map-${key}`;
/** Baris "nilai tidak cocok" kolom baru `pos` (pemicu tipenya: `${id}-type`). */
export const castRowId = (sheetId: string, pos: number) => `map-${sheetId}-cast-${pos}`;

/** Sheet baru yang dipakai: pasangan otomatis, pilihan user, null (tidak dipakai), undefined (belum). */
export function targetOf(sheet: MappingSheetView, d: SheetDraft): string | null | undefined {
  return sheet.target ? sheet.target.id : d.target;
}

/** Rencana kolom pasangan yang dipakai; null bila sheet belum/tidak dipasangkan atau belum dimuat. */
export function pairOf(
  sheet: MappingSheetView,
  d: SheetDraft,
  plans: PairPlans,
): MappingPlanView | null {
  const t = targetOf(sheet, d);
  if (t == null) return null;
  if (sheet.target?.id === t) return sheet;
  return plans[pairKey(sheet.active.id, t)] ?? null;
}

/**
 * Keputusan wajib dalam urutan tampil: pasangan sheet (bila perlu; selesai setelah kolomnya termuat)
 * lalu tiap kolom yang hilang.
 */
export function decisions(view: MappingReady, draft: MappingDraft, plans: PairPlans) {
  const out: { key: string; done: boolean }[] = [];
  for (const s of view.sheets) {
    const d = sheetDraft(draft, s.active.id);
    const pair = pairOf(s, d, plans);
    if (!s.target) out.push({ key: sheetKey(s.active.id), done: d.target === null || !!pair });
    for (const pos of pair?.missing ?? []) {
      out.push({ key: columnKey(s.active.id, pos), done: d.columns[pos] !== undefined });
    }
  }
  return out;
}

export function progress(view: MappingReady, draft: MappingDraft, plans: PairPlans) {
  const all = decisions(view, draft, plans);
  return { done: all.filter((x) => x.done).length, total: all.length };
}

/** Kunci keputusan yang belum dibuat (kosong = siap disimpan). */
export const undecided = (view: MappingReady, draft: MappingDraft, plans: PairPlans) =>
  decisions(view, draft, plans)
    .filter((x) => !x.done)
    .map((x) => x.key);

export interface PickOption {
  column: MappingNewColumn;
  /** Nama kolom aktif lain yang sudah memakai kolom ini (satu-ke-satu), atau null. */
  takenBy: string | null;
}

/** Kolom baru yang belum cocok dan bisa dipilih untuk kolom aktif `activePos`. */
export function pickOptions(
  sheet: MappingSheetView,
  pair: MappingPlanView,
  d: SheetDraft,
  activePos: number,
): PickOption[] {
  const names = new Map(sheet.active.columns.map((c) => [c.pos, c.name]));
  const taken = new Map<number, string>();
  for (const [a, n] of Object.entries(d.columns)) {
    if (n !== null && Number(a) !== activePos) taken.set(n, names.get(Number(a)) ?? "");
  }
  const byPos = new Map(pair.newColumns.map((c) => [c.pos, c]));
  return pair.extra.flatMap((pos) => {
    const column = byPos.get(pos);
    return column ? [{ column, takenBy: taken.get(pos) ?? null }] : [];
  });
}

export interface PairOption {
  id: string;
  name: string;
  colCount: number;
  /** Nama sheet aktif lain yang sudah memilih sheet baru ini (satu-ke-satu), atau null. */
  takenBy: string | null;
}

/** Sheet baru tanpa pasangan yang bisa dipilih untuk `sheet`; yang dipilih sheet aktif lain ditandai. */
export function pairOptions(
  view: MappingReady,
  draft: MappingDraft,
  sheet: MappingSheetView,
): PairOption[] {
  const taken = new Map<string, string>();
  for (const s of view.sheets) {
    const t = s.target || s.active.id === sheet.active.id ? null : draft[s.active.id]?.target;
    if (t) taken.set(t, s.active.name);
  }
  return sheet.candidates.map((c) => ({
    id: c.id,
    name: c.name,
    colCount: c.colCount,
    takenBy: taken.get(c.id) ?? null,
  }));
}

/** Draf setelah sheet pasangan diganti: keputusan pasangan lama disimpan, pasangan baru dipulihkan. */
export function withTarget(d: SheetDraft, next: string | null): SheetDraft {
  const stash = { ...d.stash };
  if (typeof d.target === "string") stash[d.target] = { columns: d.columns, casts: d.casts };
  const kept = typeof next === "string" ? stash[next] : undefined;
  return { target: next, columns: kept?.columns ?? {}, casts: kept?.casts ?? {}, stash };
}

/** Kolom baru yang tidak dipakai pemetaan: masuk skema sebagai kolom tersembunyi. */
export function hiddenExtras(pair: MappingPlanView, d: SheetDraft): MappingNewColumn[] {
  const used = new Set(Object.values(d.columns));
  const byPos = new Map(pair.newColumns.map((c) => [c.pos, c]));
  return pair.extra.flatMap((pos) => {
    const c = byPos.get(pos);
    return c && !used.has(pos) ? [c] : [];
  });
}

/** Pilihan tipe/format awal baris "nilai tidak cocok": pilihan kolom aktif (atau tipe kolom baru). */
export function castBase(
  sheet: MappingSheetView,
  pair: MappingPlanView,
  row: MappingLowCast,
): CastChoice {
  const a = sheet.active.columns.find((c) => c.pos === row.activePos);
  const src = a ?? pair.newColumns.find((c) => c.pos === row.pos);
  return { type: src?.type ?? "text", numberLocale: a?.numberLocale, dateFormat: a?.dateFormat };
}

const activeChoice = (a: MappingActiveColumn): CastChoice => ({
  type: a.type,
  numberLocale: a.numberLocale,
  dateFormat: a.dateFormat,
});

/** Sheet + kolom aktif yang dimaksud satu isu tinjau (nama sheet aktif + nama tampil), atau null. */
export function locateIssue(
  view: MappingReady,
  issue: Pick<MappingReviewIssue, "sheet" | "column">,
): { sheetId: string; activePos: number } | null {
  const s = view.sheets.find((x) => x.active.name === issue.sheet);
  const c = s?.active.columns.find((x) => x.name === issue.column);
  return s && c ? { sheetId: s.active.id, activePos: c.pos } : null;
}

/** Tanda tinjau setelah job mengembalikan isu: persen tepat (tipe yang benar-benar diterapkan). */
export function withReview(
  flags: ReviewFlags,
  view: MappingReady,
  issues: MappingReviewIssue[],
): ReviewFlags {
  const next = { ...flags };
  for (const i of issues) {
    const at = locateIssue(view, i);
    if (!at) continue;
    next[at.sheetId] = {
      ...next[at.sheetId],
      [at.activePos]: { pct: i.pct, typeLabel: i.typeLabel },
    };
  }
  return next;
}

/**
 * Baris "nilai tidak cocok" sebuah pasangan: hasil ingest (lowCast) + kolom yang cocok otomatis dan
 * ditandai tahap tinjau (persennya menggantikan perkiraan ingest).
 */
export function castRows(
  pair: MappingPlanView,
  flags: ReviewFlags[string] | undefined,
): MappingLowCast[] {
  const rows = new Map(pair.lowCast.map((r) => [r.pos, r]));
  for (const { activePos, newPos } of pair.autoMatched) {
    const f = flags?.[activePos];
    if (f) rows.set(newPos, { pos: newPos, activePos, ...f, approx: false });
  }
  return [...rows.values()].sort((a, b) => a.pos - b.pos);
}

/**
 * Kolom file baru yang dipetakan ke kolom aktif `activePos` dan perlu pilihan tipe/format: terbaca
 * bertipe lain (nilai yang tidak cocok dengan tipe aktif dikosongkan), atau ditandai tahap tinjau.
 * null = belum dipetakan/dikosongkan, tipe aktif Teks, atau tipe sama tanpa tanda tinjau.
 */
export function mappedCast(
  sheet: MappingSheetView,
  pair: MappingPlanView,
  d: SheetDraft,
  activePos: number,
  flags?: ReviewFlags[string],
): {
  column: MappingNewColumn;
  base: CastChoice;
  review?: { pct: number; typeLabel: string };
} | null {
  const newPos = d.columns[activePos];
  if (newPos == null) return null;
  const a = sheet.active.columns.find((c) => c.pos === activePos);
  const column = pair.newColumns.find((c) => c.pos === newPos);
  const review = flags?.[activePos];
  if (!a || !column || a.type === "text" || (column.type === a.type && !review)) return null;
  return { column, base: activeChoice(a), ...(review ? { review } : {}) };
}

/**
 * Id pemicu tipe untuk kolom aktif `activePos` (tombol "Ubah tipe" di panel tinjau), atau null.
 * Kolom hilang yang belum dipilih lagi (mis. hasil tinjau tersimpan setelah muat ulang) → pemilih
 * kolomnya: pilihan tipe muncul setelah kolom file dipilih.
 */
export function castTargetId(
  sheet: MappingSheetView,
  pair: MappingPlanView,
  d: SheetDraft,
  activePos: number,
): string | null {
  const sid = sheet.active.id;
  if (pair.missing.includes(activePos)) {
    // Sama dengan mappedCast: kolom aktif Teks tidak punya pilihan tipe di barisnya.
    const text = sheet.active.columns.find((c) => c.pos === activePos)?.type === "text";
    const v = d.columns[activePos];
    if (text || v === null) return null;
    return v === undefined
      ? domId(columnKey(sid, activePos))
      : `${domId(columnKey(sid, activePos))}-cast-type`;
  }
  const m = pair.autoMatched.find((p) => p.activePos === activePos);
  return m ? `${castRowId(sid, m.newPos)}-type` : null;
}

/** Pemicu tipe per isu tinjau (urutan sama); null = sheet/kolomnya tidak bisa diubah di halaman ini. */
export function issueTargets(
  view: MappingReady,
  draft: MappingDraft,
  plans: PairPlans,
  issues: MappingReviewIssue[],
): (string | null)[] {
  return issues.map((issue) => {
    const at = locateIssue(view, issue);
    const sheet = at && view.sheets.find((s) => s.active.id === at.sheetId);
    if (!at || !sheet) return null;
    const d = sheetDraft(draft, sheet.active.id);
    const pair = pairOf(sheet, d, plans);
    if (pair) return castTargetId(sheet, pair, d, at.activePos);
    return !sheet.target && d.target !== null ? domId(sheetKey(sheet.active.id)) : null;
  });
}

/**
 * Kolom cocok otomatis yang tipe/format aktifnya diubah setelah file diunggah (R3): versi baru dibaca
 * dengan pilihan lama, jadi nilainya diperiksa ulang saat disimpan. Kolom yang sudah ditandai tinjau
 * (punya baris tipe) dan kolom aktif Teks tidak ikut.
 */
export function retypedColumns(
  sheet: MappingSheetView,
  pair: MappingPlanView,
  flags?: ReviewFlags[string],
): string[] {
  const fresh = new Map(pair.newColumns.map((c) => [c.pos, c]));
  const shown = new Set(pair.lowCast.map((r) => r.pos));
  const out: string[] = [];
  for (const { activePos, newPos } of pair.autoMatched) {
    if (flags?.[activePos] || shown.has(newPos)) continue;
    const a = sheet.active.columns.find((c) => c.pos === activePos);
    const n = fresh.get(newPos);
    if (!a || !n || a.type === "text") continue;
    if (a.type !== n.type || a.numberLocale !== n.numberLocale || a.dateFormat !== n.dateFormat) {
      out.push(a.name);
    }
  }
  return out;
}

/** Draf setelah kolom aktif `activePos` diputuskan ulang: override tipe kolom baru sebelumnya dibuang. */
export function withColumn(d: SheetDraft, activePos: number, next: number | null): SheetDraft {
  const prev = d.columns[activePos];
  const columns = { ...d.columns, [activePos]: next };
  if (prev == null || prev === next) return { ...d, columns };
  const { [prev]: _, ...casts } = d.casts;
  return { ...d, columns, casts };
}

export const sameCast = (a: CastChoice, b: CastChoice) =>
  a.type === b.type && a.numberLocale === b.numberLocale && a.dateFormat === b.dateFormat;

/** Draf sheet setelah tipe/format baris `row` diubah; kembali ke pilihan awal = tanpa override. */
export function withCast(
  d: SheetDraft,
  base: CastChoice,
  pos: number,
  next: CastChoice,
): SheetDraft {
  const { [pos]: _, ...rest } = d.casts;
  return { ...d, casts: sameCast(base, next) ? rest : { ...rest, [pos]: next } };
}

/** Kolom yang dikosongkan dan sheet yang tidak dipakai lagi (isi dialog konfirmasi). */
export function nullChoices(view: MappingReady, draft: MappingDraft, plans: PairPlans) {
  const columns: { sheet: string; name: string }[] = [];
  const droppedSheets: string[] = [];
  for (const s of view.sheets) {
    const d = sheetDraft(draft, s.active.id);
    if (targetOf(s, d) === null) droppedSheets.push(s.active.name);
    for (const pos of pairOf(s, d, plans)?.missing ?? []) {
      if (d.columns[pos] !== null) continue;
      const name = s.active.columns.find((c) => c.pos === pos)?.name ?? `Kolom ${pos}`;
      columns.push({ sheet: s.active.name, name });
    }
  }
  return { columns, droppedSheets };
}

/**
 * Angka ringkasan dari pasangan yang sedang dipakai tiap sheet (berubah saat sheet dipasangkan).
 * "Nilai tidak cocok tipe" = baris tipe + kolom hilang yang dipetakan dan ditandai tahap tinjau
 * (sama dengan jumlah di panel tinjau untuk isu yang ada di halaman ini).
 */
export function summaryCounts(
  view: MappingReady,
  draft: MappingDraft,
  plans: PairPlans,
  flags: ReviewFlags,
) {
  let missing = 0;
  let lowCast = 0;
  let hidden = 0;
  let retyped = 0;
  for (const s of view.sheets) {
    const d = sheetDraft(draft, s.active.id);
    const pair = pairOf(s, d, plans);
    if (!pair) continue;
    const f = flags[s.active.id];
    missing += pair.missing.length;
    lowCast += castRows(pair, f).length;
    lowCast += pair.missing.filter((pos) => mappedCast(s, pair, d, pos, f)?.review).length;
    retyped += retypedColumns(s, pair, f).length;
    hidden += hiddenExtras(pair, d).length;
  }
  return {
    missing,
    lowCast,
    hidden,
    retyped,
    sheets: view.sheets.filter((s) => !s.target).length,
  };
}

/**
 * Kolom baru yang boleh membawa tipe/format sendiri + pilihan awalnya: baris "nilai tidak cocok",
 * kolom yang cocok otomatis, dan kolom yang dipetakan user (semuanya mengikuti kolom aktifnya).
 */
function castable(s: MappingSheetView, pair: MappingPlanView, d: SheetDraft) {
  const active = new Map(s.active.columns.map((c) => [c.pos, c]));
  const out = new Map<number, CastChoice>();
  for (const row of pair.lowCast) out.set(row.pos, castBase(s, pair, row));
  const linked = [
    ...pair.autoMatched,
    ...Object.entries(d.columns).map(([a, n]) => ({ activePos: Number(a), newPos: n })),
  ];
  for (const { activePos, newPos } of linked) {
    const a = active.get(activePos);
    if (newPos != null && a && !out.has(newPos)) out.set(newPos, activeChoice(a));
  }
  return out;
}

/** Payload keputusan untuk server: hanya keputusan yang dibuat dan override yang berbeda. */
export function toPayload(
  view: MappingReady,
  draft: MappingDraft,
  plans: PairPlans,
): MappingPayload {
  return {
    base: view.base,
    sheets: view.sheets.map((s) => {
      const d = sheetDraft(draft, s.active.id);
      const pair = pairOf(s, d, plans);
      const columns = (pair?.missing ?? []).flatMap((activePos) => {
        const newPos = d.columns[activePos];
        return newPos === undefined ? [] : [{ activePos, newPos }];
      });
      const casts = pair
        ? [...castable(s, pair, d)]
            .sort(([a], [b]) => a - b)
            .flatMap(([pos, base]) => {
              const c = d.casts[pos];
              return c && !sameCast(c, base) ? [{ pos, ...c }] : [];
            })
        : [];
      return {
        activeSheetId: s.active.id,
        target: targetOf(s, d) ?? null,
        columns,
        ...(casts.length > 0 ? { casts } : {}),
      };
    }),
  };
}

/** Keputusan yang sama dengan yang ditinjau job (boleh disimpan ulang dengan acknowledge). */
export const samePayload = (a: MappingPayload, b: MappingPayload) =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * Panel tinjau yang tampil. `live` = hasil job yang dikirim tab ini (judul menerima fokus); `ackable`
 * = keputusannya masih sama dengan yang ditinjau, jadi boleh disimpan dengan persetujuan (bar simpan
 * tidak menjalankan job yang sama lagi). Job tab lain/sebelum muat ulang (payload tidak diketahui) dan
 * hasil terakhir dari server: tidak live, tanpa persetujuan.
 */
export function reviewOf(
  view: MappingReady,
  draft: MappingDraft,
  plans: PairPlans,
  local: MappingLocal,
  last: MappingLast | null,
): { issues: MappingReviewIssue[]; live: boolean; ackable: boolean } | null {
  if (local.phase === "review") {
    return {
      issues: local.issues,
      live: local.payload !== null,
      ackable: local.payload !== null && samePayload(local.payload, toPayload(view, draft, plans)),
    };
  }
  return last?.state === "review"
    ? { issues: last.issues ?? [], live: false, ackable: false }
    : null;
}

/** Kunci acuan skema aktif: berubah (mis. setelah STALE + muat ulang) → form dipasang ulang. */
export const baseKey = (view: MappingReady) =>
  [view.base.activeVersionId, ...view.base.sheets.map((s) => `${s.id}:${s.schemaRevision}`)].join(
    "|",
  );
