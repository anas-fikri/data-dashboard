/* eslint-disable */
// Arsip bukti spike T-035 (salinan dari prototipe di luar repo); bukan kode aplikasi.
// Uji hipotetis: style-src tanpa 'unsafe-inline' (server: node server.mjs 4175 dist --strict-style).
// Hitung pelanggaran per varian (Chromium): AG dengan/tanpa styleNonce, Glide.
import fs from "node:fs";
import { chromium } from "@playwright/test";

const b = await chromium.launch();
const out = {};
for (const [name, grid, qs] of [["ag-styleNonce", "ag", ""], ["ag-tanpa-styleNonce", "ag", "?opt=nostylenonce"], ["glide", "glide", ""]]) {
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  await p.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) =>
      window.__csp.push({ d: e.violatedDirective, blocked: e.blockedURI, sample: (e.sample || "").slice(0, 60) }),
    );
  });
  await p.goto(`http://127.0.0.1:4175/${qs}#/${grid}`);
  await p.waitForTimeout(2500);
  const v = await p.evaluate(() => window.__csp);
  const byDir = {};
  for (const x of v) byDir[x.d] = (byDir[x.d] || 0) + 1;
  const rendered = await p.evaluate(() => !!(document.querySelector('.ag-row [col-id="c0"]')?.textContent || document.getElementById("glide-cell-1-0")));
  out[name] = { total: v.length, byDir, sample: v.slice(0, 3), rendered };
  await p.close();
}
console.log(JSON.stringify(out, null, 1));
fs.writeFileSync("results/chromium-strict-style.json", JSON.stringify(out, null, 2));
await b.close();
