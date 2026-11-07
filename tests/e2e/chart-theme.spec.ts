import { execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import ExcelJS from "exceljs";
import { pageFor, registerAndVerify, startWorker, stopWorker, uniqueEmail } from "./helpers";

/*
 * v1.10.0 lewat panel sungguhan. Workbook 6 bulan (Jan–Jun 2026), Kiriman 100…600 (naik 100 per bulan):
 *   Batang berdimensi tanggal otomatis tegak; Mendatar/Tegak manual; Garis tren lurus "naik … per bulan"
 *   hanya di sumbu waktu; tema grafik dashboard mengganti --chart-1… di layar, setelah muat ulang, dan di
 *   halaman cetak (PDF); panel menjelaskan Penilaian warna; halaman Yang baru + titik penanda.
 */
test.describe.configure({ mode: "serial" });

const OWNER = uniqueEmail("tema");
const TAG = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const dir = mkdtempSync(join(tmpdir(), "dd-e2e-tema-"));
const TITLE = "Kiriman per bulan";
// Ramah buta warna, terang (globals.css [data-palette="cvd"]).
const CVD_1 = "202 100% 35%";

let worker: ChildProcess | null = null;
let owner: Page;
let d = "";

async function workbook(): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Kiriman");
  ws.addRow(["Tanggal", "Kiriman", "Layanan"]);
  for (let m = 1; m <= 6; m++) ws.addRow([new Date(Date.UTC(2026, m - 1, 15)), m * 100, "Darat"]);
  const path = join(dir, "tema.xlsx");
  await wb.xlsx.writeFile(path);
  return path;
}

const card = (page: Page) =>
  page.getByTestId("widget").filter({ has: page.getByRole("heading", { name: TITLE }) });
const saved = (panel: Locator) =>
  expect(panel.getByTestId("config-status")).toHaveAttribute("data-state", "saved");
async function pick(page: Page, scope: Locator, label: string, option: string | RegExp) {
  await scope.getByLabel(label, { exact: true }).click();
  await page
    .getByRole(
      "option",
      typeof option === "string" ? { name: option, exact: true } : { name: option },
    )
    .click();
}
const chartVar = (canvas: Locator) =>
  canvas.evaluate((el) => getComputedStyle(el).getPropertyValue("--chart-1").trim());

test.describe("tema grafik, arah batang, garis tren, Yang baru (v1.10.0)", () => {
  test.beforeAll(async ({ browser, request }) => {
    test.setTimeout(300_000);
    execFileSync("node", ["scripts/dev-reset-ratelimit.mjs", "register:ip", "verify:ip"]);
    const setup = await browser.newPage();
    await registerAndVerify(setup, request, OWNER);
    await setup.close();
    owner = await pageFor(browser, OWNER);
    await owner.setViewportSize({ width: 1440, height: 900 });
    worker = await startWorker("tema");

    await owner.goto("/datasets/baru");
    await owner.getByLabel("Nama dataset").fill(`Tema ${TAG}`);
    await owner.getByRole("button", { name: "Buat dataset" }).click();
    await expect(owner).toHaveURL(/\/datasets\/[a-z0-9]{20,32}\?created=1$/);
    const datasetId = new URL(owner.url()).pathname.split("/").pop()!;
    await owner.getByTestId("upload-input").setInputFiles(await workbook());
    await expect(owner.getByTestId("dataset-schema-link")).toBeVisible({ timeout: 120_000 });

    await owner.goto(`/dashboards/baru?dataset=${datasetId}`);
    await owner.getByLabel("Nama dashboard").fill(`Tema ${TAG}`);
    await owner.getByRole("button", { name: "Buat dashboard" }).click();
    await expect(owner).toHaveURL(/\/dashboards\/[a-z0-9]{20,32}\?mode=edit$/);
    d = new URL(owner.url()).pathname.split("/").pop()!;
  });

  test.afterAll(async () => {
    await stopWorker(worker);
    await owner?.context().close();
  });

  test("batang bertanggal otomatis tegak; Mendatar/Tegak manual; garis tren hanya di sumbu waktu", async () => {
    test.setTimeout(120_000);
    await owner
      .getByTestId("canvas-toolbar")
      .getByRole("button", { name: "Tambah widget", exact: true })
      .click();
    const panel = owner.getByTestId("widget-panel");
    await panel.getByLabel("Judul", { exact: true }).fill(TITLE);
    await panel.getByLabel("Judul", { exact: true }).press("Enter");
    await panel.getByText("Batang", { exact: true }).click();
    await saved(panel);
    await pick(owner, panel, "Kelompokkan menurut", /^Tanggal ·/);
    await saved(panel);
    const canvas = card(owner).getByTestId("chart-canvas");
    await expect(canvas).toHaveAttribute("data-orientation", "vertical", { timeout: 20_000 });
    await expect(panel.getByLabel("Arah batang", { exact: true })).toContainText("Otomatis (tegak");

    await pick(owner, panel, "Arah batang", "Mendatar");
    await saved(panel);
    await expect(canvas).toHaveAttribute("data-orientation", "horizontal");
    // Mendatar: bukan sumbu waktu → tidak ada pilihan tren.
    await expect(panel.getByLabel("Garis tren", { exact: true })).toHaveCount(0);

    await pick(owner, panel, "Arah batang", "Tegak (kolom)");
    await saved(panel);
    await expect(canvas).toHaveAttribute("data-orientation", "vertical");
    await pick(owner, panel, "Garis tren", "Garis tren (lurus)");
    await saved(panel);
    await expect(canvas).toHaveAttribute("data-trend", "linear");
    await expect(card(owner).getByTestId("chart-trend")).toHaveText(
      "Tren: naik 100 per bulan (garis putus-putus)",
    );

    await pick(owner, panel, "Garis tren", "Rata-rata 3 periode");
    await saved(panel);
    await expect(card(owner).getByTestId("chart-trend")).toHaveText(
      "Rata-rata 3 periode (garis putus-putus)",
    );
  });

  test("tema grafik dashboard: semua grafik ikut, tersimpan, dan ikut ke halaman cetak", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const canvas = card(owner).getByTestId("chart-canvas");
    const before = await chartVar(canvas);
    expect(before).not.toBe(CVD_1);

    await owner.getByTestId("dashboard-colors").click();
    const pop = owner.getByTestId("dashboard-colors-panel");
    await expect(pop.getByTestId("dashboard-colors-hint")).toContainText("Penilaian warna");
    const savedColors = owner.waitForResponse(
      (r) => r.request().method() === "PATCH" && r.url().endsWith(`/api/dashboards/${d}/colors`),
    );
    await pick(owner, pop, "Tema grafik", "Ramah buta warna");
    expect((await savedColors).status()).toBe(200);
    await owner.keyboard.press("Escape");
    await expect.poll(() => chartVar(canvas), { timeout: 20_000 }).toBe(CVD_1);

    await owner.reload();
    await expect
      .poll(() => chartVar(card(owner).getByTestId("chart-canvas")), { timeout: 30_000 })
      .toBe(CVD_1);

    const { token, exportId } = JSON.parse(
      execFileSync("node", ["scripts/dev-render-token.mjs", "mint", OWNER, d]).toString(),
    ) as { token: string; exportId: string };
    const ctx = await browser.newContext({ viewport: { width: 1047, height: 740 } });
    try {
      const page = await ctx.newPage();
      await page.emulateMedia({ media: "print" });
      expect((await page.goto(`/render/${token}`))?.status()).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("data-render-ready", "1", {
        timeout: 120_000,
      });
      const printed = page.getByTestId("print-widget").getByTestId("chart-canvas").first();
      await expect.poll(() => chartVar(printed), { timeout: 20_000 }).toBe(CVD_1);
      await expect(printed).toHaveAttribute("data-trend", "ma3");
    } finally {
      await ctx.close();
      execFileSync("node", ["scripts/dev-render-token.mjs", "close", exportId]);
    }
  });

  test("klik batang tegak menyaring menurut periode yang diklik (review v1.10.0 #1)", async () => {
    await owner.goto(`/dashboards/${d}`);
    const canvas = card(owner).getByTestId("chart-canvas");
    await expect(canvas).toHaveAttribute("data-orientation", "vertical");
    await expect(owner.getByTestId("cross-filter-chip")).toHaveCount(0);
    const box = (await canvas.boundingBox())!;
    // Batang terakhir (Jun 2026, tertinggi) di kanan; klik bagian bawahnya (di dalam batang).
    await owner.mouse.click(box.x + box.width * 0.9, box.y + box.height * 0.8);
    const chip = owner.getByTestId("cross-filter-chip");
    await expect(chip).toBeVisible();
    await expect(chip).toContainText("Jun 2026");
    await owner.getByTestId("cross-filter-clear").click();
    await expect(chip).toHaveCount(0);
  });

  test("Yang baru: titik penanda sampai halaman dibuka; versi di footer menautkan ke sana", async () => {
    await owner.goto(`/dashboards/${d}`);
    const link = owner.getByTestId("whats-new-link");
    await expect(link.getByTestId("whats-new-dot")).toBeVisible();
    await expect(link).toHaveAccessibleName("Yang baru (ada pembaruan)");
    await link.click();
    await expect(owner).toHaveURL(/\/yang-baru$/);
    await expect(owner.getByRole("heading", { level: 1, name: "Yang baru" })).toBeVisible();
    await expect(owner.getByTestId("whats-new-list")).toContainText("Versi 1.10");
    await expect(owner.getByTestId("whats-new-dot")).toHaveCount(0);
    await expect(owner.getByTestId("whats-new-link")).toHaveAccessibleName("Yang baru");
    await expect(owner.getByTestId("app-version-link")).toHaveAttribute("href", "/yang-baru");
  });
});
