import { execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  apiLogin,
  pageFor,
  registerAndVerify,
  startWorker,
  stopWorker,
  uniqueEmail,
} from "./helpers";

/*
 * T-074 UI pivot tersimpan (project "widgets"): pemilik membuat pivot tersimpan di halaman dataset,
 * mengikat widget pivot + batang + KPI lewat "Sumber data" di panel, mengubah pivot tersimpan (konfirmasi
 * dampak) → ketiganya berubah; revisi basi → konflik + Muat ulang; hapus diblokir selama dipakai;
 * "Lepas dari sumber" menyalin spec; editor dashboard bisa mengikat tetapi tidak mengubah (definisi
 * baca-saja, halaman ubah 404); viewer hanya melihat nilai. Lebar 360 px tanpa gulir horizontal.
 * T-c6z4: editor pivot tersimpan menampilkan tabel pivot pratinjau (mode pemilik { datasetId, pivot })
 * yang sama dengan widget terikat dan memuat ulang saat nilai diubah; editor/viewer → 404.
 * Data: Pendapatan 1000+2000+500 = 3.500; Biaya 600+1500+100 = 2.200.
 */
test.describe.configure({ mode: "serial" });

const OWNER = uniqueEmail("sp-owner");
const EDITOR = uniqueEmail("sp-editor");
const VIEWER = uniqueEmail("sp-viewer");
const NAME = "Laba per wilayah";
const dir = mkdtempSync(join(tmpdir(), "dd-e2e-saved-pivot-"));
let worker: ChildProcess | null = null;
let datasetId = "";
let dashA = "";
let dashB = "";
let pivotId = "";
/** Body pratinjau pivot tersimpan yang dikirim editor pemilik (T-c6z4), diulang oleh editor/viewer. */
let previewBody: unknown = null;

const card = (page: Page, title: string) =>
  page.getByTestId("widget").filter({ has: page.getByRole("heading", { name: title }) });
const row = (page: Page, name: string) =>
  page.getByTestId("saved-pivot-row").and(page.locator(`[data-name="${name}"]`));

async function pick(page: Page, scope: Locator, label: string, option: string) {
  await scope.getByLabel(label, { exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function openPanel(page: Page, title: string): Promise<Locator> {
  const panel = page.getByTestId("widget-panel");
  // Klik sesaat setelah muat halaman kadang belum terpasang handler-nya (T-z8y2): ulangi bila perlu.
  await expect(async () => {
    if (!(await panel.isVisible())) {
      await card(page, title)
        .getByRole("button", { name: /^Pengaturan/ })
        .click();
    }
    await expect(panel.getByRole("heading", { name: "Pengaturan widget" })).toBeVisible({
      timeout: 2_000,
    });
  }).toPass({ timeout: 20_000 });
  return panel;
}

/** Ikat widget kosong ke pivot tersimpan lewat panel: Sumber data → jenis → pivot tersimpan. */
async function bind(page: Page, title: string, type: string) {
  const panel = await openPanel(page, title);
  await panel.getByTestId("widget-source").getByText("Pivot tersimpan").click();
  await panel.getByText(type, { exact: true }).click();
  await pick(page, panel, "Pivot tersimpan yang dipakai", NAME);
  await expect(panel.getByTestId("bound-source")).toContainText(
    `Bersumber dari pivot tersimpan ${NAME}`,
  );
  await expect(panel.getByTestId("config-status")).toHaveAttribute("data-state", "saved");
  await panel.getByRole("button", { name: "Tutup pengaturan" }).first().click();
}

async function noHorizontalScroll(page: Page) {
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(over).toBeLessThanOrEqual(0);
}

test.describe("UI pivot tersimpan (T-074)", () => {
  test.beforeAll(async ({ browser, request, baseURL }) => {
    test.setTimeout(240_000);
    execFileSync("node", ["scripts/dev-reset-ratelimit.mjs", "register:ip", "verify:ip"]);
    const p = await browser.newPage();
    await registerAndVerify(p, request, OWNER);
    await registerAndVerify(p, request, EDITOR);
    await registerAndVerify(p, request, VIEWER);
    await apiLogin(p, OWNER);
    worker = await startWorker("saved-pivot-widgets");
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
    await p.getByLabel("Nama dataset").fill(`Pivot tersimpan ${Date.now()}`);
    await p.getByRole("button", { name: "Buat dataset" }).click();
    await expect(p).toHaveURL(/\/datasets\/[a-z0-9]{20,32}\?created=1$/);
    datasetId = new URL(p.url()).pathname.split("/").pop()!;
    await p.getByTestId("upload-input").setInputFiles(csv);
    await expect(p.getByTestId("dataset-schema-link")).toBeVisible({ timeout: 90_000 });
    const share = (user: string, role: string) =>
      (
        JSON.parse(
          execFileSync("node", [
            "scripts/dev-share-fixture.mjs",
            OWNER,
            user,
            role,
            datasetId,
          ]).toString(),
        ) as { dashboardId: string }
      ).dashboardId;
    dashA = share(VIEWER, "VIEWER");
    dashB = share(EDITOR, "EDITOR");
    const headers = { origin: baseURL!, "content-type": "application/json" };
    const add = async (dashboardId: string, titles: string[]) => {
      let revision = 0;
      for (const title of titles) {
        const r = await p.request.post(`/api/dashboards/${dashboardId}/widgets`, {
          headers,
          data: { baseRevision: revision, title },
        });
        const j = (await r.json()) as { data: { layoutRevision: number } };
        expect(r.status(), JSON.stringify(j)).toBe(200);
        revision = j.data.layoutRevision;
      }
    };
    await add(dashA, ["Pivot terikat", "Batang terikat", "KPI terikat"]);
    await add(dashB, ["KPI editor", "Pivot mandiri"]);
    await p.close();
  });

  test.afterAll(async () => {
    await stopWorker(worker);
  });

  test("AC1: pemilik membuat pivot tersimpan di halaman dataset", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await apiLogin(page, OWNER);
    await page.goto(`/datasets/${datasetId}`);
    const section = page.getByTestId("saved-pivot-card");
    await expect(section.getByTestId("saved-pivot-empty")).toBeVisible();
    await section.getByTestId("saved-pivot-new").click();
    await expect(page.getByRole("heading", { name: "Pivot tersimpan baru" })).toBeVisible();
    await page.getByRole("textbox", { name: "Nama", exact: true }).fill(NAME);
    await expect(page.getByTestId("pivot-summary")).toContainText("Wilayah");
    await page.getByTestId("saved-pivot-save").click();
    await expect(page).toHaveURL(new RegExp(`/datasets/${datasetId}\\?pivot=dibuat`));
    const r = row(page, NAME);
    await expect(r).toBeVisible();
    await expect(r.getByTestId("saved-pivot-usage")).toContainText(/Belum dipakai/);
    const href = await r.getByRole("link", { name: `Ubah ${NAME}` }).getAttribute("href");
    pivotId = href!.split("/").pop()!;
    expect(pivotId).toMatch(/^[a-z0-9]{20,32}$/);
  });

  test("AC3: pemilik mengikat pivot, batang, dan KPI lewat Sumber data; ikatan tetap setelah ubah tampilan", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await apiLogin(page, OWNER);
    await page.goto(`/dashboards/${dashA}?mode=edit`);
    await bind(page, "Pivot terikat", "Pivot");
    await bind(page, "Batang terikat", "Batang");
    await bind(page, "KPI terikat", "Angka");
    await expect(card(page, "KPI terikat").getByTestId("kpi-value")).toHaveText("3.500");

    // Regresi review T-073 L4: ubah tampilan widget terikat tidak melepas ikatannya.
    const panel = await openPanel(page, "KPI terikat");
    await pick(page, panel, "Format angka", "Rupiah (Rp 1.234)");
    await expect(panel.getByTestId("config-status")).toHaveAttribute("data-state", "saved");
    await page.goto(`/dashboards/${dashA}?mode=edit`);
    const again = await openPanel(page, "KPI terikat");
    await expect(again.getByTestId("bound-source")).toContainText(NAME);
    await expect(again.getByTestId("widget-config")).toHaveCount(0);

    await page.goto(`/dashboards/${dashA}`);
    await expect(card(page, "KPI terikat").getByTestId("kpi-value")).toHaveText(/3\.500/);
    await expect(
      card(page, "Pivot terikat").getByRole("columnheader", { name: "Total Pendapatan" }),
    ).toBeVisible();
    await expect(card(page, "Batang terikat").locator("canvas, svg").first()).toBeVisible();
    await page.goto(`/datasets/${datasetId}`);
    await expect(row(page, NAME).getByTestId("saved-pivot-usage")).toContainText(
      "3 widget, 1 dashboard",
    );
  });

  test("T-c6z4: pratinjau tabel di editor = widget pivot terikat; ubah nilai → pratinjau dimuat ulang", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await apiLogin(page, OWNER);
    await page.goto(`/dashboards/${dashA}`);
    const widgetTable = card(page, "Pivot terikat").getByRole("table");
    await expect(widgetTable.getByRole("row", { name: /^Total\b/ })).toContainText("3.500");
    const rowsOf = (table: Locator) =>
      table
        .getByRole("row")
        .evaluateAll((rows) =>
          rows.map((r) =>
            Array.from(r.querySelectorAll("th, td"), (c) => (c.textContent ?? "").trim()).slice(1),
          ),
        );
    // Kolom nilai per baris (tanpa sel label/pojok yang di kartu bisa berisi menu saring).
    const widgetRows = await rowsOf(widgetTable);

    const previewReq = page.waitForRequest(
      (r) => r.url().endsWith("/api/query") && (r.postData() ?? "").includes('"pivot"'),
    );
    await page.goto(`/datasets/${datasetId}/pivot-tersimpan/${pivotId}`);
    previewBody = (await previewReq).postDataJSON();
    expect(previewBody).toMatchObject({ datasetId, pivot: { sheetId: expect.any(String) } });
    const preview = page.getByTestId("saved-pivot-preview");
    await expect(preview).toHaveAttribute("data-state", "ok");
    // Ringkasan kalimat tetap ada di atas pengaturan.
    await expect(page.getByTestId("pivot-summary")).toContainText("Wilayah");
    const table = preview.getByRole("table");
    await expect(table.getByRole("columnheader", { name: "Total Pendapatan" })).toBeVisible();
    await expect(table.getByRole("row", { name: /^Total\b/ })).toContainText("3.500");
    expect(await rowsOf(table)).toEqual(widgetRows);

    // Ubah nilai (belum disimpan) → pratinjau memuat ulang dengan Biaya: 600+1500+100 = 2.200.
    const editor = page.getByTestId("saved-pivot-editor");
    await pick(page, editor, "dari kolom", "Biaya · Bilangan bulat");
    await expect(preview).toHaveAttribute("data-state", "ok");
    await expect(table.getByRole("columnheader", { name: "Total Biaya" })).toBeVisible();
    await expect(table.getByRole("row", { name: /^Total\b/ })).toContainText("2.200");
    await expect(table.getByRole("row", { name: /Wilayah B/ })).toContainText("1.500");

    // Mode pemilik dijalankan server: pemilik 200, dataset lain/kunci asing ditolak.
    const headers = { origin: new URL(page.url()).origin, "content-type": "application/json" };
    const ok = await page.request.post("/api/query", { headers, data: previewBody });
    expect(ok.status()).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, pivot: expect.any(Object) });
  });

  test("AC2: ubah pivot tersimpan → konfirmasi dampak, ketiga widget berubah; revisi basi → konflik", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await apiLogin(page, OWNER);
    await page.goto(`/datasets/${datasetId}`);
    await row(page, NAME)
      .getByRole("link", { name: `Ubah ${NAME}` })
      .click();
    const editor = page.getByTestId("saved-pivot-editor");
    await expect(editor.getByTestId("saved-pivot-impact")).toContainText("3 widget");
    await pick(page, editor, "dari kolom", "Biaya · Bilangan bulat");
    await editor.getByTestId("saved-pivot-save").click();
    const confirm = page.getByTestId("saved-pivot-confirm");
    await expect(confirm).toContainText("Perubahan berlaku di 3 widget pada 1 dashboard.");
    await expect(confirm.getByRole("button", { name: "Batal" })).toBeFocused();
    await confirm.getByRole("button", { name: "Simpan", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/datasets/${datasetId}\\?pivot=diubah`));

    await page.goto(`/dashboards/${dashA}`);
    await expect(card(page, "KPI terikat").getByTestId("kpi-value")).toHaveText(/2\.200/);
    await expect(
      card(page, "Pivot terikat").getByRole("columnheader", { name: "Total Biaya" }),
    ).toBeVisible();
    await expect(card(page, "Batang terikat").getByTestId("widget-error")).toHaveCount(0);

    // Tab lain menyimpan dulu (revisi naik) → simpan dari editor lama ditolak tanpa menimpa.
    await page.goto(`/datasets/${datasetId}/pivot-tersimpan/${pivotId}`);
    await expect(page.getByTestId("saved-pivot-editor")).toBeVisible();
    const out = execFileSync("node", [
      "scripts/dev-saved-pivot-fixture.mjs",
      "edit",
      pivotId,
      JSON.stringify({
        rows: [{ column: "Wilayah" }],
        values: [{ agg: "sum", column: "Biaya" }],
        sort: "label_asc",
        format: { style: "auto", decimals: 0 },
        totals: true,
        subtotals: false,
      }),
    ]).toString();
    expect(JSON.parse(out).revision).toBeGreaterThan(2);
    await page.getByRole("textbox", { name: "Nama", exact: true }).fill(`${NAME} basi`);
    await page.getByTestId("saved-pivot-save").click();
    await page
      .getByTestId("saved-pivot-confirm")
      .getByRole("button", { name: "Simpan", exact: true })
      .click();
    await expect(page.getByTestId("form-alert")).toContainText("baru saja diubah");
    await page.getByTestId("saved-pivot-reload").click();
    // Suntingan yang belum disimpan tidak dibuang tanpa konfirmasi (review T-074 #4).
    const ask = page.getByTestId("saved-pivot-reload-confirm");
    await expect(ask.getByRole("button", { name: "Batal" })).toBeFocused();
    await ask.getByRole("button", { name: "Buang dan muat ulang" }).click();
    await expect(page.getByRole("textbox", { name: "Nama", exact: true })).toHaveValue(NAME);
  });

  test("AC1: hapus diblokir selama dipakai; duplikat, ganti nama, dan hapus salinan", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await apiLogin(page, OWNER);
    await page.goto(`/datasets/${datasetId}`);
    const r = row(page, NAME);
    const del = r.getByTestId("saved-pivot-delete");
    await expect(del).toHaveAttribute("aria-disabled", "true");
    // aria-disabled tetap bisa difokus (keyboard): Enter menjelaskan alasannya.
    await del.focus();
    await page.keyboard.press("Enter");
    await expect(r.getByTestId("saved-pivot-in-use")).toContainText("masih dipakai 3 widget");
    await expect(page.getByTestId("saved-pivot-delete-dialog")).toHaveCount(0);

    await r.getByRole("button", { name: `Duplikat ${NAME}` }).click();
    const copy = row(page, `${NAME} (salinan)`);
    await expect(copy).toBeVisible();
    await copy.getByRole("button", { name: `Ganti nama ${NAME} (salinan)` }).click();
    const rename = page.getByTestId("saved-pivot-rename");
    await rename.getByRole("textbox", { name: "Nama baru" }).fill("Cadangan laba");
    await rename.getByRole("button", { name: "Simpan nama" }).click();
    const renamed = row(page, "Cadangan laba");
    await expect(renamed).toBeVisible();
    await renamed.getByRole("button", { name: "Hapus Cadangan laba" }).click();
    const dialog = page.getByTestId("saved-pivot-delete-dialog");
    await dialog.getByRole("button", { name: "Hapus", exact: true }).click();
    await expect(row(page, "Cadangan laba")).toHaveCount(0);
    await expect(row(page, NAME)).toBeVisible();
  });

  test("Urungkan hapus widget terikat memulihkan ikatannya, bukan spec efektif mandiri", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await apiLogin(page, OWNER);
    await page.goto(`/dashboards/${dashA}?mode=edit`);
    const panel = await openPanel(page, "Batang terikat");
    await panel.getByRole("button", { name: "Hapus widget" }).click();
    await expect(card(page, "Batang terikat")).toHaveCount(0);
    await page.getByRole("button", { name: "Urungkan hapus widget" }).click();
    await expect(card(page, "Batang terikat")).toHaveCount(1);
    await expect(page.getByTestId("canvas-toolbar")).toContainText("Semua perubahan tersimpan");
    const again = await openPanel(page, "Batang terikat");
    await expect(again.getByTestId("bound-source")).toContainText(NAME);
    await page.goto(`/datasets/${datasetId}`);
    await expect(row(page, NAME).getByTestId("saved-pivot-usage")).toContainText(
      "3 widget, 1 dashboard",
    );
  });

  test("AC3: Lepas dari sumber menyalin spec menjadi widget mandiri", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await apiLogin(page, OWNER);
    await page.goto(`/dashboards/${dashA}?mode=edit`);
    const panel = await openPanel(page, "KPI terikat");
    await panel.getByTestId("bound-detach").click();
    const dialog = page.getByTestId("detach-dialog");
    await expect(dialog).toContainText(NAME);
    await dialog.getByRole("button", { name: "Lepas dari sumber" }).click();
    await expect(panel.getByTestId("widget-source-notice")).toContainText("dilepas");
    await expect(panel.getByTestId("widget-source-notice")).toBeFocused();
    await expect(panel.getByTestId("widget-config")).toBeVisible();
    await expect(card(page, "KPI terikat").getByTestId("kpi-value")).toHaveText(/2\.200/);
    await page.goto(`/datasets/${datasetId}`);
    await expect(row(page, NAME).getByTestId("saved-pivot-usage")).toContainText(
      "2 widget, 1 dashboard",
    );
  });

  test("AC3: widget pivot mandiri → Simpan sebagai pivot tersimpan langsung terikat", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await apiLogin(page, OWNER);
    await page.goto(`/dashboards/${dashB}?mode=edit`);
    const panel = await openPanel(page, "Pivot mandiri");
    await panel.getByText("Pivot", { exact: true }).click();
    await expect(panel.getByTestId("config-status")).toHaveAttribute("data-state", "saved");
    await panel.getByTestId("save-as-saved-pivot").click();
    const dialog = page.getByRole("dialog", { name: "Simpan sebagai pivot tersimpan" });
    await dialog.getByRole("textbox", { name: "Nama pivot tersimpan" }).fill("Pivot dari widget");
    await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(panel.getByTestId("bound-source")).toContainText("Pivot dari widget");
    await expect(page.getByTestId("canvas-toolbar")).toContainText("Semua perubahan tersimpan");
    await expect(
      card(page, "Pivot mandiri").getByRole("columnheader", { name: "Total Pendapatan" }),
    ).toBeVisible();
    await page.goto(`/datasets/${datasetId}`);
    await expect(row(page, "Pivot dari widget").getByTestId("saved-pivot-usage")).toContainText(
      "1 widget, 1 dashboard",
    );
  });

  test("AC4: editor dashboard mengikat tetapi tidak mengubah; viewer hanya melihat nilai", async ({
    browser,
  }) => {
    test.setTimeout(150_000);
    const editor = await pageFor(browser, EDITOR);
    await editor.setViewportSize({ width: 1440, height: 900 });
    await editor.goto(`/dashboards/${dashB}?mode=edit`);
    await bind(editor, "KPI editor", "Angka");
    await expect(card(editor, "KPI editor").getByTestId("kpi-value")).toHaveText("2.200");
    const panel = await openPanel(editor, "KPI editor");
    await expect(panel.getByTestId("bound-source")).toContainText("baca-saja");
    await expect(panel.getByTestId("bound-edit-source")).toHaveCount(0);
    await expect(panel.getByTestId("save-as-saved-pivot")).toHaveCount(0);
    await editor.goto(`/datasets/${datasetId}/pivot-tersimpan/${pivotId}`);
    await expect(editor.getByRole("heading", { name: "Halaman tidak ditemukan" })).toBeVisible();
    // T-c6z4 AC2: mode pratinjau pivot pemilik { datasetId, pivot } → 404 untuk editor/viewer.
    const asOthers = async (p: Page) => {
      const r = await p.request.post("/api/query", {
        headers: { origin: new URL(p.url()).origin, "content-type": "application/json" },
        data: previewBody,
      });
      expect(r.status()).toBe(404);
      expect(await r.json()).toMatchObject({ ok: false, code: "NOT_FOUND" });
    };
    expect(previewBody).not.toBeNull();
    await asOthers(editor);
    await editor.context().close();

    const viewer = await pageFor(browser, VIEWER);
    await viewer.setViewportSize({ width: 1440, height: 900 });
    await viewer.goto(`/dashboards/${dashA}`);
    await expect(
      card(viewer, "Pivot terikat").getByRole("columnheader", { name: "Total Biaya" }),
    ).toBeVisible();
    await expect(card(viewer, "KPI terikat").getByTestId("kpi-value")).toHaveText(/2\.200/);
    await expect(viewer.getByRole("button", { name: /^Pengaturan/ })).toHaveCount(0);
    await viewer.goto(`/dashboards/${dashA}?mode=edit`);
    await expect(viewer).toHaveURL(new RegExp(`/dashboards/${dashA}$`));
    await expect(viewer.getByTestId("widget-source")).toHaveCount(0);
    await viewer.goto(`/datasets/${datasetId}/pivot-tersimpan/${pivotId}`);
    await expect(viewer.getByRole("heading", { name: "Halaman tidak ditemukan" })).toBeVisible();
    await asOthers(viewer);
    await viewer.context().close();
  });

  test("AC5: 360 px tanpa gulir horizontal (daftar, editor, panel terikat)", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 360, height: 800 });
    await apiLogin(page, OWNER);
    await page.goto(`/datasets/${datasetId}`);
    await expect(row(page, NAME)).toBeVisible();
    await noHorizontalScroll(page);
    await page.goto(`/datasets/${datasetId}/pivot-tersimpan/${pivotId}`);
    await expect(page.getByTestId("saved-pivot-editor")).toBeVisible();
    // Pratinjau tabel (T-c6z4) menggulir di wilayahnya sendiri, bukan halaman.
    const preview = page.getByTestId("saved-pivot-preview");
    await expect(preview).toHaveAttribute("data-state", "ok");
    await expect(preview.getByRole("table")).toBeVisible();
    await noHorizontalScroll(page);
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(preview.getByRole("table")).toBeVisible();
    await noHorizontalScroll(page);
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto(`/dashboards/${dashA}?mode=edit`);
    const panel = await openPanel(page, "Batang terikat");
    await expect(panel.getByTestId("bound-source")).toBeVisible();
    await noHorizontalScroll(page);
  });
});
