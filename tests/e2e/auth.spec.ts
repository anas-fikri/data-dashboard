import { execFileSync } from "node:child_process";
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
  verifyLinksFor,
} from "./helpers";

/*
 * Alur auth end-to-end: butuh compose dev (PostgreSQL, Redis, Mailpit 8026), .env dengan
 * E2E_ENDPOINTS=1. Dijalankan serial; spec pengisi bucket rate limit IP ada di zz-rate-limit.
 */
test.describe.configure({ mode: "serial" });

test.describe("auth", () => {
  test("domain di luar whitelist ditolak", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Email perusahaan").fill(`x-${Date.now()}@evilpcpexpress.com`);
    await page.locator("input[name=password]").fill(PASSWORD);
    await page.getByRole("button", { name: "Daftar" }).click();
    await expect(page.getByText("Gunakan email @pcpexpress.com.")).toBeVisible();
    // Isian tidak hilang dan fokus pindah ke field yang salah
    await expect(page.getByLabel("Email perusahaan")).toHaveValue(/@evilpcpexpress\.com$/);
    await expect(page.getByLabel("Email perusahaan")).toBeFocused();
    await expect(page.getByLabel("Email perusahaan")).toHaveAttribute("aria-invalid", "true");
  });

  test("login dengan isian kosong memberi pesan per field", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Masuk" }).click();
    await expect(page.getByText("Masukkan email perusahaan Anda.")).toBeVisible();
    await expect(page.getByLabel("Email perusahaan")).toBeFocused();
    await page.getByLabel("Email perusahaan").fill("siapa@pcpexpress.com");
    await page.getByRole("button", { name: "Masuk" }).click();
    await expect(page.getByText("Masukkan password Anda.")).toBeVisible();
    await expect(page.locator("input[name=password]")).toBeFocused();
  });

  test("sukses daftar → 'Pakai email lain' mengembalikan form dengan fokus di email", async ({
    page,
  }) => {
    await register(page, uniqueEmail("restart"));
    await expect(page).toHaveTitle("Periksa inbox Anda · Data Dashboard");
    await page.getByRole("button", { name: "Pakai email lain" }).click();
    await expect(page.getByLabel("Email perusahaan")).toBeFocused();
    await expect(page.getByLabel("Email perusahaan")).toHaveValue("");
    await expect(page).toHaveTitle("Daftar · Data Dashboard");
  });

  test("password pendek ditolak", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Email perusahaan").fill(uniqueEmail("short"));
    await page.locator("input[name=password]").fill("pendek");
    await page.getByRole("button", { name: "Daftar" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "12 sampai 128" })).toBeVisible();
    await expect(page.locator("input[name=password]")).toBeFocused();
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
    // Password salah di halaman aktivasi → ditolak, token tetap belum terpakai
    await page.getByLabel("Password yang Anda buat saat mendaftar").fill("bukan-password-saya-1");
    await page.getByRole("button", { name: "Aktifkan akun" }).click();
    await expect(page.getByTestId("form-alert")).toContainText("tidak cocok");
    await activate(page, link);
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
    await expect(page).toHaveURL(/\/login\?reason=signed-out/);
    await page.context().addCookies([stolen!]);
    expect((await page.request.get("/api/auth/me")).status()).toBe(401);
  });

  test("pre-account takeover: tautan pendaftaran penyerang tidak bisa diaktifkan korban", async ({
    page,
    request,
  }) => {
    const email = uniqueEmail("victim");
    const attackerPassword = "dummy-penyerang-uji-999";
    await register(page, email, attackerPassword); // penyerang mendaftar lebih dulu
    await register(page, email, PASSWORD); // korban mendaftar dengan password sendiri
    const [victimLink, attackerLink] = await verifyLinksFor(request, email, 2);
    // Korban keliru membuka email dari pendaftaran penyerang: password korban tidak cocok
    await page.goto(attackerLink!);
    await page.getByLabel("Password yang Anda buat saat mendaftar").fill(PASSWORD);
    await page.getByRole("button", { name: "Aktifkan akun" }).click();
    await expect(page.getByTestId("form-alert")).toContainText("tidak cocok");
    // Tautan miliknya sendiri berhasil; password penyerang tidak berlaku
    await activate(page, victimLink!);
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
    await expect(page).toHaveURL(/\/login\?reason=signed-out/);
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

  test("T-fesf: sesi dicabut → /panduan dan /admin/panduan (gerbang layout (daftar)) dialihkan ke /login", async ({
    page,
    request,
  }) => {
    const email = uniqueEmail("sv-panduan");
    await registerAndVerify(page, request, email);
    execFileSync("node", ["scripts/dev-make-admin.mjs", email]);
    for (const path of ["/panduan", "/admin/panduan"]) {
      await apiLogin(page, email);
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      expect((await page.request.post("/api/auth/dev-bump-session")).status()).toBe(200);
      // Pengalihan dari server (307, gerbang layout), bukan pengalihan klien sesudah halaman mengalir.
      const res = await page.request.get(path, { maxRedirects: 0 });
      expect(res.status(), path).toBe(307);
      expect(res.headers()["location"], path).toMatch(/\/login\?next=/);
      await page.goto(path);
      await expect(page).toHaveURL(/\/login\?next=/);
    }
  });

  test("endpoint uji butuh sesi", async ({ request }) => {
    expect((await request.post("/api/auth/dev-bump-session")).status()).toBe(401);
  });
});
