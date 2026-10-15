import { execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  expect,
  test,
  type APIResponse,
  type Locator,
  type Page,
  type Response,
  type Route,
} from "@playwright/test";
import { createSaxParser } from "../../src/lib/xlsx/parser";
import type { RawValue } from "../../src/lib/xlsx/types";
import { pageFor, registerAndVerify, startWorker, stopWorker, uniqueEmail } from "./helpers";

/*
 * T-017: ekspor widget ke CSV/XLSX di atas stack sungguhan (unggah → worker → DuckDB → storage → unduh).
 *   A = pemilik dataset S (300 baris) + dashboard D1 (tabel + kolom filter Cabang) dan dataset F (sel dan
 *       nama kolom berawalan = + - @ tab) + dashboard D2 (tabel)
 *   B = viewer D1 (dibagikan A lewat dialog Bagikan) · X = orang asing
 * Serial: AC1 slicer + urutan layar → CSV persis baris terfilter → peran (viewer mengekspor, orang asing
 * 404) → AC6 unduh B/X 404, pemilik 302 presigned 5 menit + AuditLog → AC3 XLSX terbaca parser proyek,
 * lalu 61 menit (dev-expire-export + export-cleanup) → expired/410/objek hilang → AC5 netralisasi
 * formula CSV + string inline XLSX → menu dengan keyboard → mode edit tanpa "Leave site?" → AC2
 * worker kedua dengan EXPORT_MAX_ROWS=100: EXPORT_TOO_LARGE + saran, lalu filter dipersempit → berhasil.
 */
test.describe.configure({ mode: "serial" });

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const A = uniqueEmail("exp-owner");
const B = uniqueEmail("exp-viewer");
const X = uniqueEmail("exp-stranger");
const TAG = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const DATASET_S = `Omzet ekspor ${TAG}`;
const DATASET_F = `Formula ekspor ${TAG}`;
const D1_NAME = `Ekspor omzet ${TAG}`;
const D2_NAME = `Ekspor formula ${TAG}`;
const TABLE = "Tabel ekspor";
const FORMULA_TABLE = "Formula";
const HEADERS = ["Cabang", "Tanggal", "Omzet"];
/** Posisi kolom Omzet di skema (body sort). */
const OMZET_POS = 3;
const ROWS = 300;
const CABANG = ["Jakarta", "Bandung", "Surabaya", "Medan", "Makassar"];
const pad = (n: number) => String(n).padStart(2, "0");
/** Omzet unik dan tidak searah urutan baris (7919 prima, bukan faktor 300 → permutasi 0..299). */
const rows = Array.from({ length: ROWS }, (_, i) => ({
  cabang: CABANG[i % CABANG.length]!,
  day: (i % 28) + 1,
  omzet: 1000 + ((i * 7919) % ROWS),
}));
type Row = (typeof rows)[number];
/** Baris CSV yang diharapkan: tanggal ISO, angka apa adanya. */
const csvRow = (r: Row) => [r.cabang, `2026-10-${pad(r.day)}`, String(r.omzet)];
/** Slicer AC1: dua cabang = 120 baris (> 100 baris satu halaman tabel). */
const PICKED = ["Jakarta", "Bandung"];
const picked = rows.filter((r) => PICKED.includes(r.cabang));
/** Dataset F: nama kolom dan sel teks berawalan formula; kolom angka dengan nilai negatif. */
const F_HEADERS = ["=Kode", "+Catatan", "-Selisih", "@Akun", "Nama"];
const F_ROWS = [
  ["=1+1", "+tambah", "-5", "@budi", "Biasa"],
  ["=SUM(A1:A2)", "-kurang", "12", "@siti", "Ketiga, koma"],
  ["@SUM(1)", "+plus", "-300", "@ani", "\tTab di awal"],
  ["biasa", "catatan", "7", "akun", "Normal"],
];
/** Saran mempersempit di bawah pesan EXPORT_TOO_LARGE (export-model.ts TOO_LARGE_HINT). */
const TOO_LARGE_HINT =
  "Misalnya pilih rentang tanggal yang lebih pendek atau lebih sedikit nilai di filter dashboard.";
const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const XLSX_PARTS = [
  "[Content_Types].xml",
  "_rels/.rels",
  "xl/_rels/workbook.xml.rels",
  "xl/styles.xml",
  "xl/workbook.xml",
  "xl/worksheets/sheet1.xml",
];
const dir = mkdtempSync(join(tmpdir(), "dd-e2e-exports-"));
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

let worker: ChildProcess | null = null;
let ids: Record<string, string> = {};
let d1 = "";
let tableId = "";
let formulaId = "";
/** Ekspor CSV AC1 (milik A) dan ekspor CSV viewer B. */
let csvId = "";
let viewerExportId = "";
const d1Path = () => `/dashboards/${d1}`;

const node = (script: string, ...args: string[]): unknown =>
  JSON.parse(execFileSync("node", [script, ...args]).toString());
const exportAudits = (id: string) =>
  (node("scripts/dev-audit-log.mjs", "dashboard", d1) as AuditRow[]).filter(
    (r) => r.action === "dashboard.widget.export" && r.meta?.exportId === id,
  );
/** Jumlah objek storage di bawah exports/<userId>/<exportId>. */
const objectCount = (userId: string, id: string) =>
  (
    node("scripts/dev-upload-fixture.mjs", "prefix-count", `exports/${userId}/${id}.`) as {
      count: number;
    }
  ).count;

function csv(name: string, lines: string[]): string {
  const path = join(dir, name);
  writeFileSync(path, lines.join("\n"));
  return path;
}

const api = (page: Page, method: string, path: string, data?: unknown) =>
  page.request.fetch(path, { method, headers, ...(data === undefined ? {} : { data }) });

async function expectStatus(res: APIResponse, status: number, code?: string) {
  const text = await res.text();
  expect(res.status(), text).toBe(status);
  if (code) expect((JSON.parse(text) as { code?: string }).code, text).toBe(code);
}

/** CSV RFC 4180 (koma, kutip ganda, LF) → baris; BOM wajib ada dan dilepas. */
function parseCsv(file: Buffer): { header: string[]; rows: string[][]; lines: string[] } {
  expect(file.subarray(0, 3)).toEqual(BOM);
  const text = file.subarray(3).toString("utf8");
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch !== '"') field += ch;
      else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      out.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  // File diakhiri LF: tidak ada sisa field setengah jadi.
  expect(field, "CSV tidak diakhiri baris baru").toBe("");
  expect(row).toEqual([]);
  return { header: out[0] ?? [], rows: out.slice(1), lines: text.split("\n") };
}

async function readXlsx(path: string, sheet: string): Promise<RawValue[][]> {
  const out: RawValue[][] = [];
  await createSaxParser().parse(
    path,
    { sheetNames: [sheet], tmpDir: mkdtempSync(join(dir, "xlsx-")) },
    (_s, _r, values) => out.push([...values]),
  );
  return out;
}

/** Part paket XLSX dan XML worksheet (unzip bawaan sistem, terpisah dari parser proyek). */
const zipParts = (path: string) =>
  execFileSync("unzip", ["-Z1", path]).toString().trim().split("\n").sort();
const sheetXml = (path: string) =>
  execFileSync("unzip", ["-p", path, "xl/worksheets/sheet1.xml"]).toString();

/** Dataset tanpa unggahan lalu unggah `file`; tunggu ingest selesai (tautan skema). */
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
/** Kartu widget menurut id (judul bisa berubah di uji mode edit). */
const card = (page: Page, id: string) =>
  page.locator(`[data-testid=widget][data-widget-id="${id}"]`);

/** Tambah widget tabel berjudul `title` (mode edit); tunggu konfigurasi tersimpan; kembalikan id. */
async function addTable(page: Page, title: string): Promise<string> {
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
  await panel.getByText("Tabel", { exact: true }).click();
  await expect(panel.getByTestId("config-status")).toHaveAttribute("data-state", "saved");
  return (await widgetTitled(page, title).getAttribute("data-widget-id"))!;
}

/** Kolom filter lewat menu "Tambah kolom filter" (mode edit, pemilik); tunggu PATCH selesai. */
async function addFilterColumn(page: Page, column: string) {
  const section = page.getByTestId("dashboard-filter-columns");
  await section.getByRole("button", { name: "Tambah kolom filter" }).click();
  const saved = page.waitForResponse(
    (r) => r.url().endsWith("/filter-columns") && r.request().method() === "PATCH",
  );
  await page.getByRole("menuitem", { name: new RegExp(`^${column}`) }).click();
  const res = await saved;
  expect(res.status(), await res.text()).toBe(200);
}

const heads = (page: Page, id: string) =>
  card(page, id).getByTestId("widget-table").getByRole("columnheader");
const range = (page: Page, id: string) => card(page, id).getByTestId("table-range");

/** Pilih nilai slicer Cabang (popover) lalu tutup dengan Escape. */
async function pickCabang(page: Page, values: string[]) {
  await page.locator('[data-testid=filter-slicer][data-column="Cabang"]').click();
  for (const v of values) {
    await page.locator(`[data-testid=filter-slicer-option][data-value="${v}"] input`).check();
  }
  await page.keyboard.press("Escape");
}

const isCreate = (r: Response) =>
  new URL(r.url()).pathname === "/api/exports" && r.request().method() === "POST";

/** Buka menu ekspor kartu `id` (bila belum terbuka). */
async function openMenu(page: Page, id: string): Promise<Locator> {
  const menu = page.getByTestId("export-menu");
  if (!(await menu.isVisible())) await card(page, id).getByTestId("widget-export").click();
  await expect(menu).toBeVisible();
  return menu;
}

/**
 * Ekspor lewat menu kartu: POST /api/exports (202) → polling → unduhan otomatis (<a download>, event
 * download Playwright; isinya bisa datang dari endpoint publik presigned). File disalin ke `dir`.
 */
async function exportViaUi(page: Page, id: string, format: "csv" | "xlsx") {
  const menu = await openMenu(page, id);
  const created = page.waitForResponse(isCreate);
  const download = page.waitForEvent("download", { timeout: 90_000 });
  await menu.getByTestId(`export-${format}`).click();
  const res = await created;
  const json = (await res.json()) as { ok: boolean; exportId: string };
  expect(res.status(), JSON.stringify(json)).toBe(202);
  const dl = await download;
  expect(await dl.failure()).toBeNull();
  const path = join(dir, `${json.exportId}.${format}`);
  await dl.saveAs(path);
  await expect(menu.getByTestId("export-status")).toContainText("Siap diunduh");
  return {
    id: json.exportId,
    request: res.request().postDataJSON() as Record<string, unknown>,
    name: dl.suggestedFilename(),
    path,
    file: readFileSync(path),
    menu,
  };
}

/** Ekspor lewat API (cookie halaman): POST → status done → unduh (redirect ke presigned diikuti). */
async function exportViaApi(page: Page, body: Record<string, unknown>) {
  const res = await api(page, "POST", "/api/exports", body);
  const json = (await res.json()) as { exportId: string };
  expect(res.status(), JSON.stringify(json)).toBe(202);
  const id = json.exportId;
  await expect
    .poll(
      async () =>
        (
          (await (await page.request.get(`/api/exports/${id}`)).json()) as {
            state: string;
          }
        ).state,
      { timeout: 60_000 },
    )
    .toBe("done");
  const file = await page.request.get(`/api/exports/${id}/download`);
  expect(file.status()).toBe(200);
  const path = join(dir, `${id}.${String(body.format)}`);
  writeFileSync(path, await file.body());
  return { id, path, file: await file.body(), headers: file.headers() };
}

test.describe("ekspor widget", () => {
  let a: Page;
  let b: Page;
  let x: Page;

  test.beforeAll(async ({ browser, request }) => {
    test.setTimeout(420_000);
    execFileSync("node", ["scripts/dev-reset-ratelimit.mjs", "register:ip", "verify:ip"]); // suite penuh: batas per IP
    const setup = await browser.newPage();
    for (const email of [A, B, X]) {
      await setup.context().clearCookies();
      await registerAndVerify(setup, request, email);
    }
    await setup.close();
    ids = node("scripts/dev-audit-log.mjs", "ids", A, B, X) as Record<string, string>;
    for (const email of [A, B, X]) expect(ids[email], email).toBeTruthy();
    a = await pageFor(browser, A);
    b = await pageFor(browser, B);
    x = await pageFor(browser, X);

    worker = await startWorker("exports");
    const datasetS = await createDataset(
      a,
      DATASET_S,
      csv("omzet-ekspor.csv", [
        "Cabang;Tanggal;Omzet",
        ...rows.map((r) => `${r.cabang};${pad(r.day)}-10-2026;${r.omzet}`),
      ]),
    );
    const quote = (v: string) => (/[;"\t,]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const datasetF = await createDataset(
      a,
      DATASET_F,
      csv(
        "formula-ekspor.csv",
        [F_HEADERS, ...F_ROWS].map((r) => r.map(quote).join(";")),
      ),
    );

    // D1: tabel (kolom bawaan Cabang, Tanggal, Omzet) + kolom filter Cabang.
    d1 = await createDashboard(a, datasetS, D1_NAME);
    tableId = await addTable(a, TABLE);
    await expect(heads(a, tableId)).toHaveText(HEADERS);
    await addFilterColumn(a, "Cabang");
    // D2: tabel dataset F; nama kolom dari ingest apa adanya (diawali = + - @).
    await createDashboard(a, datasetF, D2_NAME);
    formulaId = await addTable(a, FORMULA_TABLE);
    await expect(heads(a, formulaId)).toHaveText(F_HEADERS);
  });

  test.afterAll(async () => {
    await stopWorker(worker);
    await Promise.all([a, b, x].map((p) => p?.context().close()));
  });

  test("AC1: tabel dengan slicer aktif dan urutan layar → CSV (BOM, header nama tampil) berisi persis baris terfilter", async () => {
    test.setTimeout(180_000);
    await a.goto(d1Path());
    await expect(range(a, tableId)).toHaveText(`Baris 1–100 dari ${ROWS}`);
    await pickCabang(a, PICKED);
    await expect(range(a, tableId)).toHaveText(`Baris 1–100 dari ${picked.length}`);

    // Urutan layar: Omzet turun (klik judul kolom 2×: naik → turun).
    const omzet = card(a, tableId)
      .getByTestId("widget-table")
      .getByRole("columnheader", { name: "Omzet", exact: true });
    await omzet.getByRole("button").click();
    await expect(omzet).toHaveAttribute("aria-sort", "ascending");
    const sorted = a.waitForResponse((r) => {
      if (!r.url().endsWith("/api/query") || r.request().method() !== "POST") return false;
      const body = r.request().postDataJSON() as { widgetId?: string; sort?: { dir?: string } };
      return body.widgetId === tableId && body.sort?.dir === "desc";
    });
    await omzet.getByRole("button").click();
    await expect(omzet).toHaveAttribute("aria-sort", "descending");
    const shownRes = await sorted;
    expect(shownRes.status()).toBe(200);
    const shown = (await shownRes.json()) as {
      columns: { label: string }[];
      rows: unknown[][];
      total: number;
    };
    expect(shown.columns.map((c) => c.label)).toEqual(HEADERS);
    expect(shown.total).toBe(picked.length);
    expect(shown.rows).toHaveLength(100);

    const exp = await exportViaUi(a, tableId, "csv");
    csvId = exp.id;
    // Body ekspor = filter + urutan yang dipakai kartu (bukan halaman).
    expect(exp.request).toEqual({
      widgetId: tableId,
      format: "csv",
      dashboardFilters: [{ column: "Cabang", op: "in", values: expect.any(Array) }],
      sort: { column: OMZET_POS, dir: "desc" },
    });
    const sent = exp.request.dashboardFilters as { values: string[] }[];
    expect([...sent[0]!.values].sort()).toEqual([...PICKED].sort());
    expect(exp.name).toMatch(/^Tabel ekspor-\d{8}-\d{4}\.csv$/);
    await expect(exp.menu.getByTestId("export-status")).toContainText(
      `${picked.length} baris · berlaku sampai`,
    );

    const parsed = parseCsv(exp.file);
    // Header: nama tampil kolom, dikutip.
    expect(parsed.lines[0]).toBe(HEADERS.map((h) => `"${h}"`).join(","));
    expect(parsed.header).toEqual(HEADERS);
    // Persis baris terfilter (semua 120, bukan halaman 100), urut Omzet turun.
    const expected = [...picked].sort((p, q) => q.omzet - p.omzet).map(csvRow);
    expect(parsed.rows).toEqual(expected);
    // Sama dengan hasil query widget di layar (halaman pertama).
    expect(parsed.rows.slice(0, 100)).toEqual(
      shown.rows.map((r) => [String(r[0]), String(r[1]).slice(0, 10), String(r[2])]),
    );

    // "Unduh lagi" memberi file yang sama.
    const again = a.waitForEvent("download");
    await exp.menu.getByTestId("export-download").click();
    const second = join(dir, "lagi.csv");
    await (await again).saveAs(second);
    expect(readFileSync(second).equals(exp.file)).toBe(true);
  });

  test("peran: VIEWER (dibagikan A) bisa mengekspor widget itu; orang asing 404 di POST /api/exports", async () => {
    test.setTimeout(180_000);
    await a.goto(d1Path());
    await a.getByTestId("share-open").click();
    const dialog = a.getByTestId("share-dialog");
    await expect(dialog.getByTestId("share-search")).toBeVisible();
    await dialog.getByTestId("share-search").fill(B.split("@")[0]!);
    const option = dialog.getByTestId("share-option");
    await expect(option).toHaveCount(1);
    await expect(option).toHaveAttribute("data-email", B);
    await option.click();
    await expect(dialog.getByTestId("share-role")).toContainText("Hanya lihat");
    await dialog.getByTestId("share-add").click();
    await expect(dialog.getByTestId("share-add-done")).toHaveText(
      `${B} kini bisa melihat dashboard ini.`,
    );
    await dialog.getByRole("button", { name: "Selesai" }).click();
    await expect(dialog).toHaveCount(0);

    await b.goto(d1Path());
    await expect(b.getByText("Hanya lihat", { exact: true })).toBeVisible();
    await expect(range(b, tableId)).toHaveText(`Baris 1–100 dari ${ROWS}`);
    const exp = await exportViaUi(b, tableId, "csv");
    viewerExportId = exp.id;
    expect(exp.request).toEqual({ widgetId: tableId, format: "csv" });
    const parsed = parseCsv(exp.file);
    expect(parsed.header).toEqual(HEADERS);
    // Tanpa filter/urutan: semua baris dalam urutan asli.
    expect(parsed.rows).toEqual(rows.map(csvRow));
    const trail = exportAudits(viewerExportId);
    expect(trail).toHaveLength(1);
    expect(trail[0]).toMatchObject({
      actorId: ids[B],
      targetType: "dashboard",
      targetId: d1,
      meta: {
        widgetId: tableId,
        exportId: viewerExportId,
        format: "csv",
        rows: ROWS,
        role: "VIEWER",
      },
    });

    // Orang asing: widget tidak terlihat → 404 (dengan atau tanpa filter), tidak ada baris Export.
    await expectStatus(
      await api(x, "POST", "/api/exports", { widgetId: tableId, format: "csv" }),
      404,
      "NOT_FOUND",
    );
    await expectStatus(
      await api(x, "POST", "/api/exports", {
        widgetId: tableId,
        format: "xlsx",
        dashboardFilters: [{ column: "Cabang", op: "in", values: ["Medan"] }],
      }),
      404,
      "NOT_FOUND",
    );
    await expectStatus(await x.request.get(`/api/exports/${viewerExportId}`), 404, "NOT_FOUND");
  });

  test("AC6: unduh ekspor A — B (viewer dashboard yang sama) dan orang asing 404; pemilik 302 ke presigned 5 menit attachment + AuditLog", async () => {
    expect(csvId).not.toBe("");
    for (const p of [b, x]) {
      await expectStatus(
        await p.request.get(`/api/exports/${csvId}/download`, { maxRedirects: 0 }),
        404,
        "NOT_FOUND",
      );
      await expectStatus(await p.request.get(`/api/exports/${csvId}`), 404, "NOT_FOUND");
    }
    // Pemilik dashboard pun tidak bisa mengunduh ekspor milik viewer.
    await expectStatus(
      await a.request.get(`/api/exports/${viewerExportId}/download`, { maxRedirects: 0 }),
      404,
      "NOT_FOUND",
    );

    const before = exportAudits(csvId);
    // UI: unduhan otomatis + "Unduh lagi" — semuanya oleh A.
    expect(before.length).toBeGreaterThanOrEqual(2);
    const res = await a.request.get(`/api/exports/${csvId}/download`, { maxRedirects: 0 });
    expect(res.status(), await res.text()).toBe(302);
    const h = res.headers();
    expect(h["cache-control"]).toContain("no-store");
    expect(h["referrer-policy"]).toBe("no-referrer");
    const loc = new URL(h["location"]!);
    expect(loc.pathname).toContain(`/exports/${ids[A]}/${csvId}.csv`);
    expect(loc.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(loc.searchParams.get("response-content-disposition")).toMatch(
      /^attachment; filename="Tabel ekspor-\d{8}-\d{4}\.csv"; filename\*=UTF-8''Tabel%20ekspor-\d{8}-\d{4}\.csv$/,
    );
    expect(loc.searchParams.get("response-content-type")).toBe("text/csv; charset=utf-8");
    // Tautan presigned itu sendiri: file CSV sebagai attachment.
    const file = await a.request.get(loc.toString());
    expect(file.status()).toBe(200);
    expect(file.headers()["content-disposition"]).toMatch(/^attachment; /);
    const parsed = parseCsv(await file.body());
    expect(parsed.rows).toHaveLength(picked.length);

    const after = exportAudits(csvId);
    expect(after).toHaveLength(before.length + 1);
    // Percobaan B/X tidak meninggalkan jejak; setiap tautan pemilik tercatat.
    for (const row of after) {
      expect(row).toMatchObject({
        action: "dashboard.widget.export",
        actorId: ids[A],
        targetType: "dashboard",
        targetId: d1,
        meta: {
          widgetId: tableId,
          exportId: csvId,
          format: "csv",
          rows: picked.length,
          role: "OWNER",
        },
      });
      expect(row.ip).toBeTruthy();
    }
  });

  test("AC3: XLSX selesai → file terbaca parser xlsx proyek; 61 menit kemudian status expired, unduh 410, objek terhapus, presigned lama mati", async () => {
    test.setTimeout(180_000);
    await a.goto(d1Path());
    await expect(range(a, tableId)).toHaveText(`Baris 1–100 dari ${ROWS}`);
    const exp = await exportViaUi(a, tableId, "xlsx");
    expect(exp.request).toEqual({ widgetId: tableId, format: "xlsx" });
    expect(exp.name).toMatch(/^Tabel ekspor-\d{8}-\d{4}\.xlsx$/);
    expect(zipParts(exp.path)).toEqual(XLSX_PARTS);
    const sheet = await readXlsx(exp.path, TABLE);
    expect(sheet[0]).toEqual(HEADERS);
    expect(sheet).toHaveLength(ROWS + 1);
    expect(
      sheet.slice(1).map((r) => [r[0], (r[1] as Date).toISOString().slice(0, 10), r[2]]),
    ).toEqual(rows.map((r) => [r.cabang, `2026-10-${pad(r.day)}`, r.omzet]));

    expect(objectCount(ids[A]!, exp.id)).toBe(1);
    const live = await a.request.get(`/api/exports/${exp.id}/download`, { maxRedirects: 0 });
    expect(live.status()).toBe(302);
    const oldUrl = live.headers()["location"]!;
    expect(new URL(oldUrl).searchParams.get("response-content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    // 61 menit berlalu (finishedAt/expiresAt dimundurkan) + job pembersihan sungguhan di worker.
    node("scripts/dev-expire-export.mjs", exp.id);
    node("scripts/dev-upload-fixture.mjs", "run-job", "export-cleanup");
    expect(await (await a.request.get(`/api/exports/${exp.id}`)).json()).toMatchObject({
      ok: true,
      state: "expired",
      code: "EXPORT_EXPIRED",
    });
    await expectStatus(
      await a.request.get(`/api/exports/${exp.id}/download`, { maxRedirects: 0 }),
      410,
      "EXPORT_EXPIRED",
    );
    expect(objectCount(ids[A]!, exp.id)).toBe(0);
    // Tautan presigned yang sempat diberikan (tanda tangan masih berlaku) tidak lagi memberi file.
    expect((await a.request.get(oldUrl)).status()).toBe(404);
  });

  test("AC5: sel dan nama kolom berawalan = + - @ tab → CSV diawali ', angka negatif utuh; XLSX string inline", async () => {
    test.setTimeout(120_000);
    const neutral = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

    const c = await exportViaApi(a, { widgetId: formulaId, format: "csv" });
    expect(c.headers["content-type"]).toBe("text/csv; charset=utf-8");
    const parsed = parseCsv(c.file);
    expect(parsed.header).toEqual(["'=Kode", "'+Catatan", "'-Selisih", "'@Akun", "Nama"]);
    // Kolom angka (-Selisih) tidak dinetralkan: -5, -300 tetap angka.
    expect(parsed.rows).toEqual(F_ROWS.map((r) => r.map((v, i) => (i === 2 ? v : neutral(v)))));
    expect(parsed.rows.map((r) => r[2])).toEqual(["-5", "12", "-300", "7"]);

    const s = await exportViaApi(a, { widgetId: formulaId, format: "xlsx" });
    expect(s.headers["content-type"]).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(zipParts(s.path)).toEqual(XLSX_PARTS);
    const sheet = await readXlsx(s.path, FORMULA_TABLE);
    // XLSX: apa adanya (tanpa '), teks sebagai string, angka sebagai angka.
    expect(sheet[0]).toEqual(F_HEADERS);
    expect(sheet.slice(1)).toEqual(F_ROWS.map((r) => r.map((v, i) => (i === 2 ? Number(v) : v))));
    const xml = sheetXml(s.path);
    expect(xml).not.toMatch(/<(\w+:)?f[\s>]/);
    // "=1+1" (A2) dan nama kolom "=Kode" (A1) adalah string inline, bukan formula atau angka.
    expect(xml).toMatch(/<c r="A1"[^>]*t="inlineStr"[^>]*><is><t[^>]*>=Kode<\/t><\/is><\/c>/);
    expect(xml).toMatch(/<c r="A2"[^>]*t="inlineStr"[^>]*><is><t[^>]*>=1\+1<\/t><\/is><\/c>/);
    expect(xml).toMatch(/<c r="C2"[^>]*><v>-5<\/v><\/c>/);
  });

  test("UI: menu ekspor dengan keyboard — Enter membuka dan fokus ke CSV, Escape menutup dan fokus kembali ke tombol", async () => {
    await a.goto(d1Path());
    const trigger = card(a, tableId).getByTestId("widget-export");
    await expect(trigger).toHaveAccessibleName(`Ekspor ${TABLE}`);
    await expect(range(a, tableId)).toHaveText(`Baris 1–100 dari ${ROWS}`);
    await trigger.focus();
    await a.keyboard.press("Enter");
    const menu = a.getByTestId("export-menu");
    await expect(menu).toBeVisible();
    await expect(menu.getByTestId("export-csv")).toBeFocused();
    await a.keyboard.press("Tab");
    await expect(menu.getByTestId("export-xlsx")).toBeFocused();
    await a.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("UI: ekspor di mode edit dengan simpanan tertunda (beforeunload aktif) → unduhan tanpa dialog 'Leave site?' dan tetap di editor", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const p = await pageFor(browser, A);
    const held: Route[] = [];
    let release = false;
    // PUT tata letak ditahan → status simpan "saving" → peringatan beforeunload editor terpasang.
    await p.route(/\/api\/dashboards\/[a-z0-9]+\/layout$/, async (route) => {
      if (route.request().method() !== "PUT") return route.fallback();
      if (release) return route.abort().catch(() => {});
      held.push(route);
    });
    const dialogs: string[] = [];
    p.on("dialog", (d) => {
      dialogs.push(d.type());
      void d.dismiss().catch(() => {});
    });
    try {
      await p.goto(`${d1Path()}?mode=edit`);
      await expect(p.getByTestId("canvas-toolbar")).toBeVisible();
      await expect(range(p, tableId)).toHaveText(`Baris 1–100 dari ${ROWS}`);
      await card(p, tableId)
        .getByRole("button", { name: `Pengaturan ${TABLE}` })
        .click();
      const panel = p.getByTestId("widget-panel");
      await expect(panel.getByRole("heading", { name: "Pengaturan widget" })).toBeFocused();
      // Geser/ubah ukuran lewat tombol panel (yang berlaku di posisi ini) → simpan tata letak.
      let moved = false;
      for (const name of [
        `Geser ${TABLE} ke kanan`,
        `Geser ${TABLE} ke kiri`,
        `Persempit ${TABLE}`,
      ]) {
        const step = panel.getByRole("button", { name, exact: true });
        if ((await step.getAttribute("aria-disabled")) === "true") continue;
        await step.click();
        moved = true;
        break;
      }
      expect(moved).toBe(true);
      await expect.poll(() => held.length).toBeGreaterThan(0);
      await expect(p.getByTestId("save-state")).toHaveAttribute("data-state", "saving");
      await panel.getByRole("button", { name: "Tutup pengaturan" }).click();
      await expect(panel).toHaveCount(0);
      const armed = () =>
        p.evaluate(() => {
          const e = new Event("beforeunload", { cancelable: true });
          window.dispatchEvent(e);
          return e.defaultPrevented;
        });
      expect(await armed()).toBe(true);

      const exp = await exportViaUi(p, tableId, "csv");
      expect(parseCsv(exp.file).rows).toHaveLength(ROWS);
      expect(dialogs).toEqual([]);
      expect(new URL(p.url()).searchParams.get("mode")).toBe("edit");
      await expect(p.getByTestId("canvas-toolbar")).toBeVisible();
      // Peringatan masih terpasang: unduhan tidak melewati atau melepas penjaga editor.
      await expect(p.getByTestId("save-state")).toHaveAttribute("data-state", "saving");
      expect(await armed()).toBe(true);
    } finally {
      release = true;
      for (const r of held) await r.abort().catch(() => {});
      await p.context().close();
    }
  });

  test("AC2: hasil melebihi EXPORT_MAX_ROWS (worker dengan batas 100) → EXPORT_TOO_LARGE + saran mempersempit; filter dipersempit → berhasil", async () => {
    test.setTimeout(240_000);
    await stopWorker(worker);
    worker = null;
    worker = await startWorker("exports-limit", { EXPORT_MAX_ROWS: "100" });

    await a.goto(d1Path());
    await expect(range(a, tableId)).toHaveText(`Baris 1–100 dari ${ROWS}`);
    const menu = await openMenu(a, tableId);
    const created = a.waitForResponse(isCreate);
    await menu.getByTestId("export-csv").click();
    const res = await created;
    const { exportId } = (await res.json()) as { exportId: string };
    expect(res.status()).toBe(202);
    const error = menu.getByTestId("export-error");
    await expect(error).toHaveAttribute("data-code", "EXPORT_TOO_LARGE", { timeout: 60_000 });
    await expect(error).toContainText(
      `Hasil ${ROWS} baris melebihi batas 100 baris. Persempit filter lalu ekspor lagi.`,
    );
    await expect(error).toContainText(TOO_LARGE_HINT);
    await expect(error.getByRole("alert")).toBeVisible();
    expect(await (await a.request.get(`/api/exports/${exportId}`)).json()).toMatchObject({
      ok: true,
      state: "failed",
      code: "EXPORT_TOO_LARGE",
    });
    // Tanpa file: unduh 404, tidak ada objek.
    await expectStatus(
      await a.request.get(`/api/exports/${exportId}/download`, { maxRedirects: 0 }),
      404,
      "NOT_FOUND",
    );
    expect(objectCount(ids[A]!, exportId)).toBe(0);

    // Saran dijalankan: satu cabang (60 baris ≤ 100) → ekspor berhasil.
    await a.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await pickCabang(a, ["Medan"]);
    const medan = rows.filter((r) => r.cabang === "Medan");
    await expect(range(a, tableId)).toHaveText(`Baris 1–${medan.length} dari ${medan.length}`);
    const ok = await exportViaUi(a, tableId, "csv");
    expect(parseCsv(ok.file).rows).toEqual(medan.map(csvRow));
    await expect(ok.menu.getByTestId("export-error")).toHaveCount(0);
  });
});
