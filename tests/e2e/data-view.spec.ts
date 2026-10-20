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
    node("scripts/dev-share-fixture.mjs", OWNER, VIEWER, "VIEWER", datasetId);
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
