/*
 * Profil raw tersimpan per file typed segmen (T-040): hitungan per kolom hasil profileSqls atas
 * raw.parquet segmen (baris data = _row > headerRow). Raw imutabel, jadi profil berlaku untuk setiap
 * revisi typed segmen itu selama baris judulnya sama — recast per segmen memutuskan tipe/locale/format
 * dari gabungan profil semua segmen tanpa memindai ulang raw, dan statistik skema (kosong, gagal cast,
 * unik) adalah jumlahnya. Murni.
 */
import { createHash } from "node:crypto";
import { exactDistinctSql, profileSqls, toProfile, type Profile } from "./infer";

/**
 * Tanda bentuk profil: SQL profil berubah → profil lama tidak dipakai (dihitung ulang dari raw).
 * PROFILE_FORMAT dinaikkan bila arti field Profile/toProfile berubah tanpa SQL berubah.
 */
const PROFILE_FORMAT = 1;
export const PROFILE_VERSION = createHash("sha256")
  .update(
    [PROFILE_FORMAT, ...profileSqls("p", ["c1"], 0), exactDistinctSql("p", ["c1"], 0)].join("\n"),
  )
  .digest("hex")
  .slice(0, 16);

/** Profil raw satu segmen: baris data + profil per kolom raw (`c<pos>`) yang punya nilai. */
export interface RawProfile {
  dataRows: number;
  profiles: Map<string, Profile>;
}

type Packed = Record<string, number | Record<string, number>>;
/** Bentuk JSON di SegmentTyped.profile: hanya field ≠ 0 (kebanyakan kolom hanya beberapa). */
export interface StoredProfile {
  v: string;
  headerRow: number;
  dataRows: number;
  cols: Record<string, Packed>;
}

const sparse = (o: Record<string, number>) =>
  Object.fromEntries(Object.entries(o).filter(([, n]) => n !== 0));

export function packProfile(headerRow: number, p: RawProfile): StoredProfile {
  const cols: Record<string, Packed> = {};
  for (const [col, x] of p.profiles) {
    const { col: _c, date, time, ...counts } = x;
    const packed: Packed = sparse(counts);
    const d = sparse(date);
    const t = sparse(time);
    if (Object.keys(d).length) packed.date = d;
    if (Object.keys(t).length) packed.time = t;
    cols[col] = packed;
  }
  return { v: PROFILE_VERSION, headerRow, dataRows: p.dataRows, cols };
}

/** Profil tersimpan untuk baris judul `headerRow`; null = tidak ada, bentuk lama, atau judul lain. */
export function unpackProfile(stored: unknown, headerRow: number): RawProfile | null {
  const s = stored as Partial<StoredProfile> | null;
  if (!s || s.v !== PROFILE_VERSION || s.headerRow !== headerRow) return null;
  if (!Number.isSafeInteger(s.dataRows) || typeof s.cols !== "object" || !s.cols) return null;
  const profiles = new Map<string, Profile>();
  for (const [col, packed] of Object.entries(s.cols)) {
    const p = toProfile({ col });
    for (const [k, n] of Object.entries(packed)) {
      if (k === "date" || k === "time") Object.assign(p[k], n);
      else if (k !== "col" && k in p) (p as unknown as Record<string, number>)[k] = Number(n);
    }
    profiles.set(col, p);
  }
  return { dataRows: s.dataRows!, profiles };
}

/**
 * Gabungan profil segmen satu sheet: semua hitungan dijumlah. `distinct` dijumlah lalu dibatasi `n`.
 * shortcut: nilai sama di dua segmen terhitung dua kali (jumlah unik hanya tampilan), ganti dengan
 * sketsa HyperLogLog tersimpan bila jumlah unik dipakai untuk keputusan.
 */
export function mergeProfiles(list: RawProfile[]): RawProfile {
  if (list.length === 1) return list[0]!;
  const profiles = new Map<string, Profile>();
  for (const one of list) {
    for (const [col, x] of one.profiles) {
      const acc = profiles.get(col) ?? toProfile({ col });
      for (const k of Object.keys(x) as (keyof Profile)[]) {
        if (k === "col") continue;
        if (k === "date" || k === "time") {
          for (const [f, n] of Object.entries(x[k])) acc[k][f as keyof Profile["date"]] += n;
        } else acc[k] += x[k];
      }
      profiles.set(col, acc);
    }
  }
  for (const p of profiles.values()) p.distinct = Math.min(p.distinct, p.n);
  return { dataRows: list.reduce((n, p) => n + p.dataRows, 0), profiles };
}
