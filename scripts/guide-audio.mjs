// Dev saja (T-3k08): nama file audio narasi bersama guide-tts.mjs (pembuat) dan record-guide-videos.ts
// (pemakai). Berubah bila teks, suara, model, atau setelan berubah — cache tidak pernah basi.
import { createHash } from "node:crypto";

export const AUDIO_DIR = "demo/guide-videos/audio";

export function audioName(voice, text) {
  const key = JSON.stringify([voice.voiceId, voice.model, voice.settings, text]);
  return `${createHash("sha256").update(key).digest("hex").slice(0, 16)}.mp3`;
}
