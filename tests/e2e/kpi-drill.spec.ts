import { execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import ExcelJS from "exceljs";
import { pageFor, registerAndVerify, startWorker, stopWorker, uniqueEmail } from "./helpers";

/*
 * v1.15.0 lewat UI sungguhan, pada dashboard contoh (T-zm9k: KPI "Total Kiriman", batang per Kota):
 *   T-43hv pembanding KPI — April 2026 (10+11+12 … per bulan: Jan 33, Feb 63, Mar 93, Apr 123) vs Maret,
 *     warna ▲ mengikuti penilaian, tahun lalu tanpa data, filter dashboard ikut menentukan periode;
 *   T-d5ev klik-tembus — tombol kategori di tabel data grafik membuka dialog baris Bandung (4 baris,
 *     kolom detail saja), "Saring dashboard dengan ini" = filter silang; viewer bisa membuka klik-tembus
 *     tetapi tidak membaca kolom di luar kolom detail, dan tidak bisa klik-tembus widget lain.
 */
test.describe.configure({ mode: "serial" });

const OWNER = uniqueEmail("tembus");
const VIEWER = uniqueEmail("tembus-v");
const TAG = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const NAME = `Tembus ${TAG}`;
const dir = mkdtempSync(join(tmpdir(), "dd-e2e-tembus-"));
const KPI = "Total Kiriman";
const BAR = "Total Kiriman per Kota";
const headers = { Origin: process.env.E2E_BASE_URL ?? "http://localhost:3100" };

let worker: ChildProcess | null = null;
let owner: Page;
let d = "";

async function workbook(): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Kiriman");
  ws.addRow(["Tanggal", "Kota", "Kiriman", "Catatan"]);
  const kota = ["Jakarta", "Bandung", "Surabaya"];
  for (let m = 1; m <= 4; m++) {
    for (const [i, k] of kota.entries())
      ws.addRow([new Date(Date.UTC(2026, m - 1, 10)), k, m * 10 + i, `rahasia-${k}-${m}`]);
  }
  const path = join(dir, "tembus.xlsx");
  await wb.xlsx.writeFile(path);
  return path;
}

const card = (page: Page, title: string) =>
  page
    .getByTestId("widget")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
const saved = (panel: Locator) =>
  expect(panel.getByTestId("config-status")).toHaveAttribute("data-state", "saved");
async function pick(page: Page, scope: Locator, label: string, option: string) {
  await scope.getByLabel(label, { exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
/** Aksi di panel lalu tunggu simpanan berjeda (PATCH widget) benar-benar selesai. */
async function savedAfter(page: Page, panel: Locator, action: () => Promise<void>) {
  const patch = page.waitForResponse(
    (r) => r.request().method() === "PATCH" && /\/widgets\/[a-z0-9]+$/.test(r.url()),
  );
  await action();
  expect((await patch).ok()).toBe(true);
  await saved(panel);
}
const AXE = readFileSync(join(process.cwd(), "node_modules/axe-core/axe.min.js"), "utf8");
/** Pelanggaran axe serius/kritis di halaman saat ini (disuntik lewat evaluate, lolos CSP). */
async function axeSerious(page: Page) {
  await page.evaluate(AXE);
  const v = await page.evaluate(async () => {
    const axe = (
      window as unknown as {
        axe: {
          run: (
            ctx: Document,
            opt: object,
          ) => Promise<{
            violations: { id: string; impact: string; nodes: { target: unknown[] }[] }[];
          }>;
        };
      }
    ).axe;
    const r = await axe.run(document, { resultTypes: ["violations"] });
    return r.violations.map((x) => ({
      id: x.id,
      impact: x.impact,
      targets: x.nodes.slice(0, 3).map((n) => JSON.stringify(n.target)),
    }));
  });
  return v.filter((x) => x.impact === "serious" || x.impact === "critical");
}
async function settings(page: Page, title: string): Promise<Locator> {
  await page.goto(`/dashboards/${d}?mode=edit`);
  await expect(page.locator("[data-testid=dashboard-canvas][data-hydrated]")).toHaveCount(1);
  await card(page, title).locator("[data-widget-settings]").click();
  const panel = page.getByTestId("widget-panel");
  await expect(panel).toBeVisible();
  return panel;
}

test.describe("pembanding KPI + klik-tembus (v1.15.0)", () => {
  test.beforeAll(async ({ browser, request }) => {
    test.setTimeout(300_000);
    execFileSync("node", ["scripts/dev-reset-ratelimit.mjs", "register:ip", "verify:ip"]);
    for (const email of [OWNER, VIEWER]) {
      const setup = await browser.newPage();
      await registerAndVerify(setup, request, email);
      await setup.close();
    }
    owner = await pageFor(browser, OWNER);
    await owner.setViewportSize({ width: 1440, height: 900 });
    worker = await startWorker("tembus");

    await owner.goto("/datasets/baru");
    await owner.getByLabel("Nama dataset").fill(`Dataset ${TAG}`);
    await owner.getByRole("button", { name: "Buat dataset" }).click();
    await expect(owner).toHaveURL(/\/datasets\/[a-z0-9]{20,32}\?created=1$/);
    const datasetId = new URL(owner.url()).pathname.split("/").pop()!;
    await owner.getByTestId("upload-input").setInputFiles(await workbook());
    await expect(owner.getByTestId("dataset-schema-link")).toBeVisible({ timeout: 120_000 });

    await owner.goto(`/dashboards/baru?dataset=${datasetId}`);
    await owner.getByLabel("Nama dashboard").fill(NAME);
    await owner.locator("#starter").check();
    await owner.getByRole("button", { name: "Buat dashboard" }).click();
    await expect(owner).toHaveURL(/\/dashboards\/[a-z0-9]{20,32}\?mode=edit$/);
    d = new URL(owner.url()).pathname.split("/").pop()!;
    await expect(card(owner, KPI)).toBeVisible({ timeout: 30_000 });
    await expect(card(owner, BAR)).toBeVisible();
  });

  test.afterAll(async () => {
    await stopWorker(worker);
    await owner?.context().close();
  });

  test("T-43hv: KPI bulan terakhir vs sebelumnya; warna ikut penilaian; tahun lalu tanpa data; filter ikut", async () => {
    test.setTimeout(120_000);
    const panel = await settings(owner, KPI);
    await pick(owner, panel, "Pembanding", "Periode sebelumnya");
    await expect(panel.getByLabel("Kolom tanggal", { exact: true })).toContainText("Tanggal");
    await expect(panel.getByLabel("Periode", { exact: true })).toContainText("Per bulan");
    await saved(panel);
    const kpi = card(owner, KPI);
    await expect(kpi.getByTestId("kpi-value")).toHaveText("123");
    const cmp = kpi.getByTestId("kpi-compare");
    await expect(cmp).toContainText(/▲ \+32,3\s?%/);
    await expect(cmp).toContainText("vs Mar 2026 (93)");
    await expect(cmp).toHaveAttribute("data-direction", "up");
    // Tanpa penilaian: netral.
    await expect(cmp.locator("[data-status]")).toHaveCount(0);

    await pick(owner, panel, "Penilaian warna", "Makin tinggi makin baik (mis. tepat waktu)");
    await saved(panel);
    await expect(cmp.locator("[data-status=good]")).toBeVisible();
    await expect(panel.getByTestId("config-tone-hint")).toContainText("▲/▼ pembanding");

    await pick(owner, panel, "Pembanding", "Periode sama tahun lalu");
    await expect(cmp).toHaveText(/Tidak ada data Apr 2025/);
    await saved(panel);
    await expect(cmp.locator("[data-status]")).toHaveCount(0);
    await pick(owner, panel, "Pembanding", "Periode sebelumnya");
    // Simpanan berjeda: tunggu kartu memakai pengaturan baru, baru status tersimpan.
    await expect(cmp).toContainText("vs Mar 2026 (93)");
    await saved(panel);

    // Mode lihat + filter Kota = Jakarta: Apr 40 vs Mar 30 (+33,3 %).
    const jakarta = JSON.stringify({
      filters: [{ column: "Kota", op: "in", values: ["Jakarta"] }],
    });
    await owner.goto(`/dashboards/${d}?f=${encodeURIComponent(jakarta)}`);
    await expect(kpi.getByTestId("kpi-value")).toHaveText("40");
    await expect(kpi.getByTestId("kpi-compare")).toContainText(/▲ \+33,3\s?%/);
    await expect(kpi.getByTestId("kpi-compare")).toContainText("vs Mar 2026 (30)");
  });

  test("T-d5ev: klik-tembus Bandung → baris detail (kolom pilihan); saring dashboard dari dialog", async () => {
    test.setTimeout(120_000);
    const panel = await settings(owner, BAR);
    await savedAfter(owner, panel, () => panel.getByTestId("widget-drill-switch").click());
    const cols = panel.getByTestId("config-drill-columns");
    await expect(cols.getByRole("checkbox", { name: "Kota" })).toBeChecked();
    await expect(cols.getByRole("checkbox", { name: "Kiriman" })).toBeChecked();
    await expect(cols.getByRole("checkbox", { name: "Catatan" })).not.toBeChecked();
    await savedAfter(owner, panel, () => cols.getByRole("checkbox", { name: "Tanggal" }).check());

    await owner.goto(`/dashboards/${d}`);
    const bar = card(owner, BAR);
    await bar.getByTestId("widget-data-toggle").click();
    const item = bar.locator("[data-testid=drill-item][data-value=Bandung]");
    await expect(item).toHaveAttribute("aria-haspopup", "dialog");
    await item.click();
    const dialog = owner.getByTestId("drill-dialog");
    await expect(dialog.getByRole("heading", { name: "Kota: Bandung" })).toBeVisible();
    const table = dialog.getByTestId("widget-table");
    await expect(table.locator("tbody tr")).toHaveCount(4);
    await expect(table.locator("thead")).toContainText("Tanggal");
    await expect(table.locator("thead")).not.toContainText("Catatan");
    await expect(table.locator("tbody")).not.toContainText("Jakarta");
    await expect(table.locator("tbody")).toContainText("41");

    // Esc menutup; fokus kembali ke tombol kategori.
    await owner.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(item).toBeFocused();

    // Filter silang dari dialog: KPI kini Bandung saja (Apr 41).
    await item.press("Enter");
    await dialog.getByTestId("drill-cross").click();
    await expect(dialog).toHaveCount(0);
    await expect(card(owner, KPI).getByTestId("kpi-value")).toHaveText("41");
    await item.click();
    await expect(dialog.getByTestId("drill-cross")).toContainText("Lepas saringan ini");
    await dialog.getByTestId("drill-cross").click();
    await expect(card(owner, KPI).getByTestId("kpi-value")).toHaveText("123");
  });

  test("ponsel 360 px: baris pembanding utuh, dialog baris detail layar penuh; axe tanpa pelanggaran serius", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const phone = await pageFor(browser, OWNER);
    await phone.setViewportSize({ width: 360, height: 740 });
    await phone.goto(`/dashboards/${d}`);
    const kpi = card(phone, KPI);
    const cmp = kpi.getByTestId("kpi-compare");
    await expect(cmp).toBeVisible();
    await cmp.scrollIntoViewIfNeeded();
    await expect(cmp).toBeInViewport({ ratio: 1 });
    // Utuh di dalam kartu (kartu memotong isi yang meluap).
    const [c, k] = [(await cmp.boundingBox())!, (await kpi.boundingBox())!];
    expect(c.y + c.height).toBeLessThanOrEqual(k.y + k.height);
    expect(c.x + c.width).toBeLessThanOrEqual(k.x + k.width);
    expect(await axeSerious(phone)).toEqual([]);
    const bar = card(phone, BAR);
    await bar.scrollIntoViewIfNeeded();
    await bar.getByTestId("widget-data-toggle").click();
    await bar.locator("[data-testid=drill-item][data-value=Jakarta]").click();
    const dialog = phone.getByTestId("drill-dialog");
    await expect(dialog.getByTestId("widget-table").locator("tbody tr")).toHaveCount(4);
    const box = (await dialog.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(360);
    // Tombol saring tetap terbaca pembaca layar walau labelnya disembunyikan di layar sempit.
    await expect(dialog.getByTestId("drill-cross")).toHaveAccessibleName(
      "Saring dashboard dengan ini",
    );
    expect(await axeSerious(phone)).toEqual([]);
    await phone.context().close();
  });

  test("T-d5ev: viewer membuka klik-tembus; widget tanpa klik-tembus dan nilai beda tipe ditolak", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    // Bagikan ke viewer (Hanya lihat).
    await owner.goto(`/dashboards/${d}`);
    await owner.getByTestId("share-open").click();
    const share = owner.getByTestId("share-dialog");
    await expect(share.getByTestId("share-search")).toBeVisible();
    await share.getByTestId("share-search").fill(VIEWER.split("@")[0]!);
    const option = share.getByTestId("share-option");
    await expect(option).toHaveCount(1);
    await option.click();
    await expect(share.getByTestId("share-role")).toContainText("Hanya lihat");
    await share.getByTestId("share-add").click();
    await expect(share.getByTestId("share-add-done")).toBeVisible();
    await share.getByRole("button", { name: "Selesai" }).click();

    const viewer = await pageFor(browser, VIEWER);
    await viewer.setViewportSize({ width: 1440, height: 900 });
    await viewer.goto(`/dashboards/${d}`);
    const bar = card(viewer, BAR);
    await bar.getByTestId("widget-data-toggle").click();
    await bar.locator("[data-testid=drill-item][data-value=Surabaya]").click();
    const table = viewer.getByTestId("drill-dialog").getByTestId("widget-table");
    await expect(table.locator("tbody tr")).toHaveCount(4);
    await expect(table.locator("thead")).not.toContainText("Catatan");
    await viewer.keyboard.press("Escape");

    // Langsung ke API: KPI tanpa klik-tembus dan angka untuk dimensi teks → INVALID, tanpa baris.
    const kpiId = await card(viewer, KPI).getAttribute("data-widget-id");
    const barId = await bar.getAttribute("data-widget-id");
    for (const body of [
      { widgetId: kpiId, drill: { value: "Bandung" } },
      { widgetId: barId, drill: { value: 7 } },
    ]) {
      const r = await viewer.request.post("/api/query", { headers, data: body });
      const j = (await r.json()) as { ok: boolean; code?: string; rows?: unknown };
      expect(r.status(), JSON.stringify(j)).toBe(400);
      expect(j).toMatchObject({ ok: false, code: "INVALID" });
      expect(j.rows).toBeUndefined();
    }
    await viewer.context().close();
  });
});
