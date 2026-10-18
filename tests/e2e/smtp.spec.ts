import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  MAILPIT,
  mailsFor,
  pageFor,
  registerAndVerify,
  requestReset,
  uniqueEmail,
} from "./helpers";

/*
 * T-byys: Admin › Email — pengaturan SMTP bawaan (.env, Mailpit dev) terisi, email uji gagal/berhasil,
 * simpan ke app/smtp.json (600) tanpa password kembali ke halaman, dan email aplikasi berikutnya memakai
 * pengirim baru tanpa restart. Proyek "backup" (sendiri): smtp.json di folder dev bersama berlaku untuk
 * semua email dev selama spec ini.
 */
test.describe.configure({ mode: "serial" });

const A = uniqueEmail("smtp-admin");
const U = uniqueEmail("smtp-user");
const FILE = join(process.cwd(), ".cache/backup-config/app/smtp.json");
const NAME = "Dasbor Uji E2E";

let a: Page;
let u: Page;

async function fromOf(
  request: import("@playwright/test").APIRequestContext,
  email: string,
  subject: string,
) {
  const [latest] = await mailsFor(request, email, subject);
  if (!latest) return null;
  const detail = (await (await request.get(`${MAILPIT}/api/v1/message/${latest.ID}`)).json()) as {
    From: { Name: string; Address: string };
  };
  return detail.From;
}

test.beforeAll(async ({ browser, request }) => {
  test.setTimeout(120_000);
  rmSync(FILE, { force: true });
  execFileSync("node", ["scripts/dev-reset-ratelimit.mjs", "register:ip", "verify:ip"]);
  const setup = await browser.newPage();
  for (const email of [A, U]) {
    await setup.context().clearCookies();
    await registerAndVerify(setup, request, email);
  }
  await setup.close();
  execFileSync("node", ["scripts/dev-make-admin.mjs", A]);
  a = await pageFor(browser, A);
  u = await pageFor(browser, U);
});

test.afterAll(async () => {
  rmSync(FILE, { force: true });
  await Promise.all([a, u].map((p) => p?.context().close()));
});

test("non-admin membuka /admin/email → 404", async () => {
  expect((await u.goto("/admin/email"))?.status()).toBe(404);
});

test("email uji gagal (port salah) lalu berhasil; simpan; email aplikasi memakai pengirim baru", async ({
  request,
}) => {
  await a.goto("/admin/email");
  await expect(a.getByTestId("smtp-source")).toContainText("bawaan server");
  const form = a.getByTestId("smtp-form");
  const port = form.getByRole("textbox", { name: "Port" });
  const original = await port.inputValue();
  await expect(form.getByRole("textbox", { name: "Server SMTP" })).toHaveValue("127.0.0.1");
  await form.getByRole("textbox", { name: "Nama pengirim" }).fill(NAME);
  await form.getByRole("textbox", { name: "Kirim email uji ke" }).fill(U);

  await port.fill("1");
  await form.getByRole("button", { name: "Kirim email uji" }).click();
  await expect(form.locator("[data-testid=form-alert][data-tone=error]")).toContainText(
    "Tidak bisa terhubung ke server SMTP",
  );

  await port.fill(original);
  await form.getByRole("button", { name: "Kirim email uji" }).click();
  await expect(form.locator("[data-testid=form-alert][data-tone=success]")).toContainText(
    `Email uji terkirim ke ${U.toLowerCase()}`,
  );
  await expect
    .poll(async () => (await fromOf(request, U, "Email uji Data Dashboard"))?.Name)
    .toBe(NAME);

  await form.getByRole("button", { name: "Simpan" }).click();
  await expect(form.locator("[data-testid=form-alert][data-tone=success]")).toContainText(
    "Tersimpan.",
  );
  expect(existsSync(FILE)).toBe(true);
  expect(statSync(FILE).mode & 0o777).toBe(0o600);
  expect(JSON.parse(readFileSync(FILE, "utf8"))).toMatchObject({
    fromName: NAME,
    updatedBy: A.toLowerCase(),
  });
  await a.reload();
  await expect(a.getByTestId("smtp-source")).toContainText("dari halaman ini");

  // Email aplikasi berikutnya (lupa password) memakai pengaturan baru tanpa restart.
  const reset = await u.context().newPage();
  await reset.context().clearCookies();
  await requestReset(reset, U);
  await expect.poll(async () => (await fromOf(request, U, "Atur ulang password"))?.Name).toBe(NAME);
  await reset.close();
});
