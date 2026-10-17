// Ukur ukuran chunk hasil build: mentah, gzip (level 6 bawaan & 9) dan brotli (q11).
// Pakai: node measure.mjs [dist]
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync, brotliCompressSync, constants } from "node:zlib";

const dir = process.argv[2] || "dist";
const files = readdirSync(join(dir, "assets")).filter((f) => /\.(js|css)$/.test(f));
const rows = files.map((f) => {
  const buf = readFileSync(join(dir, "assets", f));
  return {
    file: f,
    raw: buf.length,
    gzip6: gzipSync(buf, { level: 6 }).length,
    gzip9: gzipSync(buf, { level: 9 }).length,
    br: brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
  };
});
const kb = (n) => (n / 1024).toFixed(1);
const sum = (pred) =>
  rows.filter((r) => pred(r.file)).reduce((a, r) => ({ raw: a.raw + r.raw, gzip6: a.gzip6 + r.gzip6, gzip9: a.gzip9 + r.gzip9, br: a.br + r.br }), { raw: 0, gzip6: 0, gzip9: 0, br: 0 });
const groups = {
  "awal (index js+css)": (f) => f.startsWith("index-"),
  "rute AG (AgPage + Toolbar)": (f) => f.startsWith("AgPage-") || f.startsWith("Toolbar-"),
  "rute Glide (GlidePage js+css + Toolbar)": (f) => f.startsWith("GlidePage-") || f.startsWith("Toolbar-"),
  "Glide editor overlay (lazy, saat sel dibuka)": (f) => f.includes("overlay-editor"),
};
const out = { dir, files: rows, groups: {} };
for (const [k, pred] of Object.entries(groups)) out.groups[k] = sum(pred);
for (const r of rows) console.log(r.file.padEnd(44), "raw", kb(r.raw).padStart(7), "gz6", kb(r.gzip6).padStart(6), "gz9", kb(r.gzip9).padStart(6), "br", kb(r.br).padStart(6));
for (const [k, v] of Object.entries(out.groups)) console.log(k.padEnd(46), "raw", kb(v.raw), "gz6", kb(v.gzip6), "gz9", kb(v.gzip9), "br", kb(v.br), "KiB");
writeFileSync(`results/bundle-${dir.replace(/\W/g, "_")}.json`, JSON.stringify(out, null, 2));
