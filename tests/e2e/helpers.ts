import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8026";
export const PASSWORD = "dummy-kalimat-panjang-uji-123";

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@pcpexpress.com`;
}

/** Semua tautan aktivasi untuk email ini, terbaru dulu (email dikirim di latar, jadi polling). */
export async function verifyLinksFor(
  request: APIRequestContext,
  email: string,
  atLeast = 1,
): Promise<string[]> {
  for (let i = 0; i < 40; i++) {
    const res = await request.get(`${MAILPIT}/api/v1/search?query=to:${encodeURIComponent(email)}`);
    const body = (await res.json()) as {
      messages?: { ID: string; Subject: string; Created: string }[];
    };
    const msgs = (body.messages ?? [])
      .filter((m) => m.Subject.includes("Aktifkan"))
      .sort((a, b) => b.Created.localeCompare(a.Created));
    if (msgs.length >= atLeast) {
      const links: string[] = [];
      for (const m of msgs) {
        const detail = (await (await request.get(`${MAILPIT}/api/v1/message/${m.ID}`)).json()) as {
          Text: string;
        };
        const link = detail.Text.match(/https?:\/\/\S+\/verify\?token=[A-Za-z0-9_-]+/)?.[0];
        if (link) links.push(link);
      }
      if (links.length >= atLeast) return links;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`email verifikasi untuk ${email} tidak ditemukan di Mailpit`);
}

interface MailSummary {
  ID: string;
  Subject: string;
  Created: string;
}

/** Semua email untuk alamat ini yang subjeknya mengandung `subject`, terbaru dulu. */
export async function mailsFor(
  request: APIRequestContext,
  email: string,
  subject: string,
): Promise<MailSummary[]> {
  const res = await request.get(`${MAILPIT}/api/v1/search?query=to:${encodeURIComponent(email)}`);
  const body = (await res.json()) as { messages?: MailSummary[] };
  return (body.messages ?? [])
    .filter((m) => m.Subject.includes(subject))
    .sort((a, b) => b.Created.localeCompare(a.Created));
}

/** Tautan atur ulang password terbaru untuk email ini. */
export async function resetLinkFor(request: APIRequestContext, email: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const [latest] = await mailsFor(request, email, "Atur ulang password");
    if (latest) {
      const detail = (await (
        await request.get(`${MAILPIT}/api/v1/message/${latest.ID}`)
      ).json()) as { Text: string };
      const link = detail.Text.match(/https?:\/\/\S+\/reset-password\?token=[A-Za-z0-9_-]+/)?.[0];
      if (link) return link;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`email reset untuk ${email} tidak ditemukan di Mailpit`);
}

export async function requestReset(page: Page, email: string) {
  await page.goto("/lupa-password");
  await page.getByLabel("Email perusahaan").fill(email);
  await page.getByRole("button", { name: "Kirim tautan atur ulang" }).click();
}

export async function verifyLinkFor(request: APIRequestContext, email: string): Promise<string> {
  return (await verifyLinksFor(request, email))[0]!;
}

export async function register(page: Page, email: string, password = PASSWORD) {
  await page.goto("/register");
  await page.getByLabel("Email perusahaan").fill(email);
  await page.getByLabel("Nama").fill("Uji E2E");
  await page.locator("input[name=password]").fill(password);
  await page.getByRole("button", { name: "Daftar" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Periksa inbox Anda");
}

/** Buka tautan dari email, isi password pendaftaran, tekan "Aktifkan akun" (POST). */
export async function activate(page: Page, link: string, password = PASSWORD) {
  await page.goto(link);
  await page.getByLabel("Password yang Anda buat saat mendaftar").fill(password);
  await page.getByRole("button", { name: "Aktifkan akun" }).click();
  await expect(page).toHaveURL(/\/login\?verified=1/);
}

export async function registerAndVerify(page: Page, request: APIRequestContext, email: string) {
  await register(page, email);
  await activate(page, await verifyLinkFor(request, email));
}

export async function login(page: Page, email: string, password = PASSWORD) {
  await page.getByLabel("Email perusahaan").fill(email);
  await page.locator("input[name=password]").fill(password);
  await page.getByRole("button", { name: "Masuk" }).click();
}

/** Login lewat route JSON; cookie sesi tersimpan di konteks browser halaman. */
export async function apiLogin(page: Page, email: string, password = PASSWORD) {
  const res = await page.request.post("/api/auth/login", { data: { email, password } });
  expect(res.status(), await res.text()).toBe(200);
}
