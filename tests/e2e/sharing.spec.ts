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
  type Response,
  type Route,
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
 * usang → STALE) → Back/Forward memuat versi terbaru (mode lihat + editor; juga setelah masuk lewat
 * klik baris /dashboards, dengan posisi gulir pulih) → editor diturunkan →
 * tabel: urut kolom yang baru dibuang → CHANGED → KPI CHANGED di ponsel 320 px → cabut + AuditLog →
 * hapus dataset X → dataset Y: daftar "Dibagikan ke saya" (share langsung dulu) → pencabutan yang
 * muatan pertamanya nilai slicer → dataset Z (2 sheet): tautan peringatan kolom filter memindah fokus
 * dan membawa ?f=; Ctrl+Z di dialog Bagikan bukan milik kanvas →
 * review R3 di D3: E viewer → editor lewat konfirmasi → mode edit E: widget dihapus pemilik lalu E dicabut
 * → kolom filter disembunyikan (viewer B tidak bisa menebak nama; slicer usang → "Muat ulang") → hapus
 * D3 yang dibagikan (audit) → pemilik X dengan 21 share langsung ke C (semua terdaftar: batas 20 per
 * pemilik hanya bila daftar melewati 200).
 * Review R5 di D7 (dataset Y, pribadi — tanpa organisasi), sebelum kolom filter disembunyikan: ponsel
 * "Bagikan" tanpa pilihan (B, E jadi viewer) → mode lihat B: widget dihapus pemilik saat popover slicer
 * dipakai → B naik ke editor hanya dengan keyboard → mode edit B: widget sesi B dihapus pemilik, lalu B
 * dicabut → ganti peran E yang sudah dicabut di tab lain (galat di bawah judul daftar, fokus ke judul;
 * 1440 dan 320 px) → sakelar organisasi yang lambat lalu gagal: dialog tidak bisa ditutup → baris
 * konfirmasi "Bagikan" terlihat (C viewer di 320 px, B editor di 1440 px).
 * Review R6-CL-1 di D1 (sebelum editor diturunkan): "Selesai"/Back sesaat setelah mengubah isi di panel
 * atau menggeser widget → mode lihat memuat perubahan terakhir (PATCH/PUT diperlambat, selesai sebelum
 * props mode lihat diminta).
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
/** Nama tampilan semua akun uji (helpers.register); pemilik tampil sebagai nama + email (R3-CC-1). */
const OWNER_NAME = "Uji E2E";
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
/** Peringatan editor (AC6) di bagian tambah orang dan di konfirmasi "Jadikan editor?". */
const EDITOR_WARNING = "Editor dapat membaca semua kolom tidak tersembunyi dataset ini.";
/** Widget D3 yang dihapus pemilik selagi editor E di mode edit (review T-016 R3-CL-1). */
const GONE_WIDGET = "Hapus nanti";
/**
 * Jawaban untuk nama yang bukan (lagi) kolom filter dashboard: nama lama dan tebakan dijawab sama untuk
 * non-pemilik (review T-016 R3-SEC-1), dengan petunjuk muat ulang untuk semua pemanggil (R4-CC-1).
 */
const NOT_FILTER =
  "Kolom ini bukan kolom filter dashboard. Muat ulang halaman bila pengaturan dashboard baru diubah.";
const NOT_ALLOWED =
  "Filter tidak diizinkan untuk dashboard ini. Muat ulang halaman bila pengaturan dashboard baru diubah.";
/** Pesan server untuk ubahan widget dari versi pengaturan lama (review T-016 DI-1). */
const STALE_WIDGET =
  "Widget ini sudah berubah sejak halaman ini dimuat. Muat ulang halaman untuk melihat versi terbaru.";
const WIDGET_CHANGED = "Widget ini sudah diubah. Muat ulang halaman.";
/** Status toolbar editor yang membeku karena STALE: penyebabnya netral (review T-016 R4-CC-2). */
const STALE_STATUS = "Diubah di tempat lain.";
/** Widget sementara uji Ctrl+Z di dialog Bagikan (review T-016 R4-CL-1). */
const UNDO_WIDGET = "Urungkan nanti";
/** D7 (dataset Y, review T-016 R5): pribadi; B viewer → editor (lalu dicabut), E viewer (dicabut). */
const D7_NAME = `Ulasan R5 ${TAG}`;
/** Widget D7 yang dihapus pemilik selagi viewer B memakai slicer (review T-016 R5-CL-2). */
const TEMP_WIDGET = "Sementara R5";
/** Widget yang ditambahkan editor B di sesinya lalu dihapus pemilik (review T-016 R5-CL-1). */
const LOKAL_WIDGET = "Lokal editor";
/** Alasan "Bagikan" tanpa pengguna terpilih (review T-016 R5-UI-2). */
const MISSING_USER = "Pilih pengguna dari hasil pencarian dulu.";
/** Ganti peran orang yang sudah tidak punya share (review T-016 R5-DI-1). */
const NO_SHARE = "Pengguna ini belum punya akses ke dashboard ini.";
/** Galat ganti peran yang barisnya hilang, setelah email orangnya (klien, review T-016 R6-UI-1). */
const ROLE_GONE =
  "sudah tidak punya akses ke dashboard ini (mis. dicabut di tab atau perangkat lain). Daftar akses sudah diperbarui.";
/** Aksi share yang melempar (jaringan putus). */
const NETWORK_ERROR = "Tidak bisa menghubungi server. Periksa koneksi lalu coba lagi.";
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
let d5 = "";
/** KPI D3 (dataset Y), dipakai lagi setelah D3 dihapus. */
let produkKpiId = "";
let d7 = "";
/** KPI D7 (tetap ada sampai akhir; muatan pertamanya setelah B dicabut = 404). */
let d7KpiId = "";
let grantAction: Captured | null = null;
let renameAction: Captured | null = null;
const d1Path = () => `/dashboards/${d1}`;
const d7Path = () => `/dashboards/${d7}`;

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

/**
 * Kirim ulang Server Action dengan cookie `page` dan beberapa penggantian (di body DAN URL halaman, mis.
 * id dashboard). Status < 400 diperiksa; hasil = payload RSC mentah.
 */
async function send(page: Page, action: Captured | null, pairs: [string, string][]) {
  expect(action).not.toBeNull();
  let { url, body } = action!;
  for (const [from, to] of pairs) {
    url = url.replaceAll(from, to);
    body = body.replaceAll(from, to);
  }
  const res = await page.request.fetch(url, {
    method: "POST",
    headers: action!.headers,
    data: body,
    maxRedirects: 0,
  });
  const text = await res.text();
  expect(res.status(), text.slice(0, 500)).toBeLessThan(400);
  return text;
}

/** Dataset tanpa unggahan (cukup untuk membuat dashboard). */
async function newDataset(page: Page, name: string): Promise<string> {
  await page.goto("/datasets/baru");
  await page.getByLabel("Nama dataset").fill(name);
  await page.getByRole("button", { name: "Buat dataset" }).click();
  await expect(page).toHaveURL(/\/datasets\/[a-z0-9]{20,32}\?created=1$/);
  return new URL(page.url()).pathname.split("/").pop()!;
}

async function createDataset(page: Page, name: string, file: string): Promise<string> {
  const id = await newDataset(page, name);
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

/**
 * Ganti judul lewat panel; PATCH membawa versi yang dipegang editor dan harus diterima (200). Panel
 * ditutup lagi (tombol pengaturan widget yang panelnya terbuka menutup panel itu).
 */
async function renameWidget(page: Page, id: string, from: string, to: string) {
  const panel = await openPanel(page, from);
  const saved = widgetPatch(page, id);
  const title = panel.getByLabel("Judul", { exact: true });
  await title.fill(to);
  await title.press("Enter");
  const res = await saved;
  expect(res.status(), await res.text()).toBe(200);
  expect(res.request().postDataJSON()).toMatchObject({
    title: to,
    version: expect.stringMatching(ISO_MS),
  });
  await expect(widgetTitled(page, to)).toHaveCount(1);
  await expect(page.getByTestId("save-state")).toHaveAttribute("data-state", "saved");
  await panel.getByRole("button", { name: "Tutup pengaturan" }).click();
  await expect(page.getByTestId("widget-panel")).toHaveCount(0);
}

/** Pindah halaman lewat navigasi utama (navigasi klien, dokumen tetap). */
async function navTo(page: Page, label: string, path: RegExp) {
  await page
    .getByRole("navigation", { name: "Navigasi utama" })
    .getByRole("link", { name: label, exact: true })
    .click();
  await expect.poll(() => new URL(page.url()).pathname).toMatch(path);
  await expect(page.getByTestId("widget")).toHaveCount(0);
}

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

/** Wilayah aria-live panel share (sr-only): pengumuman hasil aksi terakhir. */
const announcement = (dialog: Locator) => dialog.locator("p.sr-only[aria-live]");

/**
 * "Bagikan" berhasil: diumumkan di wilayah aria-live DAN tampil sebagai baris konfirmasi di bawah kolom
 * cari (review T-016 R6-UI-3, R7). Teksnya sama di kedua tempat, jadi diperiksa per wadah.
 */
async function expectGranted(dialog: Locator, email: string, role: "VIEWER" | "EDITOR" = "VIEWER") {
  const text = `${email} kini ${role === "EDITOR" ? "bisa mengedit widget" : "bisa melihat"} dashboard ini.`;
  await expect(announcement(dialog)).toHaveText(text);
  const done = dialog.getByTestId("share-add-done");
  await expect(done).toHaveText(text);
  await expect(done).toBeVisible();
}

/**
 * Elemen `el` utuh di dalam area terlihat isi dialog yang bergulir (kepala dan kaki "Selesai" tidak
 * menutupinya) dan di dalam layar.
 */
async function expectInDialogView(el: Locator) {
  await expect(el).toBeInViewport({ ratio: 1 });
  const clip = await el.evaluate((node) => {
    let p = node.parentElement;
    while (p && getComputedStyle(p).overflowY !== "auto") p = p.parentElement;
    const r = node.getBoundingClientRect();
    const v = (p ?? document.documentElement).getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, viewTop: v.top, viewBottom: v.bottom };
  });
  expect(clip.top, JSON.stringify(clip)).toBeGreaterThanOrEqual(clip.viewTop - 0.5);
  expect(clip.bottom, JSON.stringify(clip)).toBeLessThanOrEqual(clip.viewBottom + 0.5);
}

/** Hitung refresh RSC halaman `path` (router.refresh), bukan prefetch tautan. */
function trackRefreshes(page: Page, path: string) {
  let n = 0;
  const track = (r: Request) => {
    const h = r.headers();
    if (
      r.method() === "GET" &&
      h["rsc"] === "1" &&
      !h["next-router-prefetch"] &&
      new URL(r.url()).pathname === path
    ) {
      n++;
    }
  };
  page.on("request", track);
  return { count: () => n, stop: () => page.off("request", track) };
}

/**
 * Urutan kejadian jaringan halaman (review T-016 R6-CL-1): jawaban PATCH widget ("patch:<status>") dan
 * PUT tata letak ("layout:<status>"), dan permintaan RSC halaman `path` ("rsc": navigasi atau refresh,
 * bukan prefetch) — props server yang dibaca mode lihat.
 */
function netLog(page: Page, path: string) {
  const log: string[] = [];
  const onRequest = (r: Request) => {
    const h = r.headers();
    if (
      r.method() === "GET" &&
      h["rsc"] === "1" &&
      !h["next-router-prefetch"] &&
      new URL(r.url()).pathname === path
    ) {
      log.push("rsc");
    }
  };
  const onResponse = (r: Response) => {
    const method = r.request().method();
    const { pathname } = new URL(r.url());
    if (method === "PATCH" && /\/widgets\/[a-z0-9]+$/.test(pathname))
      log.push(`patch:${r.status()}`);
    if (method === "PUT" && pathname.endsWith("/layout")) log.push(`layout:${r.status()}`);
  };
  page.on("request", onRequest);
  page.on("response", onResponse);
  return {
    log,
    /** `first` terjadi, dan sebelum permintaan RSC pertama (yang juga harus ada). */
    expectBeforeRsc(first: string) {
      const at = log.indexOf(first);
      expect(at, log.join(" → ")).toBeGreaterThanOrEqual(0);
      expect(log.indexOf("rsc"), log.join(" → ")).toBeGreaterThan(at);
    },
    stop() {
      page.off("request", onRequest);
      page.off("response", onResponse);
    },
  };
}

/** Tulisan `method` ditahan `ms` sebelum diteruskan: perlombaan dengan pembacaan props jadi pasti. */
function slowWrite(method: "PATCH" | "PUT", ms = 1_000) {
  const handler = async (route: Route) => {
    if (route.request().method() === method) await new Promise((r) => setTimeout(r, ms));
    await route.continue();
  };
  return handler;
}

/** Posisi/ukuran tiap widget (id → "x,y,w,h") yang tampil. */
const positions = (page: Page) =>
  page
    .getByTestId("widget")
    .evaluateAll((els) =>
      Object.fromEntries(
        els.map((el) => [el.getAttribute("data-widget-id"), el.getAttribute("data-pos")]),
      ),
    );

/** Jawaban /api/query berikutnya untuk widget `id` dengan status `status`. */
const queryAnswer = (page: Page, id: string, status: number) =>
  page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/query") &&
      r.status() === status &&
      (r.request().postData() ?? "").includes(id),
  );

/** DELETE widget `id` berikutnya di dashboard `dashboardId`. */
const widgetDelete = (page: Page, dashboardId: string, id: string) =>
  page.waitForResponse(
    (r) =>
      r.url().includes(`/api/dashboards/${dashboardId}/widgets/${id}`) &&
      r.request().method() === "DELETE",
  );

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
    await expectGranted(dialog, B);
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
    // Nama bebas bisa meniru rekan: email pemilik selalu ikut (review T-016 R3-CC-1).
    await expect(b.getByTestId("dashboard-owner")).toHaveText(
      `Dibagikan oleh ${OWNER_NAME} (${A})`,
    );
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
    await expect(row.getByTestId("shared-owner")).toContainText(OWNER_NAME);
    await expect(row.getByTestId("shared-owner")).toContainText(A);
    await expect(b.getByTestId("shared-hidden")).toHaveCount(0);
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
    await expect(sharedRow(c, D1_NAME).getByTestId("shared-owner")).toContainText(A);

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
    // Peringatan terbaca saat fokus di "Bagikan" walau pengumuman live hilang (review T-016 R3-UI-1).
    const warningId = await warning.getAttribute("id");
    expect(warningId).toBeTruthy();
    await expect(dialog.getByTestId("share-add")).toHaveAttribute("aria-describedby", warningId!);
    await dialog.getByTestId("share-add").click();
    await expectGranted(dialog, E, "EDITOR");
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

  test("AC6: editor menambah + mengganti judul widget dan menyimpan tata letak; kolom filter dari bilah filter (T-k2ec); tanpa Bagikan", async () => {
    expect((await e.goto(d1Path()))?.status()).toBe(200);
    await expect(e.getByText("Editor", { exact: true })).toBeVisible();
    await expect(e.getByTestId("share-open")).toHaveCount(0);
    await e.getByTestId("edit-dashboard").click();
    await expect(e).toHaveURL(/\?mode=edit/);
    await expect(e.getByTestId("canvas-toolbar")).toBeVisible();
    // Nama, hapus, berbagi: pemilik saja (kartu pengaturan tidak ada untuk editor).
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

    // T-k2ec: editor menambah lalu menghapus kolom filter dari bilah filter (D1 kembali ke Cabang).
    const manage = e.getByTestId("filter-bar-manage");
    await expect(manage).toHaveAttribute("aria-expanded", "false");
    await manage.click();
    await expect(manage).toHaveAttribute("aria-expanded", "true");
    const cols = e.getByTestId("filter-bar-columns");
    const items = cols.getByRole("list", { name: "Kolom filter" }).getByRole("listitem");
    await expect(items).toHaveCount(1);
    const patched = () =>
      e.waitForResponse(
        (r) => r.url().endsWith("/filter-columns") && r.request().method() === "PATCH",
      );
    let saved = patched();
    await cols.getByRole("button", { name: "Tambah kolom filter" }).click();
    await e.getByRole("menuitem", { name: /^Tanggal/ }).click();
    let res = await saved;
    expect(res.status(), await res.text()).toBe(200);
    await expect(items).toHaveCount(2);
    // Kontrol baru langsung muncul di bilah filter (refresh server).
    await expect(e.getByTestId("filter-bar").getByRole("button", { name: /^Tanggal/ })).toHaveCount(
      1,
    );
    saved = patched();
    await cols.getByRole("button", { name: "Hapus kolom filter Tanggal" }).click();
    res = await saved;
    expect(res.status(), await res.text()).toBe(200);
    await expect(items).toHaveCount(1);
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
    await expect(a.getByTestId("save-state")).toContainText(STALE_STATUS);
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

  test("Back ke editor setelah 'Selesai' (review R2-CL-1): ganti judul lagi → 200, bukan 409 STALE; tanpa 'Diubah di tempat lain.'", async () => {
    const rename = (from: string, to: string) => renameWidget(a, editorWidgetId, from, to);
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
    await expect(a.getByTestId("save-state")).not.toContainText(STALE_STATUS);
    await expect(a.getByText(STALE_WIDGET)).toHaveCount(0);
    await expect(a.locator("[data-stale-reload]")).toHaveCount(0);
    await expect(a.getByTestId("widget-error")).toHaveCount(0);
    expect(await seenDom(a)).toEqual(["refreshing"]);
  });

  test("Back setelah masuk lewat navigasi klien (lead review R4): viewer /dashboards → baris → pindah halaman → Back = kerangka + refresh; isi baru tanpa 'sudah diubah'; posisi gulir pulih (R4-CL-2)", async () => {
    const viewport = b.viewportSize()!;
    // Layar pendek agar halaman bisa digulir > 200 px (widget baru mengisi baris, T-1k96).
    await b.setViewportSize({ width: 1280, height: 400 });
    try {
      // Masuk lewat klik baris (navigasi klien): modul kanvas dimuat SETELAH router memasang popstate.
      await b.goto("/dashboards");
      await watchDom(b);
      await sharedRow(b, D1_NAME).click();
      await expect.poll(() => new URL(b.url()).pathname).toBe(d1Path());
      await expectKpi(b, ROWS);
      await expectValue(b, EDITOR_WIDGET, ROWS);

      // A mengubah isi KPI editor (Jumlah baris → Total) dari versi terkini.
      const q = (await (await query(a, { widgetId: editorWidgetId })).json()) as {
        widgetVersion: string;
      };
      const res = await api(a, "PATCH", `/api/dashboards/${d1}/widgets/${editorWidgetId}`, {
        type: "kpi",
        spec: {
          sheetId: sheetX,
          measure: { agg: "sum", column: 3 }, // Omzet
          format: { style: "auto", decimals: 0 },
        },
        version: q.widgetVersion,
      });
      expect(res.status(), await res.text()).toBe(200);

      // Gulir ke bawah → pindah lewat navigasi utama → Back.
      await b.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const scrolled = await b.evaluate(() => window.scrollY);
      expect(scrolled).toBeGreaterThan(200);
      await navTo(b, "Panduan", /^\/panduan$/);
      await b.goBack();
      await expect.poll(() => new URL(b.url()).pathname).toBe(d1Path());
      const card = widgetTitled(b, EDITOR_WIDGET);
      await expect(
        card.getByTestId("kpi-value").or(card.getByTestId("widget-error")),
      ).toBeVisible();
      // Props cache riwayat tidak pernah dipakai: kerangka → refresh → isi baru, tanpa CHANGED sekejap.
      await expectValue(b, EDITOR_WIDGET, SUM_OMZET);
      await expect(b.getByTestId("canvas-refreshing")).toHaveCount(0);
      await expect(b.getByTestId("widget-error")).toHaveCount(0);
      expect(await seenDom(b)).toEqual(["refreshing"]);
      // Posisi gulir pulih setelah refresh (kerangka setinggi kanvas terakhir, review T-016 R4-CL-2).
      await expect
        .poll(async () => Math.abs((await b.evaluate(() => window.scrollY)) - scrolled))
        .toBeLessThanOrEqual(100);
    } finally {
      await b.setViewportSize(viewport);
    }
  });

  test("Back setelah masuk lewat navigasi klien (lead review R4): pemilik /dashboards → baris → 'Ubah tata letak' → ubah isi → pindah halaman → Back = editor segar; ganti judul 200, tanpa CHANGED/STALE", async () => {
    await a.goto("/dashboards");
    await watchDom(a);
    await ownRow(a, D1_NAME).click();
    await expect.poll(() => new URL(a.url()).pathname).toBe(d1Path());
    await expectValue(a, EDITOR_WIDGET, SUM_OMZET);
    await a.getByTestId("edit-dashboard").click();
    await expect(a).toHaveURL(/\?mode=edit$/);
    const panel = await openPanel(a, EDITOR_WIDGET);
    const saved = widgetPatch(a, editorWidgetId);
    await pickAgg(a, panel, "Jumlah baris");
    expect((await saved).status()).toBe(200);
    await expect(panel.getByTestId("config-status")).toHaveAttribute("data-state", "saved");
    await expectValue(a, EDITOR_WIDGET, ROWS);

    await navTo(a, "Beranda", /^\/$/);
    await a.goBack();
    await expect(a).toHaveURL(/\?mode=edit$/);
    await expect(a.getByTestId("canvas-toolbar")).toBeVisible();
    const card = widgetTitled(a, EDITOR_WIDGET);
    await expect(card.getByTestId("kpi-value").or(card.getByTestId("widget-error"))).toBeVisible();
    await expectValue(a, EDITOR_WIDGET, ROWS);
    expect(await seenDom(a)).toEqual(["refreshing"]);
    // Editor yang dipulihkan memegang versi terbaru: ganti judul → 200 (bukan 409 STALE).
    await renameWidget(a, editorWidgetId, EDITOR_WIDGET, OWNER_TITLE);
    await renameWidget(a, editorWidgetId, OWNER_TITLE, EDITOR_WIDGET);
    await expect(a.getByTestId("save-state")).not.toContainText(STALE_STATUS);
    await expect(a.getByText(STALE_WIDGET)).toHaveCount(0);
    await expect(a.locator("[data-stale-reload]")).toHaveCount(0);
    await expect(a.getByTestId("widget-error")).toHaveCount(0);
    expect(await seenDom(a)).toEqual(["refreshing"]);
  });

  test("R6-CL-1: 'Selesai' sesaat setelah mengubah isi di panel (PATCH diperlambat) → mode lihat memuat isi baru tanpa 'sudah diubah'; PATCH selesai sebelum props mode lihat diminta", async () => {
    await a.goto(`${d1Path()}?mode=edit`);
    await expectValue(a, EDITOR_WIDGET, ROWS);
    const panel = await openPanel(a, EDITOR_WIDGET);
    const target = `**/api/dashboards/${d1}/widgets/${editorWidgetId}`;
    const slow = slowWrite("PATCH");
    await a.route(target, slow);
    const net = netLog(a, d1Path());
    try {
      await watchDom(a);
      const saved = widgetPatch(a, editorWidgetId);
      await pickAgg(a, panel, "Total");
      // Panel masih terbuka dan simpanannya masih menunggu jeda 350 ms: langsung "Selesai".
      await a
        .getByTestId("canvas-toolbar")
        .getByRole("button", { name: "Selesai", exact: true })
        .click();
      const res = await saved;
      expect(res.status(), await res.text()).toBe(200);
      expect(res.request().postDataJSON()).toMatchObject({ spec: { measure: { agg: "sum" } } });
      await expect.poll(() => new URL(a.url()).searchParams.get("mode")).toBeNull();
      await expect(a.getByTestId("canvas-toolbar")).toHaveCount(0);
      await expectValue(a, EDITOR_WIDGET, SUM_OMZET);
      // Muatan widget mode lihat memakai versi terbaru: tidak pernah "sudah diubah", juga sesudahnya.
      await a.waitForTimeout(1_000);
      await expect(a.getByTestId("widget-error")).toHaveCount(0);
      const seen = await seenDom(a);
      expect(seen).not.toContain("changed");
      expect(seen).not.toContain("stale");
      net.expectBeforeRsc("patch:200");
    } finally {
      net.stop();
      await a.unroute(target, slow);
    }
  });

  test("R6-CL-1: Back sesaat setelah mengubah isi (editor dibuka lewat 'Ubah tata letak', PATCH diperlambat) → mode lihat yang dipulihkan memuat isi baru tanpa 'sudah diubah'; refresh menunggu PATCH", async () => {
    await a.goto(d1Path());
    await expectValue(a, EDITOR_WIDGET, SUM_OMZET);
    await a.getByTestId("edit-dashboard").click();
    await expect(a).toHaveURL(/\?mode=edit$/);
    const panel = await openPanel(a, EDITOR_WIDGET);
    const target = `**/api/dashboards/${d1}/widgets/${editorWidgetId}`;
    const slow = slowWrite("PATCH");
    await a.route(target, slow);
    const net = netLog(a, d1Path());
    try {
      await watchDom(a);
      const saved = widgetPatch(a, editorWidgetId);
      await pickAgg(a, panel, "Jumlah baris");
      // Simpanan panel masih menunggu jeda: langsung Back (panel dilepas → PATCH dikirim saat itu).
      await a.goBack();
      const res = await saved;
      expect(res.status(), await res.text()).toBe(200);
      expect(res.request().postDataJSON()).toMatchObject({ spec: { measure: { agg: "count" } } });
      await expect.poll(() => new URL(a.url()).searchParams.get("mode")).toBeNull();
      await expect(a.getByTestId("canvas-toolbar")).toHaveCount(0);
      await expectValue(a, EDITOR_WIDGET, ROWS);
      await expect(a.getByTestId("canvas-refreshing")).toHaveCount(0);
      await a.waitForTimeout(1_000);
      await expectValue(a, EDITOR_WIDGET, ROWS);
      await expect(a.getByTestId("widget-error")).toHaveCount(0);
      // Kerangka sampai refresh (yang menunggu PATCH) selesai; tanpa CHANGED, walau sekejap.
      expect(await seenDom(a)).toEqual(["refreshing"]);
      net.expectBeforeRsc("patch:200");
    } finally {
      net.stop();
      await a.unroute(target, slow);
    }
  });

  test("R6-CL-1: geser widget lalu langsung 'Selesai' / Back (PUT tata letak diperlambat) → mode lihat menampilkan posisi baru, sama dengan setelah muat ulang", async () => {
    test.setTimeout(90_000);
    const target = `**/api/dashboards/${d1}/layout`;
    const slow = slowWrite("PUT");
    /** Geser widget editor satu sel ke arah pertama yang masih mengubah tata letak. */
    const step = async (panel: Locator, dirs: string[]) => {
      for (const dir of dirs) {
        const button = panel.getByRole("button", { name: `Geser ${EDITOR_WIDGET} ${dir}` });
        if ((await button.getAttribute("aria-disabled")) === "true") continue;
        const before = await positions(a);
        await button.click();
        await expect.poll(() => positions(a)).not.toEqual(before);
        return dir;
      }
      throw new Error(`tidak ada langkah yang tersedia: ${dirs.join(", ")}`);
    };

    // "Selesai" sesaat setelah geser (jeda simpan otomatis 500 ms belum habis).
    await a.goto(`${d1Path()}?mode=edit`);
    await expectValue(a, EDITOR_WIDGET, ROWS);
    let panel = await openPanel(a, EDITOR_WIDGET);
    await a.route(target, slow);
    let net = netLog(a, d1Path());
    let moved: Record<string, string | null> = {};
    let dir = "";
    try {
      await watchDom(a);
      dir = await step(panel, ["ke kanan", "ke kiri", "ke bawah", "ke atas"]);
      moved = await positions(a);
      const put = a.waitForResponse(
        (r) => r.url().endsWith(`/api/dashboards/${d1}/layout`) && r.request().method() === "PUT",
      );
      await a
        .getByTestId("canvas-toolbar")
        .getByRole("button", { name: "Selesai", exact: true })
        .click();
      expect((await put).status()).toBe(200);
      await expect.poll(() => new URL(a.url()).searchParams.get("mode")).toBeNull();
      await expect(a.getByTestId("canvas-toolbar")).toHaveCount(0);
      await expect.poll(() => positions(a)).toEqual(moved);
      await expectValue(a, EDITOR_WIDGET, ROWS);
      expect(await seenDom(a)).not.toContain("stale");
      net.expectBeforeRsc("layout:200");
    } finally {
      net.stop();
      await a.unroute(target, slow);
    }

    // Back sesaat setelah geser balik dari editor yang dibuka lewat "Ubah tata letak": tata letak
    // dikirim saat editor dilepas (keepalive) dan refresh mode lihat menunggunya.
    const back: Record<string, string> = {
      "ke kanan": "ke kiri",
      "ke kiri": "ke kanan",
      "ke bawah": "ke atas",
      "ke atas": "ke bawah",
    };
    await a.getByTestId("edit-dashboard").click();
    await expect(a).toHaveURL(/\?mode=edit$/);
    await expect.poll(() => positions(a)).toEqual(moved);
    panel = await openPanel(a, EDITOR_WIDGET);
    await a.route(target, slow);
    net = netLog(a, d1Path());
    let restored: Record<string, string | null> = {};
    try {
      await watchDom(a);
      await step(panel, [back[dir]!]);
      restored = await positions(a);
      const put = a.waitForResponse(
        (r) => r.url().endsWith(`/api/dashboards/${d1}/layout`) && r.request().method() === "PUT",
      );
      await a.goBack();
      expect((await put).status()).toBe(200);
      await expect.poll(() => new URL(a.url()).searchParams.get("mode")).toBeNull();
      await expect(a.getByTestId("canvas-toolbar")).toHaveCount(0);
      await expect(a.getByTestId("canvas-refreshing")).toHaveCount(0);
      await expect.poll(() => positions(a)).toEqual(restored);
      await expectValue(a, EDITOR_WIDGET, ROWS);
      expect(await seenDom(a)).toEqual(["refreshing"]);
      net.expectBeforeRsc("layout:200");
    } finally {
      net.stop();
      await a.unroute(target, slow);
    }
    // Server menyimpan posisi yang sama.
    await a.reload();
    await expectValue(a, EDITOR_WIDGET, ROWS);
    await expect.poll(() => positions(a)).toEqual(restored);
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
    await expectGranted(dialog, C);
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
    d5 = await createDashboard(a, datasetZ, D5_NAME);
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

    // Filter aktif (?f=) ikut ke mode edit lewat tautan ini, seperti "Ubah tata letak" (review T-016
    // R4-CL-3). Status filter menulis ?f= hanya saat pengguna mengubahnya, jadi URL dipakai apa adanya.
    const f = JSON.stringify({ filters: [{ column: "No Resi", op: "in", values: ["R-1"] }] });
    const filtered = await openShare(a, `/dashboards/${d5}?f=${encodeURIComponent(f)}`);
    const link = filtered
      .getByTestId("share-warning-filters")
      .getByRole("link", { name: FILTER_LINK });
    await expect(link).toHaveAttribute(
      "href",
      `/dashboards/${d5}?mode=edit&f=${encodeURIComponent(f)}#kolom-filter`,
    );
    await link.click();
    await expect(a.getByTestId("share-dialog")).toHaveCount(0);
    await expect(a.getByTestId("canvas-toolbar")).toBeVisible();
    await expect
      .poll(() => {
        const u = new URL(a.url());
        return [u.searchParams.get("mode"), u.searchParams.get("f")];
      })
      .toEqual(["edit", f]);

    // Ctrl+Z di dialog Bagikan bukan milik kanvas di belakangnya: widget yang baru ditambahkan tidak
    // terhapus diam-diam. Setelah dialog ditutup, Ctrl+Z kembali mengurungkan langkah kanvas (review
    // T-016 R4-CL-1).
    await a.goto(`/dashboards/${d5}?mode=edit`);
    await expect(a.getByTestId("canvas-toolbar")).toBeVisible();
    await expect(widgetTitled(a, Z_KPI)).toHaveCount(1);
    const before = await a.getByTestId("widget").count();
    await addWidget(a, UNDO_WIDGET, "Angka");
    await expect(
      a.getByTestId("canvas-toolbar").getByRole("button", { name: "Urungkan tambah widget" }),
    ).toBeVisible();
    const isDelete = (r: Request) =>
      r.method() === "DELETE" && r.url().includes(`/api/dashboards/${d5}/widgets/`);
    const deletes: string[] = [];
    const track = (r: Request) => {
      if (isDelete(r)) deletes.push(r.url());
    };
    a.on("request", track);
    await a.getByTestId("share-open").click();
    const share = a.getByTestId("share-dialog");
    await expect(share.getByTestId("share-search")).toBeVisible();
    await share.getByTestId("share-role").focus();
    await a.keyboard.press("Control+z");
    await a.waitForTimeout(1_000);
    expect(deletes).toEqual([]);
    await expect(a.getByTestId("widget")).toHaveCount(before + 1);
    await closeShare(a);
    await expect(widgetTitled(a, UNDO_WIDGET)).toHaveCount(1);
    const undone = a.waitForResponse((r) => isDelete(r.request()));
    await a.keyboard.press("Control+z");
    expect((await undone).status()).toBe(200);
    await expect(a.getByTestId("widget")).toHaveCount(before);
    a.off("request", track);
    expect(deletes).toHaveLength(1);
  });

  test("R3-UI-2: VIEWER → EDITOR di 'Orang dengan akses' lewat konfirmasi 'Jadikan editor?' (Batal = tetap viewer, fokus kembali); peringatan editor dirujuk aria-describedby", async () => {
    test.setTimeout(90_000);
    const d3Path = `/dashboards/${d3}`;
    const dialog = await openShare(a, d3Path);
    await expect(dialog.getByText("Belum ada orang yang diberi akses.")).toBeVisible();
    const options = await searchUsers(dialog, `shr_ed-${TAG}`);
    await expect(options).toHaveCount(1);
    await expect(options).toHaveAttribute("data-email", E);
    await options.click();
    await expect(options.getByRole("radio")).toBeChecked();

    // Wilayah peringatan (aria-live) sudah ada dan tidak display:none SEBELUM peringatan editor
    // muncul, jadi kemunculannya diumumkan (review T-016 R3-UI-1).
    await dialog.evaluate((el) =>
      el
        .querySelectorAll("[aria-live]")
        .forEach((n) => n.setAttribute("data-e2e-live", getComputedStyle(n).display)),
    );
    const role = dialog.getByTestId("share-role");
    const add = dialog.getByTestId("share-add");
    await role.click();
    await a.getByRole("option", { name: "Bisa mengedit widget" }).click();
    const warning = dialog.getByTestId("share-warning-editor");
    await expect(warning).toHaveText(EDITOR_WARNING);
    await expect(warning.locator("xpath=..")).toHaveAttribute("aria-live", "polite");
    const before = await warning.locator("xpath=..").getAttribute("data-e2e-live");
    expect(before, "wilayah aria-live dipasang bersama peringatannya").not.toBeNull();
    expect(before).not.toBe("none");
    await warning.locator("xpath=..").evaluate((el) => el.setAttribute("data-e2e-region", ""));
    const region = dialog.locator("[data-e2e-region]");
    const warningId = (await warning.getAttribute("id"))!;
    expect(warningId).toBeTruthy();
    await expect(role).toHaveAttribute("aria-describedby", warningId);
    await expect(add).toHaveAttribute("aria-describedby", warningId);
    // Kembali ke "Hanya lihat": peringatan dan rujukannya hilang; wilayahnya tetap.
    await role.click();
    await a.getByRole("option", { name: "Hanya lihat" }).click();
    await expect(warning).toHaveCount(0);
    expect(await add.getAttribute("aria-describedby")).toBeNull();
    await expect(region).toHaveAttribute("aria-live", "polite");
    expect(await region.evaluate((el) => getComputedStyle(el).display)).not.toBe("none");

    await add.click();
    await expectGranted(dialog, E);
    const select = grantRow(dialog, E).getByTestId("share-grant-role");
    await expect(select).toContainText("Hanya lihat");

    // Naik ke editor dari daftar akses: konfirmasi dengan peringatan editor; Batal = tetap viewer dan
    // fokus kembali ke Select baris itu (review T-016 R3-UI-2).
    const confirm = a.getByTestId("share-promote-confirm");
    const promote = async () => {
      await select.click();
      await a.getByRole("option", { name: "Bisa mengedit widget" }).click();
      await expect(confirm).toBeVisible();
      await expect(confirm).toContainText("Jadikan editor?");
      await expect(confirm).toContainText(E);
      await expect(confirm.getByTestId("share-promote-warning")).toHaveText(EDITOR_WARNING);
    };
    await promote();
    await confirm.getByRole("button", { name: "Batal" }).click();
    await expect(confirm).toHaveCount(0);
    await expect(select).toBeFocused();
    await expect(select).toContainText("Hanya lihat");
    await expect(dialog.getByTestId("share-warning-editor")).toHaveCount(0);
    expect(audit("dashboard", d3).filter((r) => r.action === "dashboard.share.role")).toEqual([]);

    await promote();
    await confirm.getByTestId("share-promote").click();
    await expect(confirm).toHaveCount(0);
    await expect(
      dialog.getByText(`Peran ${E} diubah menjadi Bisa mengedit widget.`),
    ).toBeAttached();
    await expect(select).toContainText("Bisa mengedit widget");
    await expect(select).toBeFocused();
    // Ada editor → peringatan di bagian tambah orang, dirujuk Select peran dan "Bagikan".
    const shown = dialog.getByTestId("share-warning-editor");
    await expect(shown).toBeVisible();
    const shownId = (await shown.getAttribute("id"))!;
    await expect(role).toHaveAttribute("aria-describedby", shownId);
    await expect(add).toHaveAttribute("aria-describedby", shownId);
    await closeShare(a);

    expect(
      audit("dashboard", d3)
        .filter((r) => r.action === "dashboard.share.role")
        .map((r) => [r.actorId, r.meta]),
    ).toEqual([[ids[A], { userId: ids[E], from: "VIEWER", to: "EDITOR" }]]);
    expect((await e.goto(d3Path))?.status()).toBe(200);
    await expect(e.getByText("Editor", { exact: true })).toBeVisible();
    await expect(e.getByTestId("edit-dashboard")).toBeVisible();
  });

  test("R3-CL-1: mode edit — widget dihapus pemilik di tempat lain memakai satu refresh; pencabutan SESUDAHNYA tetap me-refresh ke 404", async () => {
    test.setTimeout(90_000);
    const d3Path = `/dashboards/${d3}`;
    await a.goto(`${d3Path}?mode=edit`);
    await expectValue(a, PRODUK_KPI, SUM_JUMLAH);
    produkKpiId = await widgetId(a, PRODUK_KPI);
    await addWidget(a, GONE_WIDGET, "Angka");
    await expectValue(a, GONE_WIDGET, SUM_JUMLAH);
    const goneId = await widgetId(a, GONE_WIDGET);

    await e.goto(`${d3Path}?mode=edit`);
    await expect(e.getByTestId("canvas-toolbar")).toBeVisible();
    await expectValue(e, PRODUK_KPI, SUM_JUMLAH);
    await expectValue(e, GONE_WIDGET, SUM_JUMLAH);

    // Pemilik menghapus widget itu di tab/perangkat lain (panelnya masih terbuka dari addWidget).
    await expect(a.getByTestId("widget-panel").getByLabel("Judul", { exact: true })).toHaveValue(
      GONE_WIDGET,
    );
    const removed = a.waitForResponse(
      (r) =>
        r.url().includes(`/api/dashboards/${d3}/widgets/${goneId}`) &&
        r.request().method() === "DELETE",
    );
    await a.getByTestId("widget-panel").getByRole("button", { name: "Hapus widget" }).click();
    const del = await removed;
    expect(del.status(), await del.text()).toBe(200);
    await expect(widgetTitled(a, GONE_WIDGET)).toHaveCount(0);

    // Refresh RSC halaman ini (router.refresh), bukan prefetch tautan.
    let refreshes = 0;
    const track = (r: Request) => {
      const h = r.headers();
      if (
        r.method() === "GET" &&
        h["rsc"] === "1" &&
        !h["next-router-prefetch"] &&
        new URL(r.url()).pathname === d3Path
      ) {
        refreshes++;
      }
    };
    e.on("request", track);
    const queryOf = (id: string, status: number) =>
      e.waitForResponse(
        (r) =>
          r.url().endsWith("/api/query") &&
          r.status() === status &&
          (r.request().postData() ?? "").includes(id),
      );

    // E memfilter → semua widget dimuat ulang: widget yang dihapus 404 → satu refresh; E tetap di editor.
    const gone404 = queryOf(goneId, 404);
    await e.locator('[data-testid=filter-slicer][data-column="Produk"]').click();
    await e.locator('[data-testid=filter-slicer-option][data-value="Produk 1"] input').check();
    await e.keyboard.press("Escape");
    await gone404;
    await expectValue(e, PRODUK_KPI, 2);
    await expect.poll(() => refreshes).toBe(1);
    await e.waitForTimeout(1_000);
    expect(refreshes).toBe(1);
    await expect(e.getByRole("heading", { level: 1 })).toHaveText(D3_NAME);
    await expect(e.getByTestId("canvas-toolbar")).toBeVisible();
    // Editor tidak dipasang ulang oleh refresh (perubahan tertunda aman): kartu widget yang dihapus tetap
    // di kanvas edit dengan galatnya — yang dipasang ulang hanya penjaga refresh.
    await expect(widgetTitled(e, GONE_WIDGET).getByTestId("widget-error")).toContainText(
      "Widget tidak ditemukan.",
    );
    await expect(widgetTitled(e, PRODUK_KPI).getByTestId("widget-error")).toHaveCount(0);

    // Pemilik mencabut E; muatan E berikutnya 404 → refresh lagi (penjaga dipasang ulang) → 404.
    const dialog = await openShare(a, d3Path);
    await grantRow(dialog, E).getByTestId("share-revoke").click();
    const confirm = a.getByTestId("share-revoke-confirm");
    await expect(confirm).toContainText(E);
    await confirm.getByRole("button", { name: "Cabut akses" }).click();
    await expect(dialog.getByText(`Akses ${E} dicabut.`)).toBeAttached();
    await closeShare(a);

    const kpi404 = queryOf(produkKpiId, 404);
    await e.getByTestId("filter-clear-all").click();
    await kpi404;
    await expect(e.getByRole("heading", { level: 1 })).toHaveText("Halaman tidak ditemukan");
    await expect(e.getByTestId("widget")).toHaveCount(0);
    expect(new URL(e.url()).pathname).toBe(d3Path);
    expect(refreshes).toBe(2);
    e.off("request", track);
  });

  test("R5-UI-2: ponsel 375×667 — 'Bagikan' tanpa pilihan: alasannya tepat di bawah kolom cari dan di dalam layar, bukan di bawah daftar hasil", async () => {
    test.setTimeout(150_000);
    // D7: KPI + widget sementara (dihapus pemilik di uji mode lihat) + kolom filter Produk; pribadi.
    d7 = await createDashboard(a, datasetY, D7_NAME);
    await addWidget(a, PRODUK_KPI, "Angka");
    await expectValue(a, PRODUK_KPI, SUM_JUMLAH);
    await addWidget(a, TEMP_WIDGET, "Angka");
    await expectValue(a, TEMP_WIDGET, SUM_JUMLAH);
    await addFilterColumn(a, "Produk", 1);
    d7KpiId = await widgetId(a, PRODUK_KPI);

    const viewport = a.viewportSize()!;
    await a.setViewportSize({ width: 375, height: 667 });
    try {
      const dialog = await openShare(a, d7Path());
      // Banyak hasil (akun uji run ini dan run sebelumnya): daftar radio memanjang di bawah kolom cari.
      const options = await searchUsers(dialog, "shr");
      expect(await options.count()).toBeGreaterThanOrEqual(3);
      const search = dialog.getByTestId("share-search");
      const add = dialog.getByTestId("share-add");
      // Tombol penuh di bawah daftar hasil (digulir ke sana); tanpa pilihan → fokus ke kolom cari.
      await add.click();
      await expect(search).toBeFocused();
      await expect(search).toHaveAttribute("aria-invalid", "true");
      const msg = dialog.getByText(MISSING_USER, { exact: true });
      await expect(msg).toBeVisible();
      await expect(msg).toHaveAttribute("role", "alert");
      await expect(msg).toBeInViewport({ ratio: 1 });
      const msgId = (await msg.getAttribute("id"))!;
      expect((await search.getAttribute("aria-describedby"))?.split(" ")).toContain(msgId);
      // Tepat di bawah kolom cari, sebelum hasil pencarian.
      const [inputBox, msgBox, firstBox] = await Promise.all([
        search.boundingBox(),
        msg.boundingBox(),
        options.first().boundingBox(),
      ]);
      const boxes = JSON.stringify({ inputBox, msgBox, firstBox });
      const inputBottom = inputBox!.y + inputBox!.height;
      expect(msgBox!.y, boxes).toBeGreaterThanOrEqual(inputBottom - 0.5);
      expect(msgBox!.y - inputBottom, boxes).toBeLessThanOrEqual(16);
      expect(msgBox!.y + msgBox!.height, boxes).toBeLessThanOrEqual(firstBox!.y);
      // Di dalam area isi dialog yang terlihat (kepala dan kaki "Selesai" tidak menutupinya).
      const clip = await msg.evaluate((el) => {
        let p = el.parentElement;
        while (p && getComputedStyle(p).overflowY !== "auto") p = p.parentElement;
        const r = el.getBoundingClientRect();
        const v = (p ?? document.documentElement).getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, viewTop: v.top, viewBottom: v.bottom };
      });
      expect(clip.top, JSON.stringify(clip)).toBeGreaterThanOrEqual(clip.viewTop);
      expect(clip.bottom, JSON.stringify(clip)).toBeLessThanOrEqual(clip.viewBottom);

      // Memilih pengguna menghapus pesannya; B dan E dibagikan sebagai viewer dari ponsel.
      for (const [email, q] of [
        [B, B.split("@")[0]!],
        [E, `shr_ed-${TAG}`],
      ] as const) {
        const only = await searchUsers(dialog, q);
        await expect(only).toHaveCount(1);
        await expect(only).toHaveAttribute("data-email", email);
        await only.click();
        await expect(only.getByRole("radio")).toBeChecked();
        await expect(msg).toHaveCount(0);
        await expect(search).not.toHaveAttribute("aria-invalid", "true");
        await add.click();
        await expectGranted(dialog, email);
        await expect(grantRow(dialog, email).getByTestId("share-grant-role")).toContainText(
          "Hanya lihat",
        );
      }
      await closeShare(a);
    } finally {
      await a.setViewportSize(viewport);
    }
  });

  test("R5-CL-2: mode lihat — widget dihapus pemilik saat viewer memakai slicer: refresh akses mengisi ulang kanvas tanpa menutup popover; fokus tetap di dalamnya", async () => {
    test.setTimeout(90_000);
    expect((await b.goto(d7Path()))?.status()).toBe(200);
    await expect(b.getByTestId("widget")).toHaveCount(2);
    await expectValue(b, PRODUK_KPI, SUM_JUMLAH);
    await expectValue(b, TEMP_WIDGET, SUM_JUMLAH);
    const tempId = await widgetId(b, TEMP_WIDGET);

    // Pemilik menghapus widget sementara di tab/perangkat lain.
    await a.goto(`${d7Path()}?mode=edit`);
    await expectValue(a, TEMP_WIDGET, SUM_JUMLAH);
    const panel = await openPanel(a, TEMP_WIDGET);
    const removed = widgetDelete(a, d7, tempId);
    await panel.getByRole("button", { name: "Hapus widget" }).click();
    expect((await removed).status()).toBe(200);
    await expect(widgetTitled(a, TEMP_WIDGET)).toHaveCount(0);

    // B membuka slicer dan mencentang nilai dengan keyboard → semua widget dimuat ulang → widget yang
    // dihapus 404 → satu refresh halaman.
    const refreshes = trackRefreshes(b, d7Path());
    const trigger = b.locator('[data-testid=filter-slicer][data-column="Produk"]');
    await trigger.click();
    const popover = b.getByRole("dialog", { name: "Filter Produk" });
    await expect(popover).toBeVisible();
    const options = popover.getByTestId("filter-slicer-option");
    await expect(options).toHaveCount(8);
    const box = popover.locator('[data-testid=filter-slicer-option][data-value="Produk 1"] input');
    await box.focus();
    const gone404 = queryAnswer(b, tempId, 404);
    await b.keyboard.press("Space");
    await expect(box).toBeChecked();
    await gone404;
    await expect.poll(refreshes.count).toBe(1);
    // Props server baru (tanpa widget itu) mengisi ulang kanvas mode lihat — tanpa memasang ulang.
    await expect(widgetTitled(b, TEMP_WIDGET)).toHaveCount(0);
    await expect(b.getByTestId("widget")).toHaveCount(1);
    await expectValue(b, PRODUK_KPI, 2);
    // Popover tetap terbuka dengan daftarnya, fokus tetap di kotak centang yang dipakai.
    await expect(popover).toBeVisible();
    await expect(options).toHaveCount(8);
    await expect(box).toBeFocused();
    await expect(box).toBeChecked();
    await b.waitForTimeout(1_000);
    expect(refreshes.count()).toBe(1);
    await expect(popover).toBeVisible();
    await expect(box).toBeFocused();
    refreshes.stop();
    // Esc menutup popover dan mengembalikan fokus ke pemicunya.
    await b.keyboard.press("Escape");
    await expect(popover).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("R5-UI-1 / R5-UI-3: hanya keyboard — VIEWER → EDITOR: Enter di opsi membuka konfirmasi yang tetap terbuka (Batal tidak tertekan); Enter di 'Jadikan editor' menyimpan; fokus di kotak dialog selama simpan, lalu di Select baris", async () => {
    test.setTimeout(90_000);
    const dialog = await openShare(a, d7Path());
    const select = grantRow(dialog, B).getByTestId("share-grant-role");
    await expect(select).toContainText("Hanya lihat");
    // Catat setiap klik tombol (keypress Enter yang menekan tombol muncul sebagai klik).
    await a.evaluate(() => {
      const w = window as unknown as { __clicks: string[] };
      w.__clicks = [];
      document.addEventListener(
        "click",
        (ev) => {
          const el = ev.target instanceof Element ? ev.target.closest("button") : null;
          w.__clicks.push(el?.textContent?.trim() ?? String(ev.target));
        },
        true,
      );
    });
    const clicks = () => a.evaluate(() => (window as unknown as { __clicks: string[] }).__clicks);

    await select.focus();
    await a.keyboard.press("Enter");
    const listbox = a.getByRole("listbox");
    await expect(listbox).toBeVisible();
    // T-pxnn: fokus di kotak cari dulu; ↓ ke pilihan saat ini (Hanya lihat), ↓ lagi ke Bisa mengedit.
    await expect(a.getByTestId("select-search")).toBeFocused();
    await a.keyboard.press("ArrowDown");
    await expect(listbox.getByRole("option", { name: "Hanya lihat" })).toBeFocused();
    await a.keyboard.press("ArrowDown");
    await expect(listbox.getByRole("option", { name: "Bisa mengedit widget" })).toBeFocused();
    await a.keyboard.press("Enter");

    const confirm = a.getByTestId("share-promote-confirm");
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText("Jadikan editor?");
    await expect(confirm).toContainText(B);
    const cancel = confirm.getByRole("button", { name: "Batal" });
    await expect(cancel).toBeFocused();
    // Keypress dari Enter yang sama tidak mengeklik "Batal" yang baru difokus: konfirmasi tetap terbuka.
    await a.waitForTimeout(500);
    await expect(confirm).toBeVisible();
    await expect(cancel).toBeFocused();
    expect(await clicks()).not.toContain("Batal");
    await expect(select).toContainText("Hanya lihat");

    // Tab → "Jadikan editor" (urutan DOM = urutan tampilan: Batal lalu tombol utama).
    await a.keyboard.press("Tab");
    const promote = confirm.getByTestId("share-promote");
    await expect(promote).toBeFocused();

    // Simpan diperlambat 1,5 s: selama berjalan Select baris disabled → fokus di kotak dialog share,
    // bukan <body>; setelah selesai kembali ke Select baris itu (review T-016 R5-UI-3).
    const isPage = (u: URL) => u.pathname === d7Path();
    const slow = async (route: Route) => {
      const r = route.request();
      const body = r.postData() ?? "";
      if (
        r.method() === "POST" &&
        !!r.headers()["next-action"] &&
        body.includes(ids[B]!) &&
        body.includes("EDITOR")
      ) {
        await new Promise((res) => setTimeout(res, 1_500));
      }
      await route.continue();
    };
    await a.route(isPage, slow);
    try {
      await a.keyboard.press("Enter");
      await expect(confirm).toHaveCount(0);
      await expect(select).toBeDisabled();
      await expect(dialog).toBeFocused();
      await a.waitForTimeout(400);
      await expect(select).toBeDisabled(); // masih menyimpan
      await expect(dialog).toBeFocused();
      await expect(
        dialog.getByText(`Peran ${B} diubah menjadi Bisa mengedit widget.`),
      ).toBeAttached();
      await expect(select).toContainText("Bisa mengedit widget");
      await expect(select).toBeEnabled();
      await expect(select).toBeFocused();
      // Sesudah simpan selesai fokus tidak jatuh ke <body>.
      for (let i = 0; i < 5; i++) {
        await a.waitForTimeout(200);
        expect(await a.evaluate(() => document.activeElement === document.body)).toBe(false);
      }
      await expect(select).toBeFocused();
    } finally {
      await a.unroute(isPage, slow);
    }
    expect(await clicks()).not.toContain("Batal");
    await closeShare(a);

    expect(
      audit("dashboard", d7)
        .filter((r) => r.action === "dashboard.share.role")
        .map((r) => [r.actorId, r.meta]),
    ).toEqual([[ids[A], { userId: ids[B], from: "VIEWER", to: "EDITOR" }]]);
    expect((await b.goto(d7Path()))?.status()).toBe(200);
    await expect(b.getByText("Editor", { exact: true })).toBeVisible();
    await expect(b.getByTestId("edit-dashboard")).toBeVisible();
  });

  test("R5-CL-1: mode edit — widget yang ditambahkan editor sesi ini lalu dihapus pemilik memakai satu refresh sendiri; pencabutan sesudahnya tetap me-refresh ke 404", async () => {
    test.setTimeout(120_000);
    await b.goto(`${d7Path()}?mode=edit`);
    await expect(b.getByTestId("canvas-toolbar")).toBeVisible();
    await expectValue(b, PRODUK_KPI, SUM_JUMLAH);
    // Widget sesi ini: belum pernah ada di props server halaman B.
    const panel = await addWidget(b, LOKAL_WIDGET, "Angka");
    await expectValue(b, LOKAL_WIDGET, SUM_JUMLAH);
    const lokalId = await widgetId(b, LOKAL_WIDGET);
    await panel.getByRole("button", { name: "Tutup pengaturan" }).click();
    await expect(b.getByTestId("widget-panel")).toHaveCount(0);

    // Pemilik menghapus widget itu di tempat lain.
    await a.goto(`${d7Path()}?mode=edit`);
    await expectValue(a, LOKAL_WIDGET, SUM_JUMLAH);
    const ownerPanel = await openPanel(a, LOKAL_WIDGET);
    const removed = widgetDelete(a, d7, lokalId);
    await ownerPanel.getByRole("button", { name: "Hapus widget" }).click();
    expect((await removed).status()).toBe(200);
    await expect(widgetTitled(a, LOKAL_WIDGET)).toHaveCount(0);

    const refreshes = trackRefreshes(b, d7Path());
    const pick = async (value: string) => {
      await b.locator('[data-testid=filter-slicer][data-column="Produk"]').click();
      await b.locator(`[data-testid=filter-slicer-option][data-value="${value}"] input`).check();
      await b.keyboard.press("Escape");
    };
    // Muatan pertama sesudahnya: widget sesi itu 404 → satu refresh; B tetap di editor.
    let lokal404 = queryAnswer(b, lokalId, 404);
    await pick("Produk 1");
    await lokal404;
    await expectValue(b, PRODUK_KPI, 2);
    await expect.poll(refreshes.count).toBe(1);
    await b.waitForTimeout(1_000);
    expect(refreshes.count()).toBe(1);
    await expect(b.getByRole("heading", { level: 1 })).toHaveText(D7_NAME);
    await expect(b.getByTestId("canvas-toolbar")).toBeVisible();
    await expect(widgetTitled(b, LOKAL_WIDGET).getByTestId("widget-error")).toContainText(
      "Widget tidak ditemukan.",
    );

    // Muatan berikutnya: widget itu 404 lagi → tanpa refresh lagi (satu per widget sesi, tanpa loop).
    lokal404 = queryAnswer(b, lokalId, 404);
    await pick("Produk 2");
    await lokal404;
    await expectValue(b, PRODUK_KPI, 5);
    await b.waitForTimeout(1_000);
    expect(refreshes.count()).toBe(1);
    await expect(b.getByTestId("canvas-toolbar")).toBeVisible();

    // Pemilik mencabut B; muatan B berikutnya tetap me-refresh (jatah bersama utuh) → 404.
    const dialog = await openShare(a, d7Path());
    await grantRow(dialog, B).getByTestId("share-revoke").click();
    const confirm = a.getByTestId("share-revoke-confirm");
    await expect(confirm).toContainText(B);
    await confirm.getByRole("button", { name: "Cabut akses" }).click();
    await expect(dialog.getByText(`Akses ${B} dicabut.`)).toBeAttached();
    await closeShare(a);

    const kpi404 = queryAnswer(b, d7KpiId, 404);
    await b.getByTestId("filter-clear-all").click();
    await kpi404;
    await expect(b.getByRole("heading", { level: 1 })).toHaveText("Halaman tidak ditemukan");
    await expect(b.getByTestId("widget")).toHaveCount(0);
    expect(new URL(b.url()).pathname).toBe(d7Path());
    expect(refreshes.count()).toBe(2);
    refreshes.stop();
  });

  test("R5-DI-1 / R6-UI-1: ganti peran orang yang sudah dicabut di tab lain → daftar dimuat ulang (barisnya hilang); galat menyebut emailnya tepat di bawah judul 'Orang dengan akses', di dalam layar, fokus di judul (1440×900 dan 320×640)", async ({
    browser,
  }) => {
    test.setTimeout(150_000);
    const viewport = a.viewportSize()!;
    try {
      for (const size of [
        { width: 1440, height: 900 },
        { width: 320, height: 640 },
      ]) {
        await a.setViewportSize(size);
        // Putaran kedua: E dibagikan lagi (Server Action grant pemilik dari uji AC1, dikirim ulang).
        if (size.width === 320) {
          expect(
            await send(a, grantAction, [
              [d1, d7],
              [ids[B]!, ids[E]!],
            ]),
          ).toContain('"ok":true');
        }
        const dialog = await openShare(a, d7Path());
        const heading = dialog.getByTestId("share-grants-heading");
        await expect(heading).toHaveText("Orang dengan akses (1)");
        const row = grantRow(dialog, E);
        const select = row.getByTestId("share-grant-role");
        await expect(select).toContainText("Hanya lihat");

        // Pemilik mencabut E di tab/perangkat lain; dialog tab pertama masih menampilkan E.
        const a2 = await pageFor(browser, A);
        try {
          const other = await openShare(a2, d7Path());
          await grantRow(other, E).getByTestId("share-revoke").click();
          const revoke = a2.getByTestId("share-revoke-confirm");
          await expect(revoke).toContainText(E);
          await revoke.getByRole("button", { name: "Cabut akses" }).click();
          await expect(announcement(other)).toHaveText(`Akses ${E} dicabut.`);
        } finally {
          await a2.context().close();
        }
        await expect(row).toHaveCount(1);
        await expect(heading).toHaveText("Orang dengan akses (1)");

        await select.click();
        await a.getByRole("option", { name: "Bisa mengedit widget" }).click();
        const confirm = a.getByTestId("share-promote-confirm");
        await expect(confirm).toContainText(E);
        await confirm.getByTestId("share-promote").click();
        await expect(confirm).toHaveCount(0);
        // Server: NOT_FOUND → daftar dimuat ulang; galat tampil terhadap daftar terbaru (bukan di baris
        // usang), tepat di bawah judul dan di atas isi daftar — menyebut emailnya (review T-016 R6-UI-1).
        const alert = dialog.getByRole("alert");
        await expect(alert).toHaveText(`${E} ${ROLE_GONE}`);
        await expect(dialog.getByText(NO_SHARE)).toHaveCount(0);
        await expect(row).toHaveCount(0);
        await expect(heading).toHaveText("Orang dengan akses");
        const empty = dialog.getByText("Belum ada orang yang diberi akses.");
        await expect(empty).toBeVisible();
        await expect(dialog.getByTestId("share-grant-error")).toHaveCount(0);
        // Fokus ke judul daftar (bukan kolom cari di puncak dialog yang menggulir galat keluar layar).
        await expect(heading).toBeFocused();
        await expect(dialog.getByTestId("share-search")).not.toBeFocused();
        await expectInDialogView(heading);
        await expectInDialogView(alert);
        const [headBox, alertBox, emptyBox] = await Promise.all([
          heading.boundingBox(),
          alert.boundingBox(),
          empty.boundingBox(),
        ]);
        const boxes = JSON.stringify({ size, headBox, alertBox, emptyBox });
        const headBottom = headBox!.y + headBox!.height;
        expect(alertBox!.y, boxes).toBeGreaterThanOrEqual(headBottom - 0.5);
        expect(alertBox!.y - headBottom, boxes).toBeLessThanOrEqual(16);
        expect(alertBox!.y + alertBox!.height, boxes).toBeLessThanOrEqual(emptyBox!.y + 0.5);
        await closeShare(a);
      }
    } finally {
      await a.setViewportSize(viewport);
    }

    const ofE = (action: string) =>
      audit("dashboard", d7).filter(
        (r) => r.action === action && (r.meta as { userId?: string } | null)?.userId === ids[E],
      );
    expect(ofE("dashboard.share.role")).toEqual([]);
    expect(ofE("dashboard.share.revoke")).toHaveLength(2);
    expect((await e.goto(d7Path()))?.status()).toBe(404);
  });

  test("R6-UI-2: selama berbagi organisasi berjalan (≥ 1,5 s, lalu gagal) dialog tidak bisa ditutup — Esc, klik di luar, X, 'Selesai'; galatnya tampil di dialog yang tetap terbuka", async () => {
    test.setTimeout(90_000);
    const dialog = await openShare(a, d7Path());
    const org = dialog.getByTestId("share-org");
    await expect(org).not.toBeChecked();
    const done = dialog.getByRole("button", { name: "Selesai", exact: true });
    const close = dialog.getByRole("button", { name: "Tutup", exact: true });

    // Server Action berikutnya (sakelar organisasi) ditahan ≥ 1,5 s dan selama pemeriksaan, lalu gagal
    // (jaringan putus).
    let release = () => {};
    const released = new Promise<void>((r) => (release = r));
    let held = 0;
    const isPage = (u: URL) => u.pathname === d7Path();
    const failing = async (route: Route) => {
      const r = route.request();
      if (r.method() !== "POST" || !r.headers()["next-action"]) return route.continue();
      held++;
      await Promise.all([new Promise((res) => setTimeout(res, 1_500)), released]);
      await route.abort("internetdisconnected");
    };
    await a.route(isPage, failing);
    try {
      await org.click();
      await expect.poll(() => held).toBe(1);
      await expect(org).toBeDisabled();
      await expect(done).toBeDisabled();
      await expect(close).toBeDisabled();
      // Fokus tidak jatuh ke <body> (kontrol yang ditekan jadi disabled → kotak dialog).
      await expect(dialog).toBeFocused();

      await a.keyboard.press("Escape");
      await a.mouse.click(8, 8); // lapisan di luar dialog
      await done.click({ force: true });
      await close.click({ force: true });
      await a.waitForTimeout(300);
      await expect(dialog).toBeVisible();
      await expect(org).toBeDisabled(); // masih berjalan
      expect(await a.evaluate(() => document.activeElement === document.body)).toBe(false);
    } finally {
      release();
    }
    try {
      // Gagal → galat di bawah sakelar, di dialog yang masih terbuka; sakelar tetap keadaan server.
      const alert = dialog.getByRole("alert");
      await expect(alert).toHaveText(NETWORK_ERROR);
      await expect(dialog).toBeVisible();
      await expectInDialogView(alert);
      await expect(org).toBeEnabled();
      await expect(org).not.toBeChecked();
      await expect(done).toBeEnabled();
      await expect(close).toBeEnabled();
      expect(held).toBe(1);
    } finally {
      await a.unroute(isPage, failing);
    }
    // Setelah selesai, dialog bisa ditutup lagi; dibuka ulang = tetap pribadi, tanpa audit organisasi.
    await closeShare(a);
    await expect(a.getByTestId("share-open")).toBeFocused();
    const again = await openShare(a, d7Path());
    await expect(again.getByTestId("share-org")).not.toBeChecked();
    await again.getByRole("button", { name: "Tutup", exact: true }).click();
    await expect(again).toHaveCount(0);
    expect(audit("dashboard", d7).filter((r) => r.action === "dashboard.org.share")).toEqual([]);
  });

  test("R6-UI-3: 'Bagikan' berhasil → baris konfirmasi '<email> kini bisa …' terlihat di dalam layar (320×640 dan 1440×900), tanpa role/aria-live; hilang saat memilih orang lain", async () => {
    test.setTimeout(90_000);
    const viewport = a.viewportSize()!;
    try {
      for (const [size, email, role] of [
        [{ width: 320, height: 640 }, C, "VIEWER"],
        [{ width: 1440, height: 900 }, B, "EDITOR"],
      ] as const) {
        await a.setViewportSize(size);
        const dialog = await openShare(a, d7Path());
        const line = dialog.getByTestId("share-add-done");
        const options = await searchUsers(dialog, email.split("@")[0]!);
        await expect(options).toHaveCount(1);
        await expect(options).toHaveAttribute("data-email", email);
        await options.click();
        await expect(options.getByRole("radio")).toBeChecked();
        if (role === "EDITOR") {
          await dialog.getByTestId("share-role").click();
          await a.getByRole("option", { name: "Bisa mengedit widget" }).click();
          await expect(dialog.getByTestId("share-role")).toContainText("Bisa mengedit widget");
        }
        await expect(line).toHaveCount(0);
        await dialog.getByTestId("share-add").click();
        await expectGranted(dialog, email, role);
        await expectInDialogView(line);
        // Tidak diumumkan dua kali: hanya wilayah aria-live panel yang diumumkan.
        expect(await line.getAttribute("role")).toBeNull();
        expect(await line.getAttribute("aria-live")).toBeNull();
        expect(await line.locator("[role], [aria-live]").count()).toBe(0);
        const search = dialog.getByTestId("share-search");
        await expect(search).toBeFocused();
        await expect(search).toHaveValue("");
        const row = grantRow(dialog, email).getByTestId("share-grant-role");
        await expect(row).toContainText(role === "EDITOR" ? "Bisa mengedit widget" : "Hanya lihat");

        // Memilih orang berikutnya menghapus baris konfirmasi.
        const next = await searchUsers(dialog, `shrxed-${TAG}`);
        await expect(next).toHaveCount(1);
        await next.click();
        await expect(line).toHaveCount(0);
        await closeShare(a);
      }
    } finally {
      await a.setViewportSize(viewport);
    }
  });

  test("R7: konfirmasi 'Bagikan' tepat di bawah kolom cari (terlihat di 320×640 walau ada peringatan editor) dan hilang saat orang itu dicabut atau dijadikan editor di daftar akses", async () => {
    test.setTimeout(90_000);
    const viewport = a.viewportSize()!;
    try {
      await a.setViewportSize({ width: 320, height: 640 });
      const dialog = await openShare(a, d7Path());
      // B editor D7 (tes sebelumnya): peringatan editor tampil di atas tombol "Bagikan".
      await expect(dialog.getByTestId("share-warning-editor")).toBeVisible();
      const line = dialog.getByTestId("share-add-done");
      const revoke = a.getByTestId("share-revoke-confirm");
      const grantX = async () => {
        const option = await searchUsers(dialog, X.split("@")[0]!);
        await expect(option).toHaveCount(1);
        await option.click();
        await dialog.getByTestId("share-add").click();
        await expectGranted(dialog, X);
        await expectInDialogView(line);
      };
      const revokeX = async () => {
        await grantRow(dialog, X).getByTestId("share-revoke").click();
        await revoke.getByRole("button", { name: "Cabut akses" }).click();
        await expect(grantRow(dialog, X)).toHaveCount(0);
      };

      // Dicabut di daftar akses → konfirmasi "kini bisa melihat" tidak lagi benar → hilang.
      await grantX();
      await revokeX();
      await expect(line).toHaveCount(0);

      // Dijadikan editor di daftar akses → "bisa melihat" sudah salah → hilang.
      await grantX();
      await grantRow(dialog, X).getByTestId("share-grant-role").click();
      await a.getByRole("option", { name: "Bisa mengedit widget" }).click();
      const promote = a.getByTestId("share-promote-confirm");
      await promote.getByTestId("share-promote").click();
      await expect(promote).toHaveCount(0);
      await expect(grantRow(dialog, X).getByTestId("share-grant-role")).toContainText(
        "Bisa mengedit widget",
      );
      await expect(line).toHaveCount(0);

      // Kembalikan: X tanpa akses ke D7.
      await revokeX();
      await closeShare(a);
    } finally {
      await a.setViewportSize(viewport);
    }
  });

  test("R3-SEC-1: kolom filter tersimpan yang disembunyikan → viewer mendapat jawaban yang sama dengan nama tebakan (nilai slicer + query widget); pemilik tetap COLUMN_UNAVAILABLE / skippedFilters", async () => {
    test.setTimeout(120_000);
    const d3Path = `/dashboards/${d3}`;
    // B jadi viewer D3: Server Action grant pemilik (uji AC1) dikirim ulang untuk D3.
    expect(await send(a, grantAction, [[d1, d3]])).toContain('"ok":true');
    const values = (p: Page, column: string) =>
      api(p, "POST", `/api/dashboards/${d3}/filter-values`, { column });
    const filtered = (p: Page, column: string) =>
      query(p, {
        widgetId: produkKpiId,
        dashboardFilters: [{ column, op: "in", values: ["Produk 1"] }],
      });
    const answer = async (res: APIResponse) => ({
      status: res.status(),
      body: (await res.json()) as Record<string, unknown>,
    });
    // Sebelum disembunyikan: Produk kolom filter yang sah untuk B.
    expect((await answer(await values(b, "Produk"))).status).toBe(200);
    expect((await answer(await filtered(b, "Produk"))).status).toBe(200);

    // B membuka D3 sebelum Produk disembunyikan: halamannya memuat slicer Produk (dipakai di bawah).
    await b.goto(d3Path);
    await expectValue(b, PRODUK_KPI, SUM_JUMLAH);
    const staleSlicer = b.locator('[data-testid=filter-slicer][data-column="Produk"]');
    await expect(staleSlicer).toBeVisible();

    // Pemilik menyembunyikan Produk di halaman Skema dataset Y.
    await a.goto(`/datasets/${datasetY}/skema`);
    await expect(a.getByTestId("schema-column").first()).toBeVisible({ timeout: 30_000 });
    const pos = await a
      .getByTestId("schema-column")
      .evaluateAll(
        (els) =>
          els
            .find(
              (el) => el.querySelector<HTMLInputElement>('input[id$="-name"]')?.value === "Produk",
            )
            ?.getAttribute("data-pos") ?? "",
      );
    expect(pos).toMatch(/^\d+$/);
    await a.getByLabel(`Sembunyikan kolom ${pos}`).check();
    await a.getByRole("button", { name: "Simpan perubahan" }).click();
    await expect(a.getByTestId("recast-done")).toBeVisible({ timeout: 60_000 });

    // Viewer: kolom yang kini disembunyikan = nama yang tidak pernah jadi kolom filter (kedua endpoint).
    const GUESS = `Tebakan ${TAG}`;
    const [hiddenV, guessV] = [
      await answer(await values(b, "Produk")),
      await answer(await values(b, GUESS)),
    ];
    expect(hiddenV).toEqual(guessV);
    expect(hiddenV).toMatchObject({
      status: 400,
      body: { ok: false, code: "INVALID", message: NOT_FILTER },
    });
    // Query widget: sumber filter dashboard di-cache ≤ 30 dtk per (dashboard, versi aktif, updatedAt) —
    // menyembunyikan kolom tidak mengubah kuncinya, jadi jawaban yang dimuat sebelum disembunyikan (cek
    // di atas) bisa bertahan sampai umur cache habis (query/runtime.ts filterSourceCache).
    const guessQ = await answer(await filtered(b, GUESS));
    let hiddenQ: Awaited<ReturnType<typeof answer>> | undefined;
    await expect
      .poll(
        async () => {
          hiddenQ = await answer(await filtered(b, "Produk"));
          return hiddenQ.status;
        },
        { timeout: 45_000, intervals: [2_000] },
      )
      .toBe(400);
    expect(hiddenQ).toEqual(guessQ);
    expect(hiddenQ).toMatchObject({
      status: 400,
      body: { ok: false, code: "INVALID", message: NOT_ALLOWED },
    });
    // Slicer di halaman B yang usang: pesan dengan petunjuk muat ulang + tombol "Muat ulang", bukan
    // "Coba lagi" yang selalu mendapat 400 yang sama (review T-016 R4-CC-1).
    await staleSlicer.click();
    await expect(b.getByText(NOT_FILTER, { exact: true })).toBeVisible();
    await expect(b.getByTestId("filter-slicer-retry")).toHaveText("Muat ulang");
    await b.keyboard.press("Escape");
    // Halaman B yang dimuat ulang tidak memuat nama itu sebagai slicer.
    await b.goto(d3Path);
    await expectValue(b, PRODUK_KPI, SUM_JUMLAH);
    await expect(b.locator('[data-testid=filter-slicer][data-column="Produk"]')).toHaveCount(0);

    // Pemilik tetap mendapat jawaban rinci untuk diperbaiki.
    expect(await answer(await values(a, "Produk"))).toMatchObject({
      status: 409,
      body: {
        ok: false,
        code: "COLUMN_UNAVAILABLE",
        message: "Kolom filter ini tidak ada atau disembunyikan di data aktif.",
      },
    });
    expect(await answer(await values(a, GUESS))).toMatchObject({
      status: 400,
      body: { code: "INVALID", message: NOT_FILTER },
    });
    const ownQ = await answer(await filtered(a, "Produk"));
    expect(ownQ).toMatchObject({ status: 200, body: { ok: true, skippedFilters: ["Produk"] } });
    expect(Number((ownQ.body.rows as unknown[][])[0]![0])).toBe(SUM_JUMLAH);
    expect(await answer(await filtered(a, GUESS))).toMatchObject({
      status: 400,
      body: { code: "INVALID", message: NOT_ALLOWED },
    });
  });

  test("R3-CC-2: hapus dashboard yang dibagikan → konfirmasi menyebut dampaknya; grantee 404; AuditLog dashboard.delete {name, shares, orgShared}", async () => {
    test.setTimeout(90_000);
    const d3Path = `/dashboards/${d3}`;
    // Dashboard pribadi (D5): konfirmasi tanpa kalimat dampak.
    await a.goto(`/dashboards/${d5}?mode=edit`);
    await a.getByRole("button", { name: "Hapus dashboard" }).click();
    const plain = a.getByRole("dialog", { name: `Hapus “${D5_NAME}”?` });
    await expect(plain).toContainText("Dashboard dan semua widgetnya dihapus permanen.");
    await expect(plain.getByTestId("delete-dashboard-share-impact")).toHaveCount(0);
    await plain.getByRole("button", { name: "Batal" }).click();
    await expect(plain).toHaveCount(0);

    // D3: B (viewer langsung) + organisasi.
    const dialog = await openShare(a, d3Path);
    await expect(grantRow(dialog, B)).toHaveCount(1);
    const org = dialog.getByTestId("share-org");
    await org.click();
    await expect(org).toBeChecked();
    await closeShare(a);
    expect((await c.goto(d3Path))?.status()).toBe(200);

    await a.goto(`${d3Path}?mode=edit`);
    await a.getByRole("button", { name: "Hapus dashboard" }).click();
    const confirm = a.getByRole("dialog", { name: `Hapus “${D3_NAME}”?` });
    await expect(confirm.getByTestId("delete-dashboard-share-impact")).toHaveText(
      "1 orang dan seluruh organisasi kehilangan akses ke dashboard ini.",
    );
    await confirm.getByRole("button", { name: "Hapus permanen" }).click();
    await expect(a).toHaveURL(/\/dashboards\?deleted=1$/);

    for (const p of [b, c]) {
      expect((await p.goto(d3Path))?.status()).toBe(404);
      await expectStatus(await query(p, { widgetId: produkKpiId }), 404, "NOT_FOUND");
    }
    const rows = audit("dashboard", d3);
    const deleted = rows.filter((r) => r.action === "dashboard.delete");
    expect(deleted, JSON.stringify(rows)).toHaveLength(1);
    expect(deleted[0]).toMatchObject({ actorId: ids[A], targetType: "dashboard", targetId: d3 });
    expect(deleted[0]!.meta).toEqual({ name: D3_NAME, shares: 1, orgShared: true });
    expect(deleted[0]!.ip.length).toBeGreaterThan(0);
    expect(Number.isNaN(Date.parse(deleted[0]!.at))).toBe(false);
    // Riwayat sebelumnya tetap (targetId tanpa FK).
    expect(rows.some((r) => r.action === "dashboard.share.grant")).toBe(true);
  });

  test("R3-SEC-2 / R4-DI-1: 21 share langsung dari satu pemilik tanpa banjir → 'Dibagikan ke saya' C memuat ke-21-nya, tanpa catatan", async () => {
    test.setTimeout(180_000);
    const capName = (i: number) => `Batas ${String(i).padStart(2, "0")} ${TAG}`;
    // X (pemilik baru): 3 dataset kosong (maks. 10 dashboard per dataset) → 21 dashboard.
    const sets: string[] = [];
    for (let i = 1; i <= 3; i++) sets.push(await newDataset(x, `Batas data ${i} ${TAG}`));
    const setOf = (i: number) => sets[Math.floor((i - 1) / 10)]!;
    // Dashboard pertama lewat formulir (Server Action ditangkap); sisanya Server Action yang sama.
    await x.goto(`/dashboards/baru?dataset=${sets[0]}`);
    await x.getByLabel("Nama dashboard").fill(capName(1));
    const create = nextAction(x, capName(1));
    await x.getByRole("button", { name: "Buat dashboard" }).click();
    const createAction = await create;
    await expect(x).toHaveURL(/\?mode=edit$/);
    for (let i = 2; i <= 21; i++) {
      await send(x, createAction, [
        [capName(1), capName(i)],
        [sets[0]!, setOf(i)],
      ]);
    }
    await x.goto("/dashboards");
    const own = x.getByTestId("dashboard-row");
    await expect(own).toHaveCount(21);
    const idOf = Object.fromEntries(
      await own.evaluateAll((els) =>
        els.map((el) => [
          el.querySelector("span")?.textContent?.trim() ?? "",
          el.getAttribute("href")!.split("/").pop()!,
        ]),
      ),
    ) as Record<string, string>;
    // Share langsung ke C, urut dibuat (updatedAt naik): dashboard pertama paling lama.
    for (let i = 1; i <= 21; i++) {
      const id = idOf[capName(i)];
      expect(id, capName(i)).toBeTruthy();
      expect(
        await send(x, grantAction, [
          [d1, id!],
          [ids[B]!, ids[C]!],
        ]),
        capName(i),
      ).toContain('"ok":true');
    }

    // Daftar C jauh di bawah SHARED_LIST_MAX (200): batas 20 per pemilik tidak berlaku, ke-21-nya
    // terdaftar (terbaru dulu) tanpa catatan (review T-016 R4-DI-1). Banjir yang melewati 200 (batas per
    // pemilik + catatan) diuji di tests/features/dashboards/roles.test.ts.
    await c.goto("/dashboards");
    const fromX = c.getByTestId("shared-list").getByTestId("shared-row").filter({ hasText: X });
    await expect(fromX).toHaveCount(21);
    await expect(fromX.first()).toContainText(capName(21));
    await expect(fromX.last()).toContainText(capName(1));
    await expect(sharedRow(c, capName(1))).toHaveAttribute(
      "href",
      `/dashboards/${idOf[capName(1)]}`,
    );
    await expect(c.getByTestId("shared-hidden")).toHaveCount(0);
    // Share organisasi A (D4) tetap terdaftar.
    await expect(sharedRow(c, D4_NAME)).toBeVisible();
  });
});
