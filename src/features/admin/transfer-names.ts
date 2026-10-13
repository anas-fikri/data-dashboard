import { NAME_MAX, nameKeyOf } from "@/features/datasets/validation";

/*
 * Rencana nama saat dataset pindah pemilik: @@unique([ownerId, nameKey]) berlaku per pemilik, jadi
 * nama yang sudah dipakai pemilik baru diberi akhiran " (2)", " (3)", … (pola migrasi dashboard_widgets).
 */

export interface NamedDataset {
  id: string;
  name: string;
  nameKey: string;
}

export interface NamePlan {
  id: string;
  name: string;
  nameKey: string;
  /** Nama lama bila diganti; null = nama tetap. */
  renamedFrom: string | null;
}

/** Nama + akhiran " (n)" yang tetap ≤ NAME_MAX (dipotong per code point, spasi ujung dibuang). */
export function suffixedName(name: string, n: number): string {
  const suffix = ` (${n})`;
  const chars = Array.from(name);
  while (chars.length > 0 && chars.join("").length + suffix.length > NAME_MAX) chars.pop();
  return chars.join("").trimEnd() + suffix;
}

/**
 * Dua putaran, deterministik (urutan `incoming`):
 *  1. Dataset masuk yang namanya TIDAK bentrok dengan milik pemilik baru (maupun dengan dataset masuk
 *     sebelumnya) tetap memakai namanya, dan kuncinya ditandai terpakai lebih dulu.
 *  2. Hanya yang bentrok diberi akhiran " (n)" terkecil yang belum terpakai, jadi nama baru tidak
 *     pernah mengambil nama yang tetap dipakai dataset masuk lain (tujuan punya "X", masuk "X" dan
 *     "X (2)" → "X (2)" tetap, "X" menjadi "X (3)").
 * Kunci terpakai: nameKey tersimpan DAN nameKeyOf(nama) — kunci lama (sebelum NFC) bisa berbeda dari
 * normalisasi sekarang, padahal tampilannya sama.
 */
export function planNames(
  incoming: NamedDataset[],
  existing: { name: string; nameKey: string }[],
): NamePlan[] {
  const taken = new Set<string>();
  for (const e of existing) {
    taken.add(e.nameKey);
    taken.add(nameKeyOf(e.name));
  }
  const keeps = new Set<string>();
  for (const d of incoming) {
    const key = nameKeyOf(d.name);
    if (taken.has(d.nameKey) || taken.has(key)) continue;
    taken.add(d.nameKey);
    taken.add(key);
    keeps.add(d.id);
  }
  return incoming.map((d) => {
    if (keeps.has(d.id)) return { id: d.id, name: d.name, nameKey: d.nameKey, renamedFrom: null };
    // Akhiran berbeda untuk tiap n dan himpunan terpakai berhingga: loop pasti berhenti.
    for (let n = 2; ; n++) {
      const name = suffixedName(d.name, n);
      const nameKey = nameKeyOf(name);
      if (!taken.has(nameKey)) {
        taken.add(nameKey);
        return { id: d.id, name, nameKey, renamedFrom: d.name };
      }
    }
  });
}
