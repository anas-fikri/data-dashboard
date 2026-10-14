import type {
  CastChoice,
  MappingLowCast,
  MappingNewColumn,
  MappingPayload,
  MappingPlanView,
  MappingReady,
  MappingSheetView,
} from "./mapping-types";

/*
 * Model murni halaman pemetaan (T-014): draf keputusan → kemajuan, pilihan kolom satu-ke-satu,
 * kolom baru yang disembunyikan, ringkasan konfirmasi NULL, dan payload. Diuji unit; server tetap
 * memvalidasi ulang semuanya.
 */

export interface SheetDraft {
  /** Hanya sheet aktif tanpa pasangan otomatis: undefined = belum dipilih, null = tidak dipakai lagi. */
  target?: string | null;
  /** Posisi kolom aktif → posisi kolom baru, atau null (kosongkan). Tanpa kunci = belum diputuskan. */
  columns: Record<number, number | null>;
  /** Posisi kolom baru → tipe/format yang berbeda dari pilihan aktif. */
  casts: Record<number, CastChoice>;
}
/** Draf per id sheet aktif. */
export type MappingDraft = Record<string, SheetDraft>;

const BLANK: SheetDraft = Object.freeze({ columns: {}, casts: {} }) as SheetDraft;
const NO_PAIR: MappingPlanView = {
  newColumns: [],
  autoMatched: [],
  missing: [],
  extra: [],
  lowCast: [],
};

export const sheetDraft = (draft: MappingDraft, sheetId: string): SheetDraft =>
  draft[sheetId] ?? BLANK;

/** Kunci keputusan (juga dasar id elemen yang difokuskan saat belum lengkap). */
export const sheetKey = (sheetId: string) => `${sheetId}-sheet`;
export const columnKey = (sheetId: string, pos: number) => `${sheetId}-${pos}`;
export const domId = (key: string) => `map-${key}`;

/** Sheet baru yang dipakai: pasangan otomatis, pilihan user, null (tidak dipakai), undefined (belum). */
export function targetOf(sheet: MappingSheetView, d: SheetDraft): string | null | undefined {
  return sheet.target ? sheet.target.id : d.target;
}

/** Data kolom pasangan yang dipakai; null bila sheet belum/tidak dipasangkan. */
export function pairOf(sheet: MappingSheetView, d: SheetDraft): MappingPlanView | null {
  const t = targetOf(sheet, d);
  if (t == null) return null;
  if (sheet.target?.id === t) return sheet;
  return sheet.candidates.find((x) => x.id === t) ?? NO_PAIR;
}

/** Keputusan wajib dalam urutan tampil: pasangan sheet (bila perlu) lalu tiap kolom yang hilang. */
export function decisions(view: MappingReady, draft: MappingDraft) {
  const out: { key: string; done: boolean }[] = [];
  for (const s of view.sheets) {
    const d = sheetDraft(draft, s.active.id);
    if (!s.target) out.push({ key: sheetKey(s.active.id), done: d.target !== undefined });
    for (const pos of pairOf(s, d)?.missing ?? []) {
      out.push({ key: columnKey(s.active.id, pos), done: d.columns[pos] !== undefined });
    }
  }
  return out;
}

export function progress(view: MappingReady, draft: MappingDraft) {
  const all = decisions(view, draft);
  return { done: all.filter((x) => x.done).length, total: all.length };
}

/** Kunci keputusan yang belum dibuat (kosong = siap disimpan). */
export const undecided = (view: MappingReady, draft: MappingDraft) =>
  decisions(view, draft)
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
export function nullChoices(view: MappingReady, draft: MappingDraft) {
  const columns: { sheet: string; name: string }[] = [];
  const droppedSheets: string[] = [];
  for (const s of view.sheets) {
    const d = sheetDraft(draft, s.active.id);
    if (targetOf(s, d) === null) droppedSheets.push(s.active.name);
    for (const pos of pairOf(s, d)?.missing ?? []) {
      if (d.columns[pos] !== null) continue;
      const name = s.active.columns.find((c) => c.pos === pos)?.name ?? `Kolom ${pos}`;
      columns.push({ sheet: s.active.name, name });
    }
  }
  return { columns, droppedSheets };
}

/** Payload keputusan untuk server: hanya keputusan yang dibuat dan override yang berbeda. */
export function toPayload(view: MappingReady, draft: MappingDraft): MappingPayload {
  return {
    base: view.base,
    sheets: view.sheets.map((s) => {
      const d = sheetDraft(draft, s.active.id);
      const pair = pairOf(s, d);
      const columns = (pair?.missing ?? []).flatMap((activePos) => {
        const newPos = d.columns[activePos];
        return newPos === undefined ? [] : [{ activePos, newPos }];
      });
      const casts = pair
        ? pair.lowCast.flatMap((row) => {
            const c = d.casts[row.pos];
            return c && !sameCast(c, castBase(s, pair, row)) ? [{ pos: row.pos, ...c }] : [];
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

/** Kunci acuan skema aktif: berubah (mis. setelah STALE + muat ulang) → form dipasang ulang. */
export const baseKey = (view: MappingReady) =>
  [view.base.activeVersionId, ...view.base.sheets.map((s) => `${s.id}:${s.schemaRevision}`)].join(
    "|",
  );
