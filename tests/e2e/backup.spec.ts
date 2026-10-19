import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startFakeSftp, type FakeSftp } from "../stubs/sftp-server";
import { pageFor, registerAndVerify, uniqueEmail } from "./helpers";

/*
 * T-7psf / T-y8qq: Admin › Backup — admin mengisi NAS Synology (server SFTP tiruan di proses tes), tes
 * koneksi gagal/berhasil + kunci host dipin, simpan ke offsite.json (600) tanpa password kembali ke halaman,
 * NAS diinstal ulang (kunci host berubah) → ditolak sampai kunci dilupakan; status dari service backup
 * (status.json) tampil di halaman dan sebagai banner untuk admin saja. Proyek sendiri (setelah admin):
 * status.json di folder dev bersama memunculkan banner untuk semua admin.
 */
test.describe.configure({ mode: "serial" });

const A = uniqueEmail("backup-admin");
const U = uniqueEmail("backup-user");
const DIR = join(process.cwd(), ".cache/backup-config");
const STATUS = join(DIR, "status.json");
const OFFSITE = join(DIR, "app/offsite.json");
const NAS_USER = "dashboard-backup";
const NAS_PASSWORD = "dummy-nas-password-e2e";
const FOLDER = "/backup-data-dashboard";

let a: Page;
let u: Page;
let nasRoot = "";
let nas: FakeSftp;

const fingerprint = (hostKey: string) =>
  `SHA256:${createHash("sha256")
    .update(Buffer.from(hostKey.split(" ")[1]!, "base64"))
    .digest("base64")
    .replace(/=+$/, "")}`;

function clean() {
  rmSync(STATUS, { force: true });
  rmSync(OFFSITE, { force: true });
}

test.beforeAll(async ({ browser, request }) => {
  test.setTimeout(120_000);
  clean();
  nasRoot = mkdtempSync(join(tmpdir(), "dd-e2e-nas-"));
  mkdirSync(join(nasRoot, FOLDER));
  nas = await startFakeSftp({ root: nasRoot, username: NAS_USER, password: NAS_PASSWORD });
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
  await nas?.close();
  rmSync(nasRoot, { recursive: true, force: true });
  await Promise.all([a, u].map((p) => p?.context().close()));
});

test("non-admin membuka /admin/backup → 404", async () => {
  const res = await u.goto("/admin/backup");
  expect(res?.status()).toBe(404);
});

test("admin mengisi NAS Synology: tes koneksi gagal lalu berhasil, kunci host dipin, simpan tanpa password kembali", async () => {
  await a.goto("/admin");
  const integrasi = a.getByRole("region", { name: "Integrasi" });
  await expect(integrasi.getByRole("link", { name: /Email \(SMTP\)/ })).toBeVisible();
  await integrasi.getByRole("link", { name: /Backup ke NAS Synology/ }).click();
  await expect(a).toHaveURL(/\/admin\/backup$/);

  await expect(a.getByTestId("backup-status")).toContainText("Belum ada catatan backup");
  const form = a.getByTestId("offsite-form");
  await form.getByRole("textbox", { name: "Alamat NAS" }).fill("127.0.0.1");
  await form.getByRole("textbox", { name: "Port SFTP" }).fill(String(nas.port));
  await form.getByRole("textbox", { name: "Username" }).fill(NAS_USER);
  await form.getByRole("textbox", { name: "Folder tujuan" }).fill(FOLDER);
  const password = form.locator("#offsite-password");
  await password.fill("password-yang-salah");
  await form.getByRole("button", { name: "Tes koneksi" }).click();
  await expect(form.locator("[data-testid=form-alert][data-tone=error]")).toContainText(
    "Username atau password ditolak NAS.",
  );

  // Belum dites: simpan ditolak karena kunci host belum ada.
  await form.getByRole("button", { name: "Simpan" }).click();
  await expect(form.locator("[data-testid=form-alert][data-tone=error]")).toContainText(
    "Tekan Tes koneksi dulu",
  );

  await password.fill(NAS_PASSWORD);
  await form.getByRole("button", { name: "Tes koneksi" }).click();
  await expect(form.locator("[data-testid=form-alert][data-tone=success]")).toContainText(
    "Kunci host NAS dicatat",
  );
  await expect(form.getByTestId("offsite-fingerprint")).toHaveText(fingerprint(nas.hostKey));
  await form.getByRole("button", { name: "Simpan" }).click();
  await expect(form.locator("[data-testid=form-alert][data-tone=success]")).toContainText(
    "Tersimpan.",
  );
  await expect(password).toHaveValue("");

  expect(statSync(OFFSITE).mode & 0o777).toBe(0o600);
  expect(JSON.parse(readFileSync(OFFSITE, "utf8"))).toMatchObject({
    enabled: true,
    host: "127.0.0.1",
    port: nas.port,
    username: NAS_USER,
    password: NAS_PASSWORD,
    folder: FOLDER,
    hostKey: nas.hostKey,
    updatedBy: A.toLowerCase(),
  });
  await a.reload();
  await expect(
    form.getByText("Tersimpan. Kosongkan untuk tetap memakai password yang ada", { exact: false }),
  ).toBeVisible();
  await expect(form.getByTestId("offsite-fingerprint")).toHaveText(fingerprint(nas.hostKey));
  expect(await a.content()).not.toContain(NAS_PASSWORD);
});

test("NAS diinstal ulang (kunci host berubah) → tes ditolak sampai kunci host dilupakan", async () => {
  const port = nas.port;
  const oldKey = nas.hostKey;
  await nas.close();
  nas = await startFakeSftp({ root: nasRoot, username: NAS_USER, password: NAS_PASSWORD, port });

  await a.goto("/admin/backup");
  const form = a.getByTestId("offsite-form");
  // Password kosong = password tersimpan (NAS + akun sama), tetapi kunci host lain ditolak.
  await form.getByRole("button", { name: "Tes koneksi" }).click();
  const error = form.locator("[data-testid=form-alert][data-tone=error]");
  await expect(error).toContainText("Kunci host NAS berbeda");
  await expect(error).toContainText(fingerprint(nas.hostKey));
  expect(nas.stats.passwordAttempts).toBe(0);

  // Kunci dilupakan: password tersimpan tidak dipakai ulang untuk kunci host baru (review T-y8qq #1).
  await form.getByRole("button", { name: "Lupakan kunci host" }).click();
  await expect(form.getByTestId("offsite-fingerprint")).toHaveCount(0);
  await form.getByRole("button", { name: "Tes koneksi" }).click();
  await expect(form.getByText("kunci host berubah — isi password lagi")).toBeVisible();
  await expect(form.locator("#offsite-password")).toBeFocused();
  expect(nas.stats.passwordAttempts).toBe(0);
  await form.locator("#offsite-password").fill(NAS_PASSWORD);
  await form.getByRole("button", { name: "Tes koneksi" }).click();
  await expect(form.getByTestId("offsite-fingerprint")).toHaveText(fingerprint(nas.hostKey));
  await form.getByRole("button", { name: "Simpan" }).click();
  await expect(form.locator("[data-testid=form-alert][data-tone=success]")).toContainText(
    "Tersimpan.",
  );
  const saved = JSON.parse(readFileSync(OFFSITE, "utf8"));
  expect(saved.hostKey).toBe(nas.hostKey);
  expect(saved.hostKey).not.toBe(oldKey);
});

test("status tertunda dari service backup → status di Admin › Backup + banner untuk admin saja", async () => {
  mkdirSync(DIR, { recursive: true });
  const since = new Date(Date.now() - 3 * 3600_000).toISOString();
  writeFileSync(
    STATUS,
    JSON.stringify({
      state: "pending",
      target: "dashboard-backup@10.3.3.50:22/backup-data-dashboard",
      pending: 2,
      pendingSince: since,
      lastBackupAt: new Date().toISOString(),
      lastBackupOk: true,
      lastArchive: "dashboard-20261018T190000Z.tar.age",
      lastSizeBytes: 404 * 1024 * 1024,
      lastOffsiteOkAt: null,
      error: "dial tcp 10.3.3.50:22: i/o timeout",
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
