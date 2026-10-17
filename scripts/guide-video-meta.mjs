#!/usr/bin/env node
// Metadata video panduan (T-xfzy/T-023) dihitung di mesin perekam yang punya ffmpeg, bukan di image
// produksi: durasi (ffprobe) + poster PNG detik 1 (≤ 1280 px, ≤ 2 MB) ditulis ke manifest videos.json
// sebagai durationSec + poster, dipakai scripts/seed-guides.ts.
//   node scripts/guide-video-meta.mjs [demo/guide-videos]
import { execFileSync } from "node:child_process";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2] ?? "demo/guide-videos";
const manifestPath = join(dir, "videos.json");
const list = JSON.parse(readFileSync(manifestPath, "utf8"));
for (const v of list) {
  const path = join(dir, v.file);
  const d = Number(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      path,
    ])
      .toString()
      .trim(),
  );
  v.durationSec = Number.isFinite(d) && d > 0 ? Math.max(1, Math.round(d)) : undefined;
  const poster = v.file.replace(/\.(mp4|webm)$/i, ".poster.png");
  execFileSync("ffmpeg", [
    ...["-hide_banner", "-loglevel", "error", "-y", "-ss", "1", "-i", path],
    ...["-frames:v", "1", "-vf", "scale='min(1280,iw)':-2", join(dir, poster)],
  ]);
  if (statSync(join(dir, poster)).size > 2 * 1024 * 1024) throw new Error(`${poster} > 2 MB`);
  v.poster = poster;
  console.log(`${v.file}: ${v.durationSec ?? "?"} dtk, poster ${poster}`);
}
writeFileSync(manifestPath, `${JSON.stringify(list, null, 2)}\n`);
