import { execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { apiLogin, registerAndVerify, startWorker, stopWorker, uniqueEmail } from "./helpers";

/*
 * T-012: filter global dashboard (slicer, preset tanggal, filter silang) dengan data sungguhan
 * (unggah → ingest worker → query DuckDB). Fixture dibuat di sini sehingga test menghitung sendiri
 * jumlah baris yang diharapkan:
 *   Cabang (teks, distribusi tidak rata) · Tanggal (DATE ISO: tahun lalu, tahun ini sebelum/sesudah
 *   hari ini, tepat hari ini dan besok menurut Asia/Jakarta) · Omzet (desimal koma) ·
 *   Kode (teks, 5.000 nilai unik KD-00001…KD-05000 — satu per baris agar file tetap kecil).
 * Dashboard: A = batang Cabang × total Omzet, B = KPI jumlah baris, C = tabel; kolom filter Cabang,
 * Tanggal, Kode diatur lewat UI mode edit (PATCH /api/dashboards/:id/filter-columns).
 */
test.describe.configure({ mode: "serial" });

const OWNER = uniqueEmail("filter-owner");
const CHART = "Omzet per cabang";
const KPI = "Jumlah transaksi";
const TABLE = "Detail transaksi";
const ROWS = 5000;
// Panjang siklus 11 (koprima dengan siklus tanggal 9): jumlah per cabang berbeda-beda.
const CABANG_CYCLE = [
  "Jakarta",
  "Bandung",
  "Jakarta",
  "Surabaya",
  "Bandung",
  "Jakarta",
  "Medan",
  "Bandung",
  "Jakarta",
  "Surabaya",
  "Denpasar",
];
const dir = mkdtempSync(join(tmpdir(), "dd-e2e-filter-"));
let worker: ChildProcess | null = null;
let dashboardUrl = "";
let datasetIdShared = "";

/** Hari ini di Asia/Jakarta sebagai YYYY-MM-DD (cara yang sama dengan todayJakarta di server). */
function todayJakarta(): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
}

function addDays(day: string, n: number): string {
  const [y = 0, m = 1, d = 1] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

const TODAY = todayJakarta();
const TOMORROW = addDays(TODAY, 1);
const YEAR = Number(TODAY.slice(0, 4));
const DATES = [
  TODAY,
  TOMORROW,
  `${YEAR}-01-01`,
  `${YEAR - 1}-12-31`,
  `${YEAR - 1}-03-15`,
  addDays(TODAY, -1),
  `${YEAR}-02-28`,
  addDays(TODAY, 20),
  `${YEAR}-12-31`,
];

const code = (i: number) => `KD-${String(i + 1).padStart(5, "0")}`;
const rows = Array.from({ length: ROWS }, (_, i) => ({
  cabang: CABANG_CYCLE[i % CABANG_CYCLE.length]!,
  tanggal: DATES[i % DATES.length]!,
  omzet: 100 + ((i * 37) % 9000) + 0.25,
  kode: code(i),
}));
const countWhere = (pred: (r: (typeof rows)[number]) => boolean) => rows.filter(pred).length;

function fixtureCsv(): string {
  const lines = ["Cabang;Tanggal;Omzet;Kode"];
  for (const r of rows) {
    lines.push(`${r.cabang};${r.tanggal};${String(r.omzet).replace(".", ",")};${r.kode}`);
  }
  const path = join(dir, "omzet-filter.csv");
  writeFileSync(path, lines.join("\n"));
  return path;
}

const widgetTitled = (page: Page, title: string) =>
  page.getByTestId("widget").filter({ has: page.getByRole("heading", { name: title }) });

/** Tambah widget, beri judul, pilih jenis; tunggu konfigurasi tersimpan (alur widgets.spec.ts). */
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

/** Kolom filter lewat menu "Tambah kolom filter" (mode edit); tunggu PATCH selesai. */
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
  await expect(section.getByText("Kolom filter tersimpan.")).toBeVisible();
}

const digits = (s: string | null) => Number((s ?? "").replace(/\D/g, ""));

/** Nilai lengkap KPI B (title berisi angka utuh walau tampilan dipendekkan). */
async function expectKpi(page: Page, n: number) {
  const value = widgetTitled(page, KPI).getByTestId("kpi-value");
  await expect
    .poll(async () => digits(await value.getAttribute("title")), { timeout: 30_000 })
    .toBe(n);
}

/** Total baris tabel C ("Baris 1–100 dari N"). */
async function expectTableTotal(page: Page, n: number) {
  const range = widgetTitled(page, TABLE).getByTestId("table-range");
  await expect
    .poll(async () => digits((await range.textContent())?.match(/dari\s+([\d.]+)/)?.[1] ?? ""), {
      timeout: 30_000,
    })
    .toBe(n);
}

/** Nilai kolom Cabang di halaman tabel C yang tampil. */
async function tableCabang(page: Page): Promise<string[]> {
  return widgetTitled(page, TABLE)
    .getByTestId("widget-table")
    .evaluate((t) => {
      const heads = [...t.querySelectorAll("thead th")].map((th) => th.textContent?.trim() ?? "");
      const i = heads.findIndex((h) => h.startsWith("Cabang"));
      if (i < 0) throw new Error(`kolom Cabang tidak ada: ${heads.join(" | ")}`);
      return [...t.querySelectorAll("tbody tr")].map(
        (tr) => tr.children[i]?.textContent?.trim() ?? "",
      );
    });
}

/** Status ?f= di URL halaman. */
function urlFilters(page: Page): unknown {
  const f = new URL(page.url()).searchParams.get("f");
  return f ? JSON.parse(f) : null;
}

/** Tabel data grafik A (tombol crossfilter-item). Daftar peringkat di kartu sempit sudah berupa tombol. */
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

test.describe("filter dashboard", () => {
  test.beforeAll(async ({ browser, request }) => {
    test.setTimeout(240_000);
    execFileSync("node", ["scripts/dev-reset-ratelimit.mjs", "register:ip", "verify:ip"]); // suite penuh: batas per IP
    const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await registerAndVerify(p, request, OWNER);
    await apiLogin(p, OWNER);
    worker = await startWorker("filters");
    await p.goto("/datasets/baru");
    await p.getByLabel("Nama dataset").fill(`Omzet filter ${Date.now()}`);
    await p.getByRole("button", { name: "Buat dataset" }).click();
    await expect(p).toHaveURL(/\/datasets\/[a-z0-9]{20,32}\?created=1$/);
    const datasetId = new URL(p.url()).pathname.split("/").pop()!;
    datasetIdShared = datasetId;
    await p.getByTestId("upload-input").setInputFiles(fixtureCsv());
    await expect(p.getByTestId("dataset-schema-link")).toBeVisible({ timeout: 120_000 });

    await p.goto(`/dashboards/baru?dataset=${datasetId}`);
    await p.getByLabel("Nama dashboard").fill("Ringkasan filter");
    await p.getByRole("button", { name: "Buat dashboard" }).click();
    await expect(p).toHaveURL(/\?mode=edit$/);
    dashboardUrl = p.url().replace("?mode=edit", "");

    // A: pilihan awal batang = kolom teks pertama (Cabang) × total kolom angka pertama (Omzet).
    const bar = await addWidget(p, CHART, "Batang");
    await expect(bar.getByLabel("Kelompokkan menurut", { exact: true })).toContainText("Cabang");
    await expect(bar.getByLabel("dari kolom", { exact: true })).toContainText("Omzet");
    await expect(bar.getByTestId("widget-crossfilter-switch")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    // B: KPI jumlah baris.
    const kpi = await addWidget(p, KPI, "Angka");
    await kpi.getByLabel("Nilai", { exact: true }).click();
    await p.getByRole("option", { name: "Jumlah baris", exact: true }).click();
    await expect(kpi.getByTestId("config-status")).toHaveAttribute("data-state", "saved");
    await expectKpi(p, ROWS);
    // C: tabel.
    await addWidget(p, TABLE, "Tabel");
    await expectTableTotal(p, ROWS);

    await addFilterColumn(p, "Cabang", 1);
    await addFilterColumn(p, "Tanggal", 2);
    await addFilterColumn(p, "Kode", 3);
    await p.close();
  });

  test.afterAll(async () => {
    await stopWorker(worker);
  });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await apiLogin(page, OWNER);
  });

  test("AC1: slicer Cabang 2 nilai → semua widget terfilter; muat ulang URL sama → tetap", async ({
    page,
  }) => {
    const picked = ["Bandung", "Medan"];
    const expected = countWhere((r) => picked.includes(r.cabang));
    await page.goto(dashboardUrl);
    await expectKpi(page, ROWS);

    const slicer = page.locator('[data-testid=filter-slicer][data-column="Cabang"]');
    await slicer.click();
    const options = page.getByTestId("filter-slicer-option");
    await expect(options).toHaveCount(new Set(CABANG_CYCLE).size);
    for (const v of picked) {
      await page.locator(`[data-testid=filter-slicer-option][data-value="${v}"] input`).check();
    }
    await page.keyboard.press("Escape");
    await expect(slicer).toBeFocused();

    await expect
      .poll(() => urlFilters(page))
      .toEqual({ filters: [{ column: "Cabang", op: "in", values: picked }] });
    const url = page.url();

    const verify = async () => {
      await expectKpi(page, expected);
      await expectTableTotal(page, expected);
      const cabang = await tableCabang(page);
      expect(cabang.length).toBe(Math.min(100, expected));
      expect(new Set(cabang)).toEqual(new Set(picked));
      // Grafik A ikut tersaring filter global: hanya dua kategori itu.
      const chartRows = widgetTitled(page, CHART).getByTestId("chart-data").locator("tbody th");
      await expect(chartRows).toHaveCount(2);
      expect(new Set(await chartRows.allTextContents())).toEqual(new Set(picked));
      await expect(page.locator('[data-testid=filter-chip][data-column="Cabang"]')).toBeVisible();
    };
    await verify();

    await page.reload();
    expect(page.url()).toBe(url);
    await expect(slicer).toContainText("2 dipilih");
    await verify();
    await slicer.click();
    await expect(options.first()).toBeVisible();
    const checked = await page
      .locator("[data-testid=filter-slicer-option]:has(input:checked)")
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-value")));
    expect(checked.sort()).toEqual([...picked].sort());
  });

  test("AC1 regresi Back: pindah ke Dataset lewat tautan lalu Back → filter tetap berlaku", async ({
    page,
  }) => {
    const expected = countWhere((r) => r.cabang === "Medan");
    const state = { filters: [{ column: "Cabang", op: "in", values: ["Medan"] }] };
    await page.goto(dashboardUrl);
    await expectKpi(page, ROWS);
    await page.locator('[data-testid=filter-slicer][data-column="Cabang"]').click();
    await page.locator('[data-testid=filter-slicer-option][data-value="Medan"] input').check();
    await page.keyboard.press("Escape");
    await expect.poll(() => urlFilters(page)).toEqual(state);
    await expectKpi(page, expected);

    // Navigasi klien (tautan sidebar), bukan muat penuh: halaman kembali dari cache router.
    await page.getByRole("link", { name: "Dataset", exact: true }).first().click();
    await expect(page).toHaveURL(/\/datasets(\?|$)/);
    await page.goBack();
    const chip = page.locator('[data-testid=filter-chip][data-column="Cabang"]');
    await expect(chip).toContainText("Medan");
    await expectKpi(page, expected);
    // Status tetap di URL (tidak dihapus setelah kembali) — Forward/Back berikutnya tetap konsisten.
    await page.waitForTimeout(500);
    expect(urlFilters(page)).toEqual(state);
    await expect(chip).toContainText("Medan");
  });

  test("AC2: filter silang 'Jakarta' dari grafik A → KPI B dan tabel C hanya Jakarta; hapus memulihkan", async ({
    page,
  }) => {
    const jakarta = countWhere((r) => r.cabang === "Jakarta");
    const categories = new Set(CABANG_CYCLE).size;
    await page.goto(dashboardUrl);
    await expectKpi(page, ROWS);
    await expectTableTotal(page, ROWS);
    await expect(page.getByTestId("cross-filter-chip")).toHaveCount(0);

    const chart = await showChartItems(page);
    const items = chart.getByTestId("crossfilter-item");
    await expect(items).toHaveCount(categories);
    const item = chart.locator('[data-testid=crossfilter-item][data-value="Jakarta"]');
    await expect(item).toHaveAttribute("aria-pressed", "false");
    // Satu petunjuk untuk seluruh dashboard (bukan per grafik); tombol kategori menunjuk ke sana.
    const hint = page.getByTestId("crossfilter-hint");
    await expect(hint).toHaveCount(1);
    await expect(hint).toBeVisible();
    await expect(item).toHaveAccessibleDescription(/Pilih kategori di grafik untuk menyaring/);
    await item.click();

    const chip = page.getByTestId("cross-filter-chip");
    await expect(chip).toBeVisible();
    await expect(chip).toContainText(CHART);
    await expect(chip).toContainText("Jakarta");
    const clear = page.getByTestId("cross-filter-clear");
    await expect(clear).toBeVisible();
    await expect(clear).toHaveAccessibleName(`Hapus filter silang dari ${CHART}`);

    await expectKpi(page, jakarta);
    await expectTableTotal(page, jakarta);
    expect(new Set(await tableCabang(page))).toEqual(new Set(["Jakarta"]));
    // Sumber disorot, tidak ikut tersaring.
    await expect(item).toHaveAttribute("aria-pressed", "true");
    await expect(chart.locator("[data-testid=crossfilter-item][aria-pressed=true]")).toHaveCount(1);
    await expect(items).toHaveCount(categories);
    const cross = urlFilters(page) as { cross?: { filter: unknown } } | null;
    expect(cross?.cross?.filter).toEqual({ column: "Cabang", op: "in", values: ["Jakarta"] });

    await clear.click();
    await expect(chip).toHaveCount(0);
    await expectKpi(page, ROWS);
    await expectTableTotal(page, ROWS);
    await expect(chart.locator("[data-testid=crossfilter-item][aria-pressed=true]")).toHaveCount(0);
    expect(urlFilters(page)).toBeNull();
  });

  test("AC3: preset YTD pada Tanggal (DATE) = 1 Januari s.d. hari ini Asia/Jakarta, tanpa geser zona", async ({
    page,
  }) => {
    const start = `${YEAR}-01-01`;
    const expected = countWhere((r) => r.tanggal >= start && r.tanggal <= TODAY);
    // Fixture memuat baris tepat hari ini, besok, 1 Januari dan 31 Desember tahun lalu.
    expect(countWhere((r) => r.tanggal === TODAY)).toBeGreaterThan(0);
    expect(countWhere((r) => r.tanggal === TOMORROW)).toBeGreaterThan(0);
    expect(expected).toBeLessThan(ROWS);

    await page.goto(dashboardUrl);
    await expectKpi(page, ROWS);
    const queries: string[] = [];
    page.on("request", (r) => {
      if (r.url().endsWith("/api/query") && r.method() === "POST") queries.push(r.postData() ?? "");
    });

    const control = page.locator('[data-testid=filter-date][data-column="Tanggal"]');
    await control.click();
    const ytd = page.locator("[data-testid=filter-date-preset][data-preset=ytd]");
    await ytd.click();
    await expect(ytd).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");

    await expect(page.locator('[data-testid=filter-chip][data-column="Tanggal"]')).toContainText(
      "Sejak awal tahun",
    );
    await expectKpi(page, expected);
    await expectTableTotal(page, expected);
    // Klien hanya mengirim preset (tanggal dihitung server), bukan rentang tanggal dari jam klien.
    const sent = queries
      .map((q) => JSON.parse(q) as { dashboardFilters?: unknown[] })
      .filter((q) => q.dashboardFilters?.length);
    expect(sent.length).toBeGreaterThan(0);
    for (const q of sent) {
      expect(q.dashboardFilters).toEqual([{ column: "Tanggal", op: "preset", preset: "ytd" }]);
    }
    expect(urlFilters(page)).toEqual({
      filters: [{ column: "Tanggal", op: "preset", preset: "ytd" }],
    });
  });

  test("T-9gs1: Pilih periode (bulan, kuartal) dari data → widget tersaring, chip bernama periode, bertahan setelah muat ulang", async ({
    page,
  }) => {
    const last = YEAR - 1;
    const dec = countWhere((r) => r.tanggal.startsWith(`${last}-12`));
    const q4 = countWhere((r) => r.tanggal >= `${last}-10-01` && r.tanggal < `${YEAR}-01-01`);
    expect(dec).toBeGreaterThan(0);

    await page.goto(dashboardUrl);
    await expectKpi(page, ROWS);
    const control = page.locator('[data-testid=filter-date][data-column="Tanggal"]');
    await control.click();
    await expect(page.getByText("Pilih periode")).toBeVisible();
    if (process.env.E2E_SHOTS) {
      await page.screenshot({ path: join(process.env.E2E_SHOTS, "period-1440.png") });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: join(process.env.E2E_SHOTS, "period-390.png") });
      await page.setViewportSize({ width: 1440, height: 900 });
    }
    await page.getByLabel("Bulan", { exact: true }).click();
    await page.getByRole("option", { name: `Desember ${last}`, exact: true }).click();
    await page.keyboard.press("Escape");
    const chip = page.locator('[data-testid=filter-chip][data-column="Tanggal"]');
    await expect(chip).toContainText(`Desember ${last}`);
    await expectKpi(page, dec);
    expect(urlFilters(page)).toEqual({
      filters: [{ column: "Tanggal", op: "range", gte: `${last}-12-01`, lt: `${YEAR}-01-01` }],
    });
    await page.reload();
    await expect(chip).toContainText(`Desember ${last}`);
    await expectKpi(page, dec);

    // Kuartal: jenis periode diganti lalu dipilih dari daftar kuartal.
    await control.click();
    await page.locator("[data-testid=filter-period-grain][data-grain=quarter]").click();
    await page.getByLabel("Kuartal", { exact: true }).click();
    await page.getByRole("option", { name: `Kuartal 4 ${last}`, exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(chip).toContainText(`Kuartal 4 ${last}`);
    await expectKpi(page, q4);
  });

  test("AC4: slicer Kode (5.000 nilai unik) → 1.000 opsi + peringatan; ketik 3 huruf → disaring di server", async ({
    page,
  }) => {
    const q = "049";
    const matches = rows.map((r) => r.kode).filter((k) => k.includes(q));
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.length).toBeLessThan(1000);

    await page.goto(dashboardUrl);
    await expectKpi(page, ROWS);
    const first = page.waitForResponse(
      (r) =>
        r.url().endsWith("/filter-values") &&
        (JSON.parse(r.request().postData() ?? "{}") as { column?: string }).column === "Kode",
    );
    await page.locator('[data-testid=filter-slicer][data-column="Kode"]').click();
    const firstBody = (await (await first).json()) as { values: string[]; truncated: boolean };
    expect(firstBody.values).toHaveLength(1000);
    expect(firstBody.truncated).toBe(true);

    const options = page.getByTestId("filter-slicer-option");
    await expect(options).toHaveCount(1000);
    const warning = page.getByTestId("filter-slicer-warning");
    await expect(warning).toBeVisible();
    await expect(warning).toContainText("1.000 nilai pertama");

    const searched = page.waitForResponse(
      (r) =>
        r.url().endsWith("/filter-values") &&
        (JSON.parse(r.request().postData() ?? "{}") as { q?: string }).q === q,
    );
    await page.getByTestId("filter-slicer-search").pressSequentially(q, { delay: 40 });
    const res = await searched;
    expect(res.status()).toBe(200);
    expect(JSON.parse(res.request().postData()!)).toMatchObject({ column: "Kode", q });
    const body = (await res.json()) as { values: string[]; truncated: boolean };
    expect(body.truncated).toBe(false);
    expect([...body.values].sort()).toEqual([...matches].sort());

    await expect(options).toHaveCount(matches.length);
    const shown = await options.evaluateAll((els) => els.map((e) => e.getAttribute("data-value")!));
    expect(shown.every((v) => v.includes(q))).toBe(true);
    expect([...shown].sort()).toEqual([...matches].sort());
    await expect(warning).toHaveCount(0);
  });

  let cleanup: (() => Promise<unknown>) | null = null;
  test.afterEach(async () => {
    const res = (await cleanup?.()) as { ok(): boolean; status(): number } | undefined;
    cleanup = null;
    if (res) expect(res.ok(), `pembersihan bawaan: HTTP ${res.status()}`).toBe(true);
  });

  test("T-vb7q: filter bawaan — disimpan di mode edit, aktif tanpa ?f= (label bawaan, dikirim sebagai dashboardFilters); Hapus semua = f={} tetap tanpa filter saat dimuat ulang; Kembalikan bawaan", async ({
    page,
  }) => {
    const medan = countWhere((r) => r.cabang === "Medan");
    const state = { filters: [{ column: "Cabang", op: "in", values: ["Medan"] }] };
    const hydrated = () =>
      expect(page.locator("[data-testid=dashboard-canvas][data-hydrated]")).toHaveCount(1);
    const chip = page.locator('[data-testid=filter-chip][data-column="Cabang"]');

    // Mode edit dengan filter aktif Medan → simpan sebagai bawaan.
    await page.goto(`${dashboardUrl}?mode=edit&f=${encodeURIComponent(JSON.stringify(state))}`);
    await hydrated();
    await expectKpi(page, medan);
    const saved = page.waitForResponse(
      (r) => r.url().endsWith("/filter-columns") && r.request().method() === "PATCH",
    );
    await page.getByTestId("filter-save-defaults").click();
    const res = await saved;
    expect(res.status(), await res.text()).toBe(200);
    // Bawaan dibersihkan lewat API bila tes gagal di tengah (dashboard dipakai bersama).
    const plain = (
      res.request().postDataJSON().filterColumns as { sheet: string; column: string }[]
    ).map(({ sheet, column }) => ({ sheet, column }));
    cleanup = () =>
      page.request.patch(
        `${new URL(dashboardUrl).pathname.replace("/dashboards/", "/api/dashboards/")}/filter-columns`,
        {
          data: { filterColumns: plain },
          headers: { origin: new URL(dashboardUrl).origin },
        },
      );
    expect(res.request().postDataJSON().filterColumns[0]).toEqual({
      sheet: expect.any(String),
      column: "Cabang",
      default: state.filters[0],
    });
    await expect(page.getByText("Filter bawaan tersimpan.")).toBeVisible();
    await expect(page.getByTestId("filter-save-defaults")).toHaveAttribute("aria-disabled", "true");

    // Mode lihat tanpa ?f= → bawaan aktif, chip berlabel, widget menerima dashboardFilters Medan.
    const query = page.waitForRequest(
      (r) => r.url().endsWith("/api/query") && r.method() === "POST",
    );
    await page.goto(dashboardUrl);
    expect((await query).postDataJSON().dashboardFilters).toEqual(state.filters);
    await hydrated();
    await expectKpi(page, medan);
    await expect(chip.getByTestId("chip-default")).toHaveText("bawaan");
    expect(urlFilters(page)).toBeNull();
    await expect(page.getByTestId("filter-restore-defaults")).toHaveCount(0);
    // PDF memakai filter aktif yang sama (body POST; renderer tidak diuji di sini).
    await page.getByTestId("dashboard-pdf-export").click();
    const pdf = page.waitForRequest(
      (r) => r.url().endsWith("/api/exports") && r.method() === "POST",
    );
    await page.getByTestId("export-pdf").click();
    expect(JSON.parse((await pdf).postDataJSON().f)).toEqual(state);
    await page.keyboard.press("Escape");

    // Hapus semua → seluruh data, f={} di URL, tetap tanpa filter setelah muat ulang.
    await page.getByTestId("filter-clear-all").click();
    await expectKpi(page, ROWS);
    await expect.poll(() => urlFilters(page)).toEqual({});
    await page.reload();
    await hydrated();
    await expectKpi(page, ROWS);
    await expect(chip).toHaveCount(0);

    // Kembalikan bawaan → Medan lagi, URL tanpa f.
    await page.getByTestId("filter-restore-defaults").click();
    await expectKpi(page, medan);
    await expect.poll(() => urlFilters(page)).toBeNull();

    // Pilihan lain di kolom berbawaan: chip tanpa label bawaan.
    await page.goto(
      `${dashboardUrl}?f=${encodeURIComponent(JSON.stringify({ filters: [{ column: "Cabang", op: "in", values: ["Bandung"] }] }))}`,
    );
    await hydrated();
    await expect(chip).toBeVisible();
    await expect(chip.getByTestId("chip-default")).toHaveCount(0);

    // Hapus bawaan dari mode edit (tanpa filter aktif) → dibuka tanpa filter.
    await page.goto(`${dashboardUrl}?mode=edit&f=%7B%7D`);
    await hydrated();
    await expect(page.getByTestId("filter-save-defaults")).toHaveText("Hapus filter bawaan");
    const cleared = page.waitForResponse(
      (r) => r.url().endsWith("/filter-columns") && r.request().method() === "PATCH",
    );
    await page.getByTestId("filter-save-defaults").click();
    expect((await cleared).status()).toBe(200);
    await page.goto(dashboardUrl);
    await hydrated();
    await expectKpi(page, ROWS);
    await expect(chip).toHaveCount(0);
  });

  test("T-zm9k: 'Mulai dengan dashboard contoh' → ≥ 4 widget berisi data + ≥ 2 kolom filter tanpa langkah tambahan", async ({
    page,
  }) => {
    await page.goto(`/dashboards/baru?dataset=${datasetIdShared}`);
    await page.getByLabel("Nama dashboard").fill("Contoh otomatis");
    await page.getByTestId("dashboard-starter").check();
    await page.getByRole("button", { name: "Buat dashboard" }).click();
    await expect(page).toHaveURL(/\?mode=edit$/);
    const widgets = page.getByTestId("widget");
    await expect(widgets).toHaveCount(5);
    await expect(page.getByRole("heading", { name: "Total Omzet", exact: true })).toBeVisible();
    await expect(widgetTitled(page, "Jumlah baris").getByTestId("kpi-value")).toHaveAttribute(
      "title",
      /5\.000/,
    );
    await expect(page.getByTestId("widget-error")).toHaveCount(0);
    // Kolom filter: Tanggal + Cabang (Kode 5.000 nilai unik tidak dipilih).
    const bar = page.getByTestId("filter-bar");
    await expect(bar.locator("[data-testid=filter-slicer][data-column=Cabang]")).toHaveCount(1);
    await expect(bar.getByRole("button", { name: /^Tanggal/ })).toHaveCount(1);
    await expect(bar.locator("[data-column=Kode]")).toHaveCount(0);
    // Tanpa centang: dashboard kosong seperti sebelumnya.
    await page.goto(`/dashboards/baru?dataset=${datasetIdShared}`);
    await page.getByLabel("Nama dashboard").fill("Kosong");
    await page.getByRole("button", { name: "Buat dashboard" }).click();
    await expect(page).toHaveURL(/\?mode=edit$/);
    await expect(page.getByTestId("widget")).toHaveCount(0);
  });

  test("T-pxnn: kotak cari pintar — menu Tambah kolom filter (Enter menambah hasil pertama) dan Select di panel widget", async ({
    page,
  }) => {
    await page.goto(`${dashboardUrl}?mode=edit`);
    await expect(page.locator("[data-testid=dashboard-canvas][data-hydrated]")).toHaveCount(1);

    // Menu Tambah kolom filter (kartu pengaturan): kotak cari langsung fokus; "omz" → hanya Omzet.
    const section = page.getByTestId("dashboard-filter-columns");
    await section.getByRole("button", { name: "Tambah kolom filter" }).click();
    const box = page.getByTestId("menu-search");
    await expect(box).toBeFocused();
    await box.pressSequentially("omz");
    await expect(page.getByRole("menuitem")).toHaveCount(1);
    await expect(page.getByRole("menuitem")).toContainText("Omzet");
    const saved = page.waitForResponse(
      (r) => r.url().endsWith("/filter-columns") && r.request().method() === "PATCH",
    );
    await box.press("Enter");
    expect((await saved).status()).toBe(200);
    const items = section.getByRole("list", { name: "Kolom filter" }).getByRole("listitem");
    await expect(items.filter({ hasText: "Omzet" })).toHaveCount(1);
    // Tanpa hasil → pesan; Esc menutup.
    await section.getByRole("button", { name: "Tambah kolom filter" }).click();
    await expect(box).toBeFocused();
    await box.pressSequentially("zzz");
    await expect(page.getByText("Tidak ada yang cocok dengan “zzz”.")).toBeVisible();
    await box.press("Escape");
    await expect(box).toHaveCount(0);
    // Pulihkan kolom filter fixture.
    const removed = page.waitForResponse(
      (r) => r.url().endsWith("/filter-columns") && r.request().method() === "PATCH",
    );
    await section.getByRole("button", { name: "Hapus kolom filter Omzet" }).click();
    expect((await removed).status()).toBe(200);

    // Select biasa (Nilai di panel KPI): kotak cari fokus, "baris" menyaring, Enter memilih.
    await page.getByRole("button", { name: `Pengaturan ${KPI}` }).click();
    const panel = page.getByTestId("widget-panel");
    const nilai = panel.getByLabel("Nilai", { exact: true });
    const before = (await nilai.textContent())?.trim();
    await nilai.click();
    const search = page.getByTestId("select-search");
    await expect(search).toBeFocused();
    // Enter tanpa kata kunci tidak mengganti nilai (review T-pxnn F1): hanya menyorot pilihan saat ini.
    await search.press("Enter");
    await expect(page.getByRole("option", { name: before! })).toBeFocused();
    // Mengetik saat fokus di item tetap mengisi kotak cari; ↑ di item pertama kembali ke kotak cari.
    await page.keyboard.type("bar");
    await expect(search).toBeFocused();
    await expect(search).toHaveValue("bar");
    await search.press("ArrowDown");
    await page.keyboard.press("ArrowUp");
    await expect(search).toBeFocused();
    await search.fill("");
    await search.pressSequentially("baris");
    await expect(page.getByRole("option", { name: "Jumlah baris", exact: true })).toBeVisible();
    await expect(page.getByRole("option", { name: /^Total/ })).toHaveCount(0);
    await search.press("Enter");
    await expect(search).toHaveCount(0);
    await expect(panel.getByLabel("Nilai", { exact: true })).toContainText("Jumlah baris");
    await expectKpi(page, ROWS);
  });
});
