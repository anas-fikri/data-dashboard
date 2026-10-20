import { execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { pageFor, registerAndVerify, startWorker, stopWorker, uniqueEmail } from "./helpers";

/*
 * T-043 "Lihat data" di Chromium dengan data sungguhan (unggah CSV → worker → typed parquet): rupa
 * lembar kerja + format id-ID (AC 1), pengaturan kolom pulih per sheet/revisi dan grid tetap jalan
 * tanpa localStorage (AC 3), versi berganti saat menggulir → banner tanpa baris campuran (AC 4),
 * serta akses: editor boleh, viewer 404. Mekanika gulir 10 jt baris di data-view-scroll.spec.ts.
 */
test.describe.configure({ mode: "serial" });

const OWNER = uniqueEmail("lihat-pemilik");
const EDITOR = uniqueEmail("lihat-editor");
const VIEWER = uniqueEmail("lihat-viewer");
const ROWS = 450;
const LONG = "x".repeat(600);
const dir = mkdtempSync(join(tmpdir(), "dd-e2e-lihat-"));
let worker: ChildProcess | null = null;
let datasetId = "";
let editorDashboard = "";
let viewerDashboard = "";

const node = (script: string, ...args: string[]) =>
  JSON.parse(execFileSync("node", [script, ...args]).toString()) as Record<string, unknown>;

function csv(name: string, prefix: string): string {
  const lines = ["Kode;Jumlah;Harga;Tanggal;Aktif;Catatan"];
  for (let i = 1; i <= ROWS; i++) {
    const jumlah = i === 3 ? "" : String(i * 1000);
    const note = i === 2 ? LONG : `catatan ${i}`;
    lines.push(
      `${prefix}${i};${jumlah};${i},25;2026-03-${String((i % 28) + 1).padStart(2, "0")};${i % 2 ? "Ya" : "Tidak"};${note}`,
    );
  }
  const path = join(dir, name);
  writeFileSync(path, `${lines.join("\n")}\n`);
  return path;
}

/** Gagal bila AG Grid melaporkan modul yang kurang (ADR-0007: "AG Grid: error #200"). */
function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (/AG Grid: error #200/.test(m.text())) errors.push(m.text());
  });
  return errors;
}

const grid = (page: Page) => page.getByTestId("sheet-grid");
const cell = (page: Page, row: number, col: string) =>
  grid(page).locator(`.ag-row[row-index="${row}"] [col-id="${col}"]`).first();
const header = (page: Page, col: string) => grid(page).locator(`.ag-header-cell[col-id="${col}"]`);

async function openMenu(page: Page, col: string) {
  await header(page, col).hover();
  await header(page, col)
    .getByRole("button", { name: /^Menu kolom/ })
    .click();
}

async function waitForActive(browser: Browser, prefix: string) {
  const p = await pageFor(browser, OWNER);
  await expect(async () => {
    await p.goto(`/datasets/${datasetId}/data`);
    await expect(cell(p, 0, "c1")).toHaveText(`${prefix}1`, { timeout: 5_000 });
  }).toPass({ timeout: 120_000 });
  await p.close();
}

test.describe("Lihat data: halaman lembar kerja", () => {
  test.beforeAll(async ({ browser, request }) => {
    test.setTimeout(240_000);
    execFileSync("node", ["scripts/dev-reset-ratelimit.mjs", "register:ip"]);
    for (const email of [OWNER, EDITOR, VIEWER]) {
      const p = await browser.newPage();
      await registerAndVerify(p, request, email);
      await p.close();
    }
    worker = await startWorker("data-view");
    const page = await pageFor(browser, OWNER);
    await page.goto("/datasets/baru");
    await page.getByLabel("Nama dataset").fill(`Lihat data ${Date.now()}`);
    await page.getByRole("button", { name: "Buat dataset" }).click();
    await expect(page).toHaveURL(/\/datasets\/[a-z0-9]{20,32}\?created=1$/, { timeout: 30_000 });
    datasetId = new URL(page.url()).pathname.split("/").pop()!;
    await page.getByTestId("upload-input").setInputFiles(csv("lihat.csv", "K"));
    await expect(page.getByTestId("dataset-data-link")).toBeVisible({ timeout: 120_000 });
    await page.close();
    editorDashboard = String(
      node("scripts/dev-share-fixture.mjs", OWNER, EDITOR, "EDITOR", datasetId).dashboardId,
    );
    viewerDashboard = String(
      node("scripts/dev-share-fixture.mjs", OWNER, VIEWER, "VIEWER", datasetId).dashboardId,
    );
  });

  test.afterAll(async () => {
    await stopWorker(worker);
  });

  test("AC1: kepala kolom, nomor baris beku, format id-ID, status, dan tab sheet di bawah", async ({
    browser,
  }) => {
    const page = await pageFor(browser, OWNER);
    const errors = watchConsole(page);
    await page.goto(`/datasets/${datasetId}`);
    await page.getByTestId("dataset-data-link").click();
    await expect(page).toHaveURL(new RegExp(`/datasets/${datasetId}/data$`));
    await expect(page.getByRole("heading", { level: 1, name: "Lihat data" })).toBeVisible();

    // Huruf kolom + nama + tipe (teks pembaca layar) di kepala; kolom nomor baris beku di kiri.
    await expect(header(page, "c1")).toContainText("A");
    await expect(header(page, "c1")).toContainText("Kode");
    await expect(header(page, "c1").locator(".sr-only")).toHaveText(", Teks");
    await expect(header(page, "c2")).toContainText("B");
    await expect(header(page, "c4").locator(".sr-only")).toHaveText(", Tanggal");
    // aria-rowcount = 450 data + kepala + sentinel "Akhir data" (ADR-0007).
    await expect(grid(page).locator('[role="grid"]')).toHaveAttribute("aria-rowcount", "452");
    await expect(grid(page).locator('[role="grid"]')).toHaveAttribute(
      "aria-label",
      "Data sheet CSV",
    );
    const rownum = grid(page).locator(
      '.ag-row[row-index="0"] .ag-grid-pinned-left-cells [col-id="n"]',
    );
    await expect(cell(page, 0, "c1")).toHaveText("K1");
    await expect(rownum).toHaveText("1");

    // Format id-ID: ribuan, desimal koma, d Mmm yyyy, Ya/Tidak, NULL kosong, teks terpotong bertanda.
    await expect(cell(page, 0, "c1")).toHaveText("K1");
    await expect(cell(page, 0, "c2")).toHaveText("1.000");
    await expect(cell(page, 0, "c3")).toHaveText("1,25");
    await expect(cell(page, 0, "c4")).toHaveText("2 Mar 2026");
    await expect(cell(page, 0, "c5")).toHaveText("Ya");
    await expect(cell(page, 1, "c5")).toHaveText("Tidak");
    await expect(cell(page, 2, "c2")).toHaveText("");
    await expect(cell(page, 1, "c6")).toHaveText(`${"x".repeat(500)}…`);

    // Format tampilan Rupiah lewat menu kolom.
    await openMenu(page, "c2");
    await page.getByRole("menuitemradio", { name: "Rupiah" }).click();
    await expect(cell(page, 0, "c2")).toHaveText("Rp 1.000");

    // Status + tab sheet di bawah grid.
    await expect(page.getByTestId("grid-status-rows")).toHaveText(
      new RegExp(`^Baris 1–\\d+ dari ${ROWS}$`),
    );
    const tabs = page.getByRole("navigation", { name: "Sheet" });
    await expect(tabs.getByRole("link", { name: "CSV" })).toHaveAttribute("aria-current", "page");
    const g = (await grid(page).boundingBox())!;
    const t = (await tabs.boundingBox())!;
    expect(t.y).toBeGreaterThan(g.y + g.height - 1);

    // Ke baris 449 (blok kedua) + sentinel "Akhir data" setelah baris terakhir.
    await page.getByTestId("grid-goto-input").fill("449");
    await page.getByTestId("grid-goto-input").press("Enter");
    await expect(cell(page, 448, "c1")).toHaveText("K449");
    await page.keyboard.press("Control+End");
    await expect(cell(page, ROWS - 1, "c1")).toHaveText(`K${ROWS}`);
    await expect(
      grid(page).locator(`.ag-row[row-index="${ROWS}"] [col-id="n"]`).first(),
    ).toHaveText("Akhir data");
    await expect(page.getByTestId("grid-status-rows")).toHaveText(
      new RegExp(`^Baris \\d+–${ROWS} dari ${ROWS}$`),
    );
    expect(errors).toEqual([]);
    await page.close();
  });

  test("AC3: lebar, autofit, beku, sembunyi, dan geser pulih setelah dibuka lagi; tanpa localStorage tetap jalan", async ({
    browser,
  }) => {
    const page = await pageFor(browser, OWNER);
    await page.goto(`/datasets/${datasetId}/data`);
    await expect(cell(page, 0, "c1")).toHaveText("K1");

    await openMenu(page, "c2");
    await page.getByRole("menuitem", { name: /Bekukan sampai kolom ini/ }).click();
    await expect(
      grid(page).locator('.ag-header .ag-grid-pinned-left-cells [col-id="c2"]'),
    ).toBeVisible();
    // Kolom ke-4 tidak bisa dibekukan (≤ 3).
    await openMenu(page, "c5");
    await expect(page.getByRole("menuitem", { name: /Bekukan sampai kolom ini/ })).toBeDisabled();
    await page.keyboard.press("Escape");

    await openMenu(page, "c3");
    await page.getByRole("menuitem", { name: "Sembunyikan kolom" }).click();
    await expect(header(page, "c3")).toHaveCount(0);

    // Autofit kolom catatan (teks 500 karakter → lebar maksimum), lalu seret lebar kolom tanggal.
    const before = (await header(page, "c6").boundingBox())!.width;
    await openMenu(page, "c6");
    await page.getByRole("menuitem", { name: "Paskan lebar kolom" }).click();
    await expect.poll(async () => (await header(page, "c6").boundingBox())!.width).not.toBe(before);
    const handle = header(page, "c4").locator(".ag-header-cell-resize");
    const hb = (await handle.boundingBox())!;
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + hb.width / 2 + 90, hb.y + hb.height / 2, { steps: 5 });
    await page.mouse.up();
    const width4 = Math.round((await header(page, "c4").boundingBox())!.width);
    // Geser kolom E ke depan kolom D.
    await page.evaluate(() => {
      const g = (
        window as unknown as {
          __ddGrid: { api: { moveColumns: (c: string[], i: number) => void } };
        }
      ).__ddGrid;
      g.api.moveColumns(["c5"], 3);
    });
    const order = async () =>
      grid(page)
        .locator(".ag-header-cell[col-id]")
        .evaluateAll((els) => els.map((e) => e.getAttribute("col-id")));
    await expect.poll(order).toEqual(["n", "c1", "c2", "c5", "c4", "c6"]);
    await page.waitForTimeout(500); // simpan ber-debounce 300 ms

    await page.reload();
    await expect(cell(page, 0, "c1")).toHaveText("K1");
    await expect.poll(order).toEqual(["n", "c1", "c2", "c5", "c4", "c6"]);
    await expect(
      grid(page).locator('.ag-header .ag-grid-pinned-left-cells [col-id="c2"]'),
    ).toBeVisible();
    await expect(header(page, "c3")).toHaveCount(0);
    expect(Math.round((await header(page, "c4").boundingBox())!.width)).toBe(width4);
    await expect(page.getByTestId("grid-columns-button")).toContainText("1 disembunyikan");

    // Tampilkan lagi lewat menu Kolom → data kolom dimuat ulang.
    await page.getByTestId("grid-columns-button").click();
    await page.getByRole("checkbox", { name: /C\s*Harga/ }).check();
    await page.keyboard.press("Escape");
    await expect(cell(page, 0, "c3")).toHaveText("1,25");
    await page.close();

    // localStorage diblokir (mis. kebijakan browser): grid tetap memuat dan menu tetap jalan.
    const ctx = await browser.newContext({ storageState: undefined });
    await ctx.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new DOMException("diblokir", "SecurityError");
        },
      });
    });
    const blocked = await ctx.newPage();
    const { apiLogin } = await import("./helpers");
    await apiLogin(blocked, OWNER);
    await blocked.goto(`/datasets/${datasetId}/data`);
    await expect(cell(blocked, 0, "c1")).toHaveText("K1");
    await expect(header(blocked, "c3")).toBeVisible();
    await openMenu(blocked, "c1");
    await blocked.getByRole("menuitem", { name: /Bekukan sampai kolom ini/ }).click();
    await expect(
      grid(blocked).locator('.ag-header .ag-grid-pinned-left-cells [col-id="c1"]'),
    ).toBeVisible();
    await ctx.close();
  });

  test("Akses: editor membuka dari dashboard; viewer 404", async ({ browser }) => {
    const editor = await pageFor(browser, EDITOR);
    await editor.goto(`/dashboards/${editorDashboard}`);
    await editor.getByTestId("dashboard-data-link").click();
    await expect(editor).toHaveURL(new RegExp(`/datasets/${datasetId}/data$`));
    await expect(cell(editor, 0, "c1")).toHaveText("K1");
    await editor.close();

    const viewer = await pageFor(browser, VIEWER);
    const res = await viewer.goto(`/datasets/${datasetId}/data`);
    expect(res?.status()).toBe(404);
    await expect(viewer.getByTestId("sheet-grid")).toHaveCount(0);
    await viewer.close();
  });

  test.describe("Perbesar widget tabel (T-047)", () => {
    /** Kolom sheet di luar widget: tidak boleh pernah sampai ke viewer. */
    const OTHER = /Harga|Tanggal|Aktif|Catatan/;
    let sheetId = "";
    let versionId = "";

    /** Pemilik menambah widget tabel Kode + Jumlah ke dashboard lewat API (T-010/T-011). */
    async function addTable(browser: Browser, dashboardId: string) {
      const page = await pageFor(browser, OWNER);
      await page.goto(`/dashboards/${dashboardId}`);
      const origin = { Origin: new URL(page.url()).origin };
      const base = `/api/dashboards/${dashboardId}/widgets`;
      const add = await page.request.post(base, { headers: origin, data: { baseRevision: 0 } });
      expect(add.status(), await add.text()).toBe(200);
      const id = ((await add.json()) as { data: { widget: { id: string } } }).data.widget.id;
      const set = await page.request.patch(`${base}/${id}`, {
        headers: origin,
        data: {
          type: "table",
          title: "Tabel kode",
          spec: { sheetId, columns: [1, 2], format: { style: "auto", decimals: 0 } },
        },
      });
      expect(set.status(), await set.text()).toBe(200);
      await page.close();
    }

    test.beforeAll(async ({ browser }) => {
      const v = node("scripts/dev-upload-fixture.mjs", "latest", datasetId) as { id: string };
      versionId = v.id;
      const info = node("scripts/dev-upload-fixture.mjs", "ingest", v.id) as {
        sheets: { id: string }[];
      };
      sheetId = info.sheets[0]!.id;
      await addTable(browser, viewerDashboard);
      await addTable(browser, editorDashboard);
    });

    test("AC1: viewer → tabel layar penuh lewat /api/query {widgetId, page, sort}, hanya kolom widget, tanpa Lihat data", async ({
      browser,
    }) => {
      const viewer = await pageFor(browser, VIEWER);
      const bodies: Record<string, unknown>[] = [];
      const sheetCalls: string[] = [];
      const texts: Promise<string>[] = [];
      viewer.on("request", (r) => {
        if (r.url().includes("/api/sheets/")) sheetCalls.push(r.url());
        if (r.url().endsWith("/api/query"))
          bodies.push(r.postDataJSON() as Record<string, unknown>);
      });
      viewer.on("response", (r) => {
        if (r.url().endsWith("/api/query")) texts.push(r.text().catch(() => ""));
      });
      await viewer.goto(`/dashboards/${viewerDashboard}`);
      const card = viewer.getByTestId("widget").filter({ hasText: "Tabel kode" });
      await expect(card.getByTestId("widget-table")).toBeVisible();
      await card.getByRole("button", { name: "Perbesar Tabel kode" }).click();
      const big = viewer.getByTestId("widget-expanded");
      await expect(big.getByRole("heading", { name: "Tabel kode" })).toBeVisible();
      const table = big.getByTestId("widget-table");
      await expect(table.locator("thead th")).toHaveText(["Nomor baris", "Kode", "Jumlah"]);
      await expect(table.locator("tbody tr").first().locator("th, td")).toHaveText([
        "1",
        "K1",
        "1.000",
      ]);
      await expect(big.getByTestId("table-range")).toHaveText("Baris 1–100 dari 450");
      await expect(big.getByTestId("widget-expand-data-link")).toHaveCount(0);
      await expect(big.getByText("Buka di Lihat data")).toHaveCount(0);

      await big.getByRole("button", { name: "Halaman berikutnya" }).click();
      await expect(big.getByTestId("table-range")).toHaveText("Baris 101–200 dari 450");
      await expect(table.locator("tbody tr").first().locator("th, td")).toHaveText([
        "101",
        "K101",
        "101.000",
      ]);
      await table.getByRole("button", { name: "Jumlah" }).click();
      await table.getByRole("button", { name: "Jumlah" }).click();
      await expect(table.locator("thead th").nth(2)).toHaveAttribute("aria-sort", "descending");
      await expect(table.locator("tbody tr").first().locator("td").first()).toHaveText("K450");
      await expect(big.getByTestId("table-range")).toHaveText("Baris 1–100 dari 450");

      // Jalur widget saja: kunci body ⊆ {widgetId, dashboardFilters, page, sort}; tanpa endpoint sheet.
      expect(bodies.some((b) => b.page === 1)).toBe(true);
      expect(bodies.some((b) => JSON.stringify(b.sort) === '{"column":2,"dir":"desc"}')).toBe(true);
      for (const b of bodies) {
        expect(
          Object.keys(b).every((k) => ["widgetId", "dashboardFilters", "page", "sort"].includes(k)),
        ).toBe(true);
      }
      expect(sheetCalls).toEqual([]);
      for (const t of await Promise.all(texts)) expect(t).not.toMatch(OTHER);

      await viewer.keyboard.press("Escape");
      await expect(big).toHaveCount(0);
      await expect(card.getByRole("button", { name: "Perbesar Tabel kode" })).toBeFocused();
      await viewer.close();
    });

    test("AC2: viewer membuka URL Lihat data atau endpoint sheet langsung → ditolak tanpa nama kolom", async ({
      browser,
    }) => {
      const viewer = await pageFor(browser, VIEWER);
      const res = await viewer.goto(`/datasets/${datasetId}/data?sheetId=${sheetId}`);
      expect(res?.status()).toBe(404);
      expect(await viewer.content()).not.toMatch(OTHER);
      const origin = { Origin: new URL(viewer.url()).origin };
      const calls = [
        viewer.request.post(`/api/sheets/${sheetId}/rows`, {
          headers: origin,
          data: { versionId, rowStart: 0, rowCount: 10, cols: [1, 2, 3, 6] },
        }),
        viewer.request.post(`/api/sheets/${sheetId}/values`, {
          headers: origin,
          data: { versionId, pos: 6 },
        }),
        viewer.request.post(`/api/sheets/${sheetId}/stats`, {
          headers: origin,
          data: { versionId, pos: 3 },
        }),
        viewer.request.get(`/api/sheets/${sheetId}/cell?versionId=${versionId}&row=1&pos=6`),
      ];
      for (const r of await Promise.all(calls)) {
        expect(r.status()).toBe(403);
        expect(await r.text()).not.toMatch(/Harga|Tanggal|Aktif|Catatan|Kode|Jumlah|catatan \d/);
      }
      await viewer.close();
    });

    test("AC3: editor dan pemilik → Perbesar punya 'Buka di Lihat data' ke sheet widget", async ({
      browser,
    }) => {
      const editor = await pageFor(browser, EDITOR);
      await editor.goto(`/dashboards/${editorDashboard}`);
      const card = editor.getByTestId("widget").filter({ hasText: "Tabel kode" });
      await expect(card.getByTestId("widget-table")).toBeVisible();
      await card.getByRole("button", { name: "Perbesar Tabel kode" }).click();
      const big = editor.getByTestId("widget-expanded");
      await expect(big.getByTestId("widget-table").locator("tbody tr")).toHaveCount(100);
      const link = big.getByRole("link", { name: "Buka di Lihat data" });
      await expect(link).toHaveAttribute("href", `/datasets/${datasetId}/data?sheetId=${sheetId}`);
      await link.click();
      await expect(editor).toHaveURL(new RegExp(`/datasets/${datasetId}/data\\?sheetId=`));
      await expect(cell(editor, 0, "c1")).toHaveText("K1");
      await editor.close();

      // Pemilik juga (dashboard yang sama dengan viewer AC1).
      const owner = await pageFor(browser, OWNER);
      await owner.goto(`/dashboards/${viewerDashboard}`);
      const own = owner.getByTestId("widget").filter({ hasText: "Tabel kode" });
      await expect(own.getByTestId("widget-table")).toBeVisible();
      await own.getByRole("button", { name: "Perbesar Tabel kode" }).click();
      await expect(
        owner.getByTestId("widget-expanded").getByRole("link", { name: "Buka di Lihat data" }),
      ).toBeVisible();
      await owner.close();
    });
  });

  test("Sheet lebar 140 kolom (> 2 potongan × 64): blok dimuat tanpa 429/galat (review H1)", async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const WIDE = 140;
    const head = Array.from({ length: WIDE }, (_, j) => `Kol${j + 1}`).join(";");
    const lines = [head];
    for (let i = 1; i <= ROWS; i++) {
      lines.push(Array.from({ length: WIDE }, (_, j) => `r${i}c${j + 1}`).join(";"));
    }
    const path = join(dir, "lebar.csv");
    writeFileSync(path, `${lines.join("\n")}\n`);
    const page = await pageFor(browser, OWNER);
    await page.goto("/datasets/baru");
    await page.getByLabel("Nama dataset").fill(`Lebar ${Date.now()}`);
    await page.getByRole("button", { name: "Buat dataset" }).click();
    await expect(page).toHaveURL(/\/datasets\/[a-z0-9]{20,32}\?created=1$/, { timeout: 30_000 });
    const wideId = new URL(page.url()).pathname.split("/").pop()!;
    await page.getByTestId("upload-input").setInputFiles(path);
    await expect(page.getByTestId("dataset-data-link")).toBeVisible({ timeout: 120_000 });

    const statuses: number[] = [];
    page.on("response", (r) => {
      if (r.url().includes("/rows")) statuses.push(r.status());
    });
    await page.goto(`/datasets/${wideId}/data`);
    await expect(cell(page, 0, "c1")).toHaveText("r1c1");
    // Dua blok bersamaan (awal + lompat), masing-masing 3 potongan kolom.
    await page.getByTestId("grid-goto-input").fill("300");
    await page.getByTestId("grid-goto-input").press("Enter");
    await expect(cell(page, 299, "c1")).toHaveText("r300c1");
    await page.keyboard.press("Control+End");
    await expect(cell(page, ROWS - 1, "c1")).toHaveText(`r${ROWS}c1`);
    await page.evaluate(() => {
      const g = (
        window as unknown as { __ddGrid: { api: { ensureColumnVisible: (c: string) => void } } }
      ).__ddGrid;
      g.api.ensureColumnVisible("c140");
    });
    await expect(cell(page, ROWS - 1, "c140")).toHaveText(`r${ROWS}c140`);
    await page.evaluate(() => {
      const g = (
        window as unknown as { __ddGrid: { api: { ensureColumnVisible: (c: string) => void } } }
      ).__ddGrid;
      g.api.ensureColumnVisible("c70");
    });
    await expect(cell(page, ROWS - 1, "c70")).toHaveText(`r${ROWS}c70`);
    await expect(page.getByTestId("grid-load-error")).toHaveCount(0);
    expect(statuses.filter((s) => s !== 200)).toEqual([]);
    await page.close();
  });

  test("AC4: versi berganti saat menggulir → banner, tanpa baris dua versi; Muat ulang memuat versi baru", async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const page = await pageFor(browser, OWNER);
    await page.goto(`/datasets/${datasetId}/data`);
    await expect(cell(page, 0, "c1")).toHaveText("K1");

    // Versi baru diunggah di tab lain dan menjadi aktif.
    const other = await pageFor(browser, OWNER);
    await other.goto(`/datasets/${datasetId}`);
    await other.getByTestId("upload-input").setInputFiles(csv("lihat-baru.csv", "Z"));
    await expect(other.getByText('"lihat-baru.csv" terunggah.')).toBeVisible({ timeout: 60_000 });
    await other.close();
    await waitForActive(browser, "Z");

    // Menggulir ke blok yang belum dimuat → 409 → banner; tidak ada baris versi baru di grid lama.
    await page.getByTestId("grid-goto-input").fill("420");
    await page.getByTestId("grid-goto-input").press("Enter");
    await expect(page.getByTestId("grid-version-banner")).toBeVisible();
    await expect(page.getByTestId("grid-version-banner")).toContainText("Data sudah diperbarui");
    await expect(grid(page).locator('[col-id="c1"]', { hasText: /^Z\d+$/ })).toHaveCount(0);
    // Blok yang ditolak tidak diisi (bukan diisi dari versi lain).
    await expect(cell(page, 419, "c1")).toHaveText("");

    await page.getByRole("button", { name: "Muat ulang" }).click();
    await expect(cell(page, 0, "c1")).toHaveText("Z1");
    await expect(page.getByTestId("grid-version-banner")).toHaveCount(0);
    await page.close();
  });
});
