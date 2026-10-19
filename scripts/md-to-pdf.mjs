// Ubah dokumen Markdown (GFM: tabel) menjadi PDF A4 lewat Chromium Playwright, tanpa dependensi baru:
//   node scripts/md-to-pdf.mjs docs/ringkasan-dokumentasi.md [keluaran.pdf]
// Butuh Chromium Playwright (npx playwright install chromium). Keluaran bawaan: nama sama, ekstensi .pdf.
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { chromium } from "@playwright/test";
import { micromark } from "micromark";
import { gfmTable, gfmTableHtml } from "micromark-extension-gfm-table";

const src = process.argv[2];
if (!src) {
  console.error("pakai: node scripts/md-to-pdf.mjs <file.md> [keluaran.pdf]");
  process.exit(1);
}
const out = process.argv[3] ?? src.replace(/\.md$/, ".pdf");
const md = readFileSync(src, "utf8");
const body = micromark(md, { extensions: [gfmTable()], htmlExtensions: [gfmTableHtml()] });
const title = /^#\s+(.+)$/m.exec(md)?.[1] ?? basename(src);

const css = `
  @page { size: A4; margin: 18mm 16mm 18mm 16mm; }
  body { font: 10.5pt/1.5 -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #18181b; }
  h1 { font-size: 20pt; margin: 0 0 4pt; color: #1d4ed8; }
  h2 { font-size: 14pt; margin: 18pt 0 6pt; padding-bottom: 3pt; border-bottom: 1px solid #d4d4d8; }
  h3 { font-size: 11.5pt; margin: 12pt 0 4pt; }
  h2, h3 { break-after: avoid; }
  p, li { margin: 3pt 0; }
  hr { border: 0; border-top: 1px solid #e4e4e7; margin: 10pt 0; }
  table { border-collapse: collapse; width: 100%; margin: 6pt 0; font-size: 9.5pt; break-inside: auto; }
  tr { break-inside: avoid; }
  th, td { border: 1px solid #d4d4d8; padding: 4pt 6pt; text-align: left; vertical-align: top; }
  th { background: #f4f4f5; }
  code { font: 9pt/1.4 "SF Mono", Menlo, Consolas, monospace; background: #f4f4f5; padding: 0 2pt; border-radius: 2pt; }
  pre { background: #f4f4f5; padding: 6pt 8pt; border-radius: 4pt; white-space: pre-wrap; word-break: break-word; }
  pre code { background: none; padding: 0; }
  a { color: #1d4ed8; text-decoration: none; }
`;
const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${title}</title>
<style>${css}</style></head><body>${body}</body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "load" });
  await page.pdf({
    path: out,
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: "<span></span>",
    footerTemplate: `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:8pt;color:#71717a;width:100%;padding:0 16mm;display:flex;justify-content:space-between">
      <span>${title}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
    margin: { top: "18mm", bottom: "18mm", left: "16mm", right: "16mm" },
  });
  console.log(`PDF: ${out}`);
} finally {
  await browser.close();
}
