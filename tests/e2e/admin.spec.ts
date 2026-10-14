import { execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import {
  PASSWORD,
  apiLogin,
  login,
  registerAndVerify,
  startWorker,
  stopWorker,
  uniqueEmail,
} from "./helpers";

/*
 * T-019: halaman admin pengguna (nonaktifkan, alihkan dataset, beri/cabut admin, AuditLog).
 * Semua pengguna dibuat di sini (uniqueEmail) dan A diangkat lewat dev-make-admin, jadi test tidak
 * bergantung pada jumlah admin global; LAST_ADMIN diuji unit (tests/features/admin).
 *   A = admin pelaku · B = pemilik dataset yang dinonaktifkan · C = penerima dataset · D = admin sementara
 * C dipilih lewat pencarian server di dialog alih (ketik email → opsi radio), bukan daftar statis.
 */
test.describe.configure({ mode: "serial" });

const A = uniqueEmail("admin-a");
const B = uniqueEmail("admin-b");
const C = uniqueEmail("admin-c");
const D = uniqueEmail("admin-d");
const USERS = "/admin/pengguna";
const ROWS = 42;
const DATASET = `Omzet alih ${Date.now()}`;
const KPI = "Jumlah transaksi";
const dir = mkdtempSync(join(tmpdir(), "dd-e2e-admin-"));
let worker: ChildProcess | null = null;
let datasetId = "";
let dashboardUrl = "";

interface AuditRow {
  action: string;
  actorId: string | null;
  targetType: string;
  targetId: string;
  meta: Record<string, unknown> | null;
  ip: string;
}

function userIds(...emails: string[]): Record<string, string> {
  return JSON.parse(
    execFileSync("node", ["scripts/dev-audit-log.mjs", "ids", ...emails]).toString(),
  );
}

function auditFor(email: string): AuditRow[] {
  return JSON.parse(
    execFileSync("node", ["scripts/dev-audit-log.mjs", "target", email]).toString(),
  );
}

function fixtureCsv(): string {
  const lines = ["Cabang;Tanggal;Omzet"];
  for (let i = 0; i < ROWS; i++) {
    lines.push(`Cabang ${i % 4};${String((i % 28) + 1).padStart(2, "0")}-10-2026;${1000 + i}`);
  }
  const path = join(dir, "omzet-alih.csv");
  writeFileSync(path, lines.join("\n"));
  return path;
}

/** Satu konteks browser (cookie terpisah) per pengguna. */
async function pageFor(browser: Browser, email: string): Promise<Page> {
  const page = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  await apiLogin(page, email);
  return page;
}

const widgetTitled = (page: Page, title: string) =>
  page.getByTestId("widget").filter({ has: page.getByRole("heading", { name: title }) });

/** KPI "Jumlah baris" di dashboard baru (alur widgets.spec.ts). */
async function addCountKpi(page: Page) {
  await page
    .getByTestId("canvas-toolbar")
    .getByRole("button", { name: "Tambah widget", exact: true })
    .click();
  await expect(page.getByTestId("widget")).toHaveCount(1);
  const panel = page.getByTestId("widget-panel");
  await expect(panel.getByRole("heading", { name: "Pengaturan widget" })).toBeFocused();
  await panel.getByLabel("Judul", { exact: true }).fill(KPI);
  await panel.getByLabel("Judul", { exact: true }).press("Enter");
  await expect(widgetTitled(page, KPI)).toHaveCount(1);
  await panel.getByText("Angka", { exact: true }).click();
  await expect(panel.getByTestId("config-status")).toHaveAttribute("data-state", "saved");
  await panel.getByLabel("Nilai", { exact: true }).click();
  await page.getByRole("option", { name: "Jumlah baris", exact: true }).click();
  await expect(panel.getByTestId("config-status")).toHaveAttribute("data-state", "saved");
  await expect(widgetTitled(page, KPI).getByTestId("kpi-value")).toHaveText(String(ROWS));
}

/** Daftar pengguna disaring ke satu email (daftar dipaginasi 50 per halaman). */
async function openRow(page: Page, email: string): Promise<Locator> {
  await page.goto(`${USERS}?q=${encodeURIComponent(email)}`);
  const row = page.locator(`[data-testid="admin-user-row"][data-email="${email}"]`);
  await expect(row).toHaveCount(1);
  return row;
}

/** Menu baris → item → dialog konfirmasi → tombol konfirmasi; tunggu pemberitahuan sukses. */
async function rowAction(page: Page, row: Locator, item: string, confirm: string) {
  await row.getByTestId("admin-row-actions").click();
  await page.getByRole("menuitem", { name: item, exact: true }).click();
  const dialog = page.getByTestId("admin-confirm");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: confirm, exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("admin-result")).toHaveAttribute("data-tone", "success");
}

const statusCell = (row: Locator) => row.getByRole("cell").nth(2);
const roleCell = (row: Locator) => row.getByRole("cell").nth(1);

test.describe("admin pengguna", () => {
  let a: Page;
  let b: Page;
  let c: Page;
  let d: Page;

  test.beforeAll(async ({ browser, request }) => {
    test.setTimeout(180_000);
    execFileSync("node", ["scripts/dev-reset-ratelimit.mjs", "register:ip", "verify:ip"]); // suite penuh: batas per IP
    const setup = await browser.newPage();
    for (const email of [A, B, C, D]) {
      await setup.context().clearCookies();
      await registerAndVerify(setup, request, email);
    }
    await setup.close();
    execFileSync("node", ["scripts/dev-make-admin.mjs", A]);

    a = await pageFor(browser, A);
    b = await pageFor(browser, B);
    c = await pageFor(browser, C);
    d = await pageFor(browser, D);

    // B: dataset berisi data sungguhan + dashboard dengan KPI jumlah baris.
    worker = await startWorker("admin");
    await b.goto("/datasets/baru");
    await b.getByLabel("Nama dataset").fill(DATASET);
    await b.getByRole("button", { name: "Buat dataset" }).click();
    await expect(b).toHaveURL(/\/datasets\/[a-z0-9]{20,32}\?created=1$/);
    datasetId = new URL(b.url()).pathname.split("/").pop()!;
    await b.getByTestId("upload-input").setInputFiles(fixtureCsv());
    await expect(b.getByTestId("dataset-schema-link")).toBeVisible({ timeout: 90_000 });
    await b.goto(`/dashboards/baru?dataset=${datasetId}`);
    await b.getByLabel("Nama dashboard").fill("Ringkasan alih");
    await b.getByRole("button", { name: "Buat dashboard" }).click();
    await expect(b).toHaveURL(/\?mode=edit$/);
    dashboardUrl = b.url().replace("?mode=edit", "");
    await addCountKpi(b);
  });

  // Admin A dan akun B–D tidak dicabut di sini: global teardown (dev-purge-test-data) menghapus
  // semua akun uniqueEmail setelah datasetnya dibersihkan, jadi admin e2e tidak menumpuk di DB dev.
  test.afterAll(async () => {
    await stopWorker(worker);
    await Promise.all([a, b, c, d].map((p) => p?.context().close()));
  });

  test("AC3: non-admin membuka /admin/pengguna → 404", async () => {
    const res = await c.goto(USERS);
    expect(res?.status()).toBe(404);
    await expect(c.getByRole("heading", { level: 1 })).toHaveText("Halaman tidak ditemukan");
    await expect(c.getByTestId("admin-users-table")).toHaveCount(0);
  });

  test("AC1: B dinonaktifkan saat login → diarahkan ke /login dengan pesan, login ditolak", async () => {
    await b.goto("/datasets");
    await expect(b.getByTestId("dataset-row").filter({ hasText: DATASET })).toHaveCount(1);

    const row = await openRow(a, B);
    await expect(statusCell(row)).toHaveText("Aktif");
    await rowAction(a, row, "Nonaktifkan…", "Nonaktifkan");
    await expect(a.getByTestId("admin-result")).toContainText(`${B} dinonaktifkan.`);
    await expect(statusCell(row)).toHaveText("Nonaktif");

    await b.goto("/datasets");
    await expect(b).toHaveURL(/\/login\?next=%2Fdatasets&reason=disabled$/);
    await expect(b.getByTestId("login-disabled-notice")).toContainText(
      "Akun Anda dinonaktifkan oleh admin Data Dashboard.",
    );

    await login(b, B);
    await expect(b.getByTestId("form-alert")).toHaveText(
      "Akun Anda dinonaktifkan. Bila ini keliru, hubungi tim TI.",
    );
    await expect(b).toHaveURL(/\/login/);
    const api = await b.request.post("/api/auth/login", { data: { email: B, password: PASSWORD } });
    expect(api.status()).toBe(403);
  });

  test("AC4: dataset B (nonaktif) dialihkan ke C → C pemilik dan dashboard tetap jalan", async () => {
    const row = await openRow(a, B);
    await row.getByTestId("admin-row-actions").click();
    await a.getByRole("menuitem", { name: "Alihkan dataset…", exact: true }).click();
    const dialog = a.getByTestId("admin-confirm");
    await expect(dialog).toContainText("Dataset milik");
    await expect(
      dialog.getByRole("button", { name: "Alihkan dataset", exact: true }),
    ).toBeDisabled();
    await dialog.getByTestId("admin-transfer-target").fill(C);
    const option = dialog.locator(`[data-testid="admin-transfer-option"][data-email="${C}"]`);
    await expect(option).toHaveCount(1);
    await option.getByRole("radio").check();
    // Tombol konfirmasi menyebut email tujuan (anti salah orang / nama yang menyamar).
    const confirm = dialog.getByRole("button", { name: `Alihkan ke ${C}`, exact: true });
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(dialog).toBeHidden();
    const result = a.getByTestId("admin-result");
    await expect(result).toHaveAttribute("data-tone", "success");
    await expect(result).toContainText(`1 dataset beserta dashboard-nya dialihkan ke ${C}.`);
    await expect(row.getByRole("cell").nth(4)).toHaveText(/^0/);

    await c.goto("/datasets");
    const dataset = c.getByTestId("dataset-row").filter({ hasText: DATASET });
    await expect(dataset).toHaveAttribute("href", `/datasets/${datasetId}`);
    await c.goto(dashboardUrl);
    await expect(widgetTitled(c, KPI).getByTestId("kpi-value")).toHaveText(String(ROWS));
  });

  test("AC6: admin D dicabut saat login → sesi berakhir, setelah login lagi /admin/pengguna 404", async () => {
    expect((await d.goto(USERS))?.status()).toBe(404);

    const row = await openRow(a, D);
    await rowAction(a, row, "Jadikan admin…", "Jadikan admin");
    await expect(a.getByTestId("admin-result")).toContainText(`${D} sekarang admin.`);
    await expect(roleCell(row)).toHaveText("Admin");

    // Pemberian tidak memutus sesi; isAdmin dibaca dari DB → sesi D yang sama langsung bisa masuk.
    expect((await d.goto(USERS))?.status()).toBe(200);
    await expect(d).toHaveURL(new RegExp(`${USERS}$`));
    await expect(d.getByTestId("admin-users-table")).toBeVisible();

    await rowAction(a, row, "Cabut admin…", "Cabut admin");
    await expect(a.getByTestId("admin-result")).toContainText(`${D} bukan admin lagi.`);
    await expect(roleCell(row)).toHaveText("Pengguna");

    await d.goto(USERS);
    await expect(d).toHaveURL(/\/login\?next=%2Fadmin%2Fpengguna$/);
    await expect(d.getByTestId("login-disabled-notice")).toHaveCount(0);
    await login(d, D);
    await expect(d.getByRole("heading", { level: 1 })).toHaveText("Halaman tidak ditemukan");
    const res = await d.goto(USERS);
    expect(res?.status()).toBe(404);
    await expect(d.getByTestId("admin-users-table")).toHaveCount(0);
  });

  test("AC7: AuditLog mencatat pelaku, sasaran, dan ip tiap tindakan", async () => {
    const ids = userIds(A, B, C, D);
    const actorA = ids[A.toLowerCase()]!;
    expect(actorA).toBeTruthy();

    const forB = auditFor(B);
    expect(forB.map((r) => r.action)).toEqual(["user.deactivate", "datasets.transfer"]);
    const forD = auditFor(D);
    expect(forD.map((r) => r.action)).toEqual(["user.admin.grant", "user.admin.revoke"]);

    for (const [rows, target] of [
      [forB, ids[B.toLowerCase()]],
      [forD, ids[D.toLowerCase()]],
    ] as const) {
      for (const r of rows) {
        expect(r).toMatchObject({ actorId: actorA, targetType: "user", targetId: target });
        expect(r.ip.length).toBeGreaterThan(0);
      }
    }
    expect(forB[1]!.meta).toMatchObject({
      from: ids[B.toLowerCase()],
      to: ids[C.toLowerCase()],
      moved: 1,
      datasetIds: [datasetId],
    });
    // C tidak disentuh tindakan admin langsung (hanya penerima alih).
    expect(auditFor(C)).toEqual([]);
  });
});
