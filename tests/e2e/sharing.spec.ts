import { execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  expect,
  test,
  type APIResponse,
  type Locator,
  type Page,
  type Request,
} from "@playwright/test";
import { pageFor, registerAndVerify, startWorker, stopWorker, uniqueEmail } from "./helpers";

/*
 * T-016: berbagi dashboard di atas data dan DB sungguhan (unggah → worker → DuckDB → AuditLog).
 *   A = pemilik dataset X (dashboard D1 dibagikan, D2 tetap pribadi) dan dataset Y (dataset lain)
 *   B = viewer D1 (dipilih lewat pencarian di dialog) · C = pengguna lain (berbagi organisasi)
 *   E = editor D1, emailnya memuat "_" (prefix pencarian: "_" harus literal, bukan wildcard LIKE)
 *   X = orang asing; emailnya sama dengan E kecuali "_" → "x" (ikut cocok bila "_" jadi wildcard)
 * Serial: grant → viewer → tulis ditolak → widget dashboard lain → filter D6 → organisasi →
 * pencabutan di tengah sesi → editor → versi widget (viewer melihat "sudah diubah", simpan dari panel
 * usang → STALE) → Back/Forward memuat versi terbaru (mode lihat + editor) → editor diturunkan →
 * tabel: urut kolom yang baru dibuang → CHANGED → KPI CHANGED di ponsel 320 px → cabut + AuditLog →
 * hapus dataset X → dataset Y: daftar "Dibagikan ke saya" (share langsung dulu) → pencabutan yang
 * muatan pertamanya nilai slicer → dataset Z (2 sheet): tautan peringatan kolom filter memindah fokus.
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
/** Dashboard dataset Y (setelah dataset X dihapus): D3 dibagikan langsung ke C, D4 ke organisasi saja. */
const D3_NAME = `Produk langsung ${TAG}`;
const D4_NAME = `Produk organisasi ${TAG}`;
const PRODUK_KPI = "Jumlah produk";
const ORG_WIDGET = "Widget organisasi";
/** Judul sementara widget editor (uji Back ke editor); tidak memuat EDITOR_WIDGET (cocok substring). */
const OWNER_TITLE = "Catatan pemilik";
/** Tabel D1 (review T-016 R2-CL-2): kolom bawaan Cabang, Tanggal, Omzet; pemilik membuang Omzet. */
const TABLE = "Tabel omzet";
/** Dataset Z: workbook 2 sheet — "No Resi" ada di keduanya → peringatan kolom filter di dialog share. */
const DATASET_Z = `Dua sheet ${TAG}`;
const D5_NAME = `Dua sheet ringkas ${TAG}`;
const Z_KPI = "Jumlah kiriman";
const FILTER_LINK = "pengaturan dashboard (mode edit)";
/** Pesan server untuk ubahan widget dari versi pengaturan lama (review T-016 DI-1). */
const STALE_WIDGET =
  "Widget ini sudah berubah sejak halaman ini dimuat. Muat ulang halaman untuk melihat versi terbaru.";
const WIDGET_CHANGED = "Widget ini sudah diubah. Muat ulang halaman.";
/** Versi pengaturan widget = Widget.updatedAt dalam bentuk Date.toISOString(). */
const ISO_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ROWS = 60;
const CABANG = ["Jakarta", "Bandung", "Jakarta", "Surabaya", "Medan"];
const rows = Array.from({ length: ROWS }, (_, i) => ({
  cabang: CABANG[i % CABANG.length]!,
  tanggal: `${String((i % 28) + 1).padStart(2, "0")}-10-2026`,
  omzet: 1000 + i,
}));
const countOf = (cabang: string) => rows.filter((r) => r.cabang === cabang).length;
/** KPI "Angka" bawaan = Total kolom angka pertama (Omzet di X, Jumlah di Y). */
const SUM_OMZET = rows.reduce((s, r) => s + r.omzet, 0);
const SUM_JUMLAH = 36; // Jumlah 1..8 di dataset Y
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
let editorWidgetId = "";
let d3 = "";
let d4 = "";
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

/** Nilai lengkap KPI berjudul `title` (title berisi angka utuh walau tampilan dipendekkan). */
async function expectValue(page: Page, title: string, n: number) {
  const value = widgetTitled(page, title).getByTestId("kpi-value");
  await expect
    .poll(async () => digits(await value.getAttribute("title")), { timeout: 30_000 })
    .toBe(n);
}
const expectKpi = (page: Page, n: number) => expectValue(page, KPI, n);

/** PATCH widget D1 berikutnya dari halaman ini (ganti judul / atur isi). */
const widgetPatch = (page: Page, id: string) =>
  page.waitForResponse(
    (r) =>
      r.url().endsWith(`/api/dashboards/${d1}/widgets/${id}`) && r.request().method() === "PATCH",
  );

/** Buka panel pengaturan widget berjudul `title` (mode edit). */
async function openPanel(page: Page, title: string): Promise<Locator> {
  await widgetTitled(page, title)
    .getByRole("button", { name: `Pengaturan ${title}` })
    .click();
  const panel = page.getByTestId("widget-panel");
  await expect(panel.getByRole("heading", { name: "Pengaturan widget" })).toBeFocused();
  return panel;
}

/** Pilih "Nilai" (agregasi) di panel. */
async function pickAgg(page: Page, panel: Locator, label: string) {
  await panel.getByLabel("Nilai", { exact: true }).click();
  await page.getByRole("option", { name: label, exact: true }).click();
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

/** Keadaan yang diamati selama navigasi klien (Back/Forward tidak mengganti dokumen). */
const SEEN = {
  refreshing: "[data-testid=canvas-refreshing]",
  changed: "[data-testid=widget-error][data-code=CHANGED]",
  stale: "[data-testid=save-state][data-state=stale]",
} as const;

/** Catat setiap keadaan SEEN yang PERNAH muncul di dokumen ini mulai sekarang (juga yang sekejap). */
async function watchDom(page: Page) {
  await page.evaluate((selectors) => {
    const w = window as unknown as { __seen: Set<string> };
    w.__seen = new Set();
    const note = (el: Element) => {
      for (const [name, sel] of Object.entries(selectors)) {
        if (el.matches(sel) || el.querySelector(sel)) w.__seen.add(name);
      }
    };
    note(document.body);
    new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === "attributes" && r.target instanceof Element) note(r.target);
        r.addedNodes.forEach((n) => {
          if (n instanceof Element) note(n);
        });
      }
    }).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-code", "data-state"],
    });
  }, SEEN);
}

/** Keadaan yang tercatat watchDom; null = dokumen diganti (muat ulang penuh) sejak dipasang. */
const seenDom = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as { __seen?: Set<string> }).__seen;
    return s ? [...s].sort() : null;
  });

async function openShare(page: Page, path = d1Path()): Promise<Locator> {
  await page.goto(path);
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
        message:
          "Filter tidak diizinkan untuk dashboard ini. Muat ulang halaman bila pengaturan dashboard baru diubah.",
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

  test("versi widget: editor mengubah isi saat B membuka → muatan berikutnya B 'sudah diubah' + Muat ulang → isi baru", async () => {
    // B membuka D1 dengan pengaturan lama: widget editor = KPI "Angka" bawaan (Total Omzet).
    await b.goto(d1Path());
    await expectKpi(b, ROWS);
    await expectValue(b, EDITOR_WIDGET, SUM_OMZET);

    // E mengganti Nilai widget-nya: Total → Jumlah baris; PATCH membawa versi yang dilihat E.
    await e.goto(`${d1Path()}?mode=edit`);
    await expectValue(e, EDITOR_WIDGET, SUM_OMZET);
    editorWidgetId = await widgetId(e, EDITOR_WIDGET);
    const panel = await openPanel(e, EDITOR_WIDGET);
    const saved = widgetPatch(e, editorWidgetId);
    await pickAgg(e, panel, "Jumlah baris");
    const res = await saved;
    expect(res.status(), await res.text()).toBe(200);
    const sent = res.request().postDataJSON() as { type: string; version: string };
    expect(sent).toMatchObject({ type: "kpi", version: expect.stringMatching(ISO_MS) });
    const next = ((await res.json()) as { data: { version: string } }).data.version;
    expect(next).toMatch(ISO_MS);
    expect(next).not.toBe(sent.version);
    await expect(panel.getByTestId("config-status")).toHaveAttribute("data-state", "saved");
    // Tab yang menyimpan tidak pernah menandai kartunya sendiri "sudah diubah".
    await expectValue(e, EDITOR_WIDGET, ROWS);
    await expect(widgetTitled(e, EDITOR_WIDGET).getByTestId("widget-error")).toHaveCount(0);

    // B: filter berikutnya memuat ulang semua widget. Widget yang diubah tidak digambar dengan
    // pengaturan lama di kartu → galat CHANGED + "Muat ulang"; widget lain tetap tampil.
    const medan = countOf("Medan");
    await b.locator('[data-testid=filter-slicer][data-column="Cabang"]').click();
    await b.locator('[data-testid=filter-slicer-option][data-value="Medan"] input').check();
    await b.keyboard.press("Escape");
    await expectKpi(b, medan);
    const card = widgetTitled(b, EDITOR_WIDGET);
    const changed = card.getByTestId("widget-error");
    await expect(changed).toHaveAttribute("data-code", "CHANGED");
    await expect(changed).toContainText(WIDGET_CHANGED);
    await expect(card.getByTestId("kpi-value")).toHaveCount(0);
    await expect(widgetTitled(b, KPI).getByTestId("widget-error")).toHaveCount(0);

    // Muat ulang seluruh halaman → isi baru (Jumlah baris) dengan filter yang sama (?f=).
    const loaded = b.waitForEvent("load");
    await changed.getByTestId("widget-reload").click();
    await loaded;
    await expectValue(b, EDITOR_WIDGET, medan);
    await expect(card.getByTestId("widget-error")).toHaveCount(0);
    expect(JSON.parse(new URL(b.url()).searchParams.get("f") ?? "null")).toEqual({
      filters: [{ column: "Cabang", op: "in", values: ["Medan"] }],
    });
  });

  test("versi widget: pemilik menyimpan dari panel usang → 409 STALE, editor membeku tanpa kirim ulang; PATCH version salah 400, version terkini 200", async () => {
    const path = `/api/dashboards/${d1}/widgets/${editorWidgetId}`;
    // A membuka panel widget editor dengan versi saat halaman dimuat (isi = Jumlah baris dari E).
    await a.goto(`${d1Path()}?mode=edit`);
    await expectValue(a, EDITOR_WIDGET, ROWS);
    const aPanel = await openPanel(a, EDITOR_WIDGET);

    // E (panelnya masih terbuka dari uji sebelumnya) menyimpan lebih dulu: Jumlah baris → Total.
    const ePanel = e.getByTestId("widget-panel");
    const eSaved = widgetPatch(e, editorWidgetId);
    await pickAgg(e, ePanel, "Total");
    expect((await eSaved).status()).toBe(200);
    await expectValue(e, EDITOR_WIDGET, SUM_OMZET);

    // A menyimpan dari panel usang → 409 STALE; simpanan E tidak tertimpa.
    let patches = 0;
    const count = (r: Request) => {
      if (r.method() === "PATCH" && r.url().endsWith(path)) patches++;
    };
    a.on("request", count);
    const stale = widgetPatch(a, editorWidgetId);
    await pickAgg(a, aPanel, "Rata-rata");
    const res = await stale;
    expect(res.status()).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, code: "STALE", message: STALE_WIDGET });
    expect(res.request().postDataJSON()).toMatchObject({
      type: "kpi",
      version: expect.stringMatching(ISO_MS),
    });
    // Editor membeku: pesan server + "Muat ulang", panel tertutup, tidak ada aksi tulis lagi.
    await expect(a.getByTestId("save-state")).toHaveAttribute("data-state", "stale");
    await expect(a.getByTestId("save-state")).toContainText("Diubah di tab atau perangkat lain.");
    await expect(a.getByText(STALE_WIDGET)).toBeVisible();
    await expect(a.locator("[data-stale-reload]")).toBeVisible();
    await expect(a.getByTestId("widget-panel")).toHaveCount(0);
    await expect(
      a.getByTestId("canvas-toolbar").getByRole("button", { name: "Tambah widget", exact: true }),
    ).toBeDisabled();
    await expect(a.getByRole("button", { name: `Pengaturan ${EDITOR_WIDGET}` })).toHaveCount(0);
    // Tanpa loop kirim ulang.
    await a.waitForTimeout(2_000);
    a.off("request", count);
    expect(patches).toBe(1);

    // Yang tersimpan tetap isi E (Total Omzet); jawaban query membawa versinya (juga untuk viewer).
    const q = await query(a, { widgetId: editorWidgetId });
    expect(q.status(), await q.text()).toBe(200);
    const qb = (await q.json()) as { rows: unknown[][]; widgetVersion: string };
    expect(Number(qb.rows[0]![0])).toBe(SUM_OMZET);
    const current = qb.widgetVersion;
    expect(current).toMatch(ISO_MS);
    const viewerQ = (await (await query(b, { widgetId: editorWidgetId })).json()) as {
      widgetVersion?: string;
    };
    expect(viewerQ.widgetVersion).toBe(current);

    // PATCH langsung: version bukan ISO persis milidetik → 400 (ganti judul dan atur isi), tanpa ubahan.
    const badVersion = async (body: Record<string, unknown>) => {
      const r = await api(e, "PATCH", path, body);
      const text = await r.text();
      expect(r.status(), text).toBe(400);
      expect(JSON.parse(text)).toMatchObject({
        ok: false,
        code: "INVALID",
        message: "Versi widget tidak valid.",
      });
    };
    for (const version of [
      "kemarin",
      null,
      123,
      current.replace(/\.\d{3}Z$/, "Z"),
      "2026-02-31T00:00:00.000Z",
    ]) {
      await badVersion({ title: HACKED, version });
    }
    await badVersion({ type: "kpi", spec: { sheetId: sheetX }, version: "kemarin" });
    // Version terkini → 200 + version baru; version lama yang sama dikirim lagi → 409 STALE.
    const ok = await api(e, "PATCH", path, { title: EDITOR_WIDGET, version: current });
    expect(ok.status(), await ok.text()).toBe(200);
    const okBody = (await ok.json()) as { ok: boolean; data: { title: string; version: string } };
    expect(okBody).toMatchObject({ ok: true, data: { title: EDITOR_WIDGET } });
    expect(okBody.data.version).toMatch(ISO_MS);
    expect(Date.parse(okBody.data.version)).toBeGreaterThan(Date.parse(current));
    const again = await api(e, "PATCH", path, { title: HACKED, version: current });
    expect(again.status()).toBe(409);
    expect(await again.json()).toMatchObject({ ok: false, code: "STALE", message: STALE_WIDGET });
    const after = (await (await query(a, { widgetId: editorWidgetId })).json()) as {
      widgetVersion: string;
    };
    expect(after.widgetVersion).toBe(okBody.data.version);

    // Muat ulang → editor pemilik hidup lagi dengan isi terbaru; judul tidak pernah jadi HACKED.
    const loaded = a.waitForEvent("load");
    await a.locator("[data-stale-reload]").click();
    await loaded;
    await expect(a.getByTestId("save-state")).toHaveAttribute("data-state", "saved");
    await expectValue(a, EDITOR_WIDGET, SUM_OMZET);
    await expect(widgetTitled(a, HACKED)).toHaveCount(0);
    await expect(
      a.getByTestId("canvas-toolbar").getByRole("button", { name: "Tambah widget", exact: true }),
    ).toBeEnabled();
  });

  test("Back setelah 'Ubah tata letak' (review R2-CL-1): isi widget yang baru diubah pemilik tampil di mode lihat, tanpa 'sudah diubah'", async () => {
    await a.goto(d1Path());
    await expectValue(a, EDITOR_WIDGET, SUM_OMZET);
    await a.getByTestId("edit-dashboard").click();
    await expect(a).toHaveURL(/\?mode=edit$/);
    const panel = await openPanel(a, EDITOR_WIDGET);
    const saved = widgetPatch(a, editorWidgetId);
    await pickAgg(a, panel, "Jumlah baris");
    const res = await saved;
    expect(res.status(), await res.text()).toBe(200);
    await expect(panel.getByTestId("config-status")).toHaveAttribute("data-state", "saved");
    await expectValue(a, EDITOR_WIDGET, ROWS);

    // Back = halaman lihat dari cache riwayat router (versi widget lama) → kerangka sampai refresh
    // selesai → kanvas dengan versi terbaru. Kartu tidak pernah menampilkan CHANGED, walau sekejap.
    await watchDom(a);
    await a.goBack();
    await expect.poll(() => new URL(a.url()).searchParams.get("mode")).toBeNull();
    await expect(a.getByTestId("canvas-toolbar")).toHaveCount(0);
    await expectValue(a, EDITOR_WIDGET, ROWS);
    await expect(a.getByTestId("canvas-refreshing")).toHaveCount(0);
    await expect(a.locator(SEEN.changed)).toHaveCount(0);
    await expect(a.getByTestId("widget-error")).toHaveCount(0);
    expect(await seenDom(a)).toEqual(["refreshing"]);
  });

  test("Back ke editor setelah 'Selesai' (review R2-CL-1): ganti judul lagi → 200, bukan 409 STALE; tanpa 'Diubah di tab atau perangkat lain.'", async () => {
    /** Ganti judul lewat panel; PATCH membawa versi yang dipegang editor dan harus diterima (200). */
    const rename = async (from: string, to: string) => {
      const panel = await openPanel(a, from);
      const saved = widgetPatch(a, editorWidgetId);
      const title = panel.getByLabel("Judul", { exact: true });
      await title.fill(to);
      await title.press("Enter");
      const res = await saved;
      expect(res.status(), await res.text()).toBe(200);
      expect(res.request().postDataJSON()).toMatchObject({
        title: to,
        version: expect.stringMatching(ISO_MS),
      });
      await expect(widgetTitled(a, to)).toHaveCount(1);
      await expect(a.getByTestId("save-state")).toHaveAttribute("data-state", "saved");
    };
    await a.goto(`${d1Path()}?mode=edit`);
    await expectValue(a, EDITOR_WIDGET, ROWS);
    await rename(EDITOR_WIDGET, OWNER_TITLE);
    await a
      .getByTestId("canvas-toolbar")
      .getByRole("button", { name: "Selesai", exact: true })
      .click();
    await expect.poll(() => new URL(a.url()).searchParams.get("mode")).toBeNull();
    await expect(a.getByTestId("canvas-toolbar")).toHaveCount(0);
    await expectValue(a, OWNER_TITLE, ROWS);

    // Back → editor dari cache riwayat (judul + versi lama) → kerangka → props segar → editor.
    await watchDom(a);
    await a.goBack();
    await expect(a).toHaveURL(/\?mode=edit$/);
    await expect(a.getByTestId("canvas-toolbar")).toBeVisible();
    await expectValue(a, OWNER_TITLE, ROWS);
    await expect(widgetTitled(a, EDITOR_WIDGET)).toHaveCount(0);
    // Ganti judul lagi dari editor yang dipulihkan: versi terbaru → 200 (dulu: versi lama → 409 STALE).
    await rename(OWNER_TITLE, EDITOR_WIDGET);
    await expect(a.getByTestId("save-state")).not.toContainText(
      "Diubah di tab atau perangkat lain.",
    );
    await expect(a.getByText(STALE_WIDGET)).toHaveCount(0);
    await expect(a.locator("[data-stale-reload]")).toHaveCount(0);
    await expect(a.getByTestId("widget-error")).toHaveCount(0);
    expect(await seenDom(a)).toEqual(["refreshing"]);
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

  test("versi widget di jawaban gagal (review R2-CL-2): B mengurutkan kolom tabel yang baru dibuang pemilik → CHANGED + Muat ulang, bukan galat INVALID", async () => {
    await a.goto(`${d1Path()}?mode=edit`);
    await expect(a.getByTestId("canvas-toolbar")).toBeVisible();
    const panel = await addWidget(a, TABLE, "Tabel");
    const tableId = await widgetId(a, TABLE);
    const heads = (p: Page) =>
      widgetTitled(p, TABLE).getByTestId("widget-table").getByRole("columnheader");
    await expect(heads(a)).toHaveText(["Cabang", "Tanggal", "Omzet"]);

    // B membuka tabel dengan pengaturan lama (3 kolom).
    await b.goto(d1Path());
    await expect(heads(b)).toHaveText(["Cabang", "Tanggal", "Omzet"]);

    // A membuang kolom Omzet dari tabel.
    const saved = widgetPatch(a, tableId);
    await panel
      .getByRole("group", { name: /^Kolom ditampilkan/ })
      .getByRole("checkbox", { name: "Omzet", exact: true })
      .uncheck();
    const res = await saved;
    expect(res.status(), await res.text()).toBe(200);
    await expect(panel.getByTestId("config-status")).toHaveAttribute("data-state", "saved");
    await expect(heads(a)).toHaveText(["Cabang", "Tanggal"]);

    // B mengurutkan Omzet (posisi dari pengaturan lama) → 400 INVALID yang membawa versi widget
    // terbaru → kartu CHANGED + "Muat ulang", bukan baris galat urutan di atas tabel lama.
    const refused = b.waitForResponse(
      (r) =>
        r.url().endsWith("/api/query") &&
        r.request().method() === "POST" &&
        (r.request().postData() ?? "").includes(tableId) &&
        (r.request().postData() ?? "").includes('"sort"'),
    );
    await widgetTitled(b, TABLE)
      .getByRole("columnheader", { name: "Omzet", exact: true })
      .getByRole("button")
      .click();
    const bad = await refused;
    const body = (await bad.json()) as Record<string, unknown>;
    expect(bad.status(), JSON.stringify(body)).toBe(400);
    expect(body).toMatchObject({
      ok: false,
      code: "INVALID",
      widgetVersion: expect.stringMatching(ISO_MS),
    });
    expect(bad.request().postDataJSON()).toMatchObject({
      widgetId: tableId,
      sort: expect.anything(),
    });
    const card = widgetTitled(b, TABLE);
    const changed = card.getByTestId("widget-error");
    await expect(changed).toHaveAttribute("data-code", "CHANGED");
    await expect(changed).toContainText(WIDGET_CHANGED);
    await expect(changed.getByTestId("widget-reload")).toBeVisible();
    await expect(card.getByText("Urutan hanya untuk kolom di tabel ini.")).toHaveCount(0);
    await expect(card.getByTestId("widget-table")).toHaveCount(0);

    // Muat ulang → tabel dengan pengaturan terbaru (2 kolom), tanpa galat.
    const loaded = b.waitForEvent("load");
    await changed.getByTestId("widget-reload").click();
    await loaded;
    await expect(heads(b)).toHaveText(["Cabang", "Tanggal"]);
    await expect(card.getByTestId("widget-error")).toHaveCount(0);
  });

  test("ponsel 320×640 (review R2-UI-2): kartu KPI berstatus CHANGED memuat 'Muat ulang' utuh di dalam kartu", async () => {
    const viewport = b.viewportSize()!;
    await b.setViewportSize({ width: 320, height: 640 });
    try {
      await b.goto(d1Path());
      await expectValue(b, EDITOR_WIDGET, ROWS);
      await expect(b.getByTestId("filter-sheet-open")).toBeVisible();

      // A mengubah isi KPI editor: Jumlah baris → Total.
      await a.goto(`${d1Path()}?mode=edit`);
      await expectValue(a, EDITOR_WIDGET, ROWS);
      const panel = await openPanel(a, EDITOR_WIDGET);
      const saved = widgetPatch(a, editorWidgetId);
      await pickAgg(a, panel, "Total");
      expect((await saved).status()).toBe(200);
      await expectValue(a, EDITOR_WIDGET, SUM_OMZET);

      // B memfilter lewat lembar filter ponsel → semua widget dimuat ulang → KPI editor CHANGED.
      await b.getByTestId("filter-sheet-open").click();
      const sheet = b.getByTestId("filter-sheet");
      await sheet.getByRole("button", { name: /^Cabang/ }).click();
      await sheet.locator('[data-testid=filter-slicer-option][data-value="Jakarta"] input').check();
      await sheet.getByRole("button", { name: "Selesai", exact: true }).click();
      await expect(sheet).toHaveCount(0);
      await expectKpi(b, countOf("Jakarta"));
      const card = widgetTitled(b, EDITOR_WIDGET);
      const changed = card.getByTestId("widget-error");
      await expect(changed).toHaveAttribute("data-code", "CHANGED");
      await expect(changed).toContainText(WIDGET_CHANGED);
      const reload = changed.getByTestId("widget-reload");
      await reload.scrollIntoViewIfNeeded();
      await expect(reload).toBeInViewport({ ratio: 1 });

      // Tombol utuh di dalam kartu DAN di dalam wilayah pesan (tanpa menggulir di dalam kartu).
      const [cardBox, regionBox, btnBox] = await Promise.all([
        card.boundingBox(),
        changed.boundingBox(),
        reload.boundingBox(),
      ]);
      const inside = (
        inner: { x: number; y: number; width: number; height: number },
        outer: { x: number; y: number; width: number; height: number },
      ) =>
        inner.x >= outer.x - 0.5 &&
        inner.y >= outer.y - 0.5 &&
        inner.x + inner.width <= outer.x + outer.width + 0.5 &&
        inner.y + inner.height <= outer.y + outer.height + 0.5;
      const boxes = JSON.stringify({ cardBox, regionBox, btnBox });
      expect(inside(btnBox!, cardBox!), boxes).toBe(true);
      expect(inside(btnBox!, regionBox!), boxes).toBe(true);
      expect(await changed.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(
        1,
      );
      // KPI tanpa galat tetap ringkas (tinggi minimum 150 px, review L6).
      expect((await widgetTitled(b, KPI).boundingBox())!.height).toBeLessThanOrEqual(151);
    } finally {
      await b.setViewportSize(viewport);
    }
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

  test("Dibagikan ke saya: share langsung didahulukan dari share organisasi saja walau yang organisasi diperbarui lebih baru", async () => {
    // Dataset Y (X sudah dihapus). D3: KPI + kolom filter Produk, dibagikan langsung ke C (dipakai lagi
    // di uji berikutnya). D4: organisasi saja, diubah PALING AKHIR (updatedAt terbaru) — urutan lama
    // (satu query, updatedAt desc) menaruhnya di atas share langsung.
    d3 = await createDashboard(a, datasetY, D3_NAME);
    await addWidget(a, PRODUK_KPI, "Angka");
    await expectValue(a, PRODUK_KPI, SUM_JUMLAH);
    await addFilterColumn(a, "Produk", 1);
    d4 = await createDashboard(a, datasetY, D4_NAME);

    let dialog = await openShare(a, `/dashboards/${d3}`);
    const options = await searchUsers(dialog, C.split("@")[0]!);
    await expect(options).toHaveCount(1);
    await expect(options).toHaveAttribute("data-email", C);
    await options.click();
    await expect(options.getByRole("radio")).toBeChecked();
    await dialog.getByTestId("share-add").click();
    await expect(dialog.getByText(`${C} kini bisa melihat dashboard ini.`)).toBeAttached();
    await closeShare(a);

    dialog = await openShare(a, `/dashboards/${d4}`);
    const org = dialog.getByTestId("share-org");
    await org.click();
    await expect(org).toBeChecked();
    await expect(
      dialog.getByText("Dashboard dibagikan ke seluruh organisasi (hanya lihat)."),
    ).toBeAttached();
    await closeShare(a);
    // Ubahan isi D4 setelah semua ubahan D3 (judul widget → "Diperbarui" D4 ikut berubah).
    await a.goto(`/dashboards/${d4}?mode=edit`);
    await addWidget(a, ORG_WIDGET, "Angka");

    // Daftar lengkap (/dashboards) dan kartu Beranda (5 teratas): D3 (langsung) paling atas, D4 sesudahnya.
    for (const path of ["/dashboards", "/"]) {
      await c.goto(path);
      const list = c.getByTestId("shared-list").getByTestId("shared-row");
      await expect(list.first()).toContainText(D3_NAME);
      await expect(sharedRow(c, D4_NAME)).toBeVisible();
      const names = await list.allTextContents();
      const direct = names.findIndex((t) => t.includes(D3_NAME));
      const orgOnly = names.findIndex((t) => t.includes(D4_NAME));
      expect(direct, `${path}: ${JSON.stringify(names)}`).toBe(0);
      expect(orgOnly, `${path}: ${JSON.stringify(names)}`).toBeGreaterThan(direct);
    }
    await expect(sharedRow(c, D3_NAME)).toHaveAttribute("href", `/dashboards/${d3}`);
  });

  test("pencabutan di tengah sesi: muatan pertama sesudahnya = nilai slicer (/filter-values 404) → halaman jadi 404", async () => {
    const d3Path = `/dashboards/${d3}`;
    expect((await c.goto(d3Path))?.status()).toBe(200);
    await expectValue(c, PRODUK_KPI, SUM_JUMLAH);
    const slicer = c.locator('[data-testid=filter-slicer][data-column="Produk"]');
    await expect(slicer).toBeVisible();

    const dialog = await openShare(a, d3Path);
    await grantRow(dialog, C).getByTestId("share-revoke").click();
    const confirm = a.getByTestId("share-revoke-confirm");
    await expect(confirm).toContainText(C);
    await confirm.getByRole("button", { name: "Cabut akses" }).click();
    await expect(dialog.getByText(`Akses ${C} dicabut.`)).toBeAttached();
    await closeShare(a);

    // Muatan data C berikutnya hanya nilai slicer (belum pernah dibuka, tanpa query widget) → 404 →
    // halaman diambil ulang dari server sekali → 404.
    const calls: string[] = [];
    const track = (r: Request) => {
      const p = new URL(r.url()).pathname;
      if (p.startsWith("/api/")) calls.push(p);
    };
    c.on("request", track);
    const refused = c.waitForResponse(
      (r) => r.url().endsWith(`/api/dashboards/${d3}/filter-values`) && r.status() === 404,
    );
    await slicer.click();
    await refused;
    await expect(c.getByRole("heading", { level: 1 })).toHaveText("Halaman tidak ditemukan");
    await expect(c.getByTestId("widget")).toHaveCount(0);
    expect(new URL(c.url()).pathname).toBe(d3Path);
    c.off("request", track);
    expect(calls[0], JSON.stringify(calls)).toBe(`/api/dashboards/${d3}/filter-values`);
    expect(calls, JSON.stringify(calls)).not.toContain("/api/query");

    expect((await c.goto(d3Path))?.status()).toBe(404);
    await c.goto("/dashboards");
    await expect(sharedRow(c, D3_NAME)).toHaveCount(0);
    await expect(sharedRow(c, D4_NAME)).toBeVisible();
  });

  test("peringatan kolom filter (review R2-UI-6): tautan 'pengaturan dashboard (mode edit)' memindah fokus ke bagian #kolom-filter", async () => {
    test.setTimeout(240_000);
    // Workbook 2 sheet: KPI di sheet pertama, kolom filter "No Resi" dari sheet kedua → nama sama di dua
    // sheet yang dipakai dashboard → peringatan tumpang tindih di dialog share.
    const datasetZ = await createDataset(a, DATASET_Z, "tests/fixtures/kecil.xlsx");
    const d5 = await createDashboard(a, datasetZ, D5_NAME);
    const panel = await addWidget(a, Z_KPI, "Angka");
    await expect(panel.getByLabel("Sheet", { exact: true })).toContainText("Pengiriman 1");
    const section = a.getByTestId("dashboard-filter-columns");
    await section.getByRole("button", { name: "Tambah kolom filter" }).click();
    const saved = a.waitForResponse(
      (r) => r.url().endsWith("/filter-columns") && r.request().method() === "PATCH",
    );
    await a
      .getByRole("menuitem", { name: /^No Resi/ })
      .last()
      .click();
    const res = await saved;
    expect(res.status(), await res.text()).toBe(200);
    await expect(
      section.getByRole("list", { name: "Kolom filter" }).getByRole("listitem"),
    ).toHaveCount(1);

    const target = `/dashboards/${d5}?mode=edit#kolom-filter`;
    const focusInSection = () =>
      a.evaluate(() => !!document.activeElement?.closest("section#kolom-filter"));
    const viaLink = async (from: string, activate: (link: Locator) => Promise<void>) => {
      const dialog = await openShare(a, from);
      const warning = dialog.getByTestId("share-warning-filters");
      await expect(warning).toContainText("No Resi");
      const link = warning.getByRole("link", { name: FILTER_LINK });
      await expect(link).toHaveAttribute("href", target);
      await activate(link);
      await expect(a.getByTestId("share-dialog")).toHaveCount(0);
      await expect.poll(() => a.url()).toMatch(new RegExp(`${target.replace("?", "\\?")}$`));
      await expect(a.getByTestId("canvas-toolbar")).toBeVisible();
      const settings = a.locator("section#kolom-filter");
      await expect(settings).toBeInViewport();
      // Fokus di bagian kolom filter (bukan kembali ke "Bagikan" di atas halaman), dan bertahan.
      await expect.poll(focusInSection).toBe(true);
      await expect(a.getByTestId("share-open")).not.toBeFocused();
      await a.waitForTimeout(500);
      expect(await focusInSection()).toBe(true);
      // Tab berikutnya berlanjut dari bagian itu (urutan fokus, WCAG 2.4.3).
      await a.keyboard.press("Tab");
      expect(await focusInSection()).toBe(true);
    };
    // Dari mode lihat (klik): bagian kolom filter terpasang setelah navigasi lalu memfokus dirinya.
    await viaLink(`/dashboards/${d5}`, (link) => link.click());
    // Dari mode edit (keyboard): bagian sudah ada — fokus dipindah saat dialog tertutup.
    await viaLink(`/dashboards/${d5}?mode=edit`, async (link) => {
      await link.focus();
      await link.press("Enter");
    });
  });
});
