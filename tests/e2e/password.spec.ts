import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import {
  apiLogin,
  login,
  mailsFor,
  PASSWORD,
  registerAndVerify,
  requestReset,
  resetLinkFor,
  uniqueEmail,
} from "./helpers";

/* T-026: lupa password, ganti password, keluar dari semua perangkat. */
test.describe.configure({ mode: "serial" });

const NEW_PASSWORD = "dummy-password-baru-uji-456";

test.describe("password", () => {
  test("respons minta reset identik untuk email terdaftar dan tidak; hanya terdaftar menerima tautan", async ({
    page,
    request,
  }) => {
    const known = uniqueEmail("reset-known");
    const unknown = uniqueEmail("reset-unknown");
    await registerAndVerify(page, request, known);

    await requestReset(page, known);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Periksa inbox Anda");
    const knownHeading = await page.getByRole("heading", { level: 1 }).textContent();
    const knownBody = (await page.locator("main").innerText()).replaceAll(known, "<email>");

    await requestReset(page, unknown);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Periksa inbox Anda");
    const unknownHeading = await page.getByRole("heading", { level: 1 }).textContent();
    const unknownBody = (await page.locator("main").innerText()).replaceAll(unknown, "<email>");

    expect(knownHeading).toBe("Periksa inbox Anda");
    expect(unknownHeading).toBe(knownHeading);
    expect(unknownBody).toBe(knownBody);

    await resetLinkFor(request, known); // terdaftar menerima

    // "Kirim lagi" memberi konfirmasi yang terlihat dan menerima fokus
    await requestReset(page, known);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Periksa inbox Anda");
    await page.getByRole("button", { name: "Kirim lagi" }).click();
    const note = page.getByText(/Permintaan tautan baru diterima pukul/);
    await expect(note).toBeVisible();
    await expect(page.locator("[data-testid=form-alert]").filter({ has: note })).toBeFocused();
    await page.waitForTimeout(1500);
    expect(await mailsFor(request, unknown, "Atur ulang password")).toHaveLength(0);
  });

  test("reset → login dengan password baru; tautan sekali pakai; kedaluwarsa ditolak", async ({
    page,
    request,
  }) => {
    const email = uniqueEmail("reset-flow");
    await registerAndVerify(page, request, email);
    await requestReset(page, email);
    const link = await resetLinkFor(request, email);

    // GET tidak memakai token
    await page.goto(link);
    await page.goto(link);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Atur ulang password");
    await page.locator("input[name=password]").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Simpan password baru" }).click();
    await expect(page).toHaveURL(/\/login\?reason=password-reset/);

    // Password lama tidak berlaku, yang baru berlaku
    await login(page, email, PASSWORD);
    await expect(page.locator("[data-testid=form-alert][data-tone=error]")).toContainText("salah");
    await login(page, email, NEW_PASSWORD);
    await expect(page).toHaveURL(/\/$/);

    // Tautan yang sama dipakai lagi → tidak berlaku
    await page.goto(link);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tautan tidak berlaku");

    // Tautan baru yang kedaluwarsa (>30 menit) → tidak berlaku (pengguna login dialihkan dari
    // /lupa-password ke pengaturan keamanan, jadi keluar dulu)
    await page.goto("/lupa-password");
    await expect(page).toHaveURL(/\/akun\/keamanan/);
    await page.context().clearCookies();
    await requestReset(page, email);
    await expect.poll(async () => (await mailsFor(request, email, "Atur ulang")).length).toBe(2);
    const fresh = await resetLinkFor(request, email);
    expect(fresh).not.toBe(link);
    execFileSync("node", ["scripts/dev-expire-reset.mjs", email]);
    await page.goto(fresh);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tautan tidak berlaku");
  });

  test("ganti password di satu browser → browser lain dikeluarkan, browser ini tetap masuk", async ({
    browser,
    request,
  }) => {
    const email = uniqueEmail("change");
    const setup = await browser.newPage();
    await registerAndVerify(setup, request, email);
    await setup.close();

    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();
    await apiLogin(a, email);
    await apiLogin(b, email);
    expect((await b.request.get("/api/auth/me")).status()).toBe(200);

    await a.goto("/akun/keamanan");
    // Password saat ini kosong → error di field "Password saat ini", fokus ke sana
    await a.locator("input[name=password]").fill(NEW_PASSWORD);
    await a.getByRole("button", { name: "Simpan password" }).click();
    await expect(a.getByText("Masukkan password saat ini.")).toBeVisible();
    await expect(a.getByLabel("Password saat ini")).toBeFocused();
    await expect(a.getByLabel("Password saat ini")).toHaveAttribute("aria-invalid", "true");
    await a.getByLabel("Password saat ini").fill("dummy-salah-sekali-123");
    await a.locator("input[name=password]").fill(NEW_PASSWORD);
    await a.getByRole("button", { name: "Simpan password" }).click();
    await expect(a.getByText("Password saat ini salah.")).toBeVisible();
    await expect(a.getByLabel("Password saat ini")).toBeFocused();

    await a.getByLabel("Password saat ini").fill(PASSWORD);
    await a.locator("input[name=password]").fill(NEW_PASSWORD);
    await a.getByRole("button", { name: "Simpan password" }).click();
    await expect(a.getByTestId("form-alert")).toContainText("Password diganti");
    await expect(a.getByTestId("form-alert")).toBeFocused();

    expect((await a.request.get("/api/auth/me")).status()).toBe(200);
    expect((await b.request.get("/api/auth/me")).status()).toBe(401);
    // Pemberitahuan perubahan password terkirim (ASVS V2.2.3)
    await expect
      .poll(
        async () => (await mailsFor(request, email, "Password Data Dashboard Anda berubah")).length,
      )
      .toBe(1);
    await b.goto("/datasets");
    await expect(b).toHaveURL(/\/login\?next=/);

    // Keluar dari semua perangkat
    await a.getByTestId("logout-everywhere").click();
    await expect(a).toHaveURL(/\/login\?reason=signed-out/);
    expect((await a.request.get("/api/auth/me")).status()).toBe(401);
    await ctxA.close();
    await ctxB.close();
  });

  test("lupa password menolak domain yang tidak diizinkan di field email", async ({ page }) => {
    await page.goto("/lupa-password");
    await page.getByLabel("Email perusahaan").fill("seseorang@gmail.com");
    await page.getByRole("button", { name: "Kirim tautan atur ulang" }).click();
    await expect(page.getByText("Gunakan email @pcpexpress.com.")).toBeVisible();
    await expect(page.getByLabel("Email perusahaan")).toBeFocused();
  });

  test("permintaan reset ke-4 untuk email yang sama dalam 1 jam → RATE_LIMITED tanpa email ke-4", async ({
    page,
    request,
  }) => {
    const email = uniqueEmail("reset-rl");
    await registerAndVerify(page, request, email);
    for (let i = 0; i < 3; i++) {
      await requestReset(page, email);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Periksa inbox Anda");
    }
    await expect.poll(async () => (await mailsFor(request, email, "Atur ulang")).length).toBe(3);
    await requestReset(page, email);
    await expect(page.getByTestId("form-alert")).toContainText("Terlalu banyak percobaan");
    await page.waitForTimeout(1500);
    expect(await mailsFor(request, email, "Atur ulang")).toHaveLength(3);
  });
});
