import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { apiLogin, registerAndVerify, uniqueEmail } from "./helpers";

const WIDTHS = [320, 768, 1024, 1440] as const;

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "tidak boleh ada scroll horizontal").toBeLessThanOrEqual(0);
}

const SHELL_USER = uniqueEmail("shell");

test.describe("app shell (masuk)", () => {
  test.beforeAll(async ({ browser, request }) => {
    const page = await browser.newPage();
    await registerAndVerify(page, request, SHELL_USER);
    await page.close();
  });
  test.beforeEach(async ({ page }) => {
    await apiLogin(page, SHELL_USER);
  });

  for (const width of WIDTHS) {
    test(`lebar ${width}: tanpa scroll horizontal, satu h1, kromo lengkap`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await noHorizontalScroll(page);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page.getByTestId("theme-toggle")).toBeVisible();
      await expect(page.getByTestId("account-menu-trigger")).toBeVisible();
      await expect(page.getByRole("link", { name: "Panduan penggunaan" })).toBeVisible();
      if (width < 768) {
        await expect(page.getByTestId("drawer-open")).toBeVisible();
        await expect(page.getByTestId("sidebar")).toBeHidden();
      } else {
        await expect(page.getByTestId("drawer-open")).toBeHidden();
        await expect(page.getByTestId("sidebar")).toBeVisible();
      }
      await page.screenshot({ path: `test-results/shell-${width}.png`, fullPage: false });
    });
  }

  test("menu akun: versi aplikasi dari package.json di bagian bawah (T-066)", async ({ page }) => {
    const { version } = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/");
    await page.getByTestId("account-menu-trigger").click();
    const label = page.getByTestId("app-version");
    await expect(label).toHaveText(`Versi ${version}`);
    // Teks informasi, bukan item menu; terakhir di menu (di bawah Keluar).
    await expect(page.getByRole("menuitem", { name: /Versi/ })).toHaveCount(0);
    const last = page.getByRole("menu").locator(":scope > *").last();
    await expect(last).toHaveAttribute("data-testid", "app-version");
  });

  test("ponsel: drawer dengan backdrop, tertutup saat navigasi", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/");
    await page.getByTestId("drawer-open").click();
    await expect(page.getByTestId("drawer")).toBeVisible();
    await expect(page.getByTestId("drawer-backdrop")).toBeVisible();
    await noHorizontalScroll(page);
    await page.getByTestId("drawer").getByRole("link", { name: "Panduan" }).click();
    await expect(page).toHaveURL(/\/panduan$/);
    await expect(page.getByTestId("drawer")).toBeHidden();
  });

  test("ponsel: CTA utama full-width", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/");
    const cta = page.getByRole("link", { name: "Buat dataset" });
    const box = await cta.boundingBox();
    const main = await page.locator("main").boundingBox();
    expect(box && main && box.width).toBeGreaterThan((main?.width ?? 0) - 40);
  });

  test("desktop: sidebar bisa diciutkan dan pilihan diingat", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    const sidebar = page.getByTestId("sidebar");
    await expect(sidebar).toHaveAttribute("data-collapsed", "false");
    await page.getByTestId("sidebar-collapse").click();
    await expect(sidebar).toHaveAttribute("data-collapsed", "true");
    await page.reload();
    await expect(sidebar).toHaveAttribute("data-collapsed", "true");
    await page.getByTestId("sidebar-collapse").click();
    await expect(sidebar).toHaveAttribute("data-collapsed", "false");
  });

  test("tema: ikon di topbar mengganti kelas dark", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    const html = page.locator("html");
    await expect(html).not.toHaveClass(/dark/);
    await page.getByTestId("theme-toggle").click();
    await expect(html).toHaveClass(/dark/);
    await page.getByTestId("theme-toggle").click();
    await expect(html).not.toHaveClass(/dark/);
  });
});

test.describe("app shell (tamu)", () => {
  test("tamu yang membuka rute tak dikenal diarahkan ke login (rute tidak dibocorkan)", async ({
    page,
  }) => {
    await page.goto("/halaman-yang-tidak-ada");
    await expect(page).toHaveURL(/\/login\?next=%2Fhalaman-yang-tidak-ada/);
  });
});
