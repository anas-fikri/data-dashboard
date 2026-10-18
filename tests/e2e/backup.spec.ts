import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { envFileValue, pageFor, registerAndVerify, uniqueEmail } from "./helpers";

/*
 * T-7psf: Admin › Backup — admin mengisi target S3 (RustFS dev sebagai "NAS"), tes koneksi gagal/berhasil,
 * simpan ke offsite.json (600) tanpa secret kembali ke halaman; status dari service backup (status.json)
 * tampil di halaman dan sebagai banner untuk admin saja. Proyek sendiri (setelah admin): status.json di
 * folder dev bersama memunculkan banner untuk semua admin.
 */
test.describe.configure({ mode: "serial" });

const A = uniqueEmail("backup-admin");
const U = uniqueEmail("backup-user");
const DIR = join(process.cwd(), ".cache/backup-config");
const STATUS = join(DIR, "status.json");
const OFFSITE = join(DIR, "offsite.json");
const S3 = {
  endpoint: envFileValue("S3_ENDPOINT")!,
  bucket: envFileValue("S3_BUCKET")!,
  key: envFileValue("S3_ACCESS_KEY")!,
  secret: envFileValue("S3_SECRET_KEY")!,
};

let a: Page;
let u: Page;

function clean() {
  rmSync(STATUS, { force: true });
  rmSync(OFFSITE, { force: true });
}

test.beforeAll(async ({ browser, request }) => {
  test.setTimeout(120_000);
  clean();
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
  clean();
  await Promise.all([a, u].map((p) => p?.context().close()));
});

test("non-admin membuka /admin/backup → 404", async () => {
  const res = await u.goto("/admin/backup");
  expect(res?.status()).toBe(404);
});

test("admin mengisi target S3: tes koneksi gagal lalu berhasil, simpan tanpa secret kembali ke halaman", async () => {
  await a.goto("/admin/backup");
  await expect(a.getByTestId("backup-status")).toContainText("Belum ada catatan backup");
  const form = a.getByTestId("offsite-form");
  await form.getByRole("textbox", { name: "Endpoint" }).fill(S3.endpoint);
  await form.getByRole("textbox", { name: "Bucket" }).fill(S3.bucket);
  await form.getByRole("textbox", { name: "Folder" }).fill("uji-e2e-backup");
  await form.getByRole("textbox", { name: "Access key" }).fill(S3.key);
  const secret = form.getByLabel("Secret key");
  await secret.fill("secret-yang-salah");
  await form.getByRole("button", { name: "Tes koneksi" }).click();
  await expect(form.locator("[data-testid=form-alert][data-tone=error]")).toContainText(
    "Access key atau secret ditolak.",
  );

  await secret.fill(S3.secret);
  await form.getByRole("button", { name: "Tes koneksi" }).click();
  await expect(form.locator("[data-testid=form-alert][data-tone=success]")).toContainText(
    "Koneksi berhasil",
  );
  await form.getByRole("button", { name: "Simpan" }).click();
  await expect(form.locator("[data-testid=form-alert][data-tone=success]")).toContainText(
    "Tersimpan.",
  );
  await expect(secret).toHaveValue("");

  expect(statSync(OFFSITE).mode & 0o777).toBe(0o600);
  expect(JSON.parse(readFileSync(OFFSITE, "utf8"))).toMatchObject({
    enabled: true,
    bucket: S3.bucket,
    prefix: "uji-e2e-backup",
    updatedBy: A.toLowerCase(),
  });
  await a.reload();
  await expect(
    form.getByText("Tersimpan. Kosongkan untuk tetap memakai secret yang ada."),
  ).toBeVisible();
  expect(await a.content()).not.toContain(S3.secret);
});

test("status tertunda dari service backup → status di Admin › Backup + banner untuk admin saja", async () => {
  mkdirSync(DIR, { recursive: true });
  const since = new Date(Date.now() - 3 * 3600_000).toISOString();
  writeFileSync(
    STATUS,
    JSON.stringify({
      state: "pending",
      target: "10.3.3.50:9000/backup-data-dashboard/data-dashboard",
      pending: 2,
      pendingSince: since,
      lastBackupAt: new Date().toISOString(),
      lastBackupOk: true,
      lastArchive: "dashboard-20261018T190000Z.tar.age",
      lastSizeBytes: 404 * 1024 * 1024,
      lastOffsiteOkAt: null,
      error: "dial tcp 10.3.3.50:9000: i/o timeout",
      notified: "pending",
      updatedAt: new Date().toISOString(),
    }),
  );
  await a.goto("/");
  const banner = a.getByTestId("backup-alert");
  await expect(banner).toHaveAttribute("data-tone", "warning");
  await expect(banner).toContainText("2 arsip menunggu");
  await banner.getByRole("link", { name: "Lihat status backup" }).click();
  await expect(a).toHaveURL(/\/admin\/backup$/);
  const card = a.getByTestId("backup-status");
  await expect(card).toContainText("Salinan off-VM tertunda");
  await expect(card).toContainText("2 arsip disimpan sementara di server");
  await expect(card).toContainText("i/o timeout");

  await u.goto("/");
  await expect(u.getByTestId("backup-alert")).toHaveCount(0);

  rmSync(STATUS);
  await a.goto("/");
  await expect(a.getByTestId("backup-alert")).toHaveCount(0);
  expect(existsSync(STATUS)).toBe(false);
});
