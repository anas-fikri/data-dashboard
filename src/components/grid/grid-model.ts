/*
 * Logika murni grid "Lihat data" (T-043): huruf kolom, format sel id-ID, pengaturan kolom per pengguna
 * (localStorage, kunci per sheet + revisi skema), potongan kolom permintaan, dan rentang baris yang
 * terlihat. Tanpa DOM/React agar bisa diuji unit; komponen di sheet-grid.tsx.
 */
import type { ColumnType } from "@/features/ingest/infer";
import { formatDuration, formatNumber } from "@/features/widgets/format";
import { formatSchema, type NumberFormat } from "@/features/widgets/spec";

/** Kolom skema yang terlihat (bukan disembunyikan di skema) seperti dikirim halaman server. */
export interface GridColumn {
  pos: number;
  name: string;
  original: string;
  type: ColumnType;
}

/** Ukuran blok baris per permintaan (rencana §3.4: klien 200, server ≤ 500). */
export const BLOCK_SIZE = 200;
/** Batas kolom per permintaan (server GRID_COLS_MAX); sheet lebih lebar dipecah per potongan. */
export const COLS_PER_REQUEST = 64;
/** "Bekukan sampai kolom ini" paling banyak 3 kolom data (rencana §3.1). */
export const MAX_FROZEN = 3;
/** Penanda teks yang dipotong server di 500 karakter (isi penuh lewat panel Isi sel, T-045). */
export const CUT_MARK = "…";

/** Posisi skema 1-based → huruf kolom gaya Excel (1 → A, 27 → AA). */
export function colLetter(pos: number): string {
  let n = pos;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const intFmt = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
export const fmtInt = (n: number) => intFmt.format(n);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/** ISO naive ("2026-03-05" / "2026-03-05T08:30:00") → "5 Mar 2026" / "5 Mar 2026 08.30". */
export function formatGridDate(iso: string, withTime: boolean): string {
  const m = /^(-?\d{4,})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(iso);
  if (!m) return iso;
  const d = `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
  return withTime && m[4] ? `${d} ${m[4]}.${m[5]}` : d;
}

export const numericType = (t: ColumnType) =>
  t === "integer" || t === "decimal" || t === "duration";

/** Format bawaan sel angka: bulat dengan pemisah ribuan, desimal sampai 6 angka (tanpa pembulatan halus). */
const AUTO_DECIMALS = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 6 });

/**
 * Nilai sel (bentuk JSON dari server, lihat toJson) → teks tampil. null = sel kosong (NULL).
 * `format` hanya berlaku pada kolom angka (menu "Format tampilan"); `cut` menambah penanda potong.
 */
export function displayCell(
  value: unknown,
  type: ColumnType,
  format: NumberFormat | undefined,
  cut = false,
): string | null {
  if (value === null || value === undefined) return null;
  switch (type) {
    case "boolean":
      return value ? "Ya" : "Tidak";
    case "date":
    case "timestamp":
      return formatGridDate(String(value), type === "timestamp");
    case "integer":
    case "decimal":
    case "duration": {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) return String(value);
      if (format && format.style !== "auto") return formatNumber(n, format);
      if (type === "duration") return formatDuration(n);
      return AUTO_DECIMALS.format(n);
    }
    default: {
      const s = String(value);
      return cut ? `${s}${CUT_MARK}` : s;
    }
  }
}

/** Pengaturan kolom per pengguna yang disimpan (AC 3). */
export interface ColumnSetting {
  colId: string;
  width?: number;
  hide?: boolean;
  pinned?: boolean;
}

export interface GridSettings {
  /** Urutan tampil kolom data (colId c<pos>), beserta lebar/sembunyi/beku. */
  columns: ColumnSetting[];
  /** "Format tampilan" kolom angka per colId. */
  formats: Record<string, NumberFormat>;
}

export const EMPTY_SETTINGS: GridSettings = { columns: [], formats: {} };

export const settingsKey = (sheetId: string, schemaRevision: number) =>
  `dd.grid.v1:${sheetId}:${schemaRevision}`;

export const colIdOf = (pos: number) => `c${pos}`;

/**
 * Bersihkan pengaturan dari storage (bisa rusak/lama/diubah tangan): hanya colId yang ada, lebar
 * 40–2000, beku ≤ MAX_FROZEN dan hanya di awal urutan, minimal satu kolom tetap terlihat.
 */
export function sanitizeSettings(raw: unknown, known: readonly string[]): GridSettings {
  const ok = new Set(known);
  const out: GridSettings = { columns: [], formats: {} };
  if (!raw || typeof raw !== "object") return out;
  const r = raw as { columns?: unknown; formats?: unknown };
  const seen = new Set<string>();
  if (Array.isArray(r.columns)) {
    for (const c of r.columns) {
      if (!c || typeof c !== "object") continue;
      const { colId, width, hide, pinned } = c as Record<string, unknown>;
      if (typeof colId !== "string" || !ok.has(colId) || seen.has(colId)) continue;
      seen.add(colId);
      const s: ColumnSetting = { colId };
      if (typeof width === "number" && Number.isFinite(width)) {
        s.width = Math.round(Math.min(2000, Math.max(40, width)));
      }
      if (hide === true) s.hide = true;
      if (pinned === true) s.pinned = true;
      out.columns.push(s);
    }
  }
  // Kolom beku: prefiks berurutan, paling banyak MAX_FROZEN (sisanya tidak dibekukan).
  let frozen = 0;
  let prefix = true;
  for (const c of out.columns) {
    if (c.pinned && prefix && frozen < MAX_FROZEN) frozen++;
    else {
      if (c.pinned) delete c.pinned;
      prefix = false;
    }
  }
  const shown = known.filter((id) => !out.columns.find((c) => c.colId === id)?.hide);
  if (known.length > 0 && shown.length === 0) {
    for (const c of out.columns) delete c.hide;
  }
  if (r.formats && typeof r.formats === "object") {
    for (const [k, v] of Object.entries(r.formats as Record<string, unknown>)) {
      const f = formatSchema.safeParse(v);
      if (ok.has(k) && f.success) out.formats[k] = f.data;
    }
  }
  return out;
}

/** Baca pengaturan; storage diblokir/rusak → pengaturan kosong (grid tetap berfungsi). */
export function loadSettings(
  storage: () => Storage | null,
  key: string,
  known: readonly string[],
): GridSettings {
  try {
    const text = storage()?.getItem(key);
    return text ? sanitizeSettings(JSON.parse(text), known) : EMPTY_SETTINGS;
  } catch {
    return EMPTY_SETTINGS;
  }
}

/** Simpan pengaturan; gagal (diblokir/penuh) diabaikan. true = tersimpan. */
export function saveSettings(storage: () => Storage | null, key: string, s: GridSettings): boolean {
  try {
    const st = storage();
    if (!st) return false;
    st.setItem(key, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

/** Kolom yang diminta → potongan ≤ COLS_PER_REQUEST (urutan dipertahankan). */
export function chunkCols(cols: readonly number[], size = COLS_PER_REQUEST): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < cols.length; i += size) out.push(cols.slice(i, i + size));
  return out;
}

/** Blok [start, end) masih dekat jendela tampil [first, last] (± satu blok)? Bila tidak → batalkan. */
export function blockNearView(
  start: number,
  end: number,
  first: number,
  last: number,
  margin = BLOCK_SIZE,
): boolean {
  return end > first - margin && start <= last + margin;
}

/**
 * Teks bilah status (AC 1): "Baris 1–40 dari 9.812.334". `all` (T-044): jumlah baris sheet saat
 * saringan/cari aktif → "… dari 12 (tersaring dari 450)".
 */
export function statusText(
  first: number | null,
  last: number | null,
  total: number | null,
  all: number | null = null,
) {
  if (total === null) return "Memuat baris…";
  const from = all !== null ? ` (tersaring dari ${fmtInt(all)})` : "";
  if (total === 0)
    return all !== null ? `Tidak ada baris yang cocok${from}` : "Tidak ada baris data";
  if (first === null || last === null) return `${fmtInt(total)} baris${from}`;
  const a = Math.min(Math.max(first, 1), total);
  const b = Math.min(Math.max(last, a), total);
  return `Baris ${fmtInt(a)}–${fmtInt(b)} dari ${fmtInt(total)}${from}`;
}

/** "Ke baris" dari input pengguna ("9.000.000", "9000000") → nomor 1..total, null bila tidak valid. */
export function parseRowInput(text: string, total: number): number | null {
  const digits = text.replace(/[.\s,]/g, "");
  if (!/^\d{1,16}$/.test(digits) || total < 1) return null;
  const n = Number(digits);
  if (n < 1) return null;
  return Math.min(n, total);
}

/* ---------- T-044: urut, saring, cari ---------- */

/** Urut paling banyak 3 kolom (server GRID_SORT_MAX). */
export const MAX_SORT = 3;
/** Cari: teks ≤ 100 karakter di ≤ 10 kolom teks terlihat (server GRID_SEARCH_*). */
export const SEARCH_TEXT_MAX = 100;
export const SEARCH_COLS_MAX = 10;
/** Saringan kolom paling banyak 20 (server GRID_FILTERS_MAX). */
export const MAX_FILTERS = 20;

export type SortDir = "asc" | "desc";
export interface SortItem {
  pos: number;
  dir: SortDir;
}
/** Saringan satu kolom dalam bentuk body server: bentuk filters.ts dengan `pos` (bukan nama). */
export type BodyFilter = { pos: number } & (
  | { op: "in" | "not_in"; values: (string | number | boolean | null)[] }
  | { op: "range"; gte?: string | number; lte?: string | number; lt?: string | number }
  | { op: "preset"; preset: string }
);
export interface GridSearch {
  text: string;
  /** Posisi kolom teks yang dicari (snapshot saat cari diterapkan). */
  cols: number[];
}
/** Urut/saring/cari yang dikirim di setiap blok. */
export interface GridQuery {
  sort: SortItem[];
  filters: BodyFilter[];
  search: GridSearch | null;
}

export const posOf = (colId: string): number | null => {
  const m = /^c(\d+)$/.exec(colId);
  return m ? Number(m[1]) : null;
};

/** Model urut AG (urut sortIndex) → urutan server: hanya kolom data, paling banyak MAX_SORT. */
export function sortFromModel(model: readonly { colId: string; sort: string }[]): SortItem[] {
  const out: SortItem[] = [];
  for (const m of model) {
    const pos = posOf(m.colId);
    if (pos === null || (m.sort !== "asc" && m.sort !== "desc")) continue;
    if (out.some((s) => s.pos === pos)) continue;
    out.push({ pos, dir: m.sort });
    if (out.length === MAX_SORT) break;
  }
  return out;
}

/** Kolom cari: ≤ 10 kolom teks pertama menurut urutan tampil (yang terlihat). */
export function searchColumns(
  displayed: readonly string[],
  typeOf: (colId: string) => ColumnType | undefined,
): number[] {
  const out: number[] = [];
  for (const id of displayed) {
    const pos = posOf(id);
    if (pos === null || typeOf(id) !== "text") continue;
    out.push(pos);
    if (out.length === SEARCH_COLS_MAX) break;
  }
  return out;
}

/** Teks cari dari isian: dipangkas; kosong → null; dipotong di SEARCH_TEXT_MAX. */
export function normalizeSearchText(text: string): string | null {
  const t = text.trim().slice(0, SEARCH_TEXT_MAX);
  return t ? t : null;
}

/** Sel cocok dengan teks cari (sama dengan server: mengandung, tanpa peka besar/kecil). */
export function cellMatches(value: unknown, needle: string): boolean {
  if (typeof value !== "string" || !needle) return false;
  return value.toLowerCase().includes(needle.toLowerCase());
}

/** "x baris (tersaring dari y)"; tanpa saringan → "y baris". */
export function filteredCountText(filtered: number, total: number, active: boolean): string {
  if (!active) return `${fmtInt(total)} baris`;
  return `${fmtInt(filtered)} baris (tersaring dari ${fmtInt(total)})`;
}

const DIR_TEXT: Record<SortDir, string> = { asc: "naik", desc: "turun" };

/** Pengumuman urutan untuk pembaca layar: "Diurutkan berdasarkan Tanggal naik, lalu Kode turun". */
export function sortAnnouncement(
  sort: readonly SortItem[],
  nameOf: (pos: number) => string,
): string {
  if (sort.length === 0) return "Urutan dihapus; baris kembali ke urutan file";
  return `Diurutkan berdasarkan ${sort.map((s) => `${nameOf(s.pos)} ${DIR_TEXT[s.dir]}`).join(", lalu ")}`;
}

export const sortDirText = (d: SortDir) => DIR_TEXT[d];

/**
 * Penyimpan kecil (useSyncExternalStore) untuk keadaan yang dibaca kepala kolom AG: kepala kolom
 * tidak dirender ulang oleh React saat state SheetGrid berubah (columnDefs stabil, T-043).
 */
export class Store<T> {
  private listeners = new Set<() => void>();
  constructor(private value: T) {}
  get = (): T => this.value;
  set(next: T) {
    if (Object.is(next, this.value)) return;
    this.value = next;
    for (const l of this.listeners) l();
  }
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };
}
