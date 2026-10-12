import { expect, test, type Locator, type Page } from "@playwright/test";
import { apiLogin, registerAndVerify, uniqueEmail } from "./helpers";

/*
 * T-010: kanvas dashboard — geser/ubah ukuran tersimpan otomatis dan identik setelah muat ulang, mode
 * lihat statis tanpa panel, satu kolom di layar < 768 px, batas 10 dashboard per dataset.
 */
test.describe.configure({ mode: "serial" });

const OWNER = uniqueEmail("dash-owner");
let datasetId = "";
let dashboardUrl = "";

async function createDashboard(page: Page, name: string) {
  await page.goto(`/dashboards/baru?dataset=${datasetId}`);
  await page.getByLabel("Nama dashboard").fill(name);
  await page.getByRole("button", { name: "Buat dashboard" }).click();
}

/** Posisi/ukuran tiap widget dalam satuan grid (x,y,w,h) — yang disimpan, bukan piksel. */
const geometry = (page: Page) =>
  page.getByTestId("widget").evaluateAll((els) => els.map((el) => el.getAttribute("data-pos")));

async function drag(page: Page, from: Locator, dx: number, dy: number) {
  await from.scrollIntoViewIfNeeded();
  const b = (await from.boundingBox())!;
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let s = 1; s <= 12; s++) await page.mouse.move(x + (dx * s) / 12, y + (dy * s) / 12);
  await page.mouse.up();
}

test.describe("dashboard", () => {
  test.beforeAll(async ({ browser, request }) => {
    test.setTimeout(90_000);
    const p = await browser.newPage();
    await registerAndVerify(p, request, OWNER);
    await apiLogin(p, OWNER);
    await p.goto("/datasets/baru");
    await p.getByLabel("Nama dataset").fill(`Dash data ${Date.now()}`);
    await p.getByRole("button", { name: "Buat dataset" }).click();
    await expect(p).toHaveURL(/\/datasets\/[a-z0-9]{20,32}\?created=1$/);
    datasetId = new URL(p.url()).pathname.split("/").pop()!;
    await p.close();
  });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await apiLogin(page, OWNER);
  });

  test("AC 1: tambah widget, geser, ubah ukuran → identik setelah muat ulang", async ({ page }) => {
    await createDashboard(page, "Ringkasan Harian");
    await expect(page).toHaveURL(/\/dashboards\/[a-z0-9]{20,32}\?mode=edit$/);
    dashboardUrl = page.url().replace("?mode=edit", "");
    const add = page
      .getByTestId("canvas-toolbar")
      .getByRole("button", { name: "Tambah widget", exact: true });
    await add.click();
    await expect(page.getByTestId("widget")).toHaveCount(1);
    await add.click();
    await expect(page.getByTestId("widget")).toHaveCount(2);

    // Tiap gestur menunggu simpan otomatisnya sendiri (PUT tata letak) sebelum gestur berikutnya.
    const layoutSaved = () =>
      page.waitForResponse(
        (r) => r.url().endsWith("/layout") && r.request().method() === "PUT" && r.ok(),
      );
    const first = page.getByTestId("widget").first();
    let put = layoutSaved();
    await drag(page, first.locator(".widget-drag-handle"), 520, 0);
    await put;
    put = layoutSaved();
    await drag(
      page,
      page.locator(".react-grid-item").nth(1).locator("> .react-resizable-handle"),
      260,
      120,
    );
    await put;
    const saved = page.getByTestId("save-state");
    await expect(saved).toHaveAttribute("data-state", "saved");
    const before = await geometry(page);
    // Widget pertama digeser ke kanan, widget kedua diperlebar dan dipertinggi (bukan ukuran awal 4×4).
    expect(before[0]).not.toMatch(/^0,/);
    expect(before.some((p) => p !== null && !p.endsWith(",4,4"))).toBe(true);

    await page.reload();
    await expect(page.getByTestId("widget")).toHaveCount(2);
    await expect.poll(() => geometry(page)).toEqual(before);
  });

  test("urungkan satu langkah dan ubah posisi tanpa menyeret (tombol di pengaturan)", async ({
    page,
  }) => {
    await page.goto(`${dashboardUrl}?mode=edit`);
    await expect(page.getByTestId("widget")).toHaveCount(2);
    const before = await geometry(page);
    await page
      .getByTestId("widget")
      .first()
      .getByRole("button", { name: /^Pengaturan/ })
      .click();
    const panel = page.getByTestId("widget-panel");
    await panel.getByRole("button", { name: /^Perlebar/ }).click();
    await expect(page.getByTestId("save-state")).toHaveAttribute("data-state", "saved");
    expect(await geometry(page)).not.toEqual(before);
    await page.getByRole("button", { name: "Urungkan pindah/ubah ukuran" }).click();
    await expect.poll(() => geometry(page)).toEqual(before);
    await expect(page.getByTestId("save-state")).toHaveAttribute("data-state", "saved");
  });

  test("AC 2: mode lihat — widget tidak bisa diseret dan panel pengaturan tidak ada", async ({
    page,
  }) => {
    await page.goto(dashboardUrl);
    await expect(page.getByTestId("widget")).toHaveCount(2);
    const before = await geometry(page);
    await drag(page, page.getByTestId("widget").first(), 400, 250);
    expect(await geometry(page)).toEqual(before);
    await expect(page.getByTestId("widget-panel")).toHaveCount(0);
    await expect(page.getByTestId("canvas-toolbar")).toHaveCount(0);
    await expect(page.locator(".widget-drag-handle")).toHaveCount(0);
    await expect(page.locator(".react-resizable-handle:visible")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Pengaturan/ })).toHaveCount(0);
  });

  test("AC 3: layar < 768 px — satu kolom tanpa scroll horizontal", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(dashboardUrl);
    await expect(page.getByTestId("canvas")).toHaveAttribute("data-layout", "stack");
    const lefts = await page
      .getByTestId("widget")
      .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
    expect(new Set(lefts).size).toBe(1);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("AC 4: dashboard ke-11 untuk dataset yang sama ditolak (LIMIT_REACHED)", async ({
    page,
  }) => {
    for (let n = 2; n <= 10; n++) {
      await createDashboard(page, `Dashboard ${n}`);
      await expect(page).toHaveURL(/\?mode=edit$/);
    }
    await createDashboard(page, "Dashboard 11");
    await expect(page.locator("#datasetId-error")).toContainText(
      "Batas 10 dashboard per dataset tercapai",
    );
    await expect(page).toHaveURL(/\/dashboards\/baru/);
    // Nama yang sudah dipakai di dataset yang sama ditolak dengan pesan jelas.
    await page.goto("/dashboards");
    await expect(page.getByTestId("dashboard-row")).toHaveCount(10);
  });
});
