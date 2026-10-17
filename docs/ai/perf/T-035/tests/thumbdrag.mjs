/* eslint-disable */
// Arsip bukti spike T-035 (salinan dari prototipe di luar repo); bukan kode aplikasi.
// Seret thumb scrollbar sungguhan (mouse) ke dasar. Chromium headless menyembunyikan scrollbar
// (--hide-scrollbars), jadi argumen itu dibuang agar scrollbar klasik tergambar.
// Pakai: node tests/thumbdrag.mjs <ag|glide> [query] [jumlah-percobaan]
// Butuh `node server.mjs 4173 dist` berjalan. Semua percobaan disimpan ke satu berkas (seri).
import fs from "node:fs";
import { chromium } from "@playwright/test";

const grid = process.argv[2] || "ag";
const qs = process.argv[3] || "";
const runs = Number(process.argv[4] || 1);
const tag = `chromium-${grid}${qs ? "-" + qs.replace(/\W+/g, "_") : ""}-thumbdrag`;
const b = await chromium.launch({ channel: "chromium", ignoreDefaultArgs: ["--hide-scrollbars"], args: ["--disable-features=OverlayScrollbar,OverlayScrollbars"] });

async function once(i) {
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  await p.goto(`http://127.0.0.1:4173/${qs}#/${grid}`);
  await p.waitForTimeout(2000);
  const sel = grid === "ag" ? ".ag-body-vertical-scroll-viewport" : ".dvn-scroller";
  const info = await p.evaluate((sel) => {
    const el = document.querySelector(sel);
    const r = el.getBoundingClientRect();
    return { x: r.right, top: r.top, bottom: r.bottom, sbw: el.offsetWidth - el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight };
  }, sel);
  const x = info.x - Math.max(4, Math.floor(info.sbw / 2));
  // Thumb minimal ± 20 px di puncak track; tekan di sana lalu seret melewati dasar.
  await p.mouse.move(x, info.top + 8);
  await p.mouse.down();
  for (let k = 1; k <= 30; k++) {
    await p.mouse.move(x, info.top + 8 + ((info.bottom - info.top + 200) * k) / 30);
    await p.waitForTimeout(30);
  }
  await p.mouse.up();
  await p.waitForTimeout(1500);
  const read = () =>
    p.evaluate(
      ([sel, grid]) => {
        const el = document.querySelector(sel);
        let last = null;
        if (grid === "ag") {
          const vp = document.querySelector(".ag-grid-viewport");
          const bottom = vp.getBoundingClientRect().top + vp.clientHeight;
          const rows = [...vp.querySelectorAll(".ag-row[row-index]")]
            .map((r) => ({ idx: Number(r.getAttribute("row-index")), b: r.getBoundingClientRect(), c0: r.querySelector('[col-id="c0"]')?.textContent }))
            .filter((r) => {
              if (!r.c0 || r.b.bottom > bottom + 1) return false;
              // Uji tumbukan: tepi bawah baris tidak tertutup scrollbar horizontal/elemen lain.
              const cell = vp.querySelector(`.ag-row[row-index="${r.idx}"] [col-id="c0"]`).getBoundingClientRect();
              const hit = document.elementFromPoint(cell.left + 10, r.b.bottom - 3);
              return hit?.closest(".ag-row")?.getAttribute("row-index") === String(r.idx);
            })
            .sort((a, b) => b.idx - a.idx);
          last = rows[0] && { idx: rows[0].idx, row: rows[0].idx + 1, c0: rows[0].c0 };
        } else {
          const r = window.__glideRegion;
          last = { idx: r.y + r.height - 1, row: r.y + r.height, ty: r.ty };
        }
        return { scrollTop: el.scrollTop, max: el.scrollHeight - el.clientHeight, last };
      },
      [sel, grid],
    );
  const res = await read();
  if (i === 0) await p.screenshot({ path: `screenshots/${tag}.png` });
  // Setelah seret: 5 × wheel 200 px lalu baca lagi.
  await p.mouse.move(640, 400);
  for (let k = 0; k < 5; k++) {
    await p.mouse.wheel(0, 200);
    await p.waitForTimeout(150);
  }
  await p.waitForTimeout(1000);
  const afterWheel = await read();
  await p.close();
  return { run: i + 1, info, res, afterWheel };
}

const series = [];
for (let i = 0; i < runs; i++) {
  const r = await once(i);
  series.push(r);
  console.log(JSON.stringify({ run: r.run, lastRowAfterDrag: r.res.last?.row, lastRowAfterWheel: r.afterWheel.last?.row }));
}
fs.writeFileSync(`results/${tag}${runs > 1 ? "-seri" : ""}.json`, JSON.stringify({ grid, qs, runs, series }, null, 2));
await b.close();
