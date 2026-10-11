import { expect, test } from "@playwright/test";
import {
  activate,
  apiLogin,
  login,
  MAILPIT,
  PASSWORD,
  register,
  registerAndVerify,
  uniqueEmail,
  verifyLinkFor,
} from "./helpers";

/*
 * Alur auth end-to-end: butuh compose dev (PostgreSQL, Redis, Mailpit 8026), .env dengan
 * E2E_ENDPOINTS=1. Serial karena test terakhir mengisi bucket rate limit IP 'local'.
 */
test.describe.configure({ mode: "serial" });

test.describe("auth", () => {
  test("domain di luar whitelist ditolak", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Email perusahaan").fill(`x-${Date.now()}@evilpcpexpress.com`);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Daftar" }).click();
    await expect(page.getByTestId("form-alert")).toContainText("domain perusahaan");
  });

  test("password pendek ditolak", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Email perusahaan").fill(uniqueEmail("short"));
    await page.getByLabel("Password").fill("pendek");
    await page.getByRole("button", { name: "Daftar" }).click();
    await expect(page.getByTestId("form-alert")).toContainText("12 sampai 128");
  });

  test("daftar → belum aktif ditolak → konfirmasi aktivasi → login → next → 404 → keluar", async ({
    page,
    request,
  }) => {
    const email = uniqueEmail("flow");
    await register(page, email);

    await page.goto("/login");
    await login(page, email);
    await expect(page.getByTestId("form-alert")).toContainText("belum diaktifkan");

    // GET tautan tidak memakai token (pemindai email aman); tombol yang mengaktifkan.
    const link = await verifyLinkFor(request, email);
    await page.goto(link);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Aktifkan akun");
    await page.goto(link); // kunjungan kedua tetap valid karena belum dipakai
    await page.getByRole("button", { name: "Aktifkan akun" }).click();
    await expect(page).toHaveURL(/\/login\?verified=1/);
    await expect(page.getByTestId("form-alert")).toContainText("Akun aktif");

    // Sekali pakai
    await page.goto(link);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tautan tidak berlaku");

    await page.goto("/datasets");
    await expect(page).toHaveURL(/\/login\?next=%2Fdatasets/);
    await login(page, email);
    await expect(page).toHaveURL(/\/datasets$/);
    await expect(page.getByTestId("account-menu-trigger")).toBeVisible();

    const res404 = await page.goto("/halaman-yang-tidak-ada");
    expect(res404?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Halaman tidak ditemukan");

    // Keluar mencabut sesi di server: cookie lama yang dicuri pun tidak berlaku lagi.
    const stolen = (await page.context().cookies()).find((c) => c.name === "dd.session");
    expect(stolen).toBeTruthy();
    await page.goto("/datasets");
    await page.getByTestId("account-menu-trigger").click();
    await page.getByTestId("logout").click();
    await expect(page).toHaveURL(/\/login$/);
    await page.context().addCookies([stolen!]);
    expect((await page.request.get("/api/auth/me")).status()).toBe(401);
  });

  test("pre-account takeover: password penyerang tidak berlaku setelah korban mengaktifkan", async ({
    page,
    request,
  }) => {
    const email = uniqueEmail("victim");
    const attackerPassword = "password-milik-penyerang-999";
    await register(page, email, attackerPassword); // penyerang mendaftar lebih dulu
    await register(page, email, PASSWORD); // korban mendaftar dengan password sendiri
    // Korban membuka email terbarunya (miliknya) dan mengaktifkan
    await activate(page, await verifyLinkFor(request, email));
    await login(page, email, attackerPassword);
    await expect(page.locator("[data-testid=form-alert][data-tone=error]")).toContainText("salah");
    await login(page, email, PASSWORD);
    await expect(page).toHaveURL(/\/$/);
  });

  test("next= absolut atau // diabaikan → beranda", async ({ page, request }) => {
    const email = uniqueEmail("next");
    await registerAndVerify(page, request, email);
    await page.goto("/login?next=https://evil.example");
    await login(page, email);
    await expect(page).toHaveURL(/\/$/);
    await page.getByTestId("account-menu-trigger").click();
    await page.getByTestId("logout").click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/login?next=//evil.example");
    await login(page, email);
    await expect(page).toHaveURL(/\/$/);
  });

  test("registrasi ulang email terverifikasi: respons identik, email 'sudah ada' terkirim", async ({
    page,
    request,
  }) => {
    const email = uniqueEmail("dup");
    await registerAndVerify(page, request, email);
    await register(page, email);
    await expect
      .poll(async () => {
        const res = await request.get(
          `${MAILPIT}/api/v1/search?query=to:${encodeURIComponent(email)}`,
        );
        const body = (await res.json()) as { messages?: { Subject: string }[] };
        return body.messages?.some((m) => m.Subject.includes("sudah ada")) ?? false;
      })
      .toBe(true);
  });

  test("route login JSON menolak login-CSRF (text/plain atau Origin asing)", async ({
    request,
  }) => {
    const plain = await request.post("/api/auth/login", {
      headers: { "content-type": "text/plain" },
      data: JSON.stringify({ email: "a@pcpexpress.com", password: PASSWORD }),
    });
    expect(plain.status()).toBe(403);
    const foreign = await request.post("/api/auth/login", {
      headers: { origin: "https://evil.example" },
      data: { email: "a@pcpexpress.com", password: PASSWORD },
    });
    expect(foreign.status()).toBe(403);
  });

  test("sessionVersion dinaikkan → permintaan berikutnya ditolak dan diarahkan ke /login", async ({
    page,
    request,
  }) => {
    const email = uniqueEmail("sv");
    await registerAndVerify(page, request, email);
    await apiLogin(page, email);
    expect((await page.request.get("/api/auth/me")).status()).toBe(200);
    expect((await page.request.post("/api/auth/dev-bump-session")).status()).toBe(200);
    expect((await page.request.get("/api/auth/me")).status()).toBe(401);
    await page.goto("/datasets");
    await expect(page).toHaveURL(/\/login\?next=/);
  });

  test("endpoint uji butuh sesi", async ({ request }) => {
    expect((await request.post("/api/auth/dev-bump-session")).status()).toBe(401);
  });
});
