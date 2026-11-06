import { execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import ExcelJS from "exceljs";
import { pageFor, registerAndVerify, startWorker, stopWorker, uniqueEmail } from "./helpers";

/*
 * Warna status (v1.7.0 + v1.8.0, T-f3tf) lewat panel sungguhan. Workbook 6 customer, Ongkir 100…600
 * (satu baris per customer) → rentang 100–600:
 *   Otomatis, makin tinggi makin baik: 500/600 Baik, 300/400 Sedang, 100/200 Perlu perhatian.
 *   Batas Baik ≥ 550, Perlu perhatian < 150: 600 Baik, 100 Perlu perhatian, sisanya Sedang.
 *   Template Tegas; legenda menyebut aturannya; halaman cetak (PDF) membawa warna yang sama.
 *   Grafik garis: petunjuk bahwa warna status ada di Batang/Pivot/Angka.
 */
test.describe.configure({ mode: "serial" });

const OWNER = uniqueEmail("status");
const TAG = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const dir = mkdtempSync(join(tmpdir(), "dd-e2e-status-"));
const TITLE = "Ongkir per customer";

let worker: ChildProcess | null = null;
let owner: Page;
let d = "";

async function workbook(): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Kiriman");
  ws.addRow(["Customer", "Ongkir", "Layanan"]);
  for (let c = 1; c <= 6; c++) ws.addRow([`Customer ${c}`, c * 100, "Darat"]);
  const path = join(dir, "status.xlsx");
  await wb.xlsx.writeFile(path);
  return path;
}

const card = (page: Page) =>
  page.getByTestId("widget").filter({ has: page.getByRole("heading", { name: TITLE }) });
const saved = (panel: Locator) =>
  expect(panel.getByTestId("config-status")).toHaveAttribute("data-state", "saved");
async function pick(page: Page, scope: Locator, label: string, option: string) {
  await scope.getByLabel(label, { exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
/** Status sel nilai per customer (urut label baris). */
async function statuses(table: Locator): Promise<Record<string, string | null>> {
  const rows = table.locator("tbody tr[data-kind=leaf]");
  const out: Record<string, string | null> = {};
  for (let i = 0; i < (await rows.count()); i++) {
    const r = rows.nth(i);
    out[(await r.locator("th").innerText()).trim()] = await r
      .locator("td")
      .first()
      .getAttribute("data-status");
  }
  return out;
}

test.describe("warna status (T-f3tf)", () => {
  test.beforeAll(async ({ browser, request }) => {
    test.setTimeout(300_000);
    execFileSync("node", ["scripts/dev-reset-ratelimit.mjs", "register:ip", "verify:ip"]);
    const setup = await browser.newPage();
    await registerAndVerify(setup, request, OWNER);
    await setup.close();
    owner = await pageFor(browser, OWNER);
    await owner.setViewportSize({ width: 1440, height: 900 });
    worker = await startWorker("status");

    await owner.goto("/datasets/baru");
    await owner.getByLabel("Nama dataset").fill(`Status ${TAG}`);
    await owner.getByRole("button", { name: "Buat dataset" }).click();
    await expect(owner).toHaveURL(/\/datasets\/[a-z0-9]{20,32}\?created=1$/);
    const datasetId = new URL(owner.url()).pathname.split("/").pop()!;
    await owner.getByTestId("upload-input").setInputFiles(await workbook());
    await expect(owner.getByTestId("dataset-schema-link")).toBeVisible({ timeout: 120_000 });

    await owner.goto(`/dashboards/baru?dataset=${datasetId}`);
    await owner.getByLabel("Nama dashboard").fill(`Status ${TAG}`);
    await owner.getByRole("button", { name: "Buat dashboard" }).click();
    await expect(owner).toHaveURL(/\/dashboards\/[a-z0-9]{20,32}\?mode=edit$/);
    d = new URL(owner.url()).pathname.split("/").pop()!;
  });

  test.afterAll(async () => {
    await stopWorker(worker);
    await owner?.context().close();
  });

  test("pivot: otomatis, template, lalu batas angka; legenda menjelaskan aturannya", async () => {
    test.setTimeout(120_000);
    await owner
      .getByTestId("canvas-toolbar")
      .getByRole("button", { name: "Tambah widget", exact: true })
      .click();
    const panel = owner.getByTestId("widget-panel");
    await panel.getByLabel("Judul", { exact: true }).fill(TITLE);
    await panel.getByLabel("Judul", { exact: true }).press("Enter");
    await panel.getByText("Pivot", { exact: true }).click();
    await saved(panel);
    const table = card(owner).getByTestId("widget-pivot");
    await expect(table.locator("tbody tr[data-kind=leaf]")).toHaveCount(6);

    // Tanpa penilaian: tidak ada warna dan tidak ada legenda.
    await expect(table.locator("[data-status]")).toHaveCount(0);
    await expect(card(owner).getByTestId("status-legend")).toHaveCount(0);

    await pick(owner, panel, "Penilaian warna", "Makin tinggi makin baik (mis. tepat waktu)");
    await saved(panel);
    // Fokus kembali ke pemicu pilihan (panel tidak dipasang ulang saat nilai tersimpan).
    await expect(panel.getByLabel("Penilaian warna", { exact: true })).toBeFocused();
    await expect
      .poll(() => statuses(table), { timeout: 20_000 })
      .toEqual({
        "Customer 6": "good",
        "Customer 5": "good",
        "Customer 4": "mid",
        "Customer 3": "mid",
        "Customer 2": "bad",
        "Customer 1": "bad",
      });
    // Status juga untuk pembaca layar, dan Total tidak diwarnai.
    await expect(table.locator("tbody tr[data-kind=leaf]").first().locator("td")).toContainText(
      "Baik",
    );
    await expect(table.locator("tfoot [data-status]")).toHaveCount(0);
    const legend = card(owner).getByTestId("status-legend");
    await expect(legend).toContainText("makin tinggi makin baik");
    await expect(legend).toContainText("dibanding nilai lain di widget ini");

    await pick(owner, panel, "Template warna", "Tegas");
    await saved(panel);
    // #00733C = Tegas, baik.
    await expect
      .poll(
        () =>
          table
            .locator("td[data-status=good]")
            .first()
            .evaluate((el) => getComputedStyle(el).backgroundColor),
        { timeout: 20_000 },
      )
      .toBe("rgb(0, 115, 60)");

    await pick(owner, panel, "Cara menentukan warna", "Pakai batas angka (mis. SLA, target)");
    await panel.getByTestId("config-target-good").fill("550");
    await panel.getByTestId("config-target-good").press("Tab");
    await expect(panel.getByTestId("config-target-bad")).toBeFocused();
    await panel.getByTestId("config-target-bad").fill("150");
    await panel.getByTestId("config-target-bad").press("Tab");
    await saved(panel);
    // Batas tersimpan → fokus tidak hilang ke <body>.
    await expect(owner.locator("body")).not.toBeFocused();
    await panel.getByTestId("config-target-good").fill("560");
    await panel.getByTestId("config-target-good").press("Tab");
    await expect(panel.getByTestId("config-target-bad")).toBeFocused();
    await saved(panel);
    await panel.getByTestId("config-target-good").fill("550");
    await panel.getByTestId("config-target-good").press("Tab");
    await saved(panel);
    await expect
      .poll(() => statuses(table), { timeout: 20_000 })
      .toEqual({
        "Customer 6": "good",
        "Customer 5": "mid",
        "Customer 4": "mid",
        "Customer 3": "mid",
        "Customer 2": "mid",
        "Customer 1": "bad",
      });
    await expect(legend).toContainText("Baik ≥ 550 · Perlu perhatian < 150");
    await expect(legend).not.toContainText("dibanding nilai lain");

    // Batas terbalik ditolak dengan pesan, simpanan lama tetap.
    await panel.getByTestId("config-target-good").fill("100");
    await panel.getByTestId("config-target-good").blur();
    await expect(panel.getByTestId("config-tone-hint")).toHaveText(
      "Batas Baik harus ≥ batas Perlu perhatian.",
    );
    await panel.getByTestId("config-target-good").fill("550");
    await panel.getByTestId("config-target-good").blur();

    // Ganti cara hitung (review v1.8.0 #1): arah + batas tetap tersimpan.
    await pick(owner, panel, "Hitung", "Rata-rata");
    await saved(panel);
    await expect(legend).toContainText("Baik ≥ 550 · Perlu perhatian < 150");
    await expect(panel.getByTestId("config-target-good")).toHaveValue("550");
  });

  test("halaman cetak (PDF) membawa warna dan legenda yang sama", async ({ browser }) => {
    test.setTimeout(180_000);
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
      const printed = page.getByTestId("print-widget").getByTestId("widget-pivot");
      await expect
        .poll(() => statuses(printed), { timeout: 20_000 })
        .toMatchObject({ "Customer 6": "good", "Customer 5": "mid" });
      await expect(page.getByTestId("status-legend")).toContainText("Baik ≥ 550");
    } finally {
      await ctx.close();
      execFileSync("node", ["scripts/dev-render-token.mjs", "close", exportId]);
    }
  });

  test("grafik garis: petunjuk bahwa warna status ada di Batang/Pivot/Angka", async () => {
    const panel = owner.getByTestId("widget-panel");
    await panel.getByText("Garis", { exact: true }).click();
    await expect(panel.getByTestId("config-tone-unavailable")).toBeVisible();
    await panel.getByText("Batang", { exact: true }).click();
    await expect(panel.getByLabel("Penilaian warna", { exact: true })).toBeVisible();
  });
});
