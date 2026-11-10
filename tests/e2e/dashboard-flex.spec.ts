import { execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import ExcelJS from "exceljs";
import { pageFor, registerAndVerify, startWorker, stopWorker, uniqueEmail } from "./helpers";

/*
 * v1.14.0 lewat UI sungguhan, pada dashboard contoh (widget + kolom filter otomatis, T-zm9k):
 *   T-fcar duplikat dashboard (menu Lainnya, nama usulan, nama ganda ditolak),
 *   T-nn87 mode TV (tanpa chrome aplikasi dan bilah filter, muat ulang otomatis dengan jam palsu, keluar),
 *   T-k6k0 cari cepat Ctrl+K (combobox, panah + Enter),
 *   T-tf88 tampilan tersimpan (simpan, pilih kembali, ganti nama, hapus).
 */
test.describe.configure({ mode: "serial" });

const OWNER = uniqueEmail("luwes");
const TAG = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const NAME = `Luwes ${TAG}`;
const dir = mkdtempSync(join(tmpdir(), "dd-e2e-luwes-"));
const JAKARTA = JSON.stringify({ filters: [{ column: "Kota", op: "in", values: ["Jakarta"] }] });

let worker: ChildProcess | null = null;
let owner: Page;
let d = "";
let widgetCount = 0;

async function workbook(): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Kiriman");
  ws.addRow(["Tanggal", "Kota", "Kiriman"]);
  const kota = ["Jakarta", "Bandung", "Surabaya"];
  for (let m = 1; m <= 4; m++) {
    for (const [i, k] of kota.entries())
      ws.addRow([new Date(Date.UTC(2026, m - 1, 10)), k, m * 10 + i]);
  }
  const path = join(dir, "luwes.xlsx");
  await wb.xlsx.writeFile(path);
  return path;
}

const more = (page: Page) => page.getByTestId("dashboard-more");

test.describe("dashboard lebih luwes (v1.14.0)", () => {
  test.beforeAll(async ({ browser, request }) => {
    test.setTimeout(300_000);
    execFileSync("node", ["scripts/dev-reset-ratelimit.mjs", "register:ip", "verify:ip"]);
    const setup = await browser.newPage();
    await registerAndVerify(setup, request, OWNER);
    await setup.close();
    owner = await pageFor(browser, OWNER);
    await owner.setViewportSize({ width: 1440, height: 900 });
    worker = await startWorker("luwes");

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
    await owner.goto(`/dashboards/${d}`);
    await expect(owner.getByTestId("widget").first()).toBeVisible({ timeout: 30_000 });
    widgetCount = await owner.getByTestId("widget").count();
    expect(widgetCount).toBeGreaterThan(1);
  });

  test.afterAll(async () => {
    await stopWorker(worker);
    await owner?.context().close();
  });

  test("T-fcar: duplikat dari menu Lainnya → salinan lengkap dengan nama usulan; nama ganda ditolak", async () => {
    await owner.goto(`/dashboards/${d}`);
    await more(owner).click();
    await owner.getByRole("menuitem", { name: "Duplikat dashboard…" }).click();
    const dialog = owner.getByTestId("duplicate-dialog");
    const name = dialog.getByLabel("Nama salinan");
    await expect(name).toHaveValue(`${NAME} (salinan)`);

    await name.fill(NAME);
    await dialog.getByRole("button", { name: "Duplikat", exact: true }).click();
    await expect(
      dialog.getByText("Dataset ini sudah punya dashboard dengan nama itu."),
    ).toBeVisible();
    await expect(name).toBeFocused();

    await name.fill(`${NAME} Bandung`);
    await dialog.getByRole("button", { name: "Duplikat", exact: true }).click();
    await expect(owner).not.toHaveURL(new RegExp(`/dashboards/${d}`));
    await expect(owner).toHaveURL(/\/dashboards\/[a-z0-9]{20,32}$/);
    await expect(owner.getByRole("heading", { level: 1, name: `${NAME} Bandung` })).toBeVisible();
    await expect(owner.getByTestId("widget")).toHaveCount(widgetCount, { timeout: 30_000 });
    await expect(owner.getByTestId("filter-bar")).toBeVisible();
  });

  test("T-nn87: mode TV tanpa chrome aplikasi; muat ulang otomatis mengambil ulang data; keluar kembali normal", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const tv = await pageFor(browser, OWNER);
    await tv.setViewportSize({ width: 1440, height: 900 });
    await tv.clock.install();
    await tv.goto(`/dashboards/${d}`);
    await expect(tv.getByTestId("widget").first()).toBeVisible({ timeout: 30_000 });
    await expect(tv.getByTestId("dashboard-canvas")).toHaveAttribute("data-hydrated", "");
    await more(tv).click();
    await tv.getByRole("menuitem", { name: "Mode TV (layar penuh)" }).click();
    await expect(tv).toHaveURL(/[?&]tv=1/);
    const bar = tv.getByTestId("tv-bar");
    await expect(bar.getByRole("heading", { level: 1, name: NAME })).toBeVisible();
    await expect(tv.getByTestId("sidebar")).toBeHidden();
    await expect(tv.getByTestId("filter-bar")).toHaveCount(0);
    // Mode TV tanpa pilihan tersimpan: 5 menit.
    await expect(bar.getByLabel("Muat ulang")).toHaveValue("5");
    await bar.getByLabel("Muat ulang").selectOption("1");

    let queries = 0;
    tv.on("request", (r) => {
      if (r.method() === "POST" && new URL(r.url()).pathname === "/api/query") queries++;
    });
    await tv.clock.fastForward("01:05");
    await expect.poll(() => queries, { timeout: 30_000 }).toBeGreaterThanOrEqual(widgetCount);
    await expect(tv.getByTestId("tv-updated")).toContainText("Diperbarui");

    await bar.getByRole("button", { name: "Keluar mode TV" }).click();
    await expect(tv).not.toHaveURL(/tv=1/);
    await expect(tv.getByTestId("sidebar")).toBeVisible();
    // Pilihan 1 menit diingat browser untuk dashboard ini.
    await expect(tv.getByTestId("refresh-status")).toContainText("tiap 1 menit");
    await more(tv).click();
    await tv.getByRole("menuitemradio", { name: "Mati" }).click();
    await expect(tv.getByTestId("refresh-status")).toHaveCount(0);
    await tv.context().close();
  });

  test("T-k6k0: Ctrl+K membuka cari cepat; panah + Enter membuka dashboard; Esc menutup", async () => {
    await owner.goto("/");
    await expect(owner.getByTestId("quick-search-trigger")).toHaveAttribute("data-ready", "");
    await owner.keyboard.press("Control+k");
    const dialog = owner.getByTestId("quick-search");
    await expect(dialog).toBeVisible();
    const input = owner.getByRole("combobox", { name: /Cari dashboard/ });
    await expect(input).toBeFocused();
    await input.fill(`${TAG} Bandung`);
    const option = owner.getByRole("option", { name: new RegExp(`${NAME} Bandung`) });
    await expect(option).toBeVisible();
    await expect(owner.getByTestId("quick-search-status")).toContainText("1 hasil");
    await input.press("Enter");
    await expect(owner.getByRole("heading", { level: 1, name: `${NAME} Bandung` })).toBeVisible();
    await expect(dialog).toBeHidden();

    await owner.getByTestId("quick-search-trigger").click();
    await input.fill("panduan");
    await expect(owner.getByRole("option", { name: "Panduan" })).toBeVisible();
    await input.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("T-tf88: simpan filter sebagai tampilan, pilih lagi, ganti nama, hapus", async () => {
    await owner.goto(`/dashboards/${d}?f=${encodeURIComponent(JAKARTA)}`);
    const trigger = owner.getByTestId("saved-views-trigger");
    await expect(trigger).toHaveText("Tampilan");
    await trigger.click();
    await owner.getByRole("menuitem", { name: "Simpan filter ini sebagai tampilan…" }).click();
    const save = owner.getByTestId("save-view-dialog");
    await save.getByLabel("Nama tampilan").fill("Jakarta saja");
    await save.getByLabel("Tampilan bersama").check();
    await save.getByRole("button", { name: "Simpan", exact: true }).click();
    await expect(save).toBeHidden();
    await expect(trigger).toHaveText("Tampilan: Jakarta saja");

    // Tanpa filter → pilih tampilan → filter kembali di URL (tautan bisa dibagikan).
    await owner.goto(`/dashboards/${d}`);
    await expect(trigger).not.toHaveText(/Jakarta/);
    await trigger.click();
    const menu = owner.getByTestId("saved-views-menu");
    await expect(menu.getByText("Tampilan bersama")).toBeVisible();
    await menu.getByRole("menuitem", { name: "Jakarta saja" }).click();
    await expect(owner).toHaveURL(/[?&]f=/);
    expect(new URL(owner.url()).searchParams.get("f")).toContain("Jakarta");
    await expect(trigger).toHaveText("Tampilan: Jakarta saja");
    await expect(owner.getByTestId("saved-views-announce")).toHaveText(
      "Tampilan “Jakarta saja” diterapkan.",
    );

    await trigger.click();
    await owner.getByRole("menuitem", { name: "Kelola tampilan…" }).click();
    const manage = owner.getByTestId("manage-views-dialog");
    const row = manage.getByTestId("manage-view-row");
    await row.getByRole("textbox").fill("Jakarta");
    await row.getByRole("button", { name: "Simpan nama" }).click();
    await expect(manage.getByText("Nama tampilan disimpan.")).toBeVisible();
    await expect(trigger).toHaveText("Tampilan: Jakarta");
    await row.getByRole("button", { name: "Hapus" }).click();
    await row.getByRole("button", { name: "Ya, hapus" }).click();
    await expect(manage.getByText("Tampilan “Jakarta” dihapus.")).toBeVisible();
    await manage.getByRole("button", { name: "Tutup" }).click();
    await expect(trigger).toHaveText("Tampilan");
  });
});
