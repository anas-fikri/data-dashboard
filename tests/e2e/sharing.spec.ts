import { execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type APIResponse, type Locator, type Page } from "@playwright/test";
import { pageFor, registerAndVerify, startWorker, stopWorker, uniqueEmail } from "./helpers";

/*
 * T-016: berbagi dashboard di atas data dan DB sungguhan (unggah → worker → DuckDB → AuditLog).
 *   A = pemilik dataset X (dashboard D1 dibagikan, D2 tetap pribadi) dan dataset Y (dataset lain)
 *   B = viewer D1 (dipilih lewat pencarian di dialog) · C = pengguna lain (berbagi organisasi)
 *   E = editor D1, emailnya memuat "_" (prefix pencarian: "_" harus literal, bukan wildcard LIKE)
 *   X = orang asing; emailnya sama dengan E kecuali "_" → "x" (ikut cocok bila "_" jadi wildcard)
 * Serial: grant → viewer → tulis ditolak → widget dashboard lain → filter D6 → organisasi →
 * pencabutan di tengah sesi → editor → editor diturunkan → cabut + AuditLog → hapus dataset.
 */
test.describe.configure({ mode: "serial" });

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const A = uniqueEmail("shr-owner");
const B = uniqueEmail("shr-viewer");
const C = uniqueEmail("shr-org");
const TAG = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const E = `shr_ed-${TAG}@pcpexpress.com`;
const X = `shrxed-${TAG}@pcpexpress.com`;
const DATASET_X = `Omzet berbagi ${TAG}`;
const DATASET_Y = `Produk lain ${TAG}`;
const D1_NAME = `Ringkasan bersama ${TAG}`;
const D2_NAME = `Rahasia internal ${TAG}`;
const HACKED = `Diretas ${TAG}`;
const KPI = "Jumlah transaksi";
const CHART = "Omzet per cabang";
const EDITOR_WIDGET = "Catatan editor";
const ROWS = 60;
const CABANG = ["Jakarta", "Bandung", "Jakarta", "Surabaya", "Medan"];
const rows = Array.from({ length: ROWS }, (_, i) => ({
  cabang: CABANG[i % CABANG.length]!,
  tanggal: `${String((i % 28) + 1).padStart(2, "0")}-10-2026`,
  omzet: 1000 + i,
}));
const countOf = (cabang: string) => rows.filter((r) => r.cabang === cabang).length;
const dir = mkdtempSync(join(tmpdir(), "dd-e2e-sharing-"));
const headers = { Origin: BASE };

interface AuditRow {
  action: string;
  actorId: string | null;
  targetType: string;
  targetId: string;
  meta: Record<string, unknown> | null;
  ip: string;
  at: string;
}

/** Server Action yang ditangkap dari browser pemilik, untuk dikirim ulang dengan cookie orang lain. */
interface Captured {
  url: string;
  headers: Record<string, string>;
  body: string;
}

let worker: ChildProcess | null = null;
let ids: Record<string, string> = {};
let datasetX = "";
let datasetY = "";
let sheetX = "";
let sheetY = "";
let d1 = "";
let d2 = "";
let kpiId = "";
let secretKpiId = "";
let grantAction: Captured | null = null;
let renameAction: Captured | null = null;
const d1Path = () => `/dashboards/${d1}`;

const node = (script: string, ...args: string[]): unknown =>
  JSON.parse(execFileSync("node", [script, ...args]).toString());
const audit = (kind: "dashboard" | "dataset", id: string) =>
  node("scripts/dev-audit-log.mjs", kind, id) as AuditRow[];

/** Sheet pertama versi aktif (terbaru) dataset. */
function sheetOf(datasetId: string): string {
  const v = node("scripts/dev-upload-fixture.mjs", "latest", datasetId) as { id: string };
  const info = node("scripts/dev-upload-fixture.mjs", "ingest", v.id) as {
    status: string;
    active: boolean;
    sheets: { id: string }[];
  };
  expect(info).toMatchObject({ status: "READY", active: true });
  return info.sheets[0]!.id;
}

function csv(name: string, lines: string[]): string {
  const path = join(dir, name);
  writeFileSync(path, lines.join("\n"));
  return path;
}

const api = (page: Page, method: string, path: string, data?: unknown) =>
  page.request.fetch(path, { method, headers, ...(data === undefined ? {} : { data }) });
const query = (page: Page, body: unknown) => api(page, "POST", "/api/query", body);
const countSpec = (sheetId: string) => ({ sheetId, measures: [{ agg: "count" }] });

async function expectStatus(res: APIResponse, status: number, code?: string) {
  const text = await res.text();
  expect(res.status(), text).toBe(status);
  if (code) expect((JSON.parse(text) as { code?: string }).code, text).toBe(code);
}

/** Server Action berikutnya (header Next-Action) yang body-nya memuat `marker`. */
async function nextAction(page: Page, marker: string): Promise<Captured> {
  const r = await page.waitForRequest(
    (r) =>
      r.method() === "POST" &&
      !!r.headers()["next-action"] &&
      (r.postData() ?? "").includes(marker),
  );
  // Body diubah saat dikirim ulang: panjangnya dihitung ulang oleh Playwright.
  const { "content-length": _len, ...h } = r.headers();
  return { url: r.url(), headers: h, body: r.postData() ?? "" };
}

/** Kirim ulang Server Action dengan cookie `page` (pengguna lain); hasil = payload RSC mentah. */
async function replay(page: Page, action: Captured | null, from: string, to: string) {
  expect(action).not.toBeNull();
  const res = await page.request.fetch(action!.url, {
    method: "POST",
    headers: action!.headers,
    data: action!.body.replaceAll(from, to),
  });
  return res.text();
}

async function createDataset(page: Page, name: string, file: string): Promise<string> {
  await page.goto("/datasets/baru");
  await page.getByLabel("Nama dataset").fill(name);
  await page.getByRole("button", { name: "Buat dataset" }).click();
  await expect(page).toHaveURL(/\/datasets\/[a-z0-9]{20,32}\?created=1$/);
  const id = new URL(page.url()).pathname.split("/").pop()!;
  await page.getByTestId("upload-input").setInputFiles(file);
  await expect(page.getByTestId("dataset-schema-link")).toBeVisible({ timeout: 120_000 });
  return id;
}

async function createDashboard(page: Page, datasetId: string, name: string): Promise<string> {
  await page.goto(`/dashboards/baru?dataset=${datasetId}`);
  await page.getByLabel("Nama dashboard").fill(name);
  await page.getByRole("button", { name: "Buat dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboards\/[a-z0-9]{20,32}\?mode=edit$/);
  return new URL(page.url()).pathname.split("/").pop()!;
}

const widgetTitled = (page: Page, title: string) =>
  page.getByTestId("widget").filter({ has: page.getByRole("heading", { name: title }) });
const widgetId = async (page: Page, title: string) =>
  (await widgetTitled(page, title).getAttribute("data-widget-id"))!;

/** Tambah widget, beri judul, pilih jenis; tunggu konfigurasi tersimpan (alur filters.spec.ts). */
async function addWidget(page: Page, title: string, type: string): Promise<Locator> {
  const before = await page.getByTestId("widget").count();
  await page
    .getByTestId("canvas-toolbar")
    .getByRole("button", { name: "Tambah widget", exact: true })
    .click();
  await expect(page.getByTestId("widget")).toHaveCount(before + 1);
  const panel = page.getByTestId("widget-panel");
  await expect(panel.getByRole("heading", { name: "Pengaturan widget" })).toBeFocused();
  await panel.getByLabel("Judul", { exact: true }).fill(title);
  await panel.getByLabel("Judul", { exact: true }).press("Enter");
  await expect(widgetTitled(page, title)).toHaveCount(1);
  await panel.getByText(type, { exact: true }).click();
  await expect(panel.getByTestId("config-status")).toHaveAttribute("data-state", "saved");
  return panel;
}

/** KPI "Jumlah baris" berjudul KPI. */
async function addCountKpi(page: Page) {
  const panel = await addWidget(page, KPI, "Angka");
  await panel.getByLabel("Nilai", { exact: true }).click();
  await page.getByRole("option", { name: "Jumlah baris", exact: true }).click();
  await expect(panel.getByTestId("config-status")).toHaveAttribute("data-state", "saved");
  await expectKpi(page, ROWS);
}

/** Kolom filter lewat menu "Tambah kolom filter" (mode edit, pemilik); tunggu PATCH selesai. */
async function addFilterColumn(page: Page, column: string, n: number) {
  const section = page.getByTestId("dashboard-filter-columns");
  await section.getByRole("button", { name: "Tambah kolom filter" }).click();
  const saved = page.waitForResponse(
    (r) => r.url().endsWith("/filter-columns") && r.request().method() === "PATCH",
  );
  await page.getByRole("menuitem", { name: new RegExp(`^${column}`) }).click();
  const res = await saved;
  expect(res.status(), await res.text()).toBe(200);
  await expect(
    section.getByRole("list", { name: "Kolom filter" }).getByRole("listitem"),
  ).toHaveCount(n);
}

const digits = (s: string | null) => Number((s ?? "").replace(/\D/g, ""));

/** Nilai lengkap KPI (title berisi angka utuh walau tampilan dipendekkan). */
async function expectKpi(page: Page, n: number) {
  const value = widgetTitled(page, KPI).getByTestId("kpi-value");
  await expect
    .poll(async () => digits(await value.getAttribute("title")), { timeout: 30_000 })
    .toBe(n);
}

/** Tombol kategori grafik (crossfilter-item); tabel data dibuka bila grafik tidak berupa daftar. */
async function showChartItems(page: Page): Promise<Locator> {
  const chart = widgetTitled(page, CHART);
  if ((await chart.getByTestId("chart-ranked").count()) === 0) {
    const toggle = chart.getByTestId("widget-data-toggle");
    await expect(toggle).not.toHaveAttribute("aria-disabled", "true");
    await toggle.click();
  }
  await expect(chart.getByTestId("crossfilter-item").first()).toBeVisible();
  return chart;
}

/** Posisi widget yang tampil (body PUT tata letak yang valid). */
const layoutItems = (page: Page) =>
  page.getByTestId("widget").evaluateAll((els) =>
    els.map((el) => {
      const [x, y, w, h] = (el.getAttribute("data-pos") ?? "").split(",").map(Number);
      return { i: el.getAttribute("data-widget-id")!, x, y, w, h };
    }),
  );

async function openShare(page: Page): Promise<Locator> {
  await page.goto(d1Path());
  await page.getByTestId("share-open").click();
  const dialog = page.getByTestId("share-dialog");
  await expect(dialog).toBeVisible();
  // Kolom cari muncul setelah daftar akses dimuat (listShares).
  await expect(dialog.getByTestId("share-search")).toBeVisible();
  return dialog;
}

async function closeShare(page: Page) {
  await page.getByTestId("share-dialog").getByRole("button", { name: "Selesai" }).click();
  await expect(page.getByTestId("share-dialog")).toHaveCount(0);
}

/** Ketik di pencarian; tunggu hasil server (bukan status "Mencari…"); kembalikan semua opsi. */
async function searchUsers(dialog: Locator, q: string): Promise<Locator> {
  await dialog.getByTestId("share-search").fill(q);
  await expect(
    dialog.getByText(/pengguna ditemukan\.$|^Tidak ada pengguna aktif|hasil pertama/),
  ).toBeVisible();
  return dialog.getByTestId("share-option");
}

const grantRow = (dialog: Locator, email: string) =>
  dialog.locator(`[data-testid=share-grant][data-user-id="${ids[email]}"]`);

/** Baris dashboard milik sendiri di /dashboards. */
const ownRow = (page: Page, name: string) =>
  page.getByTestId("dashboard-row").filter({ hasText: name });
/** Baris "Dibagikan ke saya". */
const sharedRow = (page: Page, name: string) =>
  page.getByTestId("shared-list").getByTestId("shared-row").filter({ hasText: name });

test.describe("berbagi dashboard", () => {
  let a: Page;
  let b: Page;
  let c: Page;
  let e: Page;
  let x: Page;

  test.beforeAll(async ({ browser, request }) => {
    test.setTimeout(420_000);
    execFileSync("node", ["scripts/dev-reset-ratelimit.mjs", "register:ip", "verify:ip"]); // suite penuh: batas per IP
    const setup = await browser.newPage();
    for (const email of [A, B, C, E, X]) {
      await setup.context().clearCookies();
      await registerAndVerify(setup, request, email);
    }
    await setup.close();
    ids = node("scripts/dev-audit-log.mjs", "ids", A, B, C, E, X) as Record<string, string>;
    for (const email of [A, B, C, E, X]) expect(ids[email], email).toBeTruthy();
    a = await pageFor(browser, A);
    b = await pageFor(browser, B);
    c = await pageFor(browser, C);
    e = await pageFor(browser, E);
    x = await pageFor(browser, X);

    worker = await startWorker("sharing");
    datasetX = await createDataset(
      a,
      DATASET_X,
      csv("omzet-berbagi.csv", [
        "Cabang;Tanggal;Omzet",
        ...rows.map((r) => `${r.cabang};${r.tanggal};${r.omzet}`),
      ]),
    );
    datasetY = await createDataset(
      a,
      DATASET_Y,
      csv("produk-lain.csv", [
        "Produk;Jumlah",
        ...Array.from({ length: 8 }, (_, i) => `Produk ${i};${i + 1}`),
      ]),
    );
    sheetX = sheetOf(datasetX);
    sheetY = sheetOf(datasetY);
    expect(sheetX).not.toBe(sheetY);

    // D1: KPI jumlah baris + batang Cabang × total Omzet (filter silang) + kolom filter Cabang.
    d1 = await createDashboard(a, datasetX, D1_NAME);
    await addCountKpi(a);
    const bar = await addWidget(a, CHART, "Batang");
    await expect(bar.getByLabel("Kelompokkan menurut", { exact: true })).toContainText("Cabang");
    await expect(bar.getByTestId("widget-crossfilter-switch")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await addFilterColumn(a, "Cabang", 1);
    kpiId = await widgetId(a, KPI);
    // D2: dataset yang sama, tidak pernah dibagikan.
    d2 = await createDashboard(a, datasetX, D2_NAME);
    await addCountKpi(a);
    secretKpiId = await widgetId(a, KPI);
  });

  test.afterAll(async () => {
    await stopWorker(worker);
    await Promise.all([a, b, c, e, x].map((p) => p?.context().close()));
  });

  test("AC1: pemilik membagikan VIEWER ke B lewat pencarian → peran → Bagikan", async () => {
    const dialog = await openShare(a);
    await expect(dialog.getByTestId("share-org")).not.toBeChecked();
    await expect(dialog.getByText("Belum ada orang yang diberi akses.")).toBeVisible();

    // Prefix (bagian lokal, bukan email lengkap) → hanya B.
    const options = await searchUsers(dialog, B.split("@")[0]!);
    await expect(options).toHaveCount(1);
    await expect(options).toHaveAttribute("data-email", B);
    await options.click();
    await expect(options.getByRole("radio")).toBeChecked();
    await expect(dialog.getByTestId("share-role")).toContainText("Hanya lihat");
    await expect(dialog.getByTestId("share-warning-editor")).toHaveCount(0);

    const grant = nextAction(a, ids[B]!);
    await dialog.getByTestId("share-add").click();
    grantAction = await grant;
    await expect(dialog.getByText(`${B} kini bisa melihat dashboard ini.`)).toBeAttached();
    const row = grantRow(dialog, B);
    await expect(row).toBeVisible();
    await expect(row.getByTestId("share-grant-role")).toContainText("Hanya lihat");
    // Berhasil → pencarian kosong dan fokus kembali ke kolom cari untuk orang berikutnya.
    const search = dialog.getByTestId("share-search");
    await expect(search).toHaveValue("");
    await expect(search).toBeFocused();
    await expect(dialog.getByTestId("share-option")).toHaveCount(0);
    await closeShare(a);

    await a.goto("/dashboards");
    await expect(ownRow(a, D1_NAME).getByTestId("dashboard-access")).toContainText("1 orang");
    await expect(ownRow(a, D2_NAME).getByTestId("dashboard-access")).toContainText("Pribadi");
  });

  test("AC1: B melihat dan memfilter; tanpa edit; ?mode=edit → URL lihat dengan ?f=", async () => {
    const medan = countOf("Medan");
    expect(medan).toBeLessThan(ROWS);
    expect((await b.goto(d1Path()))?.status()).toBe(200);
    await expect(b.getByRole("heading", { level: 1 })).toHaveText(D1_NAME);
    await expectKpi(b, ROWS);
    await expect(b.getByTestId("dashboard-owner")).toContainText("Dibagikan oleh");
    await expect(b.getByText("Hanya lihat", { exact: true })).toBeVisible();
    await expect(b.getByTestId("edit-dashboard")).toHaveCount(0);
    await expect(b.getByTestId("canvas-toolbar")).toHaveCount(0);
    await expect(b.getByTestId("share-open")).toHaveCount(0);
    // Halaman dataset hanya untuk pemilik: namanya tampil tanpa tautan.
    await expect(b.getByText(DATASET_X)).toBeVisible();
    await expect(b.getByRole("link", { name: DATASET_X })).toHaveCount(0);

    const slicer = b.locator('[data-testid=filter-slicer][data-column="Cabang"]');
    await slicer.click();
    await b.locator('[data-testid=filter-slicer-option][data-value="Medan"] input').check();
    await b.keyboard.press("Escape");
    await expectKpi(b, medan);
    const chartRows = widgetTitled(b, CHART).getByTestId("chart-data").locator("tbody th");
    await expect(chartRows).toHaveText(["Medan"]);
    const f = new URL(b.url()).searchParams.get("f");
    expect(JSON.parse(f ?? "null")).toEqual({
      filters: [{ column: "Cabang", op: "in", values: ["Medan"] }],
    });

    await b.goto(`${d1Path()}?mode=edit&f=${encodeURIComponent(f!)}`);
    await expect
      .poll(() => {
        const u = new URL(b.url());
        return [u.pathname, u.searchParams.get("mode"), u.searchParams.get("f")];
      })
      .toEqual([d1Path(), null, f]);
    await expectKpi(b, medan);
    await expect(b.getByTestId("canvas-toolbar")).toHaveCount(0);
    await expect(b.getByTestId("widget-panel")).toHaveCount(0);

    await b.goto("/dashboards");
    const row = sharedRow(b, D1_NAME);
    await expect(row).toHaveAttribute("href", d1Path());
    await expect(row).toContainText("Hanya lihat");
    await expect(sharedRow(b, D2_NAME)).toHaveCount(0);
  });

  test("AC1: tulis dari B ditolak — Route Handler 403 FORBIDDEN, Server Action FORBIDDEN, query bebas 404", async () => {
    await b.goto(d1Path());
    await expectKpi(b, ROWS);
    const items = await layoutItems(b);
    expect(items).toHaveLength(2);

    const base = `/api/dashboards/${d1}`;
    await expectStatus(
      await api(b, "PATCH", `${base}/widgets/${kpiId}`, { title: "Diretas" }),
      403,
      "FORBIDDEN",
    );
    await expectStatus(
      await api(b, "PUT", `${base}/layout`, { baseRevision: 0, items }),
      403,
      "FORBIDDEN",
    );
    await expectStatus(
      await api(b, "POST", `${base}/widgets`, { baseRevision: 0 }),
      403,
      "FORBIDDEN",
    );
    await expectStatus(
      await api(b, "DELETE", `${base}/widgets/${kpiId}?baseRevision=0`),
      403,
      "FORBIDDEN",
    );
    await expectStatus(
      await api(b, "PATCH", `${base}/filter-columns`, { filterColumns: [] }),
      403,
      "FORBIDDEN",
    );
    // Orang asing: tidak bisa melihat → 404, bukan 403.
    await expectStatus(
      await api(x, "PATCH", `${base}/widgets/${kpiId}`, { title: "Diretas" }),
      404,
      "NOT_FOUND",
    );

    // /api/query: mode bebas dan mode editor bukan untuk viewer → 404.
    await expectStatus(
      await query(b, { datasetId: datasetX, spec: countSpec(sheetX) }),
      404,
      "NOT_FOUND",
    );
    await expectStatus(
      await query(b, { dashboardId: d1, spec: countSpec(sheetX) }),
      404,
      "NOT_FOUND",
    );

    // Server Action pemilik (ganti nama dashboard), dikirim ulang dengan cookie B / X.
    await a.goto(`${d1Path()}?mode=edit`);
    const nameInput = a.getByLabel("Nama dashboard");
    await expect(nameInput).toHaveValue(D1_NAME);
    const rename = nextAction(a, D1_NAME);
    await a.getByRole("button", { name: "Simpan nama" }).click();
    renameAction = await rename;
    await expect(a.getByText("Nama dashboard disimpan.")).toBeVisible();
    expect(await replay(b, renameAction, D1_NAME, HACKED)).toContain('"code":"FORBIDDEN"');
    expect(await replay(x, renameAction, D1_NAME, HACKED)).toContain('"code":"NOT_FOUND"');
    // Viewer tidak bisa menaikkan dirinya jadi editor lewat Server Action share.
    expect(await replay(b, grantAction, '"VIEWER"', '"EDITOR"')).toContain('"code":"FORBIDDEN"');
    expect(await replay(x, grantAction, '"VIEWER"', '"EDITOR"')).toContain('"code":"NOT_FOUND"');

    // Tidak ada yang berubah.
    await b.goto(d1Path());
    await expect(b.getByRole("heading", { level: 1 })).toHaveText(D1_NAME);
    await expect(widgetTitled(b, KPI)).toHaveCount(1);
    await expect(b.getByTestId("widget")).toHaveCount(2);
    await expect(b.getByText("Hanya lihat", { exact: true })).toBeVisible();
  });

  test("regresi: widget dashboard TIDAK dibagikan di dataset yang sama → 404 untuk viewer dan orang asing", async () => {
    await expectStatus(await query(b, { widgetId: secretKpiId }), 404, "NOT_FOUND");
    await expectStatus(await query(x, { widgetId: secretKpiId }), 404, "NOT_FOUND");
    await expectStatus(await query(x, { widgetId: kpiId }), 404, "NOT_FOUND");
    expect((await b.goto(`/dashboards/${d2}`))?.status()).toBe(404);
    await expect(b.getByRole("heading", { level: 1 })).toHaveText("Halaman tidak ditemukan");

    // Widget D1 untuk B: data ada, tanpa cached/ms (khusus pemilik).
    const ok = await query(b, { widgetId: kpiId });
    expect(ok.status(), await ok.text()).toBe(200);
    const body = (await ok.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body).not.toHaveProperty("cached");
    expect(body).not.toHaveProperty("ms");
    const own = await query(a, { widgetId: kpiId });
    expect(own.status()).toBe(200);
    expect(await own.json()).toHaveProperty("cached");
  });

  test("AC3: viewer mengirim filter kolom yang tidak diizinkan dashboard → 400", async () => {
    for (const filter of [
      { column: "Omzet", op: "in", values: ["1000"] },
      { column: "Tanggal", op: "in", values: ["2026-10-01"] },
      { column: "Tidak ada", op: "in", values: ["x"] },
    ]) {
      const res = await query(b, { widgetId: kpiId, dashboardFilters: [filter] });
      const text = await res.text();
      expect(res.status(), `${filter.column}: ${text}`).toBe(400);
      expect(JSON.parse(text)).toMatchObject({
        ok: false,
        code: "INVALID",
        message: "Filter tidak diizinkan untuk dashboard ini.",
      });
    }
    const allowed = await query(b, {
      widgetId: kpiId,
      dashboardFilters: [{ column: "Cabang", op: "in", values: ["Medan"] }],
    });
    expect(allowed.status(), await allowed.text()).toBe(200);
  });

  test("AC2: dashboard pribadi → 404 untuk C; dibagikan ke organisasi → C membuka", async () => {
    const res = await c.goto(d1Path());
    expect(res?.status()).toBe(404);
    await expect(c.getByRole("heading", { level: 1 })).toHaveText("Halaman tidak ditemukan");
    await expectStatus(await query(c, { widgetId: kpiId }), 404, "NOT_FOUND");

    const dialog = await openShare(a);
    const org = dialog.getByTestId("share-org");
    await expect(org).not.toBeChecked();
    await org.click();
    await expect(org).toBeChecked();
    await expect(
      dialog.getByText("Dashboard dibagikan ke seluruh organisasi (hanya lihat)."),
    ).toBeAttached();
    await closeShare(a);

    expect((await c.goto(d1Path()))?.status()).toBe(200);
    await expect(c.getByRole("heading", { level: 1 })).toHaveText(D1_NAME);
    await expectKpi(c, ROWS);
    await expect(c.getByText("Hanya lihat", { exact: true })).toBeVisible();
    await expect(c.getByTestId("edit-dashboard")).toHaveCount(0);
    await expect(c.getByTestId("share-open")).toHaveCount(0);
    // Organisasi = dashboard itu saja, bukan dataset-nya.
    expect((await c.goto(`/dashboards/${d2}`))?.status()).toBe(404);
    await expectStatus(await query(c, { widgetId: secretKpiId }), 404, "NOT_FOUND");

    await c.goto("/dashboards");
    const row = sharedRow(c, D1_NAME);
    await expect(row).toHaveAttribute("href", d1Path());
    await expect(row).toContainText("Hanya lihat");
    await c.goto("/");
    await expect(sharedRow(c, D1_NAME)).toBeVisible();

    await a.goto("/dashboards");
    const access = ownRow(a, D1_NAME).getByTestId("dashboard-access");
    await expect(access).toContainText("Organisasi");
    await expect(access).toContainText("1 orang");
  });

  test("AC4: organisasi dicabut saat C membuka → muatan berikutnya 404, halaman jadi 404; audit tetap", async () => {
    await c.goto(d1Path());
    await expectKpi(c, ROWS);
    const chart = await showChartItems(c);

    const dialog = await openShare(a);
    const org = dialog.getByTestId("share-org");
    await expect(org).toBeChecked();
    await org.click();
    await expect(org).not.toBeChecked();
    await expect(dialog.getByText("Berbagi ke seluruh organisasi dimatikan.")).toBeAttached();
    await closeShare(a);

    // Muatan data berikutnya C (filter silang memuat ulang KPI) → 404 → halaman diambil ulang → 404.
    const refused = c.waitForResponse(
      (r) =>
        r.url().endsWith("/api/query") && r.request().method() === "POST" && r.status() === 404,
    );
    await chart.locator('[data-testid=crossfilter-item][data-value="Jakarta"]').click();
    await refused;
    await expect(c.getByRole("heading", { level: 1 })).toHaveText("Halaman tidak ditemukan");
    await expect(c.getByTestId("widget")).toHaveCount(0);
    expect(new URL(c.url()).pathname).toBe(d1Path());
    expect((await c.goto(d1Path()))?.status()).toBe(404);
    await c.goto("/dashboards");
    await expect(sharedRow(c, D1_NAME)).toHaveCount(0);

    // AuditLog masih mencatat pembukaan C sebelumnya + kedua perubahan berbagi organisasi.
    const rows = audit("dashboard", d1);
    const opensC = rows.filter((r) => r.action === "dashboard.open" && r.actorId === ids[C]);
    expect(opensC).toHaveLength(1);
    expect(opensC[0]!.meta).toEqual({ role: "VIEWER" });
    const orgRows = rows.filter((r) => r.action === "dashboard.org.share");
    expect(orgRows.map((r) => r.meta)).toEqual([{ on: true }, { on: false }]);
    for (const r of orgRows) expect(r.actorId).toBe(ids[A]);
  });

  test("AC6: editor E (email ber-'_') lewat pencarian prefix; peringatan editor; query lintas dataset 404", async () => {
    const dialog = await openShare(a);
    // X dapat dicari dengan prefix-nya sendiri…
    let options = await searchUsers(dialog, `shrxed-${TAG}`);
    await expect(options).toHaveCount(1);
    await expect(options).toHaveAttribute("data-email", X);
    // …tetapi prefix E (dengan "_") hanya menemukan E: "_" literal, tidak lolos-ganda di-escape.
    options = await searchUsers(dialog, `shr_ed-${TAG}`);
    await expect(options).toHaveCount(1);
    await expect(options).toHaveAttribute("data-email", E);
    await options.click();
    await expect(options.getByRole("radio")).toBeChecked();

    await expect(dialog.getByTestId("share-warning-editor")).toHaveCount(0);
    await dialog.getByTestId("share-role").click();
    await a.getByRole("option", { name: "Bisa mengedit widget" }).click();
    await expect(dialog.getByTestId("share-role")).toContainText("Bisa mengedit widget");
    const warning = dialog.getByTestId("share-warning-editor");
    await expect(warning).toBeVisible();
    await expect(warning).toContainText(
      /editor dapat membaca semua kolom tidak tersembunyi dataset ini/i,
    );
    await dialog.getByTestId("share-add").click();
    await expect(dialog.getByText(`${E} kini bisa mengedit widget dashboard ini.`)).toBeAttached();
    await expect(grantRow(dialog, E).getByTestId("share-grant-role")).toContainText(
      "Bisa mengedit widget",
    );
    await expect(grantRow(dialog, B).getByTestId("share-grant-role")).toContainText("Hanya lihat");
    await expect(warning).toBeVisible();
    await closeShare(a);

    // Mode editor: sheet dataset lain → 404; sheet dataset dashboard → hasil.
    await expectStatus(
      await query(e, { dashboardId: d1, spec: countSpec(sheetY) }),
      404,
      "NOT_FOUND",
    );
    const ok = await query(e, { dashboardId: d1, spec: countSpec(sheetX) });
    expect(ok.status(), await ok.text()).toBe(200);
    const body = (await ok.json()) as { ok: boolean; rows: unknown[][] };
    expect(body.ok).toBe(true);
    expect(Number(body.rows[0]![0])).toBe(ROWS);
    expect(body).not.toHaveProperty("cached");
    // Pemilik Y sekalipun: mode dashboard hanya membaca dataset dashboard itu.
    await expectStatus(
      await query(a, { dashboardId: d1, spec: countSpec(sheetY) }),
      404,
      "NOT_FOUND",
    );
    // Editor tetap tanpa query bebas; orang asing tanpa mode dashboard.
    await expectStatus(
      await query(e, { datasetId: datasetX, spec: countSpec(sheetX) }),
      404,
      "NOT_FOUND",
    );
    await expectStatus(
      await query(x, { dashboardId: d1, spec: countSpec(sheetX) }),
      404,
      "NOT_FOUND",
    );
  });

  test("AC6: editor menambah + mengganti judul widget dan menyimpan tata letak; kolom filter 403; tanpa Bagikan", async () => {
    expect((await e.goto(d1Path()))?.status()).toBe(200);
    await expect(e.getByText("Editor", { exact: true })).toBeVisible();
    await expect(e.getByTestId("share-open")).toHaveCount(0);
    await e.getByTestId("edit-dashboard").click();
    await expect(e).toHaveURL(/\?mode=edit/);
    await expect(e.getByTestId("canvas-toolbar")).toBeVisible();
    // Nama, kolom filter, hapus, berbagi: pemilik saja.
    await expect(e.getByTestId("dashboard-filter-columns")).toHaveCount(0);
    await expect(e.getByLabel("Nama dashboard")).toHaveCount(0);
    await expect(e.getByTestId("share-open")).toHaveCount(0);

    // Tambah widget + judul + jenis (panel memakai kolom dataset dashboard).
    const panel = await addWidget(e, EDITOR_WIDGET, "Angka");
    await expect(e.getByTestId("widget")).toHaveCount(3);
    const layoutSaved = e.waitForResponse(
      (r) => r.url().endsWith(`/api/dashboards/${d1}/layout`) && r.request().method() === "PUT",
    );
    await panel.getByRole("button", { name: /^Pertinggi/ }).click();
    const put = await layoutSaved;
    expect(put.status(), await put.text()).toBe(200);
    await expect(e.getByTestId("save-state")).toHaveAttribute("data-state", "saved");

    await expectStatus(
      await api(e, "PATCH", `/api/dashboards/${d1}/filter-columns`, { filterColumns: [] }),
      403,
      "FORBIDDEN",
    );
    expect(await replay(e, renameAction, D1_NAME, HACKED)).toContain('"code":"FORBIDDEN"');
    expect(await replay(e, grantAction, ids[B]!, ids[X]!)).toContain('"code":"FORBIDDEN"');

    // Tersimpan untuk semua: pemilik melihat widget editor, nama dashboard tetap.
    await a.goto(d1Path());
    await expect(a.getByRole("heading", { level: 1 })).toHaveText(D1_NAME);
    await expect(widgetTitled(a, EDITOR_WIDGET)).toHaveCount(1);
    await expect(a.getByTestId("widget")).toHaveCount(3);
  });

  test("editor diturunkan jadi viewer saat mode edit terbuka → editor membeku, muat ulang = mode lihat", async () => {
    await e.goto(`${d1Path()}?mode=edit`);
    await expect(e.getByTestId("canvas-toolbar")).toBeVisible();

    const dialog = await openShare(a);
    const row = grantRow(dialog, E);
    await row.getByTestId("share-grant-role").click();
    await a.getByRole("option", { name: "Hanya lihat" }).click();
    await expect(dialog.getByText(`Peran ${E} diubah menjadi Hanya lihat.`)).toBeAttached();
    await expect(row.getByTestId("share-grant-role")).toContainText("Hanya lihat");
    await expect(dialog.getByTestId("share-warning-editor")).toHaveCount(0);
    await closeShare(a);

    const refused = e.waitForResponse(
      (r) => r.url().endsWith(`/api/dashboards/${d1}/widgets`) && r.request().method() === "POST",
    );
    await e
      .getByTestId("canvas-toolbar")
      .getByRole("button", { name: "Tambah widget", exact: true })
      .click();
    expect((await refused).status()).toBe(403);
    await expect(e.getByTestId("save-state")).toHaveAttribute("data-state", "denied");
    await expect(e.getByText("Akses edit Anda berubah. Muat ulang halaman.")).toBeVisible();
    await expect(e.getByTestId("widget")).toHaveCount(3);

    await e.reload();
    await expect.poll(() => new URL(e.url()).searchParams.get("mode")).toBeNull();
    await expect(e.getByTestId("canvas-toolbar")).toHaveCount(0);
    await expect(e.getByText("Hanya lihat", { exact: true })).toBeVisible();
    await expectStatus(
      await query(e, { dashboardId: d1, spec: countSpec(sheetX) }),
      404,
      "NOT_FOUND",
    );
  });

  test("AC7: cabut lewat konfirmasi; AuditLog grant/role/revoke/open lengkap {actorId, action, target, meta, ip, at}", async () => {
    const dialog = await openShare(a);
    await grantRow(dialog, B).getByTestId("share-revoke").click();
    const confirm = a.getByTestId("share-revoke-confirm");
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText(B);
    await confirm.getByRole("button", { name: "Cabut akses" }).click();
    await expect(confirm).toHaveCount(0);
    await expect(dialog.getByText(`Akses ${B} dicabut.`)).toBeAttached();
    await expect(grantRow(dialog, B)).toHaveCount(0);
    await expect(grantRow(dialog, E)).toHaveCount(1);
    await closeShare(a);

    // B kehilangan akses pada muatan berikutnya.
    await expectStatus(await query(b, { widgetId: kpiId }), 404, "NOT_FOUND");
    expect((await b.goto(d1Path()))?.status()).toBe(404);

    const rows = audit("dashboard", d1);
    for (const r of rows) {
      expect(r).toMatchObject({ targetType: "dashboard", targetId: d1 });
      expect(r.actorId).toBeTruthy();
      expect(r.ip.length).toBeGreaterThan(0);
      expect(Number.isNaN(Date.parse(r.at))).toBe(false);
    }
    const of = (action: string) => rows.filter((r) => r.action === action);
    expect(of("dashboard.share.grant").map((r) => [r.actorId, r.meta])).toEqual([
      [ids[A], { userId: ids[B], role: "VIEWER" }],
      [ids[A], { userId: ids[E], role: "EDITOR" }],
    ]);
    expect(of("dashboard.share.role").map((r) => [r.actorId, r.meta])).toEqual([
      [ids[A], { userId: ids[E], from: "EDITOR", to: "VIEWER" }],
    ]);
    expect(of("dashboard.share.revoke").map((r) => [r.actorId, r.meta])).toEqual([
      [ids[A], { userId: ids[B], role: "VIEWER" }],
    ]);
    // Satu baris per pengguna (dedup 30 menit), termasuk pemilik; percobaan 404 tidak tercatat.
    const opens = of("dashboard.open");
    expect(
      Object.fromEntries(opens.map((r) => [r.actorId, r.meta])),
      JSON.stringify(opens),
    ).toEqual({
      [ids[A]!]: { role: "OWNER" },
      [ids[B]!]: { role: "VIEWER" },
      [ids[C]!]: { role: "VIEWER" },
      [ids[E]!]: { role: "EDITOR" },
    });
    expect(opens).toHaveLength(4);
  });

  test("AC7: hapus dataset dengan dashboard dibagikan → dialog menyebut dampaknya; dataset.delete tercatat", async () => {
    // Dataset tanpa dashboard dibagikan: tanpa kalimat dampak.
    await a.goto(`/datasets/${datasetY}`);
    await a.getByRole("button", { name: "Hapus dataset" }).click();
    await expect(a.getByRole("dialog")).toBeVisible();
    await expect(a.getByTestId("delete-share-impact")).toHaveCount(0);
    await a.getByRole("dialog").getByRole("button", { name: "Batal" }).click();

    await a.goto(`/datasets/${datasetX}`);
    await a.getByRole("button", { name: "Hapus dataset" }).click();
    const dialog = a.getByRole("dialog");
    await expect(dialog).toContainText("2 dashboard");
    await expect(dialog.getByTestId("delete-share-impact")).toHaveText(
      "1 orang kehilangan akses ke 1 dashboard yang dibagikan.",
    );
    await dialog.getByLabel(/Ketik/).fill(DATASET_X);
    await dialog.getByRole("button", { name: "Hapus permanen" }).click();
    await expect(a).toHaveURL(/\/datasets\?deleted=1/);

    const rows = audit("dataset", datasetX);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: "dataset.delete",
      actorId: ids[A],
      targetType: "dataset",
      targetId: datasetX,
      meta: { name: DATASET_X, dashboards: 2, shares: 1 },
    });
    expect(rows[0]!.ip.length).toBeGreaterThan(0);
    expect(Number.isNaN(Date.parse(rows[0]!.at))).toBe(false);

    // Akses ikut hilang; riwayat audit dashboard tetap (targetId tanpa FK).
    expect((await e.goto(d1Path()))?.status()).toBe(404);
    await expectStatus(await query(e, { widgetId: kpiId }), 404, "NOT_FOUND");
    await e.goto("/dashboards");
    await expect(sharedRow(e, D1_NAME)).toHaveCount(0);
    expect(audit("dashboard", d1).some((r) => r.action === "dashboard.open")).toBe(true);
  });
});
