// Dev saja (T-3k08): rakit video panduan bernarasi dari rekaman layar + linimasa kalimat.
//   timeline = [{ t: ms dari awal video, dur: detik, text: kalimat narasi, file: mp3 | null }]
import { execFileSync } from "node:child_process";
import { renameSync } from "node:fs";

/** Panjang baris takarir yang nyaman dibaca (± 42 karakter, maks. 2 baris per cue). */
const LINE = 42;

const stamp = (ms) => {
  const t = Math.max(0, Math.round(ms));
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${p(Math.floor(t / 3_600_000))}:${p(Math.floor(t / 60_000) % 60)}:${p(Math.floor(t / 1000) % 60)}.${p(t % 1000, 3)}`;
};

/** Bungkus teks per kata menjadi baris ≤ LINE karakter. */
function wrap(text) {
  const lines = [];
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const last = lines.at(-1);
    if (last && `${last} ${word}`.length <= LINE) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
}

/**
 * WebVTT dari linimasa: satu kalimat narasi dipecah per kalimat (titik/tanya/seru) lalu per 2 baris,
 * dan waktunya dibagi menurut panjang teks — takarir mengikuti ucapan tanpa blok teks panjang.
 */
export function toVtt(timeline) {
  const cues = [];
  for (const item of timeline) {
    const chunks = [];
    for (const sentence of item.text.split(/(?<=[.!?])\s+/).filter(Boolean)) {
      const lines = wrap(sentence);
      for (let i = 0; i < lines.length; i += 2) chunks.push(lines.slice(i, i + 2).join("\n"));
    }
    const total = chunks.reduce((n, c) => n + c.length, 0) || 1;
    let at = item.t;
    for (const c of chunks) {
      const len = (item.dur * 1000 * c.length) / total;
      cues.push(`${stamp(at)} --> ${stamp(at + len)}\n${c}`);
      at += len;
    }
  }
  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}

/**
 * Tempatkan tiap mp3 pada detiknya (adelay) lalu gabung (amix tanpa normalisasi: kalimat tidak tumpang
 * tindih) menjadi trek Opus di webm yang sama; video disalin apa adanya. Tanpa audio → video tetap.
 */
export function assemble(raw, out, timeline) {
  const voiced = timeline.filter((i) => i.file);
  if (!voiced.length) {
    renameSync(raw, out);
    return;
  }
  const inputs = voiced.flatMap((i) => ["-i", i.file]);
  const delays = voiced.map((i, n) => `[${n + 1}:a]adelay=${Math.round(i.t)}:all=1[a${n}]`);
  const mix = `${voiced.map((_, n) => `[a${n}]`).join("")}amix=inputs=${voiced.length}:normalize=0,aresample=48000[aout]`;
  execFileSync("ffmpeg", [
    ...["-hide_banner", "-loglevel", "error", "-y", "-i", raw, ...inputs],
    ...["-filter_complex", [...delays, mix].join(";")],
    ...["-map", "0:v", "-map", "[aout]", "-c:v", "copy", "-c:a", "libopus", "-b:a", "96k", out],
  ]);
}
