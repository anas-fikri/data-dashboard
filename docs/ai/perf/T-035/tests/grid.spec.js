/* eslint-disable */
// Arsip bukti spike T-035 (salinan dari prototipe di luar repo); bukan kode aplikasi.
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { decodePng, hex, hslToHex } from "./png.js";
import { COLUMNS, cellCopy, cellValue } from "../src/data.js";

const ROWS = 10_000_000;
const OUT = path.resolve("results");
const SHOTS = path.resolve("screenshots");
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(SHOTS, { recursive: true });

const save = (b, g, name, data) =>
  fs.writeFileSync(path.join(OUT, `${b}-${g}-${name}.json`), JSON.stringify(data, null, 2));
const pcp = (idx) => "PCP" + String(idx + 1).padStart(8, "0");
const fmt = (n) => new Intl.NumberFormat("id-ID").format(n);

// Token dari src/tokens.css (salinan src/styles/tokens.css repo).
const tokensCss = fs.readFileSync(path.resolve("src/tokens.css"), "utf8");
function tok(name, dark) {
  const block = dark ? tokensCss.slice(tokensCss.indexOf(".dark")) : tokensCss.slice(0, tokensCss.indexOf(".dark"));
  const m = block.match(new RegExp(`--${name}:\\s*([^;]+);`));
  return hslToHex(m[1].replace(/\/\*.*$/, ""));
}
const dist = (a, b) => {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return Math.max(...x.map((v, i) => Math.abs(v - y[i])));
};

async function instrument(page) {
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) =>
      window.__csp.push({ directive: e.violatedDirective, blocked: e.blockedURI, sample: e.sample, source: e.sourceFile }),
    );
    window.__copies = [];
    const origSet = DataTransfer.prototype.setData;
    DataTransfer.prototype.setData = function (t, d) {
      window.__copies.push({ via: "clipboardData", type: t, data: d });
      return origSet.call(this, t, d);
    };
    if (navigator.clipboard) {
      const wt = navigator.clipboard.writeText?.bind(navigator.clipboard);
      if (wt)
        navigator.clipboard.writeText = (s) => {
          window.__copies.push({ via: "writeText", type: "text/plain", data: s });
          return wt(s).catch((e) => window.__copies.push({ via: "writeText-error", data: String(e) }));
        };
      const w = navigator.clipboard.write?.bind(navigator.clipboard);
      if (w)
        navigator.clipboard.write = async (items) => {
          for (const it of items)
            for (const t of it.types) {
              const b = await it.getType(t);
              window.__copies.push({ via: "write", type: t, data: await b.text() });
            }
          return w(items).catch((e) => window.__copies.push({ via: "write-error", data: String(e) }));
        };
    }
  });
}

async function openGrid(page, grid, base = "", qs = "") {
  await page.goto(`${base}/${qs}#/${grid}`);
  if (grid === "ag")
    await page.waitForFunction(
      () =>
        document.querySelector('.ag-row[row-index="0"] [col-id="c0"]')?.textContent ===
        "PCP00000001",
      null,
      { timeout: 30_000 },
    );
  else
    await page.waitForFunction(() => document.getElementById("glide-cell-1-0")?.textContent === "PCP00000001", null, {
      timeout: 30_000,
    });
  await page.mouse.move(1270, 790);
}

// Status viewport: baris yang terlihat penuh, isi baris pertama/terakhir/target, fokus, scroller.
function readState(page, grid, target = null) {
  return page.evaluate(
    ([grid, ROWS, target]) => {
      if (grid === "ag") {
        const vpEl = document.querySelector(".ag-grid-viewport");
        const vr = vpEl.getBoundingClientRect();
        // Header lengket di dalam viewport (v36): area data = bawah header s.d. clientHeight.
        const vp = { top: document.querySelector(".ag-header").getBoundingClientRect().bottom, bottom: vr.top + vpEl.clientHeight };
        const rowInfo = (idx) => {
          const r = vpEl.querySelector(`.ag-row[row-index="${idx}"]`);
          if (!r) return null;
          const b = r.getBoundingClientRect();
          const no = r.querySelector('[col-id="n"]');
          return {
            idx,
            aria: Number(r.getAttribute("aria-rowindex")),
            c0: r.querySelector('[col-id="c0"]')?.textContent || null,
            no: no?.textContent || null,
            full: b.top >= vp.top - 1 && b.bottom <= vp.bottom + 1,
            top: Math.round(b.top - vp.top),
          };
        };
        const all = [...vpEl.querySelectorAll(".ag-row[row-index]")]
          .map((r) => rowInfo(Number(r.getAttribute("row-index"))))
          .filter((r) => r && r.full && r.c0)
          .sort((a, b) => a.idx - b.idx);
        const fc = window.__grid.api.getFocusedCell();
        return {
          firstFull: all[0]?.idx ?? null,
          lastFull: all.at(-1)?.idx ?? null,
          firstRow: all[0] ?? null,
          lastRow: all.at(-1) ?? null,
          target: target == null ? null : rowInfo(target),
          focused: fc ? { row: fc.rowIndex, col: fc.column.getColId() } : null,
          scrollers: [...document.querySelectorAll(".ag-grid-viewport, .ag-body-vertical-scroll-viewport")].map((e) => ({
            cls: e.classList[0],
            scrollTop: e.scrollTop,
            scrollHeight: e.scrollHeight,
            clientHeight: e.clientHeight,
          })),
        };
      }
      const sc = document.querySelector(".dvn-scroller");
      const sb = sc.getBoundingClientRect();
      const top = sb.top + 44;
      const bottom = sb.top + sc.clientHeight;
      const r = window.__glideRegion;
      const ref = window.__grid.ref.current;
      const info = (y) => {
        const b = ref.getBounds(1, y);
        if (!b) return null;
        return {
          idx: y,
          aria: Number(document.getElementById(`glide-cell-1-${y}`)?.parentElement?.getAttribute("aria-rowindex")) || null,
          c0: document.getElementById(`glide-cell-1-${y}`)?.textContent ?? null,
          no: document.getElementById(`glide-cell-0-${y}`)?.textContent ?? null,
          full: b.y >= top - 1 && b.y + b.height <= bottom + 1,
          top: Math.round(b.y - top),
        };
      };
      const full = [];
      for (let y = r.y; y < Math.min(ROWS, r.y + r.height + 1); y++) {
        const i = info(y);
        if (i && i.full) full.push(i);
      }
      const sel = window.__glideSel?.cell;
      return {
        firstFull: full[0]?.idx ?? null,
        lastFull: full.at(-1)?.idx ?? null,
        firstRow: full[0] ?? null,
        lastRow: full.at(-1) ?? null,
        target: target == null ? null : info(target),
        focused: sel ? { row: sel[1], col: sel[0] } : null,
        region: r,
        scrollers: [{ cls: "dvn-scroller", scrollTop: sc.scrollTop, scrollHeight: sc.scrollHeight, clientHeight: sc.clientHeight }],
      };
    },
    [grid, ROWS, target],
  );
}

async function settle(page, grid, target = null, ms = 15_000) {
  const t0 = Date.now();
  let prev = null;
  for (;;) {
    await page.waitForTimeout(150);
    const s = await readState(page, grid, target);
    const ready = s.lastRow?.c0 && (target == null || s.target?.c0);
    if (ready && prev && prev.firstFull === s.firstFull && prev.lastFull === s.lastFull) return s;
    prev = s;
    if (Date.now() - t0 > ms) return s;
  }
}

const SCROLLER = { ag: ".ag-grid-viewport", glide: ".dvn-scroller" };

const stats = (xs) => {
  const v = [...xs].sort((a, b) => a - b);
  const mid = v.length >> 1;
  return { n: v.length, min: v[0], median: v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2, max: v.at(-1) };
};

// Seri wheel: `n` langkah × 100 px; trackpad: `n` potong × (25 × 4 px = 100 px). Baris bergeser per 100 px.
async function wheelSeries(page, grid, n = 12) {
  const box = await page.locator('[data-testid="grid"]').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const wheel = [];
  for (let i = 0; i < n; i++) {
    const a = await settle(page, grid);
    await page.mouse.wheel(0, 100);
    const b = await settle(page, grid);
    wheel.push(b.firstFull - a.firstFull);
  }
  const trackpad = [];
  for (let i = 0; i < n; i++) {
    const a = await settle(page, grid);
    for (let k = 0; k < 25; k++) {
      await page.mouse.wheel(0, 4);
      await page.waitForTimeout(16);
    }
    const b = await settle(page, grid);
    trackpad.push(b.firstFull - a.firstFull);
  }
  return { wheel, wheelStats: stats(wheel), trackpad, trackpadStats: stats(trackpad) };
}

async function cellPoint(page, grid, col, row) {
  if (grid === "ag") {
    const b = await page.locator(`.ag-row[row-index="${row}"] [col-id="${col === 0 ? "n" : "c" + (col - 1)}"]`).first().boundingBox();
    return { x: b.x + 10, y: b.y + b.height / 2, b };
  }
  const b = await page.evaluate(([c, r]) => {
    const x = window.__grid.ref.current.getBounds(c, r);
    return x && { x: x.x, y: x.y, width: x.width, height: x.height };
  }, [col, row]);
  return { x: b.x + 10, y: b.y + b.height / 2, b };
}

for (const grid of ["ag", "glide"]) {
  test.describe(grid, () => {
    test.beforeEach(async ({ page }) => {
      await instrument(page);
    });

    test("csp-load", async ({ page, browserName }) => {
      const consoleMsgs = [];
      const pageErrors = [];
      const assets = [];
      page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && consoleMsgs.push(`${m.type()}: ${m.text()}`));
      page.on("pageerror", (e) => pageErrors.push(String(e)));
      page.on("response", async (r) => {
        const u = new URL(r.url());
        if (/\.(js|css)$/.test(u.pathname)) assets.push({ path: u.pathname, status: r.status() });
      });
      const resp = await page.goto("/");
      const csp = resp.headers()["content-security-policy"];
      await page.waitForSelector(".topbar");
      const before = assets.length;
      const t0 = Date.now();
      await page.click(`a[href="#/${grid}"]`);
      await openGrid(page, grid).catch(() => {});
      const renderMs = Date.now() - t0;
      // Aksi yang memicu kode tambahan: gulir ke akhir, ke baris, ganti tema, overlay sel (Glide).
      await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        el.scrollTop = el.scrollHeight;
      }, SCROLLER[grid]);
      await page.waitForTimeout(500);
      await page.fill('[data-testid="goto-input"]', "5000000");
      await page.click('[data-testid="goto-btn"]');
      await page.waitForTimeout(500);
      await page.click('[data-testid="theme"]');
      await page.waitForTimeout(300);
      if (grid === "glide") {
        const p = await cellPoint(page, grid, 12, 4_999_999);
        await page.mouse.dblclick(p.x, p.y);
        await page.waitForTimeout(500);
        await page.keyboard.press("Escape");
      }
      await page.waitForTimeout(300);
      const violations = await page.evaluate(() => window.__csp);
      const cspConsole = consoleMsgs.filter((m) => /Content.Security.Policy|CSP/i.test(m));
      const rendered = await readState(page, grid).catch((e) => ({ error: String(e) }));
      await page.screenshot({ path: path.join(SHOTS, `${browserName}-${grid}-csp.png`) });
      const data = {
        cspHeader: csp,
        violations,
        cspConsole,
        consoleMsgs,
        pageErrors,
        renderMs,
        routeAssets: assets.slice(before),
        initialAssets: assets.slice(0, before),
        renderedOk: !!rendered.lastRow?.c0,
      };
      save(browserName, grid, "csp", data);
      expect(csp).toContain("strict-dynamic");
      expect(data.renderedOk).toBe(true);
      expect(violations).toEqual([]);
      expect(cspConsole).toEqual([]);
    });

    test("drag-to-end", async ({ page, browserName }) => {
      await openGrid(page, grid);
      const s0 = await readState(page, grid);
      // Meniru seret thumb scrollbar: scrollTop dinaikkan bertahap sampai maksimum.
      const mids = [];
      for (const frac of [0.25, 0.5, 0.75, 0.999, 1]) {
        await page.evaluate(
          ([sel, frac]) => {
            const el = document.querySelector(sel);
            el.scrollTop = Math.round((el.scrollHeight - el.clientHeight) * frac);
          },
          [SCROLLER[grid], frac],
        );
        const s = await settle(page, grid);
        mids.push({ frac, firstFull: s.firstFull, lastFull: s.lastFull, firstC0: s.firstRow?.c0, scrollTop: s.scrollers[0].scrollTop });
      }
      const s = await settle(page, grid);
      await page.screenshot({ path: path.join(SHOTS, `${browserName}-${grid}-drag-end.png`) });
      const ok = s.lastFull === ROWS - 1 && s.lastRow.c0 === pcp(ROWS - 1) && s.lastRow.no === fmt(ROWS);
      save(browserName, grid, "drag", { before: s0.scrollers, mids, end: s, ok });
      expect(ok).toBe(true);
    });

    test("drag-to-end-mitigasi", async ({ page, browserName }) => {
      await openGrid(page, grid, "", grid === "ag" ? "?opt=sentinel,fixbottom" : "?opt=sentinel");
      for (const frac of [0.25, 0.5, 0.75, 0.999, 1]) {
        await page.evaluate(
          ([sel, frac]) => {
            const el = document.querySelector(sel);
            el.scrollTop = Math.round((el.scrollHeight - el.clientHeight) * frac);
          },
          [grid === "ag" ? ".ag-body-vertical-scroll-viewport" : ".dvn-scroller", frac],
        );
        await page.waitForTimeout(300);
      }
      const s = await settle(page, grid);
      await page.screenshot({ path: path.join(SHOTS, `${browserName}-${grid}-drag-end-mitigasi.png`) });
      const ok = s.lastFull === ROWS - 1 && s.lastRow.c0 === pcp(ROWS - 1) && s.lastRow.no === fmt(ROWS);
      // "Ke baris" ke baris terakhir dan 9.999.999 dengan mitigasi aktif.
      const gotos = [];
      for (const n of [10_000_000, 9_999_999, 5_000_000, 10_000_000]) {
        await page.fill('[data-testid="goto-input"]', String(n));
        await page.click('[data-testid="goto-btn"]');
        const g = await settle(page, grid, n - 1);
        gotos.push({ n, exact: g.target?.full === true && g.target.c0 === pcp(n - 1) && g.focused?.row === n - 1, top: g.target?.top ?? null });
      }
      save(browserName, grid, "drag-mitigasi", { end: s, ok, gotos });
      expect(ok).toBe(true);
      expect(gotos.every((g) => g.exact)).toBe(true);
    });

    for (const variant of grid === "ag" ? ["", "wheelfix"] : [""])
    test(`wheel-step${variant ? "-" + variant : ""}`, async ({ page, browserName }) => {
      await openGrid(page, grid, "", variant ? `?opt=${variant}` : "");
      await page.fill('[data-testid="goto-input"]', "5000000");
      await page.click('[data-testid="goto-btn"]');
      await settle(page, grid, 4_999_999);
      const r = await wheelSeries(page, grid, 12);
      save(browserName, grid, `wheel-step${variant ? "-" + variant : ""}`, r);
    });

    // Semua mitigasi AG sekaligus (sentinel + fixbottom + wheelfix + focusguard; Ke baris 'middle' bawaan): seret, Ke baris, wheel, keyboard di
    // dasar, keyboard dalam dari baris 5 jt, cincin fokus tema gelap. Sentinel = baris kosong nyata.
    test("mitigasi-gabungan", async ({ page, browserName }) => {
      test.skip(grid !== "ag", "khusus AG Grid");
      await openGrid(page, grid, "", "?opt=sentinel,fixbottom,wheelfix,focusguard");
      const out = { opts: "sentinel,fixbottom,wheelfix,focusguard" };
      const lastData = async () => {
        const st = await settle(page, grid, ROWS - 1);
        return { full: st.target?.full ?? false, top: st.target?.top ?? null, focused: st.focused };
      };
      // 1. seret ke akhir
      for (const frac of [0.25, 0.5, 0.75, 0.999, 1]) {
        await page.evaluate((frac) => {
          const el = document.querySelector(".ag-body-vertical-scroll-viewport");
          el.scrollTop = Math.round((el.scrollHeight - el.clientHeight) * frac);
        }, frac);
        await page.waitForTimeout(300);
      }
      out.drag = await lastData();
      // 2. wheel di tengah
      await page.fill('[data-testid="goto-input"]', "5000000");
      await page.click('[data-testid="goto-btn"]');
      await settle(page, grid, 4_999_999);
      out.wheel = await wheelSeries(page, grid, 10);
      // 3. horizontal tetap jalan (wheel diagonal, dominan vertikal)
      const sl0 = await page.evaluate(() => document.querySelector(".ag-grid-viewport").scrollLeft);
      await page.mouse.wheel(120, 200);
      await page.waitForTimeout(300);
      const sl1 = await page.evaluate(() => document.querySelector(".ag-grid-viewport").scrollLeft);
      out.horizontal = { before: sl0, after: sl1, moved: sl1 > sl0 };
      // 4. keyboard di dasar: Cmd+↓, End, PageDown (fokus DOM harus di sel grid, bukan tombol "Ke baris")
      await page.evaluate(() => window.__grid.api.ensureColumnVisible("c0"));
      const startRow = (await settle(page, grid)).firstFull + 2;
      const cell = await cellPoint(page, grid, 1, startRow);
      await page.mouse.click(cell.x, cell.y);
      await page.waitForTimeout(200);
      out.focusInGridBeforeKeys = await page.evaluate(() => !!document.activeElement?.closest(".ag-grid-viewport"));
      out.keysAtEnd = {};
      for (const k of ["Meta+ArrowDown", "End", "PageDown"]) {
        await page.keyboard.press(k);
        await page.waitForTimeout(400);
        out.keysAtEnd[k] = await lastData();
      }
      await page.evaluate(() => window.__grid.api.ensureColumnVisible("c0"));
      await page.waitForTimeout(300);
      // 5. Ke baris di akhir
      out.gotos = [];
      for (const n of [10_000_000, 9_999_999]) {
        await page.fill('[data-testid="goto-input"]', String(n));
        await page.click('[data-testid="goto-btn"]');
        const g = await settle(page, grid, n - 1);
        out.gotos.push({ n, exact: g.target?.full === true && g.target.c0 === pcp(n - 1) && g.focused?.row === n - 1 });
      }
      // 6. keyboard dalam dari 5 jt: ArrowDown × 25 lalu PageDown × 3, baris terfokus harus terlihat penuh
      await page.fill('[data-testid="goto-input"]', "5000000");
      await page.click('[data-testid="goto-btn"]');
      await settle(page, grid, 4_999_999);
      const fc = await cellPoint(page, grid, 1, 4_999_999);
      await page.mouse.click(fc.x, fc.y);
      const deep = [];
      for (let i = 0; i < 28; i++) {
        const key = i < 25 ? "ArrowDown" : "PageDown";
        await page.keyboard.press(key);
        await page.waitForTimeout(120);
        const f = await page.evaluate(() => window.__grid.api.getFocusedCell()?.rowIndex);
        const st = await settle(page, grid, f, 3000);
        const scrollTop = await page.evaluate(() => document.querySelector(".ag-grid-viewport").scrollTop);
        deep.push({ key, row: f, full: st.target?.full ?? false, top: st.target?.top ?? null, scrollTop });
      }
      out.deepKeyboard = { steps: deep, allFull: deep.every((d) => d.full), notFull: deep.filter((d) => !d.full) };
      save(browserName, grid, "mitigasi-gabungan", out);
      // 7. cincin fokus di tema gelap (sel fokus dibawa ke tengah dulu)
      await page.click('[data-testid="theme"]');
      await page.waitForTimeout(400);
      await page.evaluate(() => window.__grid.api.ensureIndexVisible(window.__grid.api.getFocusedCell().rowIndex, "middle"));
      await settle(page, grid);
      const fr = await page.evaluate(() => {
        const f = window.__grid.api.getFocusedCell();
        const el = document.querySelector(`.ag-row[row-index="${f.rowIndex}"] [col-id="${f.column.getColId()}"]`);
        el?.focus();
        const b = el.getBoundingClientRect();
        return { x: b.x, y: b.y, width: b.width, height: b.height };
      });
      const png = decodePng(await page.screenshot({ clip: { x: fr.x - 3, y: fr.y - 3, width: fr.width + 6, height: fr.height + 6 }, path: path.join(SHOTS, `${browserName}-ag-focus-dark.png`) }));
      const primaryDark = tok("primary", true);
      let ring = 0;
      for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) if (dist(hex(png.px(x, y)), primaryDark) < 40) ring++;
      out.focusRingDark = { ringPixels: ring, primaryDark };
      save(browserName, grid, "mitigasi-gabungan", out);
      expect(out.drag.full).toBe(true);
    });

    // Keyboard dalam: dari baris 5 jt, ArrowDown × 25 lalu PageDown × 3; baris terfokus harus terlihat penuh.
    for (const variant of grid === "ag" ? ["", "sentinel,fixbottom,wheelfix", "sentinel,fixbottom,wheelfix,focusguard"] : [""])
    test(`keyboard-dalam${variant ? (variant.includes("focusguard") ? "-mitigasi-focusguard" : "-mitigasi") : ""}`, async ({ page, browserName }) => {
      await openGrid(page, grid, "", variant ? `?opt=${variant}` : "");
      await page.fill('[data-testid="goto-input"]', "5000000");
      await page.click('[data-testid="goto-btn"]');
      await settle(page, grid, 4_999_999);
      const fc = await cellPoint(page, grid, 1, 4_999_999);
      await page.mouse.click(fc.x, fc.y);
      await page.waitForTimeout(200);
      const steps = [];
      for (let i = 0; i < 28; i++) {
        const key = i < 25 ? "ArrowDown" : "PageDown";
        await page.keyboard.press(key);
        await page.waitForTimeout(120);
        const f = await page.evaluate((grid) => (grid === "ag" ? window.__grid.api.getFocusedCell()?.rowIndex : window.__glideSel?.cell?.[1]), grid);
        const st = await settle(page, grid, f, 3000);
        steps.push({ key, row: f, full: st.target?.full ?? false, top: st.target?.top ?? null });
      }
      const notFull = steps.filter((d) => !d.full);
      const tag = variant ? (variant.includes("focusguard") ? "-mitigasi-focusguard" : "-mitigasi") : "";
      await page.screenshot({ path: path.join(SHOTS, `${browserName}-${grid}-keyboard-dalam${tag}.png`) });
      save(browserName, grid, `keyboard-dalam${tag}`, { steps, notFull, allFull: notFull.length === 0 });
    });

    test("wheel-to-end", async ({ page, browserName }) => {
      await openGrid(page, grid);
      const box = await page.locator('[data-testid="grid"]').boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      let events = 0;
      let last = -1;
      let stuck = 0;
      const t0 = Date.now();
      for (; events < 600; events++) {
        await page.mouse.wheel(0, 1_000_000);
        if (events % 5 === 4) {
          await page.waitForTimeout(50);
          const st = await page.evaluate((sel) => {
            const el = document.querySelector(sel);
            return { top: el.scrollTop, max: el.scrollHeight - el.clientHeight };
          }, SCROLLER[grid]);
          if (st.top >= st.max - 1) break;
          if (st.top === last && ++stuck > 3) break;
          last = st.top;
        }
      }
      const s = await settle(page, grid);
      await page.screenshot({ path: path.join(SHOTS, `${browserName}-${grid}-wheel-end.png`) });
      // Wheel kecil (3 × 100 px) setelah di dasar: apakah tetap di baris terakhir.
      const ok = s.lastFull === ROWS - 1 && s.lastRow.c0 === pcp(ROWS - 1);
      save(browserName, grid, "wheel", { events: events + 1, ms: Date.now() - t0, end: s, ok });
      expect(ok).toBe(true);
    });

    test("goto", async ({ page, browserName }) => {
      await openGrid(page, grid);
      const targets = [9_999_999, 10_000_000, 1, 5_000_000, 1_234_567, 8_765_432, 5_000_300, 9_999_999];
      const out = {};
      for (const mode of ["native", "fixed"]) {
        await page.goto("about:blank");
        await openGrid(page, grid);
        const results = [];
        for (const n of targets) {
          const idx = n - 1;
          const t0 = Date.now();
          if (mode === "fixed") {
            await page.fill('[data-testid="goto-input"]', String(n));
            await page.click('[data-testid="goto-btn"]');
          } else {
            await page.evaluate((n) => window.__grid.goTo(n, "native"), n);
          }
          let visibleMs = null;
          try {
            if (grid === "ag")
              await page.waitForFunction(
                ([idx, exp]) => document.querySelector(`.ag-row[row-index="${idx}"] [col-id="c0"]`)?.textContent === exp,
                [idx, pcp(idx)],
                { timeout: 8_000 },
              );
            else
              await page.waitForFunction(
                ([idx, exp]) => document.getElementById(`glide-cell-1-${idx}`)?.textContent === exp,
                [idx, pcp(idx)],
                { timeout: 8_000 },
              );
            visibleMs = Date.now() - t0;
          } catch {
            visibleMs = null;
          }
          const s = await settle(page, grid, idx, 4000);
          const exact =
            s.target?.full === true && s.target.c0 === pcp(idx) && s.target.no === fmt(n) && s.focused?.row === idx;
          results.push({
            n,
            visibleMs,
            exact,
            targetFull: s.target?.full ?? false,
            targetTopPx: s.target?.top ?? null,
            topAligned: s.firstFull === idx,
            firstFull: s.firstFull,
            lastFull: s.lastFull,
            focusedRow: s.focused?.row ?? null,
            ariaRowIndex: s.target?.aria ?? null,
          });
          if (n === 9_999_999 && mode === "fixed")
            await page.screenshot({ path: path.join(SHOTS, `${browserName}-${grid}-goto-9999999.png`) });
        }
        out[mode] = results;
      }
      save(browserName, grid, "goto", out);
      expect(out.fixed.every((r) => r.exact)).toBe(true);
    });

    test("keyboard-aria", async ({ page, browserName }) => {
      await openGrid(page, grid);
      const p = await cellPoint(page, grid, 1, 0);
      await page.mouse.click(p.x, p.y);
      await page.waitForTimeout(200);
      const info = () =>
        page.evaluate((grid) => {
          const a = document.activeElement;
          const row = a?.closest('[role="row"]');
          const cs = a ? getComputedStyle(a) : null;
          let focused = null;
          if (grid === "ag") {
            const fc = window.__grid.api.getFocusedCell();
            focused = fc && { row: fc.rowIndex, col: fc.column.getColId() };
          } else {
            const c = window.__glideSel?.cell;
            focused = c && { row: c[1], col: c[0] };
          }
          return {
            focused,
            active: a && { tag: a.tagName, role: a.getAttribute("role"), id: a.id || null, colindex: a.getAttribute("aria-colindex"), rowindex: row?.getAttribute("aria-rowindex") ?? null },
            focusStyle: cs && { outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`, border: cs.borderColor, boxShadow: cs.boxShadow },
          };
        }, grid);
      const steps = [];
      steps.push({ key: "click", ...(await info()) });
      const keys = [
        "ArrowDown",
        "ArrowRight",
        "PageDown",
        "PageUp",
        "End",
        "Home",
        "Control+End",
        "Control+Home",
        "Meta+End",
        "Meta+Home",
        "Meta+ArrowDown",
        "Meta+ArrowUp",
      ];
      for (const k of keys) {
        await page.keyboard.press(k);
        await page.waitForTimeout(400);
        await settle(page, grid, null, 5000);
        steps.push({ key: k, ...(await info()) });
      }
      await page.keyboard.press("Meta+ArrowDown");
      const lastKb = await settle(page, grid, ROWS - 1);
      const lastRowAfterKeyboard = { full: lastKb.target?.full ?? false, top: lastKb.target?.top ?? null, focused: lastKb.focused };
      await page.screenshot({ path: path.join(SHOTS, `${browserName}-${grid}-kb-last.png`) });
      await page.keyboard.press("Meta+ArrowUp");
      await settle(page, grid);
      // Fokus terlihat: piksel warna ring/aksen di tepi sel terfokus.
      await page.keyboard.press("ArrowDown");
      await page.waitForTimeout(300);
      const fp = grid === "ag" ? await page.evaluate(() => {
        const fc = window.__grid.api.getFocusedCell();
        const el = document.querySelector(`.ag-row[row-index="${fc.rowIndex}"] [col-id="${fc.column.getColId()}"]`);
        const b = el.getBoundingClientRect();
        return { x: b.x, y: b.y, width: b.width, height: b.height };
      }) : await page.evaluate(() => {
        const c = window.__glideSel.cell;
        const b = window.__grid.ref.current.getBounds(c[0], c[1]);
        return { x: b.x, y: b.y, width: b.width, height: b.height };
      });
      const clip = { x: Math.max(0, fp.x - 3), y: Math.max(0, fp.y - 3), width: fp.width + 6, height: fp.height + 6 };
      const png = decodePng(await page.screenshot({ clip, path: path.join(SHOTS, `${browserName}-${grid}-focus.png`) }));
      const primary = tok("primary", false);
      let ringPixels = 0;
      for (let y = 0; y < png.height; y++)
        for (let x = 0; x < png.width; x++) if (dist(hex(png.px(x, y)), primary) < 40) ringPixels++;

      const aria = await page.evaluate((grid) => {
        const root = document.querySelector('[role="grid"], [role="treegrid"]');
        const headers = [...document.querySelectorAll('[role="columnheader"]')];
        const rows = [...root.querySelectorAll('[role="row"][aria-rowindex]')].map((r) => Number(r.getAttribute("aria-rowindex")));
        return {
          rootTag: root.tagName,
          role: root.getAttribute("role"),
          rowcount: root.getAttribute("aria-rowcount"),
          colcount: root.getAttribute("aria-colcount"),
          multiselectable: root.getAttribute("aria-multiselectable"),
          label: root.getAttribute("aria-label") || root.getAttribute("aria-labelledby"),
          headerCount: headers.length,
          headerSample: headers.slice(0, 3).map((h) => ({ text: h.textContent.trim().slice(0, 40), sort: h.getAttribute("aria-sort"), colindex: h.getAttribute("aria-colindex") })),
          rowIndexMin: Math.min(...rows),
          rowIndexMax: Math.max(...rows),
          gridcells: root.querySelectorAll('[role="gridcell"]').length,
        };
      }, grid);
      // aria-sort setelah klik header kolom A (AG Grid saja; Glide tidak punya urut bawaan).
      let ariaSortAfterClick = null;
      if (grid === "ag") {
        await page.evaluate(() => window.__grid.api.ensureColumnVisible("c0"));
        await page.waitForTimeout(300);
        await page.locator('.ag-header-cell[col-id="c0"]').click();
        await page.waitForTimeout(500);
        ariaSortAfterClick = await page.locator('.ag-header-cell[col-id="c0"]').getAttribute("aria-sort");
      }
      // aria-rowindex di baris dalam (stretching tidak boleh merusak indeks).
      await page.fill('[data-testid="goto-input"]', "9999999");
      await page.click('[data-testid="goto-btn"]');
      await settle(page, grid, 9_999_998);
      const deep = await readState(page, grid, 9_999_998);
      let snapshot = null;
      try {
        snapshot = (await page.locator('[role="grid"], [role="treegrid"]').first().ariaSnapshot()).split("\n").slice(0, 40).join("\n");
      } catch (e) {
        snapshot = "ERR " + String(e).slice(0, 200);
      }
      save(browserName, grid, "keyboard", { lastRowAfterKeyboard, steps, ringPixels, aria, ariaSortAfterClick, deepAriaRowIndex: deep.target?.aria, snapshot });
      expect(steps.find((s) => s.key === "ArrowDown").focused.row).toBe(1);
    });

    test("theme", async ({ page, browserName }) => {
      await openGrid(page, grid);
      const out = {};
      for (const dark of [false, true]) {
        if (dark) {
          await page.click('[data-testid="theme"]');
          await page.waitForTimeout(400);
          await page.mouse.move(1270, 790);
          await page.waitForTimeout(200);
        }
        const p = await cellPoint(page, grid, 1, 1);
        const shot = await page.screenshot({ path: path.join(SHOTS, `${browserName}-${grid}-${dark ? "dark" : "light"}.png`) });
        const png = decodePng(shot);
        const dpr = png.width / 1280;
        const sample = (x, y) => hex(png.px(Math.round(x * dpr), Math.round(y * dpr)));
        const cellPx = sample(p.b.x + p.b.width - 6, p.b.y + p.b.height / 2);
        const headerPx = sample(p.b.x + p.b.width - 6, (grid === "ag" ? (await page.locator('.ag-header-cell[col-id="c0"]').boundingBox()).y : p.b.y - p.b.height - 44) + 6);
        const expCell = tok("card", dark);
        const expHeader = tok("muted", dark);
        out[dark ? "dark" : "light"] = { cellPx, expCell, cellDist: dist(cellPx, expCell), headerPx, expHeader, headerDist: dist(headerPx, expHeader) };
      }
      save(browserName, grid, "theme", out);
      expect(out.light.cellDist).toBeLessThan(6);
      expect(out.dark.cellDist).toBeLessThan(6);
    });

    test("copy", async ({ page, browserName }) => {
      await openGrid(page, grid);
      const results = [];
      // Baris dengan catatan berawalan "=" (uji netralisasi formula).
      let fRow = 0;
      while (cellValue(fRow, 11) !== "=SUM(A1:A9)") fRow++;
      const cases = [
        { name: "angka desimal (Berat)", row: 0, col: 4 },
        { name: "angka (Ongkir)", row: 0, col: 5 },
        { name: "tanggal", row: 0, col: 1 },
        { name: "teks formula", row: fRow, col: 11 },
      ];
      for (const c of cases) {
        await page.evaluate(() => (window.__copies = []));
        if (grid === "ag") {
          await page.evaluate((r) => window.__grid.api.ensureIndexVisible(r, "middle"), c.row);
          await page.waitForTimeout(400);
          await page.evaluate((col) => window.__grid.api.ensureColumnVisible("c" + col), c.col);
          await page.waitForTimeout(300);
        } else {
          await page.evaluate(([r, col]) => window.__grid.ref.current.scrollTo(col + 1, r, "both", 0, 0, { vAlign: "center" }), [c.row, c.col]);
          await page.waitForTimeout(300);
        }
        const p = await cellPoint(page, grid, c.col + 1, c.row);
        await page.mouse.click(p.x, p.y);
        await page.waitForTimeout(150);
        await page.keyboard.press("ControlOrMeta+c");
        await page.waitForTimeout(400);
        const copies = await page.evaluate(() => window.__copies);
        let clip = null;
        if (browserName === "chromium") clip = await page.evaluate(() => navigator.clipboard.readText()).catch((e) => "ERR " + e);
        const plain = copies.find((x) => x.type === "text/plain")?.data ?? null;
        const expected = cellCopy(c.row, c.col);
        results.push({ ...c, expected, plain, clipboardReadText: clip, ok: plain === expected, via: copies.map((x) => x.via + ":" + x.type) });
      }
      // Rentang (Glide bawaan) dan seleksi raksasa.
      let range = null;
      let huge = null;
      if (grid === "glide") {
        await page.evaluate(() => window.__grid.ref.current.scrollTo(1, 0, "both", 0, 0, { vAlign: "start" }));
        await page.waitForTimeout(300);
        const p = await cellPoint(page, grid, 1, 0);
        await page.mouse.click(p.x, p.y);
        await page.keyboard.press("Shift+ArrowRight");
        await page.keyboard.press("Shift+ArrowRight");
        await page.keyboard.press("Shift+ArrowDown");
        await page.evaluate(() => (window.__copies = []));
        await page.keyboard.press("ControlOrMeta+c");
        await page.waitForTimeout(400);
        const copies = await page.evaluate(() => window.__copies);
        const exp = [0, 1].map((r) => [0, 1, 2].map((c) => cellCopy(r, c)).join("\t")).join("\n");
        const plain = copies.find((x) => x.type === "text/plain")?.data ?? null;
        range = { expected: exp, plain, html: copies.some((x) => x.type === "text/html"), ok: plain?.replace(/\r\n/g, "\n") === exp };
        // Seleksi sampai baris terakhir (10 jt) → harus ditolak, halaman tetap responsif.
        await page.keyboard.press("Escape");
        await page.evaluate(() => window.__grid.ref.current.scrollTo(1, 0, "both", 0, 0, { vAlign: "start" }));
        await page.waitForTimeout(200);
        const p2 = await cellPoint(page, grid, 2, 1);
        await page.mouse.click(p2.x, p2.y);
        await page.keyboard.press("Shift+ControlOrMeta+ArrowDown");
        await page.waitForTimeout(300);
        await page.evaluate(() => (window.__copies = []));
        const t0 = Date.now();
        await page.keyboard.press("ControlOrMeta+c");
        await page.waitForTimeout(300);
        const responsive = await page.evaluate(() => 1 + 1);
        huge = {
          selection: await page.evaluate(() => window.__glideSel),
          refused: await page.evaluate(() => window.__copyRefused ?? null),
          copies: (await page.evaluate(() => window.__copies)).length,
          ms: Date.now() - t0,
          responsive: responsive === 2,
        };
      }
      save(browserName, grid, "copy", { results, range, huge });
      expect(results.every((r) => r.ok)).toBe(true);
    });

    test("axe", async ({ page, browserName }) => {
      test.skip(browserName !== "chromium", "axe cukup di satu engine");
      await openGrid(page, grid, "http://127.0.0.1:4174");
      await page.addScriptTag({ path: path.resolve("node_modules/axe-core/axe.min.js") });
      const res = await page.evaluate(async () => {
        const r = await window.axe.run(document.querySelector('[data-testid="grid"]'), {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
        });
        return r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help, sample: v.nodes[0]?.target }));
      });
      save(browserName, grid, "axe", res);
      expect(res.filter((v) => v.impact === "critical" || v.impact === "serious")).toEqual([]);
    });
  });
}

test("max-element-height", async ({ page, browserName }) => {
  await page.setContent("<!doctype html><body></body>");
  const res = await page.evaluate(() => {
    const d = document.createElement("div");
    document.body.appendChild(d);
    let lo = 1e6;
    let hi = 4e9;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      d.style.height = mid + "px";
      if (d.clientHeight === mid) lo = mid;
      else hi = mid;
    }
    d.style.height = "1000000000px";
    const clamped = d.getBoundingClientRect().height; // tinggi maksimum efektif (dijepit engine)
    d.remove();
    // Replika deteksi AG Grid (ag-stack _getMaxDivHeight): gandakan dari 1e6, Firefox dibatasi 6e6.
    const isFF = /firefox/i.test(navigator.userAgent);
    let res = 1e6;
    const upTo = isFF ? 6e6 : 1e9;
    const t = document.createElement("div");
    document.body.appendChild(t);
    for (;;) {
      const test = res * 2;
      t.style.height = test + "px";
      if (test > upTo || t.clientHeight !== test) break;
      res = test;
    }
    t.remove();
    // Wadah gulir dengan 64 × 5 jt px (seperti padder Glide 6.0.3) → scrollHeight nyata.
    const sc = document.createElement("div");
    sc.style.cssText = "height:500px;overflow:auto";
    for (let i = 0; i < 64; i++) {
      const p = document.createElement("div");
      p.style.height = "5000000px";
      sc.appendChild(p);
    }
    document.body.appendChild(sc);
    const stacked = sc.scrollHeight;
    sc.scrollTop = 1e12;
    const maxTop = sc.scrollTop;
    return { maxDivHeight: lo, clampedAt1e9: clamped, agGridDetected: res, stackedScrollHeight: stacked, stackedMaxScrollTop: maxTop, ua: navigator.userAgent };
  });
  fs.writeFileSync(path.join(OUT, `${browserName}-maxheight.json`), JSON.stringify(res, null, 2));
});
