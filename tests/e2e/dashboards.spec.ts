import { expect, test, type Locator, type Page } from "@playwright/test";
import { apiLogin, registerAndVerify, uniqueEmail } from "./helpers";

/*
 * T-010: kanvas dashboard — geser/ubah ukuran tersimpan otomatis dan identik setelah muat ulang, mode
 * lihat statis tanpa panel, satu kolom di layar < 768 px, batas 10 dashboard per dataset. Juga: panel
 * pengaturan sebagai lembar di < 1280 px (fokus masuk/kembali), fokus setelah hapus, dan tab lain yang
 * mengubah dashboard → STALE tanpa menimpa.
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

/** Posisi/ukuran tiap widget (id → "x,y,w,h" dalam satuan grid) — yang disimpan, bukan piksel. */
const geometry = (page: Page) =>
  page
    .getByTestId("widget")
    .evaluateAll((els) =>
      Object.fromEntries(
        els.map((el) => [el.getAttribute("data-widget-id"), el.getAttribute("data-pos")]),
      ),
    );
const settingsOf = (page: Page, nth = 0) =>
  page
    .getByTestId("widget")
    .nth(nth)
    .getByRole("button", { name: /^Pengaturan/ });

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
    const [firstId, secondId] = (await page
      .getByTestId("widget")
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-widget-id")!))) as [
      string,
      string,
    ];

    // Tiap gestur menunggu simpan otomatisnya sendiri (PUT tata letak) sebelum gestur berikutnya.
    const layoutSaved = () =>
      page.waitForResponse(
        (r) => r.url().endsWith("/layout") && r.request().method() === "PUT" && r.ok(),
      );
    // Seret lewat kepala kartu (pegangan), ubah ukuran lewat pojok kanan bawah.
    let put = layoutSaved();
    await drag(page, page.locator(`[data-widget-id="${firstId}"] .widget-drag-handle`), 520, 0);
    await put;
    put = layoutSaved();
    await drag(
      page,
      page.locator(`[data-widget-id="${secondId}"] > .react-resizable-handle`),
      260,
      120,
    );
    await put;
    const saved = page.getByTestId("save-state");
    await expect(saved).toHaveAttribute("data-state", "saved");
    const before = await geometry(page);
    // Widget pertama digeser ke kanan, widget kedua diperlebar dan dipertinggi (bukan ukuran awal 4×4).
    expect(before[firstId]).not.toMatch(/^0,/);
    expect(before[secondId]).not.toMatch(/,4,4$/);

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
    await settingsOf(page).click();
    const panel = page.getByTestId("widget-panel");
    // ≥ 1280 px: panel menempel dan fokus pindah ke judulnya.
    await expect(panel.getByRole("heading", { name: "Pengaturan widget" })).toBeFocused();
    await panel.getByRole("button", { name: /^Pertinggi/ }).click();
    await expect(page.getByTestId("save-state")).toHaveAttribute("data-state", "saved");
    expect(await geometry(page)).not.toEqual(before);
    await page.getByRole("button", { name: "Urungkan perubahan tata letak" }).click();
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

  test("< 1280 px: pengaturan sebagai lembar — fokus masuk, Escape menutup, fokus kembali", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto(`${dashboardUrl}?mode=edit`);
    const settings = settingsOf(page);
    await settings.click();
    const sheet = page.getByRole("dialog", { name: "Pengaturan widget" });
    await expect(sheet).toBeInViewport();
    await expect(sheet.locator(":focus")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await expect(settings).toBeFocused();
    // 768 px: toolbar membungkus, tidak ada scroll horizontal halaman (setelah grid mengukur ulang).
    await page.setViewportSize({ width: 768, height: 900 });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      )
      .toBeLessThanOrEqual(0);
  });

  test("judul yang sedang diketik tetap tersimpan saat panel ditutup dengan Escape", async ({
    page,
  }) => {
    for (const [width, title] of [
      [1440, "Omzet per cabang"],
      [1024, "Retur per kurir"],
    ] as const) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${dashboardUrl}?mode=edit`);
      await settingsOf(page).click();
      const panel = page.getByTestId("widget-panel");
      await panel.getByLabel("Judul", { exact: true }).fill(title);
      const saved = page.waitForResponse(
        (r) => /\/widgets\/[a-z0-9]+$/.test(r.url()) && r.request().method() === "PATCH" && r.ok(),
      );
      await page.keyboard.press("Escape");
      await saved;
      await expect(panel).toHaveCount(0);
      await expect(page.getByTestId("widget").first().getByRole("heading")).toHaveText(title);
      await page.reload();
      await expect(page.getByTestId("widget").first().getByRole("heading")).toHaveText(title);
    }
  });

  test("hapus dari panel → fokus ke Urungkan; urungkan mengembalikan widget", async ({ page }) => {
    await page.goto(`${dashboardUrl}?mode=edit`);
    const widgets = page.getByTestId("widget");
    await expect(widgets).toHaveCount(2);
    const before = await geometry(page);
    const deletedId = (await widgets.first().getAttribute("data-widget-id"))!;
    await settingsOf(page).click();
    await page.getByTestId("widget-panel").getByRole("button", { name: "Hapus widget" }).click();
    await expect(widgets).toHaveCount(1);
    const undo = page.getByRole("button", { name: "Urungkan hapus widget" });
    await expect(undo).toBeFocused();
    await undo.click();
    await expect(widgets).toHaveCount(2);
    await expect(page.getByTestId("save-state")).toHaveAttribute("data-state", "saved");
    // Dipulihkan (id baru) di posisi semula; widget lain kembali ke tempatnya juga.
    const after = await geometry(page);
    const restoredId = Object.keys(after).find((k) => !(k in before))!;
    expect(after[restoredId]).toBe(before[deletedId]);
    expect(Object.values(after).sort()).toEqual(Object.values(before).sort());
  });

  test("tab lain mengubah dashboard → STALE: tidak menimpa, edit dibekukan, muat ulang", async ({
    page,
  }) => {
    await page.goto(`${dashboardUrl}?mode=edit`);
    await expect(page.getByTestId("widget")).toHaveCount(2);
    const other = await page.context().newPage();
    await other.goto(`${dashboardUrl}?mode=edit`);
    await other
      .getByTestId("canvas-toolbar")
      .getByRole("button", { name: "Tambah widget", exact: true })
      .click();
    await expect(other.getByTestId("widget")).toHaveCount(3);
    await expect(other.getByTestId("save-state")).toHaveAttribute("data-state", "saved");

    // Tab ini masih memegang revisi lama: perubahannya ditolak, bukan menimpa widget baru.
    await settingsOf(page).click();
    await page
      .getByTestId("widget-panel")
      .getByRole("button", { name: /^Pertinggi/ })
      .click();
    await expect(page.getByTestId("save-state")).toHaveAttribute("data-state", "stale");
    await expect(page.getByTestId("form-alert")).toContainText("belum tersimpan");
    await expect(
      page
        .getByTestId("canvas-toolbar")
        .getByRole("button", { name: "Tambah widget", exact: true }),
    ).toBeDisabled();
    await expect(page.getByTestId("widget-panel")).toHaveCount(0);
    await expect(page.locator(".widget-drag-handle")).toHaveCount(0);

    await page.getByTestId("form-alert").getByRole("button", { name: "Muat ulang" }).click();
    await expect(page.getByTestId("widget")).toHaveCount(3);
    await expect(page.getByTestId("save-state")).toHaveAttribute("data-state", "saved");
    await other.close();
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
