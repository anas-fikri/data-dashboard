import { execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page, type Route } from "@playwright/test";
import { pageFor, registerAndVerify, startWorker, stopWorker, uniqueEmail } from "./helpers";

/*
 * T-043 / ADR-0007 "Persyaratan T-043": mekanika gulir grid Lihat data pada 10.000.000 baris dengan
 * SEMUA mitigasi stretching aktif, dijalankan di Chromium, Firefox, dan WebKit (project
 * data-view-scroll[-firefox|-webkit]). Halaman dan sheet sungguhan (CSV kecil lewat worker); respons
 * POST /api/sheets/:id/rows diganti baris sintetis berjumlah 10 jt (versi/revisi dari respons asli),
 * jadi yang diuji adalah klien: Ke baris, Ctrl+End, seret ke akhir, wheel, keyboard dalam, cincin fokus.
 */
test.describe.configure({ mode: "serial" });

const TOTAL = 10_000_000;
const OWNER = uniqueEmail("gulir-pemilik");
const dir = mkdtempSync(join(tmpdir(), "dd-e2e-gulir-"));
let worker: ChildProcess | null = null;
let datasetId = "";
let page: Page;
const aborted: string[] = [];
const agErrors: string[] = [];

function csv(): string {
  const lines = ["Kode;Nilai;Tanggal"];
  for (let i = 1; i <= 5; i++) lines.push(`R${i};${i};2026-01-0${i}`);
  const path = join(dir, "gulir.csv");
  writeFileSync(path, `${lines.join("\n")}\n`);
  return path;
}

let meta: { versionId: string; schemaRevision: number } | null = null;
let delayMs = 0;

/** Baris sintetis: kolom 1 "R<n>", kolom 2 n, kolom 3 tanggal. Total 10 jt. */
async function synthetic(route: Route) {
  if (!meta) {
    const real = await route.fetch();
    const body = await real.json();
    meta = { versionId: body.versionId, schemaRevision: body.schemaRevision };
  }
  const req = route.request().postDataJSON() as {
    rowStart: number;
    rowCount: number;
    cols: number[];
  };
  const end = Math.min(TOTAL, req.rowStart + req.rowCount);
  const rows = [];
  for (let i = req.rowStart; i < end; i++) {
    const n = i + 1;
    rows.push({
      n,
      _row: n + 1,
      cells: req.cols.map((p) => (p === 1 ? `R${n}` : p === 2 ? n : "2026-01-01")),
      cut: [],
    });
  }
  if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
  await route
    .fulfill({
      json: { ok: true, ...meta, total: TOTAL, filteredTotal: TOTAL, rows },
    })
    .catch(() => {}); // permintaan sudah dibatalkan klien
}

const grid = () => page.getByTestId("sheet-grid");

/** Indeks baris terfokus (0-based) dari sel DOM yang punya fokus, atau null. */
const focusedRow = () =>
  page.evaluate(() => {
    const el = document.activeElement?.closest(".ag-row");
    const v = el?.getAttribute("row-index");
    return v == null ? null : Number(v);
  });

/** Baris terlihat penuh di antara kepala dan tepi bawah viewport grid (sama dengan mitigasi). */
const fullyVisible = (rowIndex: number) =>
  page.evaluate((idx) => {
    const root = document.querySelector('[data-testid="sheet-grid"]')!;
    const vp = root.querySelector<HTMLElement>(".ag-grid-viewport")!;
    const top = root.querySelector(".ag-header")!.getBoundingClientRect().bottom;
    const bottom = vp.getBoundingClientRect().top + vp.clientHeight;
    const r = vp.querySelector(`.ag-row[row-index="${idx}"]`)?.getBoundingClientRect();
    return Boolean(r && r.top >= top - 1 && r.bottom <= bottom + 1);
  }, rowIndex);

/** Indeks baris pertama yang lebih dari separuhnya terlihat. */
const firstVisible = () =>
  page.evaluate(() => {
    const root = document.querySelector('[data-testid="sheet-grid"]')!;
    const vp = root.querySelector<HTMLElement>(".ag-grid-viewport")!;
    const top = root.querySelector(".ag-header")!.getBoundingClientRect().bottom;
    let best = Infinity;
    for (const row of vp.querySelectorAll(".ag-grid-scrolling-rows .ag-row[row-index]")) {
      const r = row.getBoundingClientRect();
      if ((r.top + r.bottom) / 2 >= top)
        best = Math.min(best, Number(row.getAttribute("row-index")));
    }
    return best;
  });

const settle = () =>
  page.evaluate(
    () =>
      new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 60))),
      ),
  );

async function expectFocusedVisible(row: number) {
  await expect.poll(focusedRow).toBe(row);
  await expect.poll(() => fullyVisible(row)).toBe(true);
}

/** Ke baris N lewat kotak "Ke baris"; mengembalikan ms sampai baris berisi data terlihat penuh. */
async function goToTimed(n: number): Promise<number> {
  const input = page.getByTestId("grid-goto-input");
  await input.fill(String(n));
  const t0 = await page.evaluate(() => performance.now());
  await input.press("Enter");
  const handle = await page.waitForFunction(
    (idx) => {
      const root = document.querySelector('[data-testid="sheet-grid"]')!;
      const vp = root.querySelector<HTMLElement>(".ag-grid-viewport")!;
      const top = root.querySelector(".ag-header")!.getBoundingClientRect().bottom;
      const bottom = vp.getBoundingClientRect().top + vp.clientHeight;
      const row = vp.querySelector(`.ag-row[row-index="${idx}"]`);
      const r = row?.getBoundingClientRect();
      const text = row?.querySelector('[col-id="c1"]')?.textContent;
      return r && r.top >= top - 1 && r.bottom <= bottom + 1 && text === `R${idx + 1}`
        ? performance.now()
        : false;
    },
    n - 1,
    { polling: "raf", timeout: 10_000 },
  );
  return ((await handle.jsonValue()) as number) - t0;
}

test.describe("Lihat data: gulir 10 jt baris (ADR-0007)", () => {
  test.beforeAll(async ({ browser, request }) => {
    test.setTimeout(240_000);
    execFileSync("node", ["scripts/dev-reset-ratelimit.mjs", "register:ip"]);
    const p = await browser.newPage();
    await registerAndVerify(p, request, OWNER);
    await p.close();
    worker = await startWorker("data-view-scroll");
    const owner = await pageFor(browser, OWNER);
    await owner.goto("/datasets/baru");
    await owner.getByLabel("Nama dataset").fill(`Gulir ${Date.now()}`);
    await owner.getByRole("button", { name: "Buat dataset" }).click();
    await expect(owner).toHaveURL(/\/datasets\/[a-z0-9]{20,32}\?created=1$/, { timeout: 30_000 });
    datasetId = new URL(owner.url()).pathname.split("/").pop()!;
    await owner.getByTestId("upload-input").setInputFiles(csv());
    await expect(owner.getByTestId("dataset-data-link")).toBeVisible({ timeout: 120_000 });
    await stopWorker(worker);
    worker = null;

    page = owner;
    await page.setViewportSize({ width: 1280, height: 900 });
    page.on("console", (m) => {
      if (/AG Grid: error #200/.test(m.text())) agErrors.push(m.text());
    });
    page.on("requestfailed", (r) => {
      if (r.url().includes("/rows")) aborted.push(r.failure()?.errorText ?? "");
    });
    await page.route("**/api/sheets/*/rows", synthetic);
    await page.goto(`/datasets/${datasetId}/data`);
    await expect(grid().locator('.ag-row[row-index="0"] [col-id="c1"]')).toHaveText("R1");
    await expect(page.getByTestId("grid-status-rows")).toHaveText(
      /^Baris 1–\d+ dari 10\.000\.000$/,
    );
    await expect(grid().locator('[role="grid"]')).toHaveAttribute(
      "aria-rowcount",
      String(TOTAL + 2),
    );
  });

  test.afterAll(async () => {
    await stopWorker(worker);
    // ADR-0007: modul AG yang kurang hanya terlihat saat runtime.
    expect(agErrors).toEqual([]);
  });

  test("AC2: Ke baris 9.000.000 dan Ctrl+End tampil ≤ 1 detik", async () => {
    const ms = await goToTimed(9_000_000);
    expect(ms).toBeLessThanOrEqual(1000);
    await expectFocusedVisible(8_999_999);
    await expect(page.getByTestId("grid-status-rows")).toHaveText(
      /^Baris 8\.99\d\.\d{3}–9\.00\d\.\d{3} dari 10\.000\.000$/,
    );

    const t0 = await page.evaluate(() => performance.now());
    await page.keyboard.press("Control+End");
    const done = await page.waitForFunction(
      (idx) => {
        const row = document.querySelector(
          `[data-testid="sheet-grid"] .ag-row[row-index="${idx}"]`,
        );
        return row?.querySelector('[col-id="c1"]')?.textContent === `R${idx + 1}` &&
          document.activeElement?.closest(".ag-row") === row
          ? performance.now()
          : false;
      },
      TOTAL - 1,
      { polling: "raf", timeout: 10_000 },
    );
    expect(((await done.jsonValue()) as number) - t0).toBeLessThanOrEqual(1000);
    await expectFocusedVisible(TOTAL - 1);
    await page.keyboard.press("Control+Home");
    await expectFocusedVisible(0);
  });

  test("Ke baris 1 / 5.000.000 / 9.999.999 / 10.000.000 tepat", async () => {
    for (const n of [1, 5_000_000, 9_999_999, 10_000_000]) {
      await goToTimed(n);
      await expectFocusedVisible(n - 1);
      await expect(page.locator(".ag-row-focus [col-id='c1']").first()).toHaveText(`R${n}`);
    }
  });

  test("Seret ke akhir, lalu Ctrl+↓ / End / PageDown di dasar: baris data terakhir terlihat penuh", async () => {
    await goToTimed(1);
    // Seret thumb ke dasar = scrollTop maksimum pada scroller vertikal AG.
    await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>(
        '[data-testid="sheet-grid"] .ag-body-vertical-scroll-viewport',
      )!;
      el.scrollTop = el.scrollHeight;
    });
    await expect
      .poll(async () => {
        await settle();
        return fullyVisible(TOTAL - 1);
      })
      .toBe(true);
    await expect(grid().locator(`.ag-row[row-index="${TOTAL}"] [col-id="n"]`).first()).toHaveText(
      "Akhir data",
    );
    await expect(page.getByTestId("grid-status-rows")).toHaveText(
      /^Baris 9\.999\.\d{3}–10\.000\.000 dari 10\.000\.000$/,
    );

    await goToTimed(TOTAL);
    for (const key of ["Control+ArrowDown", "End", "PageDown", "PageDown"]) {
      await page.keyboard.press(key);
      await settle();
      await expect.poll(() => fullyVisible(TOTAL - 1)).toBe(true);
    }
  });

  test("Wheel: median ≤ 5 dan maks ≤ 8 baris per 100 px (12 langkah)", async () => {
    await goToTimed(5_000_000);
    const box = (await grid().boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await settle();
    const steps: number[] = [];
    let prev = await firstVisible();
    for (let i = 0; i < 12; i++) {
      await page.mouse.wheel(0, 100);
      await settle();
      const now = await firstVisible();
      steps.push(now - prev);
      prev = now;
    }
    const sorted = [...steps].sort((a, b) => a - b);
    const median = (sorted[5]! + sorted[6]!) / 2;
    test.info().annotations.push({ type: "wheel", description: JSON.stringify(steps) });
    console.log(`wheel ${test.info().project.name}: ${JSON.stringify(steps)}`);
    expect(median, JSON.stringify(steps)).toBeLessThanOrEqual(5);
    expect(Math.max(...steps), JSON.stringify(steps)).toBeLessThanOrEqual(8);
    expect(Math.min(...steps), JSON.stringify(steps)).toBeGreaterThan(0);
  });

  test("Keyboard dalam: dari baris 5.000.000, ArrowDown × 25 lalu PageDown, baris terfokus selalu terlihat penuh", async () => {
    await goToTimed(5_000_000);
    await expectFocusedVisible(4_999_999);
    for (let i = 1; i <= 25; i++) {
      await page.keyboard.press("ArrowDown");
      await settle();
      await expectFocusedVisible(4_999_999 + i);
    }
    await page.keyboard.press("PageDown");
    await settle();
    const row = (await focusedRow())!;
    expect(row).toBeGreaterThan(4_999_999 + 25);
    await expect.poll(() => fullyVisible(row)).toBe(true);
  });

  test("Cincin fokus terlihat (kontras ≥ 3:1) di tema terang dan gelap", async () => {
    await goToTimed(5_000_000);
    for (const dark of [false, true]) {
      await page.evaluate((d) => document.documentElement.classList.toggle("dark", d), dark);
      await settle();
      const ratio = await page.evaluate(() => {
        const cell = document.activeElement as HTMLElement;
        const cs = getComputedStyle(cell);
        const rgb = (c: string) =>
          c
            .match(/[\d.]+/g)!
            .slice(0, 3)
            .map(Number);
        const lum = ([r, g, b]: number[]) => {
          const f = (v: number) => {
            const s = v / 255;
            return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          };
          return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
        };
        let bgEl: HTMLElement | null = cell;
        let bg = "rgba(0, 0, 0, 0)";
        while (bgEl && /rgba\(0, 0, 0, 0\)|transparent/.test(bg)) {
          bg = getComputedStyle(bgEl).backgroundColor;
          bgEl = bgEl.parentElement;
        }
        if (cs.outlineStyle === "none" || parseFloat(cs.outlineWidth) < 2) return 0;
        const a = lum(rgb(cs.outlineColor));
        const b = lum(rgb(bg));
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      });
      expect(ratio, dark ? "gelap" : "terang").toBeGreaterThanOrEqual(3);
      await expectFocusedVisible(4_999_999);
    }
    await page.evaluate(() => document.documentElement.classList.remove("dark"));
  });

  test("Blok yang sudah digulir lewat dibatalkan (AbortSignal)", async () => {
    delayMs = 800;
    aborted.length = 0;
    await page.getByTestId("grid-goto-input").fill("3000000");
    await page.getByTestId("grid-goto-input").press("Enter");
    await page.waitForTimeout(400); // permintaan blok 3 jt sedang berjalan
    await goToTimed(7_000_000);
    await expect.poll(() => aborted.length).toBeGreaterThan(0);
    delayMs = 0;
    // Kembali ke blok yang dibatalkan → dimuat ulang, bukan kosong selamanya.
    await goToTimed(3_000_000);
    await expectFocusedVisible(2_999_999);
  });
});
