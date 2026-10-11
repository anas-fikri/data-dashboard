import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8026";
export const PASSWORD = "kalimat-panjang-yang-kuat-123";

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@pcpexpress.com`;
}

/** Tautan aktivasi terbaru untuk email ini dari Mailpit (email dikirim di latar, jadi polling). */
export async function verifyLinkFor(request: APIRequestContext, email: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
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
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`email verifikasi untuk ${email} tidak ditemukan di Mailpit`);
}

export async function register(page: Page, email: string, password = PASSWORD) {
  await page.goto("/register");
  await page.getByLabel("Email perusahaan").fill(email);
  await page.getByLabel("Nama").fill("Uji E2E");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Daftar" }).click();
  await expect(page.getByTestId("form-alert")).toContainText("Periksa inbox");
}

/** Buka tautan dari email lalu tekan "Aktifkan akun" (aktivasi lewat POST). */
export async function activate(page: Page, link: string) {
  await page.goto(link);
  await page.getByRole("button", { name: "Aktifkan akun" }).click();
  await expect(page).toHaveURL(/\/login\?verified=1/);
}

export async function registerAndVerify(page: Page, request: APIRequestContext, email: string) {
  await register(page, email);
  await activate(page, await verifyLinkFor(request, email));
}

export async function login(page: Page, email: string, password = PASSWORD) {
  await page.getByLabel("Email perusahaan").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Masuk" }).click();
}

/** Login lewat route JSON; cookie sesi tersimpan di konteks browser halaman. */
export async function apiLogin(page: Page, email: string, password = PASSWORD) {
  const res = await page.request.post("/api/auth/login", { data: { email, password } });
  expect(res.status(), await res.text()).toBe(200);
}
