import { execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { apiLogin, registerAndVerify, startWorker, stopWorker, uniqueEmail } from "./helpers";

/*
 * T-058 kolom sistem "Periode", pemangkasan segmen, dan pemilih periode (worker sungguhan). Dataset
 * Jan–Mar diatur per bulan, lalu April diunggah sebagai periode baru (aktif otomatis):
 *  - AC1/AC3: widget batang "Kelompokkan menurut" → Periode (grain bulan bawaan), label "Jan 2026" …
 *    urut kronologis; kolom filter "Periode" dengan preset "Periode terbaru" → KPI = April saja;
 *  - AC2: query bebas dengan filter Periode → hasil sama dengan menjumlah periode itu (pemangkasan
 *    diuji identik di unit DuckDB, tests/features/query/period-query.test.ts);
 *  - AC4: Lihat data "Periode: Semua ▾" → pilih Februari: grid hanya Februari, jumlah baris = metadata.
 */
test.describe.configure({ mode: "serial" });

const OWNER = uniqueEmail("period-query");
const dir = mkdtempSync(join(tmpdir(), "dd-e2e-period-query-"));
let worker: ChildProcess | null = null;
const SLOW = { timeout: 120_000 };
const CHART = "Nilai per periode";
const KPI = "Total nilai";

const fx = (...args: string[]) =>
  JSON.parse(
    execFileSync("node", ["scripts/dev-upload-fixture.mjs", ...args]).toString(),
  ) as Record<string, unknown>;
const seg = (...args: string[]) =>
  JSON.parse(
    execFileSync(
      "npx",
      [
        "tsx",
        "--conditions=react-server",
        "--env-file-if-exists=.env",
        "scripts/dev-segments.ts",
        ...args,
      ],
      { env: { ...process.env, LOG_LEVEL: "error" } },
    ).toString(),
  ) as unknown;
type Version = { id: string; status: string; active: boolean };
const versions = (datasetId: string) => fx("versions", datasetId) as unknown as Version[];
const csv = (rows: string[]) => `${["kode;Tanggal Kirim;nilai", ...rows].join("\n")}\n`;

async function api(page: Page, baseURL: string, path: string, data: unknown = {}) {
  const res = await page.request.post(path, {
    data: JSON.stringify(data),
    headers: { origin: baseURL, "content-type": "application/json" },
  });
  return { status: res.status(), body: (await res.json()) as Record<string, unknown> };
}

/** Unggahan periode lewat API (init → part → complete), seperti panel unggah. */
async function upload(page: Page, baseURL: string, datasetId: string, name: string, body: string) {
  const file = join(dir, name);
  writeFileSync(file, body);
  const init = await api(page, baseURL, "/api/uploads", {
    datasetId,
    name,
    size: statSync(file).size,
    lastModified: 1,
    mode: "PERIOD",
    baseVersionId: versions(datasetId).find((v) => v.active)!.id,
  });
  expect(init.status, JSON.stringify(init.body)).toBe(200);
  const versionId = String(init.body.versionId);
  const signed = await api(page, baseURL, `/api/uploads/${versionId}/parts`, { partNumbers: [1] });
  const url = (signed.body.urls as { url: string }[])[0]!.url;
  expect((await page.request.put(url, { data: Buffer.from(body) })).status()).toBe(200);
  expect((await api(page, baseURL, `/api/uploads/${versionId}/complete`)).status).toBe(200);
  return versionId;
}

const widgetTitled = (page: Page, title: string) =>
  page.getByTestId("widget").filter({ has: page.getByRole("heading", { name: title }) });

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

async function choose(panel: Locator, label: string, option: RegExp) {
  await panel.getByLabel(label, { exact: true }).click();
  await panel.page().getByRole("option", { name: option }).click();
  await expect(panel.getByTestId("config-status")).toHaveAttribute("data-state", "saved");
}

async function chartRows(page: Page, title: string): Promise<[string, number][]> {
  const chart = widgetTitled(page, title);
  if ((await chart.getByTestId("chart-data").count()) === 0) {
    await chart.getByTestId("widget-data-toggle").click();
  }
  return chart
    .getByTestId("chart-data")
    .locator("tbody tr")
    .evaluateAll((trs) =>
      trs.map((tr) => [
        tr.querySelector("th")!.textContent!.trim(),
        Number(tr.querySelector("td")!.dataset.value),
      ]),
    ) as Promise<[string, number][]>;
}

const digits = (s: string | null) => Number((s ?? "").replace(/\D/g, ""));
async function expectKpi(page: Page, n: number) {
  const value = widgetTitled(page, KPI).getByTestId("kpi-value");
  await expect
    .poll(async () => digits(await value.getAttribute("title")), { timeout: 30_000 })
    .toBe(n);
}

test.describe("kolom sistem Periode", () => {
  let datasetId = "";
  let dashboardUrl = "";

  test.beforeAll(async ({ browser, request, baseURL }) => {
    test.setTimeout(360_000);
    execFileSync("node", ["scripts/dev-reset-ratelimit.mjs", "register:ip", "verify:ip"]);
    const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await registerAndVerify(p, request, OWNER);
    await apiLogin(p, OWNER);
    worker = await startWorker("period-query");
    await p.goto("/datasets/baru");
    await p.getByLabel("Nama dataset").fill(`Periode query ${Date.now()}`);
    await p.getByRole("button", { name: "Buat dataset" }).click();
    await expect(p).toHaveURL(/\/datasets\/[a-z0-9]{20,32}\?created=1$/, { timeout: 30_000 });
    datasetId = new URL(p.url()).pathname.split("/").pop()!;
    const first = join(dir, "jan-mar.csv");
    writeFileSync(
      first,
      csv([
        "A;2026-01-05;10",
        "B;2026-01-20;20",
        "C;2026-02-03;30",
        "D;2026-02-28;40",
        "E;2026-03-15;50",
      ]),
    );
    await p.getByTestId("upload-input").setInputFiles(first);
    await expect(p.getByTestId("dataset-schema-link")).toBeVisible(SLOW);
    await p.getByTestId("period-link").click();
    await p.getByTestId("period-review").click();
    await expect(p.getByTestId("period-preview")).toBeVisible(SLOW);
    await p.getByTestId("period-apply").click();
    await expect.poll(() => versions(datasetId).length, SLOW).toBe(2);
    await expect.poll(() => versions(datasetId)[0]!.active, SLOW).toBe(true);
    const april = await upload(
      p,
      baseURL!,
      datasetId,
      "april.csv",
      csv(["F;2026-04-02;60", "G;2026-04-30;70"]),
    );
    await expect
      .poll(() => versions(datasetId).find((v) => v.id === april)?.active, SLOW)
      .toBe(true);

    // Dashboard: batang per Periode + KPI total nilai + kolom filter Periode.
    await p.goto(`/dashboards/baru?dataset=${datasetId}`);
    await p.getByLabel("Nama dashboard").fill("Ringkasan periode");
    await p.getByRole("button", { name: "Buat dashboard" }).click();
    await expect(p).toHaveURL(/\?mode=edit$/);
    dashboardUrl = p.url().replace("?mode=edit", "");
    const bar = await addWidget(p, CHART, "Batang");
    await choose(bar, "Kelompokkan menurut", /^Periode ·/);
    await expect(bar.getByLabel("Rentang waktu", { exact: true })).toContainText("Per bulan");
    await choose(bar, "dari kolom", /^nilai ·/);
    const kpi = await addWidget(p, KPI, "Angka");
    await choose(kpi, "dari kolom", /^nilai ·/);
    const section = p.getByTestId("dashboard-filter-columns");
    await section.getByRole("button", { name: "Tambah kolom filter" }).click();
    const saved = p.waitForResponse(
      (r) => r.url().endsWith("/filter-columns") && r.request().method() === "PATCH",
    );
    await p.getByRole("menuitem", { name: /^Periode/ }).click();
    expect((await saved).status()).toBe(200);
    await p.close();
  });

  test.afterAll(async () => {
    await stopWorker(worker);
  });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await apiLogin(page, OWNER);
  });

  test("AC1/AC3: dimensi Periode berlabel 'Jan 2026' kronologis; preset 'Periode terbaru'", async ({
    page,
  }) => {
    await page.goto(dashboardUrl);
    await expectKpi(page, 280);
    await expect
      .poll(async () => (await chartRows(page, CHART)).map((r) => r[0]), SLOW)
      .toEqual(["Jan 2026", "Feb 2026", "Mar 2026", "Apr 2026"]);
    expect((await chartRows(page, CHART)).map((r) => r[1])).toEqual([30, 70, 50, 130]);

    const control = page.locator('[data-testid=filter-date][data-column="Periode"]');
    await control.click();
    const latest = page.locator("[data-testid=filter-date-preset][data-preset=latest_period]");
    await latest.click();
    await expect(latest).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-testid=filter-chip][data-column="Periode"]')).toContainText(
      "Periode terbaru",
    );
    await expectKpi(page, 130);
  });

  test("AC2: query bebas dengan filter Periode = jumlah periode itu", async ({ page, baseURL }) => {
    const active = versions(datasetId).find((v) => v.active)!.id;
    const sheetId = (seg("periods", active) as { sheets: { id: string }[] }).sheets[0]!.id;
    const q = async (filters: unknown[]) => {
      const res = await page.request.post("/api/query", {
        data: {
          datasetId,
          spec: {
            sheetId,
            dimensions: [{ column: "Periode", timeGrain: "month" }],
            measures: [{ agg: "sum", column: "nilai" }],
            filters,
          },
        },
        headers: { Origin: baseURL! },
      });
      expect(res.status(), await res.text()).toBe(200);
      return ((await res.json()) as { rows: unknown[][] }).rows;
    };
    expect(await q([])).toEqual([
      ["2026-01-01", 30],
      ["2026-02-01", 70],
      ["2026-03-01", 50],
      ["2026-04-01", 130],
    ]);
    expect(
      await q([{ column: "Periode", op: "between", values: ["2026-02-01", "2026-03-01"] }]),
    ).toEqual([
      ["2026-02-01", 70],
      ["2026-03-01", 50],
    ]);
  });

  test("AC4: Lihat data 'Periode: Semua ▾' → Februari: grid dibatasi, total = metadata", async ({
    page,
  }) => {
    await page.goto(`/datasets/${datasetId}/data`);
    const picker = page.getByTestId("grid-period-picker");
    await expect(picker).toHaveText(/Periode: Semua/);
    await expect(page.getByTestId("grid-status-rows")).toHaveText(/dari 7$/, SLOW);
    await picker.click();
    const options = page.getByTestId("grid-period-option");
    await expect(options).toHaveText([
      /Semua periode\s*7 baris/,
      /Januari 2026\s*2 baris/,
      /Februari 2026\s*2 baris/,
      /Maret 2026\s*1 baris/,
      /April 2026\s*2 baris/,
    ]);
    await page.locator('[data-testid=grid-period-option][data-period="2026-02"]').click();
    await expect(page).toHaveURL(/periode=2026-02/);
    await expect(picker).toHaveText(/Periode: Februari 2026/);
    await expect(page.getByTestId("grid-status-rows")).toHaveText("Baris 1–2 dari 2", SLOW);
    const grid = page.getByTestId("sheet-grid");
    await expect(
      grid.getByText("2026-02-03").or(grid.getByText("3 Feb 2026")).first(),
    ).toBeVisible();
  });
});
