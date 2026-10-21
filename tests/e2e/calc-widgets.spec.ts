import { execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { apiLogin, registerAndVerify, startWorker, stopWorker, uniqueEmail } from "./helpers";

/*
 * T-069 editor field terhitung (project "widgets"): pemilik menyusun Margin = (Total Pendapatan −
 * Total Biaya) ÷ Total Pendapatan di pivot lewat token (tanpa SQL), galat sebelum simpan, pratinjau
 * teks + nilai contoh, format persen; ubah nama; grafik batang Laba yang ikut ke pai (aditif) dan pai
 * negatif memberi peringatan; KPI Margin; viewer melihat nilai sama tanpa editor; lalu hapus field di
 * pivot, grafik, KPI. 360 px: penyusun bisa dipakai keyboard, target ≥ 44 px, tanpa gulir horizontal.
 * E2E_SHOTS=<folder> menyimpan tangkapan layar editor untuk review desain.
 * Data: A 1000/600, B 2000/1500, C 500/100 → Margin A 40,0%, B 25,0%, C 80,0%, total 1300/3500 = 37,1%.
 */
test.describe.configure({ mode: "serial" });

const OWNER = uniqueEmail("calc-owner");
const VIEWER = uniqueEmail("calc-viewer");
const dir = mkdtempSync(join(tmpdir(), "dd-e2e-calc-"));
const PIVOT = "Margin per wilayah";
const CHART = "Laba per wilayah";
const KPI = "Margin total";
let worker: ChildProcess | null = null;
let dashboardId = "";
const SHOTS = process.env.E2E_SHOTS;

const card = (page: Page, title: string) =>
  page.getByTestId("widget").filter({ has: page.getByRole("heading", { name: title }) });

async function choose(scope: Locator, label: string, option: string | RegExp) {
  await scope.getByLabel(label, { exact: true }).click();
  await scope.page().getByRole("option", { name: option }).first().click();
}

async function addWidget(page: Page, title: string, type: string): Promise<Locator> {
  const before = await page.getByTestId("widget").count();
  await page
    .getByTestId("canvas-toolbar")
    .getByRole("button", { name: "Tambah widget", exact: true })
    .click();
  await expect(page.getByTestId("widget")).toHaveCount(before + 1);
  const panel = page.getByTestId("widget-panel");
  await expect(panel.getByRole("heading", { name: "Pengaturan widget" })).toBeFocused();
  await panel.getByLabel("Judul", { exact: true }).fill(title);
  await panel.getByLabel("Judul", { exact: true }).press("Enter");
  await expect(card(page, title)).toHaveCount(1);
  await panel.getByText(type, { exact: true }).click();
  await saved(panel);
  return panel;
}

const saved = (panel: Locator) =>
  expect(panel.getByTestId("config-status")).toHaveAttribute("data-state", "saved");

async function openSettings(page: Page, title: string): Promise<Locator> {
  const panel = page.getByTestId("widget-panel");
  // Klik sesaat setelah muat halaman kadang belum membuka panel (task T-z8y2): ulangi.
  await expect(async () => {
    await card(page, title)
      .getByRole("button", { name: /^Pengaturan/ })
      .click();
    await expect(panel.getByRole("heading", { name: "Pengaturan widget" })).toBeVisible({
      timeout: 2_000,
    });
  }).toPass({ timeout: 20_000 });
  return panel;
}

/** Tambah ukuran "Total <kolom>" ke rumus lewat pilihan Ukuran + kolom. */
async function addMeasure(editor: Locator, column: "Pendapatan" | "Biaya") {
  await choose(editor, "Ukuran", "Total");
  await choose(editor, "dari kolom", new RegExp(`^${column} ·`));
  await editor.getByTestId("calc-add-measure").click();
}
const opButton = (editor: Locator, symbol: string) =>
  editor.getByTestId("calc-operators").getByRole("button", { name: new RegExp(`^\\${symbol} `) });

test.describe("field terhitung (T-069)", () => {
  test.beforeAll(async ({ browser, request }) => {
    test.setTimeout(180_000);
    execFileSync("node", ["scripts/dev-reset-ratelimit.mjs", "register:ip", "verify:ip"]);
    const p = await browser.newPage();
    await registerAndVerify(p, request, OWNER);
    await registerAndVerify(p, request, VIEWER);
    await apiLogin(p, OWNER);
    worker = await startWorker("calc-widgets");
    const csv = join(dir, "laba-wilayah.csv");
    writeFileSync(
      csv,
      [
        "Wilayah;Pendapatan;Biaya",
        "Wilayah A;1000;600",
        "Wilayah B;2000;1500",
        "Wilayah C;500;100",
      ].join("\n"),
    );
    await p.goto("/datasets/baru");
    await p.getByLabel("Nama dataset").fill(`Laba wilayah ${Date.now()}`);
    await p.getByRole("button", { name: "Buat dataset" }).click();
    await expect(p).toHaveURL(/\/datasets\/[a-z0-9]{20,32}\?created=1$/);
    const datasetId = new URL(p.url()).pathname.split("/").pop()!;
    await p.getByTestId("upload-input").setInputFiles(csv);
    await expect(p.getByTestId("dataset-schema-link")).toBeVisible({ timeout: 90_000 });
    // Dashboard di dataset ini, dibagikan ke VIEWER (hanya lihat).
    dashboardId = (
      JSON.parse(
        execFileSync("node", [
          "scripts/dev-share-fixture.mjs",
          OWNER,
          VIEWER,
          "VIEWER",
          datasetId,
        ]).toString(),
      ) as { dashboardId: string }
    ).dashboardId;
    await p.close();
  });

  test.afterAll(async () => {
    await stopWorker(worker);
  });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("AC1/AC2/AC3: pivot — susun Margin dari token, galat sebelum simpan, pratinjau, format persen, ubah nama", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await apiLogin(page, OWNER);
    await page.goto(`/dashboards/${dashboardId}?mode=edit`);
    const panel = await addWidget(page, PIVOT, "Pivot");
    await panel.getByTestId("calc-add").click();
    const editor = panel.getByTestId("calc-editor");
    await expect(editor.getByRole("heading", { name: "Field terhitung baru" })).toBeFocused();
    // Tidak ada kotak rumus/SQL bebas: hanya nama field dan angka.
    await expect(editor.locator("textarea")).toHaveCount(0);
    await expect(editor.locator("input:visible")).toHaveCount(2);
    const save = editor.getByTestId("calc-save");
    await expect(save).toBeDisabled();

    await editor.getByTestId("calc-label").fill("Margin");
    await opButton(editor, "(").click();
    await addMeasure(editor, "Pendapatan");
    // Operator ganda: galat menunjuk token "×" lewat aria-describedby, Simpan nonaktif.
    await opButton(editor, "−").click();
    await opButton(editor, "×").click();
    const error = editor.getByTestId("calc-error");
    await expect(error).toHaveText(/Operator ganda/);
    if (SHOTS) await editor.screenshot({ path: join(SHOTS, "calc-editor-error-1440.png") });
    const tokens = editor.getByTestId("calc-token");
    const errorId = await error.getAttribute("id");
    await expect(tokens.nth(3)).toHaveAttribute("aria-describedby", errorId!);
    await expect(save).toBeDisabled();
    // Backspace pada token menghapusnya; fokus pindah ke token sebelumnya.
    await tokens.nth(3).focus();
    await tokens.nth(3).press("Backspace");
    await expect(tokens).toHaveCount(3);
    await expect(tokens.nth(2)).toBeFocused();

    await addMeasure(editor, "Biaya");
    // Kurung belum ditutup: pesan di token "(".
    await expect(error).toHaveText(/Kurung buka ini belum ditutup/);
    await expect(tokens.nth(0)).toHaveAttribute("aria-describedby", errorId!);
    await expect(save).toBeDisabled();
    await opButton(editor, ")").click();
    await opButton(editor, "÷").click();
    await expect(error).toHaveText(/belum selesai/);
    await addMeasure(editor, "Pendapatan");
    await expect(error).toHaveText("");

    await expect(editor.getByTestId("calc-preview-text")).toHaveText(
      "Margin = (Total Pendapatan − Total Biaya) ÷ Total Pendapatan",
    );
    // Nilai contoh total keseluruhan dari server (format widget otomatis), lalu format persen.
    await expect(editor.getByTestId("calc-sample-value")).toHaveText("0,37");
    await choose(editor, "Format nilai", "Persen (12%)");
    await expect(editor.getByTestId("calc-sample-value")).toHaveText("37,1%");
    await expect(save).toBeEnabled();
    await save.click();

    await expect(panel.getByTestId("calc-editor")).toHaveCount(0);
    // Fokus pindah ke "Ubah rumus" kartu baru (bukan ke <body>).
    await expect(panel.getByRole("button", { name: "Ubah rumus Margin" })).toBeFocused();
    await expect(panel.getByTestId("calc-formula")).toHaveText(
      "Margin = (Total Pendapatan − Total Biaya) ÷ Total Pendapatan",
    );
    await saved(panel);
    const pivot = card(page, PIVOT).getByTestId("widget-pivot");
    await expect(pivot.getByRole("columnheader", { name: "Margin" })).toBeVisible();
    await expect(pivot.getByRole("row", { name: /Wilayah A/ })).toContainText("40,0%");
    await expect(pivot.getByRole("row", { name: /Wilayah B/ })).toContainText("25,0%");
    await expect(pivot.getByRole("row", { name: /Wilayah C/ })).toContainText("80,0%");
    await expect(pivot.locator("tfoot")).toContainText("37,1%");

    // Ubah: ganti nama; rumus tetap; fokus kembali ke tombol "Ubah rumus".
    await panel.getByRole("button", { name: "Ubah rumus Margin" }).click();
    const again = panel.getByTestId("calc-editor");
    await expect(again.getByTestId("calc-token")).toHaveCount(7);
    await again.getByTestId("calc-label").fill("Margin kotor");
    await again.getByTestId("calc-save").click();
    await expect(panel.getByRole("button", { name: "Ubah rumus Margin kotor" })).toBeFocused();
    await saved(panel);
    await expect(pivot.getByRole("columnheader", { name: "Margin kotor" })).toBeVisible();
    await expect(pivot.locator("tfoot")).toContainText("37,1%");
  });

  test("AC3: grafik — Laba di batang, ikut ke pai (aditif), pai negatif diperingatkan, rasio tidak ke pai", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await apiLogin(page, OWNER);
    await page.goto(`/dashboards/${dashboardId}?mode=edit`);
    const panel = await addWidget(page, CHART, "Batang");
    await panel.getByRole("button", { name: "Pakai field terhitung" }).click();
    const editor = panel.getByTestId("calc-editor");
    await editor.getByTestId("calc-label").fill("Laba");
    await addMeasure(editor, "Pendapatan");
    await opButton(editor, "−").click();
    await addMeasure(editor, "Biaya");
    await expect(editor.getByTestId("calc-sample-value")).toHaveText("1.300");
    await editor.getByTestId("calc-save").click();
    await saved(panel);
    const data = card(page, CHART).getByTestId("chart-data");
    const values = () =>
      data
        .locator("tbody tr")
        .evaluateAll((trs) =>
          Object.fromEntries(
            trs.map((tr) => [
              tr.querySelector("th")!.textContent!,
              Number(tr.querySelector("td")!.dataset.value),
            ]),
          ),
        );
    await expect.poll(values).toEqual({ "Wilayah A": 400, "Wilayah B": 500, "Wilayah C": 400 });

    // Ke pai: rumus aditif ikut (T-068 L3).
    await panel.getByText("Pai", { exact: true }).click();
    await saved(panel);
    await expect(panel.getByTestId("calc-formula")).toHaveText(
      "Laba = Total Pendapatan − Total Biaya",
    );
    await expect(panel.getByTestId("config-calc-dropped")).toHaveCount(0);
    // Rumus berhasil negatif → pai memberi peringatan.
    await panel.getByRole("button", { name: "Ubah rumus Laba" }).click();
    const edit = panel.getByTestId("calc-editor");
    const tokens = edit.getByTestId("calc-token");
    await tokens.last().focus();
    for (let i = 0; i < 3; i++) await page.keyboard.press("Backspace");
    await expect(tokens).toHaveCount(0);
    await addMeasure(edit, "Biaya");
    await opButton(edit, "−").click();
    await addMeasure(edit, "Pendapatan");
    await edit.getByTestId("calc-label").fill("Rugi");
    await edit.getByTestId("calc-save").click();
    await saved(panel);
    await expect(card(page, CHART).getByTestId("pie-negative")).toBeVisible();
    // Rasio di pai ditolak sebelum simpan.
    await panel.getByRole("button", { name: "Ubah rumus Rugi" }).click();
    await opButton(edit, "÷").click();
    await addMeasure(edit, "Pendapatan");
    await expect(edit.getByTestId("calc-error")).toHaveText(/pai hanya untuk rumus/);
    await expect(edit.getByTestId("calc-save")).toBeDisabled();
    await edit.getByRole("button", { name: "Batal" }).click();

    // Kembali ke batang: rumus tetap.
    await panel.getByText("Batang", { exact: true }).click();
    await saved(panel);
    await expect(panel.getByTestId("calc-formula")).toHaveText(
      "Rugi = Total Biaya − Total Pendapatan",
    );
  });

  test("AC3: KPI — Margin persen; ganti ke tabel diberi tahu, kembali ke KPI rumus utuh", async ({
    page,
  }) => {
    await apiLogin(page, OWNER);
    await page.goto(`/dashboards/${dashboardId}?mode=edit`);
    const panel = await addWidget(page, KPI, "Angka");
    await panel.getByRole("button", { name: "Pakai field terhitung" }).click();
    const editor = panel.getByTestId("calc-editor");
    await editor.getByTestId("calc-label").fill("Margin");
    await opButton(editor, "(").click();
    await addMeasure(editor, "Pendapatan");
    await opButton(editor, "−").click();
    await addMeasure(editor, "Biaya");
    await opButton(editor, ")").click();
    await opButton(editor, "÷").click();
    await addMeasure(editor, "Pendapatan");
    await choose(editor, "Format nilai", "Persen (12%)");
    await expect(editor.getByTestId("calc-sample-value")).toHaveText("37,1%");
    await editor.getByTestId("calc-save").click();
    await saved(panel);
    await expect(panel.getByLabel("Tampilkan sebagai", { exact: true })).toHaveCount(0);
    await expect(card(page, KPI).getByTestId("kpi-value")).toHaveText("37,1%");

    await panel.getByText("Tabel", { exact: true }).click();
    await expect(panel.getByTestId("config-calc-dropped")).toContainText("“Margin”");
    await saved(panel);
    await panel.getByText("Angka", { exact: true }).click();
    await saved(panel);
    await expect(card(page, KPI).getByTestId("kpi-value")).toHaveText("37,1%");
  });

  test("AC5: viewer melihat nilai yang sama dan tidak bisa membuka editor ekspresi", async ({
    page,
  }) => {
    await apiLogin(page, VIEWER);
    await page.goto(`/dashboards/${dashboardId}`);
    const pivot = card(page, PIVOT).getByTestId("widget-pivot");
    await expect(pivot.getByRole("columnheader", { name: "Margin kotor" })).toBeVisible();
    await expect(pivot.getByRole("row", { name: /Wilayah A/ })).toContainText("40,0%");
    await expect(pivot.locator("tfoot")).toContainText("37,1%");
    await expect(card(page, KPI).getByTestId("kpi-value")).toHaveText("37,1%");
    await expect(
      page.getByTestId("widget").getByRole("button", { name: /^Pengaturan/ }),
    ).toHaveCount(0);
    await expect(page.getByTestId("calc-editor")).toHaveCount(0);
    // Mode edit lewat URL tidak membuka panel untuk viewer.
    await page.goto(`/dashboards/${dashboardId}?mode=edit`);
    await expect(card(page, KPI).getByTestId("kpi-value")).toHaveText("37,1%");
    await expect(page.getByTestId("widget-panel")).toHaveCount(0);
    await expect(page.getByTestId("calc-add")).toHaveCount(0);
  });

  test("AC4: 360 px — penyusun dengan keyboard, target ≥ 44 px, tanpa gulir horizontal", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await apiLogin(page, OWNER);
    await page.goto(`/dashboards/${dashboardId}?mode=edit`);
    const panel = await openSettings(page, KPI);
    const edit = panel.getByRole("button", { name: "Ubah rumus Margin" });
    await edit.focus();
    await page.keyboard.press("Enter");
    const editor = panel.getByTestId("calc-editor");
    await expect(editor.getByRole("heading", { name: "Ubah field terhitung" })).toBeFocused();
    // Tab dari judul → nama field → token (satu tab-stop) → operator.
    await page.keyboard.press("Tab");
    await expect(editor.getByTestId("calc-label")).toBeFocused();
    await page.keyboard.press("Tab");
    const tokens = editor.getByTestId("calc-token");
    await expect(tokens.last()).toBeFocused();
    await page.keyboard.press("Home");
    await expect(tokens.first()).toBeFocused();
    await page.keyboard.press("End");
    await page.keyboard.press("Backspace");
    await expect(tokens).toHaveCount(6);
    await expect(editor.getByTestId("calc-error")).toHaveText(/belum selesai/);
    // Tab ke tombol operator, lalu ke "Tambah …" ukuran: Enter memakai tombol.
    await editor.getByTestId("calc-add-measure").focus();
    await page.keyboard.press("Enter");
    await expect(tokens).toHaveCount(7);
    await expect(editor.getByTestId("calc-error")).toHaveText("");

    if (SHOTS) {
      await editor.screenshot({ path: join(SHOTS, "calc-editor-360.png") });
      await page.screenshot({ path: join(SHOTS, "calc-panel-360.png"), fullPage: true });
    }
    for (const b of await editor.getByRole("button").all()) {
      if (!(await b.isVisible())) continue;
      const box = (await b.boundingBox())!;
      expect(box.height, await b.innerText()).toBeGreaterThanOrEqual(44);
    }
    const overflow = await page.evaluate(() => {
      const root = document.scrollingElement!;
      const ed = document.querySelector<HTMLElement>("[data-testid=calc-editor]")!;
      return {
        page: root.scrollWidth - root.clientWidth,
        editor: ed.scrollWidth - ed.clientWidth,
        right: ed.getBoundingClientRect().right - window.innerWidth,
      };
    });
    expect(overflow.page).toBeLessThanOrEqual(0);
    expect(overflow.editor).toBeLessThanOrEqual(0);
    expect(overflow.right).toBeLessThanOrEqual(0);
    await editor.getByRole("button", { name: "Batal" }).click();
    await expect(edit).toBeFocused();
  });

  test("hapus field terhitung di pivot, grafik, dan KPI", async ({ page }) => {
    test.setTimeout(90_000);
    await apiLogin(page, OWNER);
    await page.goto(`/dashboards/${dashboardId}?mode=edit`);
    let panel = await openSettings(page, PIVOT);
    await panel.getByRole("button", { name: "Hapus nilai 2" }).click();
    // Satu nilai tersisa: fokus ke pilihan "Hitung"-nya.
    await expect(panel.getByLabel("Hitung", { exact: true })).toBeFocused();
    await saved(panel);
    await expect(panel.getByTestId("calc-formula")).toHaveCount(0);
    const pivot = card(page, PIVOT).getByTestId("widget-pivot");
    await expect(pivot.getByRole("columnheader", { name: "Margin kotor" })).toHaveCount(0);

    panel = await openSettings(page, CHART);
    await panel.getByRole("button", { name: "Kembali ke ukuran biasa" }).click();
    await saved(panel);
    await expect(panel.getByRole("button", { name: "Pakai field terhitung" })).toBeFocused();
    await expect(panel.getByLabel("dari kolom", { exact: true })).toContainText("Pendapatan");

    panel = await openSettings(page, KPI);
    await panel.getByRole("button", { name: "Kembali ke ukuran biasa" }).click();
    await saved(panel);
    await expect(card(page, KPI).getByTestId("kpi-value")).toHaveText("3.500");
  });
});
