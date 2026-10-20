import { execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import {
  apiLogin,
  pageFor,
  registerAndVerify,
  startWorker,
  stopWorker,
  uniqueEmail,
} from "./helpers";

/*
 * T-048 "Lihat data" untuk ponsel, keyboard, dan pembaca layar (rencana G-6 §3.7–3.8). Data sungguhan
 * (CSV 450 baris → worker → typed parquet). AC1: 360 px (tanpa gulir horizontal, hanya nomor baris
 * beku, "Lainnya", menu kolom/saring sebagai lembar bawah, ketuk sel = Isi sel, target ≥ 44 px).
 * AC2: semua tombol keyboard + cincin fokus. AC3 (bagian otomatis): role/aria-rowcount/colcount/
 * rowindex/aria-selected, status memuat diumumkan, axe tanpa pelanggaran serius/kritis. Uji NVDA/
 * VoiceOver manual (catatan task) tidak bisa diotomatisasi di sini.
 */
test.describe.configure({ mode: "serial" });

const OWNER = uniqueEmail("lihat-a11y");
const ROWS = 450;
const dir = mkdtempSync(join(tmpdir(), "dd-e2e-a11y-"));
let worker: ChildProcess | null = null;
let datasetId = "";
const AXE = readFileSync(join(process.cwd(), "node_modules/axe-core/axe.min.js"), "utf8");

function csv(): string {
  const lines = ["Kode;Jumlah;Tanggal;Kota;Catatan"];
  for (let i = 1; i <= ROWS; i++) {
    const city = ["Jakarta", "Bandung", "Surabaya"][i % 3];
    lines.push(`K${i};${i * 10};2026-03-${String((i % 28) + 1).padStart(2, "0")};${city};c ${i}`);
  }
  const path = join(dir, "a11y.csv");
  writeFileSync(path, `${lines.join("\n")}\n`);
  return path;
}

const grid = (page: Page) => page.getByTestId("sheet-grid");
const root = (page: Page) => grid(page).locator('[role="grid"]');
const cell = (page: Page, row: number, col: string) =>
  grid(page).locator(`.ag-row[row-index="${row}"] [col-id="${col}"]`).first();
const header = (page: Page, col: string) => grid(page).locator(`.ag-header-cell[col-id="${col}"]`);

async function openGrid(page: Page) {
  await page.goto(`/datasets/${datasetId}/data`);
  await expect(cell(page, 0, "c1")).toHaveText("K1", { timeout: 30_000 });
}

/** Sel/kepala yang memegang fokus DOM: {row, col} (row null = kepala kolom). */
const focused = (page: Page) =>
  page.evaluate(() => {
    const a = document.activeElement;
    const c = a?.closest("[col-id]");
    const r = a?.closest(".ag-row")?.getAttribute("row-index");
    return { row: r == null ? null : Number(r), col: c?.getAttribute("col-id") ?? null };
  });

/** Cincin fokus terlihat: outline ≥ 2px pada elemen terfokus (token --ring). */
const ringWidth = (page: Page) =>
  page.evaluate(() => {
    const a = document.activeElement as HTMLElement | null;
    const el = a?.closest<HTMLElement>(".ag-cell, .ag-header-cell") ?? a;
    if (!el) return 0;
    const s = getComputedStyle(el);
    return s.outlineStyle === "none" ? 0 : Number.parseFloat(s.outlineWidth);
  });

/** Pelanggaran axe berdampak serius/kritis (rule id + target) di halaman saat ini. */
async function axeSerious(page: Page) {
  // Disuntik lewat evaluate (CDP), bukan <script>: CSP nonce halaman tidak menghalangi.
  await page.evaluate(AXE);
  const v = await page.evaluate(async () => {
    const axe = (
      window as unknown as {
        axe: {
          run: (
            ctx: Document,
            opt: object,
          ) => Promise<{
            violations: {
              id: string;
              impact: string;
              nodes: { target: unknown[]; failureSummary?: string }[];
            }[];
          }>;
        };
      }
    ).axe;
    const r = await axe.run(document, { resultTypes: ["violations"] });
    return r.violations.map((x) => ({
      id: x.id,
      impact: x.impact,
      targets: x.nodes.slice(0, 3).map((n) => JSON.stringify(n.target)),
      summary: x.nodes[0]?.failureSummary ?? "",
    }));
  });
  return v.filter((x) => x.impact === "serious" || x.impact === "critical");
}

async function mobilePage(browser: Browser) {
  const ctx = await browser.newContext({
    viewport: { width: 360, height: 780 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await ctx.newPage();
  await apiLogin(page, OWNER);
  return page;
}

/** Kotak elemen ≥ 44 × 44 px (target sentuh, WCAG 2.5.5 / rencana §3.8). */
async function expectTouchTarget(l: Locator, name: string) {
  const b = await l.boundingBox();
  expect(b, name).not.toBeNull();
  expect(Math.round(b!.height), `${name} tinggi`).toBeGreaterThanOrEqual(44);
  expect(Math.round(b!.width), `${name} lebar`).toBeGreaterThanOrEqual(44);
}

const noHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

const pinnedHeaderCols = (page: Page) =>
  grid(page)
    .locator(".ag-header .ag-grid-pinned-left-cells .ag-header-cell[col-id]")
    .evaluateAll((els) => els.map((e) => e.getAttribute("col-id")));

test.describe("Lihat data: ponsel, keyboard, pembaca layar", () => {
  test.beforeAll(async ({ browser, request }) => {
    test.setTimeout(240_000);
    execFileSync("node", ["scripts/dev-reset-ratelimit.mjs", "register:ip"]);
    const p = await browser.newPage();
    await registerAndVerify(p, request, OWNER);
    await p.close();
    worker = await startWorker("data-view-a11y");
    const page = await pageFor(browser, OWNER);
    await page.goto("/datasets/baru");
    await page.getByLabel("Nama dataset").fill(`Lihat a11y ${Date.now()}`);
    await page.getByRole("button", { name: "Buat dataset" }).click();
    await expect(page).toHaveURL(/\/datasets\/[a-z0-9]{20,32}\?created=1$/, { timeout: 30_000 });
    datasetId = new URL(page.url()).pathname.split("/").pop()!;
    await page.getByTestId("upload-input").setInputFiles(csv());
    await expect(page.getByTestId("dataset-data-link")).toBeVisible({ timeout: 120_000 });
    await page.close();
    await stopWorker(worker);
    worker = null;
  });

  test.afterAll(async () => {
    await stopWorker(worker);
  });

  test("AC2: keyboard — panah, Tab, PageUp/Down, Home/End, Ctrl+Home/End, Alt+↓, F2/Enter, Ctrl+F, Shift+Spasi; fokus terlihat", async ({
    browser,
  }) => {
    const page = await pageFor(browser, OWNER);
    await openGrid(page);
    await cell(page, 0, "c1").click();
    expect(await focused(page)).toEqual({ row: 0, col: "c1" });
    expect(await ringWidth(page)).toBeGreaterThanOrEqual(2);

    // Panah.
    await page.keyboard.press("ArrowRight");
    expect(await focused(page)).toEqual({ row: 0, col: "c2" });
    await page.keyboard.press("ArrowDown");
    expect(await focused(page)).toEqual({ row: 1, col: "c2" });
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowUp");
    expect(await focused(page)).toEqual({ row: 0, col: "c1" });
    // Tab / Shift+Tab antar sel.
    await page.keyboard.press("Tab");
    expect(await focused(page)).toEqual({ row: 0, col: "c2" });
    await page.keyboard.press("Shift+Tab");
    expect(await focused(page)).toEqual({ row: 0, col: "c1" });
    // End / Home dalam baris.
    await page.keyboard.press("End");
    expect(await focused(page)).toEqual({ row: 0, col: "c5" });
    await page.keyboard.press("Home");
    expect(await focused(page)).toEqual({ row: 0, col: "n" });
    expect(await ringWidth(page)).toBeGreaterThanOrEqual(2);
    await page.keyboard.press("ArrowRight");
    // PageDown / PageUp.
    await page.keyboard.press("PageDown");
    const down = await focused(page);
    expect(down.col).toBe("c1");
    expect(down.row).toBeGreaterThan(5);
    await page.keyboard.press("PageUp");
    expect(await focused(page)).toEqual({ row: 0, col: "c1" });
    // Ctrl+End / Ctrl+Home (lewat jendela server).
    await page.keyboard.press("Control+End");
    await expect.poll(async () => (await focused(page)).row).toBe(ROWS - 1);
    await expect(cell(page, ROWS - 1, "c1")).toHaveText(`K${ROWS}`);
    await page.keyboard.press("Control+Home");
    await expect.poll(async () => (await focused(page)).row).toBe(0);

    // Kepala kolom: panah atas dari baris 1 → kepala terfokus dengan cincin.
    await page.keyboard.press("ArrowUp");
    expect(await focused(page)).toEqual({ row: null, col: "c1" });
    expect(await ringWidth(page)).toBeGreaterThanOrEqual(2);
    await page.keyboard.press("ArrowDown");
    expect(await focused(page)).toEqual({ row: 0, col: "c1" });

    // Alt+↓ → saring kolom; Escape → fokus kembali.
    await page.keyboard.press("Alt+ArrowDown");
    await expect(page.getByTestId("grid-filter-dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("grid-filter-dialog")).toBeHidden();
    await expect(cell(page, 0, "c1")).toBeFocused();

    // F2 dan Enter → Isi sel.
    const panel = page.getByTestId("grid-cell-panel");
    await page.keyboard.press("F2");
    await expect(panel).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(cell(page, 0, "c1")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(panel).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(cell(page, 0, "c1")).toBeFocused();

    // Shift+Spasi → baris dipilih (aria-selected nyata); Escape → lepas.
    await page.keyboard.press("Shift+Space");
    await expect(page.getByTestId("grid-selection")).toContainText("1 baris dipilih");
    const row0 = grid(page).locator('.ag-row[row-index="0"]');
    await expect(row0.first()).toHaveAttribute("aria-selected", "true");
    await expect(grid(page).locator('.ag-row[row-index="1"]').first()).toHaveAttribute(
      "aria-selected",
      "false",
    );
    await page.keyboard.press("Escape");
    await expect(row0.first()).toHaveAttribute("aria-selected", "false");

    // Ctrl+F → kotak Cari.
    await page.keyboard.press("Control+f");
    await expect(page.getByTestId("grid-search-input")).toBeFocused();
    await page.close();
  });

  test("AC3: role=grid, aria-rowcount/colcount/rowindex/selected, status memuat diumumkan, axe", async ({
    browser,
  }) => {
    const page = await pageFor(browser, OWNER);
    // Blok kedua (baris 201–400) sengaja lambat agar status memuat terdengar.
    await page.route("**/api/sheets/*/rows", async (route) => {
      const body = route.request().postDataJSON() as { rowStart: number };
      if (body.rowStart >= 200) await new Promise((r) => setTimeout(r, 1500));
      await route.continue().catch(() => {});
    });
    await openGrid(page);
    await expect(root(page)).toHaveAttribute("aria-label", "Data sheet CSV");
    // ADR-0007: + kepala + baris sentinel "Akhir data" (lihat catatan task T-048).
    await expect(root(page)).toHaveAttribute("aria-rowcount", String(ROWS + 2));
    await expect(root(page)).toHaveAttribute("aria-colcount", "6");
    await expect(root(page)).toHaveAttribute("aria-multiselectable", "true");
    await expect(grid(page).locator('.ag-row[row-index="0"]').first()).toHaveAttribute(
      "aria-rowindex",
      "2",
    );

    const announce = page.getByTestId("grid-announce");
    await page.getByTestId("grid-goto-input").fill("300");
    await page.getByTestId("grid-goto-input").press("Enter");
    await expect(announce).toHaveText("Memuat baris 201–400…");
    await expect(cell(page, 299, "c1")).toHaveText("K300");
    await expect(announce).toHaveText(/^(Baris 201–400 dimuat|Ke baris 300)$/);
    // aria-rowindex nyata = nomor baris + 1 (kepala), juga di kedalaman.
    await expect(grid(page).locator('.ag-row[row-index="299"]').first()).toHaveAttribute(
      "aria-rowindex",
      "301",
    );
    // Pilihan Shift+klik nomor baris → aria-selected pada baris (bagian beku + tengah).
    await grid(page).locator('.ag-row[row-index="299"] [col-id="n"]').click();
    await grid(page)
      .locator('.ag-row[row-index="301"] [col-id="n"]')
      .click({ modifiers: ["Shift"] });
    for (const r of [299, 300, 301]) {
      for (const el of await grid(page).locator(`.ag-row[row-index="${r}"]`).all()) {
        await expect(el).toHaveAttribute("aria-selected", "true");
      }
    }
    await expect(grid(page).locator('.ag-row[row-index="302"]').first()).toHaveAttribute(
      "aria-selected",
      "false",
    );

    expect(await axeSerious(page)).toEqual([]);
    // Dialog saring dan panel Isi sel terbuka juga lolos axe.
    await cell(page, 300, "c4").click();
    await page.keyboard.press("Alt+ArrowDown");
    await expect(page.getByTestId("grid-filter-dialog")).toBeVisible();
    expect(await axeSerious(page)).toEqual([]);
    await page.keyboard.press("Escape");
    await page.keyboard.press("F2");
    await expect(page.getByTestId("grid-cell-panel")).toBeVisible();
    expect(await axeSerious(page)).toEqual([]);
    await page.close();
  });

  test("AC1: 360 px — tanpa gulir horizontal, nomor baris saja yang beku, Lainnya, lembar bawah, ketuk sel, target 44 px", async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    // Kolom A dibekukan di desktop; di 360 px hanya nomor baris yang beku, lalu pulih di desktop.
    const desk = await pageFor(browser, OWNER);
    await openGrid(desk);
    await header(desk, "c1").hover();
    await header(desk, "c1")
      .getByRole("button", { name: /^Menu kolom/ })
      .click();
    await desk.getByRole("menuitem", { name: "Bekukan sampai kolom ini" }).click();
    await expect.poll(() => pinnedHeaderCols(desk)).toEqual(["n", "c1"]);
    await desk.setViewportSize({ width: 360, height: 780 });
    await expect.poll(() => pinnedHeaderCols(desk)).toEqual(["n"]);
    await desk.setViewportSize({ width: 1440, height: 900 });
    await expect.poll(() => pinnedHeaderCols(desk)).toEqual(["n", "c1"]);
    // Pengaturan disimpan tertunda 300 ms: tunggu pembekuan tersimpan sebelum muat ulang.
    await expect
      .poll(() =>
        desk.evaluate(() =>
          Object.keys(localStorage).some((k) => localStorage.getItem(k)?.includes('"pinned":true')),
        ),
      )
      .toBe(true);
    await desk.reload();
    await expect(cell(desk, 0, "c1")).toHaveText("K1", { timeout: 30_000 });
    await expect.poll(() => pinnedHeaderCols(desk)).toEqual(["n", "c1"]);
    await desk.close();

    const page = await mobilePage(browser);
    await openGrid(page);
    expect(await noHorizontalScroll(page)).toBe(true);
    await expect.poll(() => pinnedHeaderCols(page)).toEqual(["n"]);

    // Toolbar terlipat: hanya Cari + "Lainnya".
    await expect(page.getByTestId("grid-columns-button")).toBeHidden();
    await expect(page.getByTestId("grid-goto-input")).toBeHidden();
    const more = page.getByTestId("grid-more-button");
    for (const [l, n] of [
      [more, "Lainnya"],
      [page.getByTestId("grid-search-input"), "kotak Cari"],
      [page.getByTestId("grid-search").getByRole("button", { name: "Cari" }), "tombol Cari"],
      [header(page, "c1").getByRole("button", { name: /^Menu kolom/ }), "menu kolom"],
      [cell(page, 0, "c2"), "sel"],
      [cell(page, 0, "n"), "nomor baris"],
    ] as const) {
      await expectTouchTarget(l, n);
    }

    await more.tap();
    const sheet = page.getByTestId("grid-more-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("heading", { name: "Lainnya" })).toBeVisible();
    await expect(sheet.getByTestId("grid-export-button")).toBeVisible();
    await expect(sheet.getByText("Kolom yang ditampilkan")).toBeVisible();
    for (const [l, n] of [
      [sheet.getByRole("button", { name: "Tutup Lainnya" }), "tutup"],
      [sheet.getByTestId("grid-goto-input"), "Ke baris"],
      [sheet.getByRole("button", { name: "Buka" }), "Buka"],
      [sheet.getByTestId("grid-export-button"), "Unduh"],
      [sheet.getByTestId("grid-decimal-koma"), "Koma"],
      [sheet.locator("label").filter({ hasText: "Kode" }), "kolom Kode"],
    ] as const) {
      await expectTouchTarget(l, n);
    }
    expect(await axeSerious(page)).toEqual([]);
    await sheet.getByTestId("grid-goto-input").fill("120");
    await sheet.getByRole("button", { name: "Buka" }).tap();
    await expect(sheet).toBeHidden();
    await expect.poll(async () => (await focused(page)).row).toBe(119);

    // Menu kolom = lembar dari bawah selebar layar; tanpa "Bekukan"; urut berjalan.
    await header(page, "c1")
      .getByRole("button", { name: /^Menu kolom/ })
      .tap();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    const box = (await menu.boundingBox())!;
    expect(Math.round(box.x)).toBe(0);
    expect(Math.round(box.width)).toBe(360);
    expect(Math.round(box.y + box.height)).toBe(780);
    await expect(menu.getByRole("menuitem", { name: "Bekukan sampai kolom ini" })).toHaveCount(0);
    await expectTouchTarget(menu.getByRole("menuitemradio", { name: "Urutkan turun" }), "item");
    await menu.getByRole("menuitemradio", { name: "Urutkan turun" }).tap();
    await expect(header(page, "c1")).toHaveAttribute("aria-sort", "descending");
    await expect(cell(page, 0, "c1")).toHaveText("K99");

    // Saring juga di lembar bawah.
    await header(page, "c1")
      .getByRole("button", { name: /^Menu kolom/ })
      .tap();
    await page.getByRole("menuitem", { name: /Saring/ }).tap();
    const filter = page.getByTestId("grid-filter-dialog");
    await expect(filter).toBeVisible();
    const fb = (await filter.boundingBox())!;
    expect(Math.round(fb.y + fb.height)).toBe(780);
    await filter.getByRole("button", { name: "Tutup saringan" }).tap();

    // Ketuk sel → Isi sel (dengan Salin).
    await cell(page, 0, "c2").tap();
    const panel = page.getByTestId("grid-cell-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId("grid-cell-copy")).toBeVisible();
    await expectTouchTarget(panel.getByTestId("grid-cell-copy"), "Salin isi");
    await panel.getByRole("button", { name: "Tutup Isi sel" }).tap();
    await expect(panel).toBeHidden();

    expect(await noHorizontalScroll(page)).toBe(true);
    expect(await axeSerious(page)).toEqual([]);
    await page.close();
  });
});
