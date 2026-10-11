import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/*
 * Alur auth end-to-end: butuh compose dev (PostgreSQL, Redis, Mailpit di 8026) dan .env.
 * Setiap test memakai email unik agar rate limit per akun tidak saling memengaruhi.
 */
const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8026";
const PASSWORD = "kalimat-panjang-yang-kuat-123";

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@pcpexpress.com`;
}

async function verifyLinkFor(request: APIRequestContext, email: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const res = await request.get(`${MAILPIT}/api/v1/search?query=to:${encodeURIComponent(email)}`);
    const body = (await res.json()) as { messages?: { ID: string; Subject: string }[] };
    const msg = body.messages?.find((m) => m.Subject.includes("Aktifkan"));
    if (msg) {
      const detail = (await (await request.get(`${MAILPIT}/api/v1/message/${msg.ID}`)).json()) as {
        Text: string;
      };
      const link = detail.Text.match(/https?:\/\/\S+\/verify\?token=[A-Za-z0-9_-]+/)?.[0];
      if (link) return link;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`email verifikasi untuk ${email} tidak ditemukan di Mailpit`);
}

async function registerAndVerify(page: Page, request: APIRequestContext, email: string) {
  await page.goto("/register");
  await page.getByLabel("Email perusahaan").fill(email);
  await page.getByLabel("Nama").fill("Uji E2E");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Daftar" }).click();
  await expect(page.getByTestId("form-alert")).toContainText("Periksa inbox");
  const link = await verifyLinkFor(request, email);
  await page.goto(link);
  await expect(page).toHaveURL(/\/login\?verified=1/);
}

async function login(page: Page, email: string, password = PASSWORD) {
  await page.getByLabel("Email perusahaan").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Masuk" }).click();
}

test.describe.configure({ mode: "serial" });

test.describe("auth", () => {
  test("domain di luar whitelist ditolak tanpa membuat user", async ({ page }) => {
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

  test("daftar → belum verifikasi ditolak → verifikasi via Mailpit → login → next", async ({
    page,
    request,
  }) => {
    const email = uniqueEmail("flow");
    await page.goto("/register");
    await page.getByLabel("Email perusahaan").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Daftar" }).click();
    await expect(page.getByTestId("form-alert")).toContainText("Periksa inbox");

    // Login sebelum verifikasi → EMAIL_NOT_VERIFIED
    await page.goto("/login");
    await login(page, email);
    await expect(page.getByTestId("form-alert")).toContainText("belum diaktifkan");

    // Verifikasi lewat tautan di email
    const link = await verifyLinkFor(request, email);
    await page.goto(link);
    await expect(page).toHaveURL(/\/login\?verified=1/);
    await expect(page.getByTestId("form-alert")).toContainText("Akun aktif");

    // Tautan sekali pakai
    await page.goto(link);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("tidak berlaku");

    // Rute terlindungi → /login?next → setelah login kembali ke /datasets
    await page.goto("/datasets");
    await expect(page).toHaveURL(/\/login\?next=%2Fdatasets/);
    await login(page, email);
    await expect(page).toHaveURL(/\/datasets$/);
    await expect(page.getByTestId("account-menu-trigger")).toBeVisible();

    // Pengguna login: rute tak dikenal → 404 dengan aksi kembali
    const res404 = await page.goto("/halaman-yang-tidak-ada");
    expect(res404?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Halaman tidak ditemukan");
    await page.goto("/datasets");

    // Menu akun → keluar
    await page.getByTestId("account-menu-trigger").click();
    await page.getByTestId("logout").click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/datasets");
    await expect(page).toHaveURL(/\/login\?next=/);
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

  test("registrasi ulang email yang sudah ada: respons identik, email 'sudah ada' terkirim", async ({
    page,
    request,
  }) => {
    const email = uniqueEmail("dup");
    await registerAndVerify(page, request, email);
    await page.goto("/register");
    await page.getByLabel("Email perusahaan").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Daftar" }).click();
    await expect(page.getByTestId("form-alert")).toContainText("Periksa inbox");
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

  test("sessionVersion dinaikkan → permintaan berikutnya diarahkan ke /login", async ({
    page,
    request,
  }) => {
    const email = uniqueEmail("sv");
    await registerAndVerify(page, request, email);
    await page.goto("/login");
    await login(page, email);
    await expect(page).toHaveURL(/\/$/);
    const me = await page.request.get("/api/auth/me");
    expect(me.status()).toBe(200);

    // Naikkan sessionVersion lewat endpoint uji khusus dev (hanya aktif saat NODE_ENV!=production).
    const bump = await page.request.post("/api/auth/dev-bump-session", { data: { email } });
    expect(bump.status()).toBe(200);

    const meAfter = await page.request.get("/api/auth/me");
    expect(meAfter.status()).toBe(401);
    await page.goto("/datasets");
    await expect(page).toHaveURL(/\/login\?next=/);
  });

  // Terakhir: test ini mengisi bucket IP 'local' (dev tanpa proxy) sehingga login lain akan 429.
  test("rate limit: Route Handler login menjawab 429 setelah 10 kegagalan per IP", async ({
    request,
  }) => {
    let last = 0;
    for (let i = 0; i < 11; i++) {
      const res = await request.post("/api/auth/login", {
        data: { email: `rl-${i}@pcpexpress.com`, password: "salah-salah-salah" },
      });
      last = res.status();
    }
    expect(last).toBe(429);
  });
});
