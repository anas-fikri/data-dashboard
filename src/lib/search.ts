/*
 * Pencarian pintar untuk daftar pilihan (T-jwhc): tidak peka huruf besar/kecil dan aksen, setiap kata
 * kunci harus cocok (urutan bebas) sebagai awalan kata, potongan teks, atau singkatan huruf berurutan
 * di satu kata ("tgl krm" → "Tanggal Kirim"); satu kata kunci juga boleh berupa inisial ("tk"). Hasil
 * diurutkan dari yang paling cocok (urutan asli bila sama) beserta posisi huruf yang cocok (untuk
 * disorot, indeks code point label asli). Murni.
 */
export interface SearchHit<T> {
  option: T;
  /** Indeks code point label yang cocok, naik. */
  hits: number[];
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Teks terlipat + peta indeks UTF-16 teks terlipat → indeks code point label asli. */
function folded(label: string): { text: string; at: number[] } {
  let text = "";
  const at: number[] = [];
  Array.from(label).forEach((ch, i) => {
    const f = fold(ch);
    text += f;
    for (let k = 0; k < f.length; k++) at.push(i);
  });
  return { text, at };
}

const range = (from: number, len: number) => Array.from({ length: len }, (_, k) => from + k);

/** Huruf `token` berurutan di dalam `word`, mulai dari huruf pertamanya; null bila tidak. */
function subsequence(token: string, word: string, start: number): number[] | null {
  if (token[0] !== word[0]) return null;
  const out: number[] = [];
  let j = 0;
  for (let k = 0; k < word.length && j < token.length; k++) {
    if (word[k] === token[j]) {
      out.push(start + k);
      j++;
    }
  }
  return j === token.length ? out : null;
}

/** Skor + posisi satu kata kunci: awalan kata 3, potongan 2, singkatan 1; null bila tidak cocok. */
function matchToken(
  token: string,
  text: string,
  words: { word: string; start: number }[],
): { score: number; at: number[] } | null {
  const prefix = words.find((w) => w.word.startsWith(token));
  if (prefix) return { score: 3, at: range(prefix.start, token.length) };
  const i = text.indexOf(token);
  if (i >= 0) return { score: 2, at: range(i, token.length) };
  for (const w of words) {
    const at = subsequence(token, w.word, w.start);
    if (at) return { score: 1, at };
  }
  return null;
}

export function searchOptions<T extends { label: string }>(
  options: readonly T[],
  query: string,
): SearchHit<T>[] {
  const tokens = fold(query)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  if (!tokens.length) return options.map((option) => ({ option, hits: [] }));
  const scored: { hit: SearchHit<T>; score: number; i: number }[] = [];
  options.forEach((option, i) => {
    const { text, at } = folded(option.label);
    const words = [...text.matchAll(/[\p{L}\p{N}]+/gu)].map((m) => ({
      word: m[0],
      start: m.index,
    }));
    let score = 0;
    const pos = new Set<number>();
    const parts = tokens.map((t) => matchToken(t, text, words));
    if (parts.every(Boolean)) {
      for (const p of parts) {
        score += p!.score;
        p!.at.forEach((k) => pos.add(at[k]!));
      }
    } else if (tokens.length === 1 && tokens[0]!.length > 1) {
      // Inisial: "tk" → Tanggal Kirim.
      const initials = words.map((w) => w.word[0]).join("");
      if (!initials.startsWith(tokens[0]!)) return;
      score = 1;
      words.slice(0, tokens[0]!.length).forEach((w) => pos.add(at[w.start]!));
    } else {
      return;
    }
    if (text === tokens.join(" ")) score += 10;
    scored.push({ hit: { option, hits: [...pos].sort((a, b) => a - b) }, score, i });
  });
  return scored.sort((a, b) => b.score - a.score || a.i - b.i).map((s) => s.hit);
}

/** Potongan label untuk disorot: teks biasa dan yang cocok bergantian. Murni. */
export function highlightParts(
  label: string,
  hits: readonly number[],
): { text: string; hit: boolean }[] {
  const chars = Array.from(label);
  const set = new Set(hits);
  const out: { text: string; hit: boolean }[] = [];
  chars.forEach((ch, i) => {
    const hit = set.has(i);
    const last = out[out.length - 1];
    if (last && last.hit === hit) last.text += ch;
    else out.push({ text: ch, hit });
  });
  return out;
}
