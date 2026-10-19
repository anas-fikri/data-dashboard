// Dev saja (T-3k08): nama file audio narasi bersama guide-tts.mjs (pembuat) dan record-guide-videos.ts
// (pemakai). Berubah bila teks, suara, model, atau setelan berubah — cache tidak pernah basi.
import { createHash } from "node:crypto";

export const AUDIO_DIR = "demo/guide-videos/audio";

export function audioName(voice, text) {
  // Seluruh objek suara (penyedia, nama suara, tempo, model, setelan): ganti penyedia = audio baru.
  const key = JSON.stringify([voice, text]);
  return `${createHash("sha256").update(key).digest("hex").slice(0, 16)}.mp3`;
}

/** Penanda istilah bahasa Inggris di naskah: "[en:pivot]" — diucapkan suara en-GB (T-9bc2). */
export const EN_TERM = /\[en:([^\]]+)\]/g;

/** Teks takarir (VTT) dari kalimat naskah: penanda istilah dibuang, istilahnya tetap. */
export const captionText = (voice) => voice.replace(EN_TERM, "$1");
