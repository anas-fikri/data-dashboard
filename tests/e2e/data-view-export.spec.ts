import { execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page, type Request } from "@playwright/test";
import { createSaxParser } from "../../src/lib/xlsx/parser";
import type { RawValue } from "../../src/lib/xlsx/types";
import { pageFor, registerAndVerify, startWorker, stopWorker, uniqueEmail } from "./helpers";

/*
 * T-046 "Unduh tampilan" Lihat data di atas stack sungguhan (CSV 1.000 baris → worker → typed parquet →
 * grid → POST /api/exports → worker ekspor → storage → unduh):
 *  AC1 kolom terlihat (satu disembunyikan), urut turun, cari → file CSV/XLSX = baris grid, kedaluwarsa
 *      60 menit, AuditLog dataset.sheet.export;
 *  AC2 worker dengan EXPORT_MAX_ROWS=500: tampilan 1.000 baris → dialog menjelaskan batas + saran saring,
 *      tanpa file (tidak pernah dipotong); teks batas Excel 1.048.575 di dialog XLSX;
 *  AC3 pengguna tanpa akses pemilik/editor → 403 FORBIDDEN.
 */
test.describe.configure({ mode: "serial" });

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const OWNER = uniqueEmail("lihat-unduh");
const STRANGER = uniqueEmail("lihat-unduh-asing");
const ROWS = 1000;
const LIMIT = 500;
const CITIES = ["Jakarta", "Bandung", "Surabaya"];
const dir = mkdtempSync(join(tmpdir(), "dd-e2e-unduh-"));
let worker: ChildProcess | null = null;
let datasetId = "";
let sheetId = "";
let versionId = "";

/** Baris i (1-based). Kota baris 2 berawalan = (Bandung-lah yang dicari: i % 3 === 1). */
const city = (i: number) => (i === 1 ? "=Bandung+1" : CITIES[i % 3]!);
const amount = (i: number) => ((i * 37) % 101) - 50 + 0.25;
const qty = (i: number) => String(i * 3);
const date = (i: number) => `2026-03-${String((i % 28) + 1).padStart(2, "0")}`;

function csv(): string {
  const lines = ["Kota;Jumlah;Qty;Tanggal;Kode"];
  for (let i = 1; i <= ROWS; i++) lines.push(`${city(i)};${amount(i)};${qty(i)};${date(i)};K${i}`);
  const path = join(dir, "unduh.csv");
  writeFileSync(path, `${lines.join("\n")}\n`);
  return path;
}

/** Tampilan uji: cari "bandung", urut Jumlah turun (lalu baris asli), kolom Qty disembunyikan. */
function expected(): string[][] {
  const ids = Array.from({ length: ROWS }, (_, k) => k + 1).filter((i) =>
    city(i).toLowerCase().includes("bandung"),
  );
  ids.sort((a, b) => amount(b) - amount(a) || a - b);
  // CSV: teks berawalan formula diberi ' (netralisasi), angka/tanggal apa adanya.
  const text = (s: string) => (/^[=+\-@]/.test(s) ? `'${s}` : s);
  return ids.map((i) => [text(city(i)), String(amount(i)), date(i), `K${i}`]);
}

/** CSV RFC 4180 sederhana (koma, kutip ganda, LF). */
function parseCsv(t: string): string[][] {
  const rows: string[][] = [];
  for (const line of t
    .replace(/^\uFEFF/, "")
    .trimEnd()
    .split("\n")) {
    const out: string[] = [];
    let i = 0;
    while (i <= line.length) {
      if (line[i] === '"') {
        let v = "";
        i++;
        while (i < line.length) {
          if (line[i] === '"' && line[i + 1] === '"') {
            v += '"';
            i += 2;
          } else if (line[i] === '"') {
            i++;
            break;
          } else v += line[i++];
        }
        out.push(v);
        i++;
      } else {
        const end = line.indexOf(",", i);
        const stop = end < 0 ? line.length : end;
        out.push(line.slice(i, stop));
        i = stop + 1;
      }
    }
    rows.push(out);
  }
  return rows;
}

const grid = (page: Page) => page.getByTestId("sheet-grid");
const cell = (page: Page, row: number, col: string) =>
  grid(page).locator(`.ag-row[row-index="${row}"] [col-id="${col}"]`).first();
const header = (page: Page, col: string) => grid(page).locator(`.ag-header-cell[col-id="${col}"]`);
const sortTarget = (page: Page, col: string) => header(page, col).getByTestId("grid-header-sort");
const isCreate = (r: Request) => r.url().endsWith("/api/exports") && r.method() === "POST";

async function openGrid(page: Page) {
  const rows = page.waitForRequest((r) => /\/api\/sheets\/[a-z0-9]+\/rows$/.test(r.url()));
  await page.goto(`/datasets/${datasetId}/data`);
  const req = await rows;
  sheetId = req.url().split("/").at(-2)!;
  versionId = (req.postDataJSON() as { versionId: string }).versionId;
  await expect(cell(page, 0, "c5")).toHaveText("K1", { timeout: 30_000 });
}

/** Tampilan uji: sembunyikan Qty, urut Jumlah turun, cari "bandung". */
async function applyView(page: Page) {
  await page.getByTestId("grid-columns-button").click();
  await page.getByRole("checkbox", { name: /Qty/ }).uncheck();
  await page.keyboard.press("Escape");
  await expect(header(page, "c3")).toHaveCount(0);
  await sortTarget(page, "c2").click();
  await sortTarget(page, "c2").click();
  await expect(header(page, "c2")).toHaveAttribute("aria-sort", "descending");
  await page.getByTestId("grid-search-input").fill("bandung");
  await page.getByTestId("grid-search-input").press("Enter");
  await expect(page.getByTestId("grid-search-count")).toHaveText(
    `Ditemukan di ${expected().length} baris`,
    { timeout: 30_000 },
  );
}

/** Dialog → format → Buat file → unduhan otomatis; file disalin ke `dir`. */
async function downloadView(page: Page, format: "csv" | "xlsx") {
  await page.getByTestId("grid-export-button").click();
  const dialog = page.getByTestId("grid-export-dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByTestId(`grid-export-format-${format}`).check();
  const created = page.waitForResponse((r) => isCreate(r.request()));
  const download = page.waitForEvent("download", { timeout: 90_000 });
  await dialog.getByTestId("grid-export-start").click();
  const res = await created;
  const json = (await res.json()) as { exportId: string };
  expect(res.status(), JSON.stringify(json)).toBe(202);
  const dl = await download;
  expect(await dl.failure()).toBeNull();
  const path = join(dir, `${json.exportId}.${format}`);
  await dl.saveAs(path);
  await expect(dialog.getByTestId("export-status")).toContainText("Siap diunduh");
  return {
    id: json.exportId,
    body: res.request().postDataJSON() as Record<string, unknown>,
    name: dl.suggestedFilename(),
    path,
    dialog,
  };
}

test.describe("Lihat data: Unduh tampilan", () => {
  test.beforeAll(async ({ browser, request }) => {
    test.setTimeout(240_000);
    execFileSync("node", ["scripts/dev-reset-ratelimit.mjs", "register:ip"]);
    for (const email of [OWNER, STRANGER]) {
      const p = await browser.newPage();
      await registerAndVerify(p, request, email);
      await p.close();
    }
    worker = await startWorker("data-view-export", { EXPORT_MAX_ROWS: String(LIMIT) });
    const page = await pageFor(browser, OWNER);
    await page.goto("/datasets/baru");
    await page.getByLabel("Nama dataset").fill(`Lihat unduh ${Date.now()}`);
    await page.getByRole("button", { name: "Buat dataset" }).click();
    await expect(page).toHaveURL(/\/datasets\/[a-z0-9]{20,32}\?created=1$/, { timeout: 30_000 });
    datasetId = new URL(page.url()).pathname.split("/").pop()!;
    await page.getByTestId("upload-input").setInputFiles(csv());
    await expect(page.getByTestId("dataset-data-link")).toBeVisible({ timeout: 120_000 });
    await page.close();
  });

  test.afterAll(async () => {
    await stopWorker(worker);
  });

  test("AC1 CSV: kolom terlihat, urut, cari = grid; kedaluwarsa 60 menit; AuditLog tercatat", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const page = await pageFor(browser, OWNER);
    await openGrid(page);
    await applyView(page);
    const want = expected();
    // Baris pertama grid = baris pertama file.
    await expect(cell(page, 0, "c5")).toHaveText(want[0]![3]!);
    const r = await downloadView(page, "csv");
    expect(r.body).toEqual({
      sheetId,
      versionId,
      format: "csv",
      cols: [1, 2, 4, 5],
      sort: [{ pos: 2, dir: "desc" }],
      search: { text: "bandung", cols: [1, 5] },
    });
    expect(r.name).toMatch(/\.csv$/);
    const rows = parseCsv(readFileSync(r.path, "utf8"));
    expect(rows[0]).toEqual(["Kota", "Jumlah", "Tanggal", "Kode"]);
    expect(rows.slice(1)).toEqual(want);

    const status = (await (await page.request.get(`/api/exports/${r.id}`)).json()) as {
      state: string;
      rows: number;
      expiresAt: string;
    };
    expect(status).toMatchObject({ state: "done", rows: want.length });
    const left = Date.parse(status.expiresAt) - Date.now();
    expect(left).toBeGreaterThan(55 * 60_000);
    expect(left).toBeLessThanOrEqual(60 * 60_000);

    const audits = JSON.parse(
      execFileSync("node", ["scripts/dev-audit-log.mjs", "dataset", datasetId]).toString(),
    ) as { action: string; meta: Record<string, unknown> }[];
    expect(audits.filter((a) => a.action === "dataset.sheet.export")).toEqual([
      expect.objectContaining({
        meta: { sheetId, exportId: r.id, format: "csv", rows: want.length, role: "OWNER" },
      }),
    ]);
    await page.close();
  });

  test("AC1 XLSX: baris dan urutan sama, teks formula tetap teks; dialog menyebut batas Excel", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const page = await pageFor(browser, OWNER);
    await openGrid(page);
    await applyView(page);
    await page.getByTestId("grid-export-button").click();
    const dialog = page.getByTestId("grid-export-dialog");
    await dialog.getByTestId("grid-export-format-xlsx").check();
    await expect(dialog.getByTestId("grid-export-limit")).toContainText(
      "File Excel (XLSX) memuat paling banyak 1.048.575 baris data.",
    );
    await page.keyboard.press("Escape");
    const r = await downloadView(page, "xlsx");
    const rows: RawValue[][] = [];
    await createSaxParser().parse(r.path, { sheetNames: [], tmpDir: dir }, (_s, _n, v) =>
      rows.push([...v]),
    );
    const want = expected();
    expect(rows[0]).toEqual(["Kota", "Jumlah", "Tanggal", "Kode"]);
    expect(rows.length).toBe(want.length + 1);
    expect(rows.slice(1).map((x) => [x[0], Number(x[1]), x[3]])).toEqual(
      want.map((w) => [w[0]!.replace(/^'/, ""), Number(w[1]), w[3]]),
    );
    await page.close();
  });

  test("AC2: tampilan melewati batas → dialog menjelaskan batas + saran saring, tanpa file", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const page = await pageFor(browser, OWNER);
    await openGrid(page);
    await page.getByTestId("grid-export-button").click();
    const dialog = page.getByTestId("grid-export-dialog");
    await expect(dialog.getByTestId("grid-export-summary")).toContainText("1.000 baris × 5 kolom");
    await dialog.getByTestId("grid-export-format-csv").check();
    let downloads = 0;
    page.on("download", () => downloads++);
    await dialog.getByTestId("grid-export-start").click();
    const error = dialog.getByTestId("export-error");
    await expect(error).toHaveAttribute("data-code", "EXPORT_TOO_LARGE", { timeout: 60_000 });
    await expect(error).toContainText(
      `Tampilan ini 1.000 baris, melebihi batas unduhan ${LIMIT} baris.`,
    );
    await expect(error).toContainText("file tidak pernah dipotong");
    await expect(error).toContainText("Saring kolom");
    expect(downloads).toBe(0);
    await page.close();
  });

  test("AC3: pengguna tanpa peran pemilik/editor → 403 FORBIDDEN", async ({ browser }) => {
    const page = await pageFor(browser, STRANGER);
    const res = await page.request.post("/api/exports", {
      headers: { Origin: BASE },
      data: { sheetId, versionId, format: "csv", cols: [1, 2] },
    });
    expect(res.status()).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe("FORBIDDEN");
    await page.close();
  });
});
