import { execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { pageFor, registerAndVerify, startWorker, stopWorker, uniqueEmail } from "./helpers";

/*
 * T-045 "Lihat data": panel Isi sel (AC1), salin sel ke Excel (AC2), salin baris lewat nomor baris +
 * tawaran Unduh tampilan (AC3), dan ringkasan kolom angka = widget KPI setara (AC4). Data sungguhan
 * (CSV 1.200 baris → worker → typed parquet); papan klip dibaca lewat izin clipboard Chromium.
 */
test.describe.configure({ mode: "serial" });

const OWNER = uniqueEmail("lihat-salin");
const ROWS = 1200;
const CITIES = ["Jakarta", "Bandung", "Surabaya"];
const LONG = `${"x".repeat(600)}AKHIR`;
const dir = mkdtempSync(join(tmpdir(), "dd-e2e-salin-"));
let worker: ChildProcess | null = null;
let datasetId = "";

/** Baris i (1-based). Kota baris 1–2 berawalan = dan -; Qty baris 7 'abc' (gagal cast bilangan bulat). */
const city = (i: number) => (i === 1 ? "=SUM(1)" : i === 2 ? "-cabang" : CITIES[i % 3]!);
const amount = (i: number) => ((i * 37) % 101) - 50 + 0.25;
const qty = (i: number) => (i === 7 ? "abc" : String(i));
const day = (i: number) => (i % 28) + 1;
const date = (i: number) => `2026-03-${String(day(i)).padStart(2, "0")}`;
const note = (i: number) => (i === 3 ? LONG : `catatan ${i}`);

function csv(): string {
  const lines = ["Kota;Jumlah;Qty;Tanggal;Catatan;Kode"];
  for (let i = 1; i <= ROWS; i++) {
    lines.push(`${city(i)};${amount(i)};${qty(i)};${date(i)};${note(i)};K${i}`);
  }
  const path = join(dir, "salin.csv");
  writeFileSync(path, `${lines.join("\n")}\n`);
  return path;
}

const grid = (page: Page) => page.getByTestId("sheet-grid");
const cell = (page: Page, row: number, col: string) =>
  grid(page).locator(`.ag-row[row-index="${row}"] [col-id="${col}"]`).first();
const rownum = (page: Page, row: number) =>
  grid(page).locator(`.ag-row[row-index="${row}"] .ag-grid-pinned-left-cells [col-id="n"]`);
const comma = (n: number) => String(n).replace(".", ",");

async function openGrid(page: Page) {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`/datasets/${datasetId}/data`);
  await expect(cell(page, 0, "c6")).toHaveText("K1", { timeout: 30_000 });
}

const clipboard = (page: Page) => page.evaluate(() => navigator.clipboard.readText());
const setClipboard = (page: Page, t: string) =>
  page.evaluate((v) => navigator.clipboard.writeText(v), t);

test.describe("Lihat data: Isi sel, salin, ringkasan kolom", () => {
  test.beforeAll(async ({ browser, request }) => {
    test.setTimeout(240_000);
    execFileSync("node", ["scripts/dev-reset-ratelimit.mjs", "register:ip"]);
    const p = await browser.newPage();
    await registerAndVerify(p, request, OWNER);
    await p.close();
    worker = await startWorker("data-view-copy");
    const page = await pageFor(browser, OWNER);
    await page.goto("/datasets/baru");
    await page.getByLabel("Nama dataset").fill(`Lihat salin ${Date.now()}`);
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

  test("AC1: F2/Enter membuka Isi sel — isi penuh, nilai asli gagal cast, sumber; fokus kembali", async ({
    browser,
  }) => {
    const page = await pageFor(browser, OWNER);
    await openGrid(page);
    const panel = page.getByTestId("grid-cell-panel");

    // Teks terpotong (605 karakter) di baris 3 kolom Catatan (E).
    await expect(cell(page, 2, "c5")).toHaveText(`${"x".repeat(500)}…`);
    await cell(page, 2, "c5").click();
    await page.keyboard.press("F2");
    await expect(panel.getByRole("heading", { name: "Isi sel E3: Catatan" })).toBeVisible();
    await expect(panel.getByTestId("grid-cell-value")).toHaveText(LONG);
    await expect(panel).toContainText("605 karakter");
    // Baris fisik file = baris data + 1 (judul di baris 1).
    await expect(panel.getByTestId("grid-cell-source")).toHaveText("salin.csv · baris 4");
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(cell(page, 2, "c5")).toBeFocused();

    // Sel gagal cast: Qty 'abc' di baris 7 (C7) lewat Enter.
    await expect(cell(page, 6, "c3")).toHaveText("");
    await cell(page, 6, "c3").click();
    await page.keyboard.press("Enter");
    await expect(panel.getByTestId("grid-cell-castfail")).toContainText(
      "Tidak terbaca sebagai bilangan bulat",
    );
    await expect(panel.getByTestId("grid-cell-raw")).toHaveText("abc");
    await expect(panel.getByTestId("grid-cell-source")).toHaveText("salin.csv · baris 8");
    await panel.getByRole("button", { name: "Tutup Isi sel" }).click();
    await expect(cell(page, 6, "c3")).toBeFocused();
    await page.close();
  });

  test("AC2: Ctrl/Cmd+C pada sel — angka tanpa ribuan, desimal koma/titik, tanggal ISO, teks penuh", async ({
    browser,
  }) => {
    const page = await pageFor(browser, OWNER);
    await openGrid(page);
    await page.getByTestId("grid-decimal-koma").click();
    await expect(page.getByTestId("grid-decimal-koma")).toHaveAttribute("aria-pressed", "true");

    await cell(page, 1, "c2").click();
    await page.keyboard.press("ControlOrMeta+c");
    await expect.poll(() => clipboard(page)).toBe(comma(amount(2)));

    await page.getByTestId("grid-decimal-titik").click();
    await cell(page, 1, "c2").click();
    await page.keyboard.press("ControlOrMeta+c");
    await expect.poll(() => clipboard(page)).toBe(String(amount(2)));

    await cell(page, 3, "c4").click();
    await page.keyboard.press("ControlOrMeta+c");
    await expect.poll(() => clipboard(page)).toBe(date(4));

    // Teks terpotong di grid → isi penuh diambil dari server.
    await cell(page, 2, "c5").click();
    await page.keyboard.press("ControlOrMeta+c");
    await expect.poll(() => clipboard(page)).toBe(LONG);

    // Teks berawalan = dinetralkan juga untuk salin satu sel.
    await cell(page, 0, "c1").click();
    await page.keyboard.press("ControlOrMeta+c");
    await expect.poll(() => clipboard(page)).toBe("'=SUM(1)");
    await page.close();
  });

  test("AC3: pilih baris lewat nomor baris → TSV + judul, teks = + - @ dinetralkan, negatif utuh; > 1.000 → Unduh tampilan", async ({
    browser,
  }) => {
    const page = await pageFor(browser, OWNER);
    await openGrid(page);
    await page.getByTestId("grid-decimal-koma").click();

    await rownum(page, 0).click();
    await rownum(page, 1).click({ modifiers: ["Shift"] });
    await expect(page.getByTestId("grid-selection")).toContainText("2 baris dipilih (baris 1–2)");
    await page.keyboard.press("ControlOrMeta+c");
    const tsv = [
      "Kota\tJumlah\tQty\tTanggal\tCatatan\tKode",
      `'=SUM(1)\t${comma(amount(1))}\t1\t${date(1)}\tcatatan 1\tK1`,
      `'-cabang\t${comma(amount(2))}\t2\t${date(2)}\tcatatan 2\tK2`,
    ].join("\r\n");
    await expect.poll(() => clipboard(page)).toBe(tsv);
    expect(amount(1)).toBeLessThan(0);

    // Keyboard: Escape melepas pilihan; Shift+Spasi memilih baris sel terfokus.
    await cell(page, 4, "c2").click();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("grid-selection")).toBeHidden();
    await page.keyboard.press("Shift+Space");
    await expect(page.getByTestId("grid-selection")).toContainText("1 baris dipilih");
    await page.getByTestId("grid-selection-copy").click();
    await expect
      .poll(() => clipboard(page))
      .toBe(
        `Kota\tJumlah\tQty\tTanggal\tCatatan\tKode\r\n${city(5)}\t${comma(amount(5))}\t5\t${date(5)}\tcatatan 5\tK5`,
      );

    // > 1.000 baris: tawaran Unduh tampilan, papan klip tidak ditimpa.
    await rownum(page, 0).click();
    await page.evaluate(() =>
      (window as unknown as { __ddGrid: { goTo: (n: number) => void } }).__ddGrid.goTo(1101),
    );
    await expect(rownum(page, 1100)).toHaveText("1.101");
    await rownum(page, 1100).click({ modifiers: ["Shift"] });
    await expect(page.getByTestId("grid-selection")).toContainText("1.101 baris dipilih");
    await expect(page.getByTestId("grid-copy-offer")).toContainText("Unduh tampilan");
    await expect(page.getByTestId("grid-selection-copy")).toHaveCount(0);
    await setClipboard(page, "lama");
    await cell(page, 1100, "c2").click();
    await page.keyboard.press("ControlOrMeta+c");
    await page.waitForTimeout(500);
    expect(await clipboard(page)).toBe("lama");
    await page.close();
  });

  test("AC4: kolom angka terfokus → Jumlah, Rata-rata, Min, Maks, Hitung atas baris tersaring = KPI", async ({
    browser,
    baseURL,
  }) => {
    const page = await pageFor(browser, OWNER);
    await openGrid(page);
    const statsResp = () =>
      page.waitForResponse((r) => r.url().includes("/stats") && r.request().method() === "POST");

    const first = statsResp();
    await cell(page, 0, "c2").click();
    const r1 = await first;
    const sheetId = /\/api\/sheets\/([a-z0-9]+)\/stats/.exec(r1.url())![1]!;
    const s1 = (await r1.json()) as Record<string, number>;
    await expect(page.getByTestId("grid-stats")).toContainText(
      `Hitung ${ROWS.toLocaleString("id-ID")}`,
    );

    const kpi = async (filters: unknown[]) => {
      const res = await page.request.post("/api/query", {
        data: {
          datasetId,
          spec: {
            sheetId,
            measures: ["sum", "avg", "min", "max", "count"].map((agg) => ({
              agg,
              column: "Jumlah",
            })),
            filters,
          },
        },
        headers: { Origin: baseURL! },
      });
      expect(res.status(), await res.text()).toBe(200);
      return ((await res.json()) as { rows: number[][] }).rows[0]!;
    };
    const check = (s: Record<string, number>, k: number[]) => {
      expect(s.sum).toBeCloseTo(k[0]!, 6);
      expect(s.avg).toBeCloseTo(k[1]!, 6);
      expect([s.min, s.max, s.count]).toEqual([k[2], k[3], k[4]]);
    };
    check(s1, await kpi([]));
    const all = Array.from({ length: ROWS }, (_, i) => amount(i + 1));
    expect(s1.count).toBe(ROWS);
    expect(s1.sum).toBeCloseTo(
      all.reduce((a, b) => a + b, 0),
      6,
    );

    // Cari "Bandung" → ringkasan dihitung ulang atas baris tersaring (bukan blok yang dimuat).
    const second = statsResp();
    await page.getByTestId("grid-search-input").fill("Bandung");
    await page.getByTestId("grid-search-input").press("Enter");
    const r2 = await second;
    expect(r2.request().postDataJSON()).toMatchObject({ search: { text: "Bandung" } });
    const s2 = (await r2.json()) as Record<string, number>;
    const bandung = Array.from({ length: ROWS }, (_, i) => i + 1).filter(
      (i) => city(i) === "Bandung",
    );
    expect(s2.count).toBe(bandung.length);
    check(s2, await kpi([{ column: "Kota", op: "in", values: ["Bandung"] }]));
    await expect(page.getByTestId("grid-stats")).toContainText(
      `Hitung ${bandung.length.toLocaleString("id-ID")}`,
    );

    // Kolom teks terfokus → tanpa ringkasan.
    await cell(page, 0, "c6").click();
    await expect(page.getByTestId("grid-stats")).toHaveCount(0);
    await page.close();
  });
});
