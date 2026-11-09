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
const RETENTION = join(DIR, "app/retention.json");
const REQUEST = join(DIR, "app/sync-request");
const RUNNING = join(DIR, "running.json");
const AXE = readFileSync(join(process.cwd(), "node_modules/axe-core/axe.min.js"), "utf8");
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
  for (const f of [STATUS, OFFSITE, RETENTION, REQUEST, RUNNING]) rmSync(f, { force: true });
}

/** Pelanggaran axe serius/kritis di halaman saat ini (disuntik lewat evaluate, lolos CSP). */
async function axeSerious(page: Page) {
  await page.evaluate(AXE);
  const v = await page.evaluate(async () => {
    const axe = (
      window as unknown as {
        axe: {
          run: (
            ctx: Document,
            opt: object,
          ) => Promise<{
            violations: { id: string; impact: string; nodes: { target: unknown[] }[] }[];
          }>;
        };
      }
    ).axe;
    const r = await axe.run(document, { resultTypes: ["violations"] });
    return r.violations.map((x) => ({
      id: x.id,
      impact: x.impact,
      targets: x.nodes.slice(0, 3).map((n) => JSON.stringify(n.target)),
    }));
  });
  return v.filter((x) => x.impact === "serious" || x.impact === "critical");
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
  // NAS aktif disimpan → arsip tertunda langsung dikirim service backup (permintaan kirim ulang, T-tsvf).
  expect(existsSync(REQUEST)).toBe(true);
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

test("Admin › Backup (T-tsvf): arsip, ruang, jeda + petunjuk galat, kirim ulang sekarang, lama simpan", async () => {
  test.setTimeout(120_000);
  mkdirSync(join(DIR, "app"), { recursive: true });
  // Simpan NAS di tes sebelumnya meminta kirim ulang (dianggap sudah diambil service backup).
  rmSync(REQUEST, { force: true });
  const TARGET = "dashboard-backup@10.3.3.50:22/backup-data-dashboard";
  const GB = 1024 ** 3;
  const status = {
    state: "pending",
    target: TARGET,
    pending: 1,
    pendingSince: new Date(Date.now() - 86_400_000).toISOString(),
    lastBackupAt: new Date().toISOString(),
    lastBackupOk: true,
    lastArchive: "dashboard-20261109T190000Z.tar.age",
    lastSizeBytes: GB,
    lastOffsiteOkAt: "2026-11-08T19:05:00Z",
    error:
      'Failed to copy with 2 errors: last error was: Update ReadFrom failed: sftp: "Failure" (SSH_FX_FAILURE)',
    notified: "pending",
    updatedAt: new Date().toISOString(),
    syncFailures: 2,
    nextSyncAt: new Date(Date.now() + 3600_000).toISOString(),
    nextSyncEpoch: Math.floor(Date.now() / 1000) + 3600,
    retention: { localDays: 30, remoteDays: 30, source: "env" },
    archives: [
      { name: "dashboard-20261109T190000Z.tar.age", sizeBytes: GB, offsite: false },
      { name: "dashboard-20261108T190000Z.tar.age", sizeBytes: GB, offsite: true },
    ],
    localBytes: 2 * GB,
    disk: { totalBytes: 148 * GB, freeBytes: 1.5 * GB },
    remote: {
      target: TARGET,
      count: 12,
      bytes: 12 * GB,
      oldest: "dashboard-20261029T190000Z.tar.age",
      newest: "dashboard-20261108T190000Z.tar.age",
      checkedAt: "2026-11-08T19:06:00Z",
    },
    nasSpace: {
      target: TARGET,
      totalBytes: 4 * 1024 * GB,
      freeBytes: 0.5 * GB,
      checkedAt: new Date().toISOString(),
    },
  };
  writeFileSync(STATUS, JSON.stringify(status));

  await a.goto("/admin/backup");
  const card = a.getByTestId("backup-status");
  await expect(card).toContainText("NAS menolak menyimpan 2× berturut-turut");
  await expect(card).toContainText("dijeda sampai");
  await expect(card).toContainText("ruang penyimpanan NAS penuh atau kuota folder/akun habis");
  await expect(card).toContainText("SSH_FX_FAILURE");
  await expect(card).toContainText("Sisa 1,5 GB dari 148 GB");
  await expect(card).toContainText("Sisa 512 MB dari 4 TB");
  await expect(
    card.getByText("Kurang dari 2 × ukuran arsip terakhir", { exact: false }),
  ).toHaveCount(2);
  await expect(card).toContainText("12 arsip · 12 GB · terlama 30 Okt 2026 02.00 WIB");

  const table = a.getByTestId("backup-archives");
  await expect(table.getByRole("row")).toHaveCount(3);
  await expect(table.getByRole("row").nth(1)).toContainText("10 Nov 2026 02.00 WIB");
  await expect(table.getByRole("row").nth(1)).toContainText("Menunggu dikirim");
  await expect(table.getByRole("row").nth(2)).toContainText("Sudah di NAS");
  expect(await axeSerious(a)).toEqual([]);

  // Kirim ulang sekarang → permintaan untuk service backup; tombol terkunci sampai diproses.
  const send = card.getByRole("button", { name: "Kirim ulang sekarang" });
  await send.click();
  await expect(card.getByTestId("sync-state")).toContainText("Permintaan terkirim");
  await expect(send).toBeDisabled();
  expect(existsSync(REQUEST)).toBe(true);
  // Service backup mengambil permintaan dan berhasil → halaman memuat ulang status sendiri.
  rmSync(REQUEST);
  writeFileSync(
    STATUS,
    JSON.stringify({
      ...status,
      state: "ok",
      pending: 0,
      pendingSince: null,
      error: null,
      syncFailures: 0,
      nextSyncAt: null,
      nextSyncEpoch: null,
      lastRequestAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      archives: status.archives.map((x) => ({ ...x, offsite: true })),
    }),
  );
  await expect(card.getByText("Normal", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(card.getByRole("button", { name: "Kirim ulang sekarang" })).toBeEnabled();
  await expect(table.getByText("Menunggu dikirim")).toHaveCount(0);

  // Lama simpan: validasi per kolom, simpan ke retention.json (600), kembali ke bawaan server.
  const form = a.getByTestId("retention-form");
  await expect(form.getByTestId("retention-effective")).toContainText(
    "server 30 hari, NAS 30 hari (bawaan server)",
  );
  const localDays = form.getByRole("textbox", { name: /Lama simpan di server/ });
  const remoteDays = form.getByRole("textbox", { name: /Lama simpan di NAS/ });
  await localDays.fill("2");
  await form.getByRole("button", { name: "Simpan lama simpan" }).click();
  await expect(form.getByText("Lama simpan di server minimal 3 hari.")).toBeVisible();
  await expect(localDays).toBeFocused();
  expect(existsSync(RETENTION)).toBe(false);

  await localDays.fill("5");
  await expect(form).toContainText("Perkiraan ruang: ± 5 GB (5 × arsip terakhir 1 GB)");
  await remoteDays.fill("60");
  await form.getByRole("button", { name: "Simpan lama simpan" }).click();
  await expect(form.locator("[data-testid=form-alert][data-tone=success]")).toContainText(
    "Tersimpan: server 5 hari, NAS 60 hari",
  );
  expect(statSync(RETENTION).mode & 0o777).toBe(0o600);
  expect(JSON.parse(readFileSync(RETENTION, "utf8"))).toMatchObject({
    localDays: 5,
    remoteDays: 60,
    updatedBy: A.toLowerCase(),
  });
  // Diterapkan service backup dalam ± 1 menit (permintaan yang sama dengan "Kirim ulang sekarang").
  expect(existsSync(REQUEST)).toBe(true);
  rmSync(REQUEST);

  await a.reload();
  await expect(localDays).toHaveValue("5");
  await form.getByRole("button", { name: "Pakai bawaan server" }).click();
  await expect(form.locator("[data-testid=form-alert][data-tone=success]")).toContainText(
    "Kembali ke bawaan server",
  );
  expect(existsSync(RETENTION)).toBe(false);
  rmSync(REQUEST, { force: true });

  rmSync(STATUS);
});
