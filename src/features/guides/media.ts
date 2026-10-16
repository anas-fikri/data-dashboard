/*
 * Aturan berkas video panduan (T-021), fungsi murni yang dipakai browser (pra-cek UX) dan server
 * (penentu). Signature dibaca dari byte awal, bukan dari ekstensi/Content-Type klien.
 */

export const VIDEO_MAX_BYTES = 500 * 1024 * 1024;
export const POSTER_MAX_BYTES = 2 * 1024 * 1024;
/** Byte awal yang cukup untuk header ftyp mp4 dan header EBML webm (DocType). */
export const VIDEO_SNIFF_BYTES = 64;
export const VIDEO_TITLE_MAX = 120;
/** Durasi wajar video panduan (detik); di luar itu disimpan tanpa durasi. */
export const VIDEO_DURATION_MAX = 6 * 60 * 60;

export type VideoExt = "mp4" | "webm";

export function videoExtOf(name: string): VideoExt | null {
  const m = /\.(mp4|webm)$/i.exec(name.trim());
  return m ? (m[1]!.toLowerCase() as VideoExt) : null;
}

const ascii = (b: Uint8Array, from: number, len: number) =>
  String.fromCharCode(...b.subarray(from, from + len));

/**
 * mp4: kotak "ftyp" di byte 4–8. webm: magic EBML 1A 45 DF A3 dan elemen DocType (42 82) bernilai
 * "webm" — Matroska (.mkv) memakai magic yang sama dengan DocType "matroska" sehingga ditolak.
 */
export function sniffVideo(ext: VideoExt, head: Uint8Array): boolean {
  if (ext === "mp4") return head.length >= 8 && ascii(head, 4, 4) === "ftyp";
  if (
    head.length < 4 ||
    head[0] !== 0x1a ||
    head[1] !== 0x45 ||
    head[2] !== 0xdf ||
    head[3] !== 0xa3
  )
    return false;
  for (let i = 4; i + 2 < head.length; i++) {
    if (head[i] !== 0x42 || head[i + 1] !== 0x82) continue;
    const size = head[i + 2]! & 0x7f; // vint 1 byte (DocType pendek)
    if (!(head[i + 2]! & 0x80)) return false;
    return ascii(head, i + 3, size) === "webm";
  }
  return false;
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function isPng(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && PNG.every((b, i) => bytes[i] === b);
}

/** Pesan galat pra-cek (null = boleh diunggah). Server memeriksa ulang setelah unggah selesai. */
export function videoProblem(
  name: string,
  size: number,
  head: Uint8Array,
): { code: "INVALID_FORMAT" | "FILE_TOO_LARGE"; message: string } | null {
  const ext = videoExtOf(name);
  if (!ext) return { code: "INVALID_FORMAT", message: "Hanya video .mp4 atau .webm." };
  if (size > VIDEO_MAX_BYTES)
    return { code: "FILE_TOO_LARGE", message: "Ukuran video melebihi batas 500 MB." };
  if (!sniffVideo(ext, head))
    return {
      code: "INVALID_FORMAT",
      message: `Isi file bukan video ${ext.toUpperCase()} (mis. .mkv yang diganti ekstensinya).`,
    };
  return null;
}

/** 75 → "1:15", 3725 → "1:02:05". */
export function formatDuration(sec: number): string {
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}
