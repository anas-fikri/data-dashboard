/* eslint-disable */
// Arsip bukti spike T-035 (salinan dari prototipe di luar repo); bukan kode aplikasi.
// Gulir sentuh (Chromium, CDP Input.synthesizeScrollGesture, sumber "touch"): berapa baris bergeser per
// usapan 300 px dari baris 5 jt. Hanya Chromium yang punya gestur sentuh sintetis.
import fs from "node:fs";
import { chromium } from "@playwright/test";

const b = await chromium.launch();
const out = [];
for (const [grid, qs] of [["ag", ""], ["ag", "?opt=wheelfix"], ["glide", ""]]) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto(`http://127.0.0.1:4173/${qs}#/${grid}`);
  await p.waitForTimeout(1500);
  await p.fill('[data-testid="goto-input"]', "5000000");
  await p.click('[data-testid="goto-btn"]');
  await p.waitForTimeout(1200);
  const first = () =>
    p.evaluate((grid) => {
      if (grid === "glide") return window.__glideRegion.y;
      const vp = document.querySelector(".ag-grid-viewport");
      const top = document.querySelector(".ag-header").getBoundingClientRect().bottom;
      const rows = [...vp.querySelectorAll(".ag-row[row-index]")]
        .filter((r) => r.getBoundingClientRect().top >= top - 1)
        .map((r) => Number(r.getAttribute("row-index")));
      return Math.min(...rows);
    }, grid);
  const cdp = await ctx.newCDPSession(p);
  const res = [];
  for (let i = 0; i < 3; i++) {
    const a = await first();
    await cdp.send("Input.synthesizeScrollGesture", { x: 640, y: 450, yDistance: -300, gestureSourceType: "touch", speed: 800, preventFling: true });
    await p.waitForTimeout(1200);
    const z = await first();
    res.push(z - a);
  }
  out.push({ grid, qs, rowsPer300pxSwipe: res });
  console.log(grid, qs, res);
  await ctx.close();
}
fs.writeFileSync("results/chromium-touch.json", JSON.stringify(out, null, 2));
await b.close();
