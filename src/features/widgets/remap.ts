/*
 * Widget setelah data diganti (T-011, temuan verifikasi): setiap unggahan baru membuat versi baru
 * dengan id sheet baru dan langsung aktif, sehingga spec widget (sheetId + posisi kolom) menunjuk ke
 * versi lama. Di sini spec dipetakan ke versi aktif saat dibaca: sheet lewat nama (atau satu-satunya
 * sheet bila versi lama JUGA hanya punya satu sheet — CSV/nama file berubah), kolom lewat judul asli +
 * urutan kemunculannya (kunci yang sama dengan versi refresh, T-013) lalu nama tampil sebagai cadangan
 * (tidak peka besar/kecil dan spasi). Kolom yang tidak ketemu diberi posisi
 * MISSING_COLUMN (tidak pernah ada di skema): query memberi pesan "kolom tidak ada di data terbaru"
 * dengan nama lamanya dan panel menandainya untuk dipilih ulang. Pemetaan disimpan permanen saat user
 * menyimpan pengaturan widget; T-013/T-014 memindahkannya ke saat aktivasi versi. Murni.
 */
import type { ColumnSchema } from "@/features/ingest/infer";
import { MISSING_COLUMN, type WidgetConfig } from "./spec";

export { MISSING_COLUMN };

export interface SheetInfo {
  id: string;
  name: string;
  /** Nama sheet aktif yang dipasangkan user saat pemetaan (T-014); lihat matchSheet. */
  aliasName?: string | null;
  index: number;
  schema: ColumnSchema[];
}

type Configured = Exclude<WidgetConfig, { type: "empty" }>;

/**
 * Nama sheet/kolom ternormalisasi untuk pencocokan lewat nama (NFC, trim, spasi dirapatkan, huruf
 * kecil). Juga dipakai filter dashboard (T-012) untuk mencocokkan kolom filter di sheet tiap widget.
 */
export const normName = (s: string) => s.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
const key = normName;

/** Kunci pencocokan kolom: nama asli ternormalisasi + urutan kemunculan nama itu di sheet. */
export function columnKeys(originals: string[]): string[] {
  const seen = new Map<string, number>();
  return originals.map((o) => {
    const k = normName(o);
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    // Baris baru tidak mungkin ada di nama ternormalisasi (spasi dirapatkan) → pemisah aman.
    return `${k}\n${n}`;
  });
}

type Named = { name: string; aliasName?: string | null };
const aliasKey = (s: Named) => (s.aliasName?.trim() ? key(s.aliasName) : null);

/**
 * Sheet pengganti di versi aktif, atau null bila tidak bisa ditentukan dengan aman: nama sama lebih
 * dulu, lalu alias pasangan pemetaan (T-014, akar silsilah nama sheet) — alias sheet lama = nama sheet
 * target (rollback ke versi akar), nama sheet lama = alias sheet target (roll-forward dari versi akar),
 * atau alias sama (dua versi di tengah rantai ganti nama V1 → V2 → V3). Lebih dari satu kandidat →
 * null. Fallback "satu-satunya sheet" hanya bila versi lama juga satu sheet — sheet yang dihapus
 * dari workbook tidak boleh diam-diam menunjuk sheet lain (angka salah dengan judul lama).
 */
export function matchSheet<T extends Named>(
  old: Named,
  active: T[],
  oldSheetCount: number,
): T | null {
  const name = key(old.name);
  const byName = active.filter((s) => key(s.name) === name);
  if (byName.length === 1) return byName[0]!;
  if (byName.length === 0) {
    const alias = aliasKey(old);
    const byAlias = active.filter(
      (s) =>
        key(s.name) === alias || aliasKey(s) === name || (alias !== null && aliasKey(s) === alias),
    );
    if (byAlias.length === 1) return byAlias[0]!;
    if (byAlias.length > 1) {
      // Nama akar dipakai ulang oleh sheet lain: keturunan sejati membawa akar yang sama (alias↔alias).
      const lineage = alias === null ? [] : byAlias.filter((s) => aliasKey(s) === alias);
      return lineage.length === 1 ? lineage[0]! : null;
    }
  }
  if (byName.length === 0 && active.length === 1 && oldSheetCount === 1) return active[0]!;
  return null;
}

export interface Remapped {
  config: Configured;
  /** Nama kolom lama yang tidak ditemukan di versi aktif. */
  missing: string[];
}

/**
 * Kolom dikenali seperti versi refresh: judul asli + urutan kemunculan (nama tampil per versi — ganti
 * nama hanya mengenai versi aktif, jadi rollback tidak boleh bergantung padanya). Nama tampil hanya
 * cadangan bila judul aslinya tidak ada di target (T-011: judul di file berganti), dan tidak pernah
 * menunjuk kolom target yang judul aslinya juga ada di sheet lama (itu kolom sumber lain).
 * Penanda MISSING_COLUMN di spec tetap penanda; namanya diambil dari `stored` (Widget.missingColumns,
 * lihat markerNames), tidak pernah "kolom 16385".
 */
export function remapConfig(
  config: Configured,
  old: SheetInfo,
  target: SheetInfo,
  stored: string[] = [],
): Remapped {
  const byPos = (s: SheetInfo) => [...s.schema].sort((a, b) => a.pos - b.pos);
  const oldCols = byPos(old);
  const oldKeys = columnKeys(oldCols.map((c) => c.original));
  const oldCol = new Map(oldCols.map((c, i) => [c.pos, { name: c.name, key: oldKeys[i]! }]));
  const oldKeySet = new Set(oldKeys);
  const newCols = byPos(target);
  const newKeys = columnKeys(newCols.map((c) => c.original));
  const keyPos = new Map(newKeys.map((k, i) => [k, newCols[i]!.pos]));
  const namePos = new Map<string, number>();
  newCols.forEach((c, i) => {
    if (oldKeySet.has(newKeys[i]!) || namePos.has(key(c.name))) return;
    namePos.set(key(c.name), c.pos);
  });
  const missing: string[] = [];
  const marked = markerNames(config, old.schema, stored);
  const pos = (p: number): number => {
    if (p === MISSING_COLUMN) {
      for (const n of marked) if (!missing.includes(n)) missing.push(n);
      return MISSING_COLUMN;
    }
    const o = oldCol.get(p);
    const found = o && (keyPos.get(o.key) ?? namePos.get(key(o.name)));
    if (found !== undefined) return found;
    const label = o?.name ?? `kolom ${p}`;
    if (!missing.includes(label)) missing.push(label);
    return MISSING_COLUMN;
  };
  const mapMeasure = <M extends { column?: number }>(m: M): M =>
    m.column === undefined ? m : { ...m, column: pos(m.column) };

  switch (config.type) {
    case "kpi":
      return {
        config: {
          ...config,
          spec: { ...config.spec, sheetId: target.id, measure: mapMeasure(config.spec.measure) },
        },
        missing,
      };
    case "table": {
      const mapped = config.spec.columns.map(pos);
      // Kolom tabel harus unik: semua yang hilang diwakili satu penanda.
      const columns = [
        ...mapped.filter((p) => p !== MISSING_COLUMN),
        ...(mapped.includes(MISSING_COLUMN) ? [MISSING_COLUMN] : []),
      ];
      const formatColumns = config.spec.formatColumns
        ?.map(pos)
        .filter((p) => p !== MISSING_COLUMN && columns.includes(p));
      return {
        config: {
          ...config,
          spec: {
            ...config.spec,
            sheetId: target.id,
            columns,
            ...(formatColumns ? { formatColumns } : {}),
          },
        },
        missing,
      };
    }
    default:
      return {
        config: {
          ...config,
          spec: {
            ...config.spec,
            sheetId: target.id,
            dimension: { ...config.spec.dimension, column: pos(config.spec.dimension.column) },
            measure: mapMeasure(config.spec.measure),
          },
        },
        missing,
      };
  }
}

/** Posisi kolom yang dipakai spec (dimensi, ukuran, kolom tabel). */
function usedColumns(config: Configured): number[] {
  if (config.type === "table") return config.spec.columns;
  const m = config.spec.measure.column;
  const measure = m === undefined ? [] : [m];
  return config.type === "kpi" ? measure : [config.spec.dimension.column, ...measure];
}

/**
 * Nama kolom lama di balik penanda MISSING_COLUMN spec (T-013: spec dipindah dengan penanda saat sheet
 * lamanya dihapus retensi). Nama itu hanya tercatat di Widget.missingColumns (`stored`), yang juga bisa
 * memuat kolom spec yang hilang terhadap versi lain: nama kolom spec yang masih ada di `schema` (sheet
 * spec) dikeluarkan. [] bila spec tidak memakai penanda.
 */
export function markerNames(
  config: Configured,
  schema: ColumnSchema[],
  stored: string[],
): string[] {
  const used = usedColumns(config);
  if (!used.includes(MISSING_COLUMN)) return [];
  const present = new Set(schema.filter((c) => used.includes(c.pos)).map((c) => c.name));
  return stored.filter((n) => !present.has(n));
}

/** Pesan widget untuk kolom yang hilang setelah data diganti (nama lama disebut). */
export function missingMessage(names: string[]): string {
  const list = names.map((n) => `"${n}"`).join(", ");
  return `Kolom ${list} tidak ada di data terbaru (dihapus atau diganti namanya). Atur ulang widget lewat tombol pengaturan.`;
}
