import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { apiLogin, registerAndVerify, uniqueEmail } from "./helpers";

/*
 * v1.18 monitor sumber daya (T-ee46, ADR-0010). Akses API memakai server sungguhan (METRICS_NODE_URL boleh
 * kosong atau terisi); tampilan kartu sidebar dan halaman admin memakai respons tiruan (page.route) supaya
 * angka/ambang pasti, tanpa node-exporter di mesin uji.
 *   AC3 kartu semua user, ikon saat diciutkan · AC4 halaman admin + API admin 404 non-admin, tanpa host/IP/antarmuka
 */
const USER = uniqueEmail("metrics-user");
const ADMIN = uniqueEmail("metrics-admin");
const now = Date.now();
const pt = (i: number, cpu: number) => ({
  t: now - (59 - i) * 60_000,
  cpu,
  mem: 0.62,
  disk: 0.48,
  rx: 120_000 + i * 1_000,
  tx: 30_000,
});
// 5 menit terakhir CPU ± 90 % (ambang memakai rata-rata 5 menit, review T-ee46 M1).
const series = Array.from({ length: 60 }, (_, i) => pt(i, i >= 54 ? 0.9 : 0.2 + (i % 5) / 100));
const SUMMARY = {
  ok: true,
  enabled: true,
  available: true,
  latest: { ...series[59]!, cpu: 0.91, iowait: 0.02, load1: 3.2, cpus: 8 },
  series,
  queue: { waiting: 2, active: 1, workerDown: false },
};
const HOST = {
  ...SUMMARY.latest,
  memUsed: 10 * 1024 ** 3,
  memTotal: 16 * 1024 ** 3,
  swapUsed: 0,
  swapTotal: 0,
  disks: [
    { mount: "/", used: 40 * 1024 ** 3, size: 100 * 1024 ** 3 },
    { mount: "/data", used: 900 * 1024 ** 3, size: 1000 * 1024 ** 3 },
  ],
  diskBusy: 0.1,
};
const ADMIN_BODY = {
  ...SUMMARY,
  host: HOST,
  day: series,
  workers: 1,
  services: [
    { service: "app", t: now, cpu: 0.35, mem: 700 * 1024 ** 2, memMax: 3 * 1024 ** 3 },
    { service: "worker", t: now, cpu: 1.2, mem: 2 * 1024 ** 3, memMax: null },
  ],
  accounts: {
    quotaBytes: 20 * 1024 ** 3,
    rows: [
      {
        id: "u1",
        email: "budi@contoh.id",
        name: "Budi",
        running: 2,
        seconds: 130,
        jobs: { upload: 1, recast: 0, export: 2 },
        storageBytes: 5 * 1024 ** 3,
      },
    ],
  },
};

async function mock(page: Page, body: object, path = "/api/metrics") {
  await page.route(`**${path}`, (r) => r.fulfill({ json: body }));
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser, request }) => {
  for (const email of [USER, ADMIN]) {
    const p = await browser.newPage();
    await registerAndVerify(p, request, email);
    await p.close();
  }
  execFileSync("node", ["scripts/dev-make-admin.mjs", ADMIN]);
});

test("API: tanpa sesi 401; user biasa ringkasan tanpa host/mount/antarmuka; admin API 404", async ({
  page,
  playwright,
}) => {
  const anon = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
  expect((await anon.get("/api/metrics")).status()).toBe(401);
  expect((await anon.get("/api/metrics/admin")).status()).toBe(401);
  await anon.dispose();

  await apiLogin(page, USER);
  const res = await page.request.get("/api/metrics");
  expect(res.status()).toBe(200);
  expect(res.headers()["cache-control"]).toContain("no-store");
  const body = await res.json();
  expect(Object.keys(body).sort()).toEqual([
    "available",
    "enabled",
    "latest",
    "ok",
    "queue",
    "series",
  ]);
  expect(JSON.stringify(body)).not.toMatch(/mount|disks|"workers"|hostname|device|eth\d|ens\d/);
  expect((await page.request.get("/api/metrics/admin")).status()).toBe(404);
  const admin = await page.goto("/admin/sumber-daya");
  expect(admin?.status()).toBe(404);
});

test("AC3: kartu Server di sidebar — angka, ambang bertanda teks, antrean; diciutkan → ikon", async ({
  page,
}) => {
  await mock(page, SUMMARY);
  await apiLogin(page, USER);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const card = page.getByTestId("server-card");
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("data-level", "warn");
  await expect(card.getByTestId("server-status")).toHaveText("Beban tinggi: CPU");
  await expect(card.getByTestId("server-cpu")).toHaveText("91% (tinggi)");
  await expect(card.getByTestId("server-mem")).toHaveText("62%");
  await expect(card.getByTestId("server-disk")).toHaveText("48%");
  await expect(card.getByTestId("server-net")).toContainText("KB/dtk");
  await expect(card.getByTestId("server-queue")).toHaveText(
    "Pemroses: aktif · 1 diproses · 2 menunggu",
  );
  // User biasa tidak mendapat tautan detail admin.
  await expect(card.getByTestId("server-card-detail")).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("server-card.png") });

  await page.getByTestId("sidebar-collapse").click();
  const icon = page.getByTestId("server-card-collapsed");
  await expect(icon).toHaveAccessibleName(
    "Server: Beban tinggi: CPU. Lebarkan sidebar untuk detail",
  );
  await icon.click();
  await expect(page.getByTestId("sidebar")).toHaveAttribute("data-collapsed", "false");
  await expect(card).toBeVisible();
  // Fokus pindah ke kartu (tombol ikon hilang), bukan jatuh ke <body> (review M3).
  await expect(card).toBeFocused();
});

test("AC3: pemroses mati → status merah bertulisan; monitor belum dipasang → kartu tidak tampil", async ({
  page,
}) => {
  await mock(page, { ...SUMMARY, queue: { waiting: 3, active: 0, workerDown: true } });
  await apiLogin(page, USER);
  await page.goto("/");
  await expect(page.getByTestId("server-status")).toHaveText("Pemroses unggahan tidak aktif");
  await expect(page.getByTestId("server-queue")).toHaveText("Pemroses: tidak aktif · 3 menunggu");

  await page.unroute("**/api/metrics");
  await mock(page, {
    ok: true,
    enabled: false,
    available: false,
    latest: null,
    series: [],
    queue: null,
  });
  await page.goto("/");
  await expect(page.getByTestId("sidebar")).toBeVisible();
  await expect(page.getByTestId("server-card")).toHaveCount(0);
});

test("AC4: admin — tautan Detail, grafik 1 jam/24 jam, disk per mount, per layanan", async ({
  page,
}) => {
  await mock(page, SUMMARY);
  await mock(page, ADMIN_BODY, "/api/metrics/admin");
  await apiLogin(page, ADMIN);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin");
  await page.getByRole("link", { name: /Sumber daya server/ }).click();
  await expect(page).toHaveURL(/\/admin\/sumber-daya$/);
  const panel = page.getByTestId("resources-panel");
  await expect(panel).toBeVisible();
  await expect(page.getByTestId("resources-status")).toHaveText("Beban tinggi: CPU");
  // Jam di luar live region (review M2).
  await expect(page.getByTestId("resources-time")).toContainText("WIB");
  await expect(page.getByTestId("chart-cpu")).toContainText("91%");
  await expect(page.getByTestId("res-load")).toHaveText("3,20 untuk 8 inti (0,4 per inti)");
  const disks = page.getByTestId("res-disks");
  await expect(disks.getByRole("row")).toHaveCount(3);
  await expect(disks.getByRole("row").nth(2)).toContainText("90% (tinggi)");
  const svc = page.getByTestId("res-services-table");
  await expect(svc.getByRole("row").nth(1)).toContainText("700 MB3 GB (23%)");
  await expect(svc.getByRole("row").nth(2)).toContainText("Tanpa batas");
  await expect(page.getByTestId("res-queue")).toContainText("aktif: 1 · 1 diproses · 2 menunggu");
  // T-qed9: per akun (perkiraan) — waktu query 15 menit, query berjalan, pekerjaan, storage.
  const acct = page.getByTestId("res-accounts-table").getByRole("row").nth(1);
  await expect(acct).toContainText("Budi");
  await expect(acct).toContainText("2 mnt 10 dtk");
  await expect(acct).toContainText("1 unggahan, 2 ekspor");
  await expect(acct).toContainText("5 GB dari 20 GB");
  await page.getByTestId("range-day").click();
  await expect(page.getByTestId("range-day")).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: test.info().outputPath("admin-resources.png"), fullPage: true });

  // Kartu sidebar admin punya tautan detail.
  await expect(page.getByTestId("server-card-detail")).toHaveAttribute(
    "href",
    "/admin/sumber-daya",
  );
});

test("AC4: halaman admin tanpa monitor → petunjuk pemasangan", async ({ page }) => {
  await mock(
    page,
    { ...ADMIN_BODY, enabled: false, available: false, host: null, latest: null },
    "/api/metrics/admin",
  );
  await apiLogin(page, ADMIN);
  await page.goto("/admin/sumber-daya");
  await expect(page.getByTestId("resources-off")).toContainText("belum dipasang");
});

test("T-qed9: API admin sungguhan memuat tabel per akun; per akun gagal tidak menjatuhkan halaman", async ({
  page,
}) => {
  await apiLogin(page, ADMIN);
  const res = await page.request.get("/api/metrics/admin");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.accounts).not.toBeUndefined();
  if (body.accounts) expect(Array.isArray(body.accounts.rows)).toBe(true);

  await mock(page, { ...ADMIN_BODY, accounts: null }, "/api/metrics/admin");
  await page.goto("/admin/sumber-daya");
  await expect(page.getByTestId("res-accounts-error")).toBeVisible();
  await expect(page.getByTestId("chart-cpu")).toBeVisible();
});
