import { execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  apiLogin,
  pageFor,
  registerAndVerify,
  startWorker,
  stopWorker,
  uniqueEmail,
} from "./helpers";

/*
 * T-073 widget terikat pivot tersimpan (project "widgets"): pivot, bar, line, pie, KPI, dan tabel di
 * satu dashboard memakai SATU pivot tersimpan lewat PATCH widget { type, spec: tampilan, savedPivotId }.
 * Pemilik dan viewer melihat nilai yang sama; pemilik mengubah pivot tersimpan (skrip, UI menyusul
 * T-074) → muat berikutnya keenam kartu memakai definisi baru tanpa menunggu TTL; nilai yang dihapus →
 * pesan per kartu "Pilih ulang nilai…", kartu lain tetap. Viewer tidak bisa mengikat (403).
 * Data: A 1000/600, B 2000/1500, C 500/100 → Margin = 1300/3500 = 37,1%; setelah edit (÷ Biaya)
 * 1300/2200 = 59,1%.
 */
test.describe.configure({ mode: "serial" });

const OWNER = uniqueEmail("bound-owner");
const VIEWER = uniqueEmail("bound-viewer");
const dir = mkdtempSync(join(tmpdir(), "dd-e2e-bound-"));
let worker: ChildProcess | null = null;
let datasetId = "";
let dashboardId = "";
let savedPivotId = "";
const widgetIds: Record<string, string> = {};

const margin = (den: string) => ({
  kind: "calc",
  label: "Margin",
  expr: {
    op: "div",
    args: [
      {
        op: "sub",
        args: [
          { agg: "sum", column: "Pendapatan" },
          { agg: "sum", column: "Biaya" },
        ],
      },
      { agg: "sum", column: den },
    ],
  },
  format: { style: "percent", decimals: 1 },
});
const SPEC = {
  rows: [{ column: "Wilayah" }],
  values: [{ agg: "sum", column: "Pendapatan" }, margin("Pendapatan")],
  sort: "label_asc",
  format: { style: "auto", decimals: 0 },
  totals: true,
  subtotals: false,
};
const EDITED = { ...SPEC, values: [{ agg: "sum", column: "Biaya" }, margin("Biaya")] };
const DISPLAY: Record<string, { type: string; spec: unknown }> = {
  "Pivot terikat": { type: "pivot", spec: { sort: "label_asc", totals: true, subtotals: false } },
  "Batang terikat": {
    type: "bar",
    spec: { dimension: "row", value: 0, sort: "label_asc", topN: 10, crossFilter: true },
  },
  "Garis terikat": {
    type: "line",
    spec: { dimension: "row", value: 0, sort: "label_desc", topN: 30 },
  },
  "Pai terikat": { type: "pie", spec: { dimension: "row", value: 0, sort: "value_desc", topN: 5 } },
  "KPI terikat": { type: "kpi", spec: { value: 1 } },
  "Tabel terikat": { type: "table", spec: { sort: "label_asc", totals: true } },
};

const card = (page: Page, title: string) =>
  page.getByTestId("widget").filter({ has: page.getByRole("heading", { name: title }) });
const fixture = (...args: string[]) =>
  JSON.parse(execFileSync("node", ["scripts/dev-saved-pivot-fixture.mjs", ...args]).toString());

async function expectValues(page: Page, kpi: string, valueHeader: string) {
  await page.goto(`/dashboards/${dashboardId}`);
  await expect(card(page, "KPI terikat").getByTestId("kpi-value")).toHaveText(kpi);
  const pivot = card(page, "Pivot terikat");
  await expect(pivot.getByRole("columnheader", { name: valueHeader })).toBeVisible();
  await expect(pivot.locator("tfoot")).toContainText(kpi);
  const table = card(page, "Tabel terikat");
  await expect(table.getByRole("columnheader", { name: valueHeader })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Margin" })).toBeVisible();
  for (const title of ["Batang terikat", "Garis terikat", "Pai terikat"]) {
    await expect(card(page, title).locator("canvas, svg").first()).toBeVisible();
    await expect(card(page, title).getByTestId("widget-error")).toHaveCount(0);
  }
}

test.describe("widget terikat pivot tersimpan (T-073)", () => {
  test.beforeAll(async ({ browser, request, baseURL }) => {
    test.setTimeout(180_000);
    execFileSync("node", ["scripts/dev-reset-ratelimit.mjs", "register:ip", "verify:ip"]);
    const p = await browser.newPage();
    await registerAndVerify(p, request, OWNER);
    await registerAndVerify(p, request, VIEWER);
    await apiLogin(p, OWNER);
    worker = await startWorker("bound-widgets");
    const csv = join(dir, "laba-wilayah.csv");
    writeFileSync(
      csv,
      [
        "Wilayah;Pendapatan;Biaya",
        "Wilayah A;1000;600",
        "Wilayah B;2000;1500",
        "Wilayah C;500;100",
      ].join("\n"),
    );
    await p.goto("/datasets/baru");
    await p.getByLabel("Nama dataset").fill(`Terikat ${Date.now()}`);
    await p.getByRole("button", { name: "Buat dataset" }).click();
    await expect(p).toHaveURL(/\/datasets\/[a-z0-9]{20,32}\?created=1$/);
    datasetId = new URL(p.url()).pathname.split("/").pop()!;
    await p.getByTestId("upload-input").setInputFiles(csv);
    await expect(p.getByTestId("dataset-schema-link")).toBeVisible({ timeout: 90_000 });
    dashboardId = (
      JSON.parse(
        execFileSync("node", [
          "scripts/dev-share-fixture.mjs",
          OWNER,
          VIEWER,
          "VIEWER",
          datasetId,
        ]).toString(),
      ) as { dashboardId: string }
    ).dashboardId;
    savedPivotId = fixture("create", datasetId, JSON.stringify(SPEC)).savedPivotId;

    // Enam widget lewat API kanvas, lalu diikat lewat PATCH { type, spec: tampilan, savedPivotId }.
    const headers = { origin: baseURL!, "content-type": "application/json" };
    let revision = 0;
    for (const [title, d] of Object.entries(DISPLAY)) {
      const r = await p.request.post(`/api/dashboards/${dashboardId}/widgets`, {
        headers,
        data: { baseRevision: revision, title },
      });
      const j = (await r.json()) as { data: { layoutRevision: number; widget: { id: string } } };
      expect(r.status(), JSON.stringify(j)).toBe(200);
      revision = j.data.layoutRevision;
      widgetIds[title] = j.data.widget.id;
      const b = await p.request.patch(
        `/api/dashboards/${dashboardId}/widgets/${j.data.widget.id}`,
        {
          headers,
          data: { type: d.type, spec: d.spec, savedPivotId },
        },
      );
      expect(b.status(), await b.text()).toBe(200);
    }
    await p.close();
  });

  test.afterAll(async () => {
    await stopWorker(worker);
  });

  test("AC1/AC2: pemilik dan viewer melihat keenam widget dari pivot tersimpan; viewer tidak bisa mengikat", async ({
    browser,
    page,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await apiLogin(page, OWNER);
    await expectValues(page, "37,1%", "Total Pendapatan");
    const viewer = await pageFor(browser, VIEWER);
    await expectValues(viewer, "37,1%", "Total Pendapatan");
    const headers = { origin: baseURL!, "content-type": "application/json" };
    const r = await viewer.request.patch(
      `/api/dashboards/${dashboardId}/widgets/${widgetIds["KPI terikat"]}`,
      { headers, data: { type: "kpi", spec: { value: 0 }, savedPivotId } },
    );
    expect(r.status()).toBe(403);
    // D6: body query viewer hanya { widgetId, dashboardFilters } — savedPivotId/spec → 400.
    const q = await viewer.request.post("/api/query", {
      headers,
      data: { widgetId: widgetIds["KPI terikat"], savedPivotId },
    });
    expect(q.status()).toBe(400);
    await viewer.context().close();
  });

  test("AC1: edit pivot tersimpan → muat berikutnya keenam widget memakai definisi baru", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await apiLogin(page, OWNER);
    await expectValues(page, "37,1%", "Total Pendapatan");
    expect(fixture("edit", savedPivotId, JSON.stringify(EDITED)).revision).toBe(2);
    await expectValues(page, "59,1%", "Total Biaya");
  });

  test("AC4: nilai yang dipilih dihapus dari pivot tersimpan → pesan per kartu, kartu lain tetap", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await apiLogin(page, OWNER);
    fixture("edit", savedPivotId, JSON.stringify({ ...EDITED, values: [EDITED.values[0]] }));
    await page.goto(`/dashboards/${dashboardId}`);
    const kpi = card(page, "KPI terikat");
    await expect(kpi.getByTestId("widget-error")).toContainText(
      "Pilih ulang nilai di pengaturan widget.",
    );
    await expect(
      card(page, "Pivot terikat").getByRole("columnheader", { name: "Total Biaya" }),
    ).toBeVisible();
    await expect(card(page, "Batang terikat").getByTestId("widget-error")).toHaveCount(0);
  });
});
