import { execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page, type Route } from "@playwright/test";
import { pageFor, registerAndVerify, startWorker, stopWorker, uniqueEmail } from "./helpers";

/*
 * T-044 "Lihat data": urut multi-kolom (AC1), saring per kolom + chip + hapus semua (AC2), cari Ctrl+F
 * dengan sorotan, jumlah, dan pembatalan (AC3), serta pesan urut terlalu berat dengan grid tetap
 * dipakai (AC4, jawaban 504 dari server disimulasikan lewat route). Data sungguhan (CSV → worker →
 * typed parquet); urutan/saringan/cari dihitung server.
 */
test.describe.configure({ mode: "serial" });

const OWNER = uniqueEmail("lihat-urut");
const ROWS = 60;
const CITIES = ["Jakarta Pusat", "Bandung", "jakarta Barat", "Surabaya", "Medan"];
const dir = mkdtempSync(join(tmpdir(), "dd-e2e-urut-"));
let worker: ChildProcess | null = null;
let datasetId = "";

/** Baris i (1-based): kota bergilir, jumlah (i * 37) % 101, tanggal Maret 2026, kode K<i>. */
const city = (i: number) => CITIES[i % CITIES.length]!;
const amount = (i: number) => (i * 37) % 101;
const day = (i: number) => (i % 28) + 1;

function csv(): string {
  const lines = ["Kota;Jumlah;Tanggal;Kode"];
  for (let i = 1; i <= ROWS; i++) {
    lines.push(`${city(i)};${amount(i)};2026-03-${String(day(i)).padStart(2, "0")};K${i}`);
  }
  const path = join(dir, "urut.csv");
  writeFileSync(path, `${lines.join("\n")}\n`);
  return path;
}

const grid = (page: Page) => page.getByTestId("sheet-grid");
const cell = (page: Page, row: number, col: string) =>
  grid(page).locator(`.ag-row[row-index="${row}"] [col-id="${col}"]`).first();
const header = (page: Page, col: string) => grid(page).locator(`.ag-header-cell[col-id="${col}"]`);
const sortTarget = (page: Page, col: string) => header(page, col).getByTestId("grid-header-sort");
const rownum = (page: Page, row: number) =>
  grid(page).locator(`.ag-row[row-index="${row}"] .ag-grid-pinned-left-cells [col-id="n"]`);

/** Isi kolom pada `count` baris pertama (setelah baris terlihat). */
async function column(page: Page, col: string, count: number): Promise<string[]> {
  const out: string[] = [];
  for (let r = 0; r < count; r++) out.push((await cell(page, r, col).textContent()) ?? "");
  return out;
}

async function openGrid(page: Page) {
  await page.goto(`/datasets/${datasetId}/data`);
  await expect(cell(page, 0, "c4")).toHaveText("K1", { timeout: 30_000 });
}

test.describe("Lihat data: urut, saring, cari", () => {
  test.beforeAll(async ({ browser, request }) => {
    test.setTimeout(240_000);
    execFileSync("node", ["scripts/dev-reset-ratelimit.mjs", "register:ip"]);
    const p = await browser.newPage();
    await registerAndVerify(p, request, OWNER);
    await p.close();
    worker = await startWorker("data-view-query");
    const page = await pageFor(browser, OWNER);
    await page.goto("/datasets/baru");
    await page.getByLabel("Nama dataset").fill(`Lihat urut ${Date.now()}`);
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

  test("AC1: klik kepala naik → turun → tanpa urut, Shift+klik multi-kolom, aria-sort dan nomor baris", async ({
    browser,
  }) => {
    const page = await pageFor(browser, OWNER);
    await openGrid(page);
    const sortBodies: unknown[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/rows") && r.method() === "POST") {
        const b = r.postDataJSON() as { sort?: unknown };
        if (b.sort) sortBodies.push(b.sort);
      }
    });
    await expect(header(page, "c2")).toHaveAttribute("aria-sort", "none");

    const asc = [...Array.from({ length: ROWS }, (_, i) => amount(i + 1))].sort((a, b) => a - b);
    await sortTarget(page, "c2").click();
    await expect(header(page, "c2")).toHaveAttribute("aria-sort", "ascending");
    await expect(cell(page, 0, "c2")).toHaveText(String(asc[0]));
    await expect(cell(page, 5, "c2")).toHaveText(String(asc[5]));
    // Nomor baris = posisi di tampilan baru.
    await expect(rownum(page, 0)).toHaveText("1");
    await expect(rownum(page, 5)).toHaveText("6");
    expect(sortBodies.at(-1)).toEqual([{ pos: 2, dir: "asc" }]);

    await sortTarget(page, "c2").click();
    await expect(header(page, "c2")).toHaveAttribute("aria-sort", "descending");
    await expect(cell(page, 0, "c2")).toHaveText(String(asc.at(-1)));

    await sortTarget(page, "c2").click();
    await expect(header(page, "c2")).toHaveAttribute("aria-sort", "none");
    await expect(cell(page, 0, "c4")).toHaveText("K1");

    // Kota naik, lalu Shift+klik Jumlah turun (dua kali: naik → turun) = urut dua kolom.
    await sortTarget(page, "c1").click();
    await sortTarget(page, "c2").click({ modifiers: ["Shift"] });
    await sortTarget(page, "c2").click({ modifiers: ["Shift"] });
    await expect(header(page, "c1")).toHaveAttribute("aria-sort", "ascending");
    await expect(header(page, "c2")).toHaveAttribute("aria-sort", "descending");
    await expect(header(page, "c2").getByTestId("grid-sort-mark")).toHaveText("2");
    const expected = Array.from({ length: ROWS }, (_, i) => i + 1)
      .sort(
        (a, b) =>
          city(a).toLowerCase().localeCompare(city(b).toLowerCase()) ||
          amount(b) - amount(a) ||
          a - b,
      )
      .slice(0, 6)
      .map((i) => `K${i}`);
    await expect(cell(page, 5, "c4")).toHaveText(expected[5]!);
    expect(await column(page, "c4", 6)).toEqual(expected);

    // Kolom ke-4 lewat Shift+klik ditolak (≤ 3): Tanggal + Kode masuk, kolom ke-4 dilepas lagi.
    await sortTarget(page, "c3").click({ modifiers: ["Shift"] });
    await sortTarget(page, "c4").click({ modifiers: ["Shift"] });
    await expect(header(page, "c3")).toHaveAttribute("aria-sort", "ascending");
    await expect(header(page, "c4")).toHaveAttribute("aria-sort", "none");

    // Keyboard: Enter di kepala kolom → menu → "Urutkan turun" (mengganti urutan).
    await header(page, "c4").focus();
    await page.keyboard.press("Enter");
    // Kolom lain sedang diurutkan: label menyebut urutan lain ikut dilepas (review #4).
    await page.getByRole("menuitemradio", { name: /^Urutkan turun saja/ }).click();
    await expect(header(page, "c4")).toHaveAttribute("aria-sort", "descending");
    await expect(header(page, "c1")).toHaveAttribute("aria-sort", "none");
    // Teks: K9 > K60 > K6 … (urut teks, bukan angka).
    await expect(cell(page, 0, "c4")).toHaveText("K9");
    await page.close();
  });

  test("AC2: saring teks (daftar nilai + cari), angka, tanggal; chip, status tersaring, Hapus semua saringan", async ({
    browser,
  }) => {
    const page = await pageFor(browser, OWNER);
    await openGrid(page);
    // Alt+↓ di sel Kota → dialog saring dengan daftar nilai dari server.
    await cell(page, 0, "c1").click();
    await page.keyboard.press("Alt+ArrowDown");
    const dialog = page.getByTestId("grid-filter-dialog");
    await expect(dialog.getByRole("heading", { name: "Saring kolom A: Kota" })).toBeVisible();
    await expect(dialog.getByTestId("filter-slicer-option")).toHaveCount(CITIES.length);
    await dialog.getByTestId("filter-slicer-search").fill("band");
    await expect(dialog.getByTestId("filter-slicer-option")).toHaveCount(1);
    await dialog.getByTestId("filter-slicer-option").filter({ hasText: "Bandung" }).click();
    await dialog.getByTestId("grid-filter-apply").click();
    await expect(dialog).toBeHidden();
    // Fokus kembali ke sel asal.
    await expect(cell(page, 0, "c1")).toBeFocused();

    const bandung = Array.from({ length: ROWS }, (_, i) => i + 1).filter(
      (i) => city(i) === "Bandung",
    );
    await expect(page.getByTestId("grid-filter-chip")).toHaveCount(1);
    await expect(page.getByTestId("grid-filter-chip")).toContainText("Kota: Bandung");
    await expect(page.getByTestId("grid-filter-count")).toHaveText(
      `${bandung.length} baris (tersaring dari ${ROWS})`,
    );
    await expect(page.getByTestId("grid-status-rows")).toContainText(`(tersaring dari ${ROWS})`);
    await expect(cell(page, 0, "c1")).toHaveText("Bandung");
    await expect(header(page, "c1").getByTestId("grid-filter-mark")).toBeVisible();

    // Angka: menu kolom → Saring… → rentang ≥ 50.
    await header(page, "c2").hover();
    await header(page, "c2")
      .getByRole("button", { name: /^Menu kolom/ })
      .click();
    await page.getByRole("menuitem", { name: /Saring/ }).click();
    await dialog.getByLabel("Paling kecil").fill("50");
    await dialog.getByRole("button", { name: "Terapkan" }).click();
    const both = bandung.filter((i) => amount(i) >= 50);
    await expect(page.getByTestId("grid-filter-chip")).toHaveCount(2);
    await expect(page.getByTestId("grid-filter-count")).toHaveText(
      `${both.length} baris (tersaring dari ${ROWS})`,
    );

    // Tanggal: rentang sendiri 1–10 Maret 2026, lewat Alt+↓ di kepala kolom.
    await header(page, "c3").focus();
    await page.keyboard.press("Alt+ArrowDown");
    await expect(dialog.getByRole("heading", { name: "Saring kolom C: Tanggal" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Bulan ini" })).toBeVisible();
    await dialog.getByLabel("Dari").fill("2026-03-01");
    await dialog.getByLabel("Sampai").fill("2026-03-10");
    await dialog.getByTestId("grid-filter-apply").click();
    const three = both.filter((i) => day(i) <= 10);
    await expect(page.getByTestId("grid-filter-chip")).toHaveCount(3);
    await expect(page.getByTestId("grid-filter-count")).toHaveText(
      `${three.length} baris (tersaring dari ${ROWS})`,
    );

    // Hapus satu chip, lalu Hapus semua saringan → semua baris kembali.
    await page.getByRole("button", { name: "Hapus saringan Tanggal" }).click();
    await expect(page.getByTestId("grid-filter-chip")).toHaveCount(2);
    await page.getByTestId("grid-filter-clear-all").click();
    await expect(page.getByTestId("grid-filter-chip")).toHaveCount(0);
    await expect(page.getByTestId("grid-status-rows")).not.toContainText("tersaring");
    await expect(page.getByTestId("grid-status-rows")).toContainText(`dari ${ROWS}`);
    await expect(cell(page, 0, "c4")).toHaveText("K1");
    await page.close();
  });

  test("AC3: Ctrl+F 'jakarta' di grid → baris yang mengandung, sel disorot, 'Ditemukan di N baris'; bisa dibatalkan", async ({
    browser,
  }) => {
    const page = await pageFor(browser, OWNER);
    await openGrid(page);
    let searchBody: { search?: { text: string; cols: number[] } } | null = null;
    page.on("request", (r) => {
      if (r.url().includes("/rows") && r.method() === "POST") {
        const b = r.postDataJSON() as { search?: { text: string; cols: number[] } };
        if (b.search) searchBody = b;
      }
    });
    await cell(page, 2, "c2").click();
    await page.keyboard.press("Control+f");
    await expect(page.getByTestId("grid-search-input")).toBeFocused();
    await page.keyboard.type("jakarta");
    await page.keyboard.press("Enter");
    const hits = Array.from({ length: ROWS }, (_, i) => i + 1).filter((i) =>
      city(i).toLowerCase().includes("jakarta"),
    );
    await expect(page.getByTestId("grid-search-count")).toHaveText(
      `Ditemukan di ${hits.length} baris`,
    );
    // Kolom teks terlihat: Kota (A) dan Kode (D).
    expect(searchBody!.search).toEqual({ text: "jakarta", cols: [1, 4] });
    for (let r = 0; r < 5; r++) {
      await expect(cell(page, r, "c1")).toContainText(/jakarta/i);
      await expect(cell(page, r, "c1")).toHaveClass(/dd-grid-match/);
      await expect(cell(page, r, "c4")).not.toHaveClass(/dd-grid-match/);
    }
    await expect(cell(page, 1, "c4")).toHaveText(`K${hits[1]}`);
    // Kolom yang dicari disembunyikan → cari diulang hanya di kolom teks yang masih terlihat (review #3).
    await header(page, "c4").hover();
    await header(page, "c4")
      .getByRole("button", { name: /^Menu kolom/ })
      .click();
    await page.getByRole("menuitem", { name: "Sembunyikan kolom" }).click();
    await expect.poll(() => searchBody!.search).toEqual({ text: "jakarta", cols: [1] });
    await expect(page.getByTestId("grid-search-count")).toHaveText(
      `Ditemukan di ${hits.length} baris`,
    );
    await page.getByTestId("grid-columns-button").click();
    await page.getByRole("checkbox").last().check();
    await page.keyboard.press("Escape");
    await expect.poll(() => searchBody!.search).toEqual({ text: "jakarta", cols: [1, 4] });
    await page.getByTestId("grid-search-clear").click();
    await expect(cell(page, 0, "c4")).toHaveText("K1");

    // Pencarian lambat dibatalkan: permintaan ditahan, "Batalkan" → grid kembali tanpa cari.
    await page.route("**/api/sheets/*/rows", async (route) => {
      const b = route.request().postDataJSON() as { search?: unknown };
      if (!b.search) return route.continue();
      await new Promise((r) => setTimeout(r, 5_000));
      await route.continue().catch(() => {});
    });
    await page.getByTestId("grid-search-input").fill("medan");
    await page.getByTestId("grid-search-input").press("Enter");
    await expect(page.getByTestId("grid-search-status")).toContainText("Mencari");
    await page.getByTestId("grid-search-cancel").click();
    await expect(page.getByTestId("grid-search-cancel")).toBeHidden();
    await expect(page.getByTestId("grid-search-input")).toHaveValue("");
    await expect(page.getByTestId("grid-status-rows")).toContainText(`dari ${ROWS}`);
    await expect(cell(page, 0, "c4")).toHaveText("K1");
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await page.close();
  });

  test("AC4: urut melewati batas waktu → 'Pengurutan ini terlalu berat; saring data dulu', grid tetap dipakai", async ({
    browser,
  }) => {
    const page = await pageFor(browser, OWNER);
    await openGrid(page);
    // Cari dulu (tanpa urut, tidak dicegat): jumlah tampil.
    const hits = Array.from({ length: ROWS }, (_, i) => i + 1).filter((i) =>
      city(i).toLowerCase().includes("jakarta"),
    ).length;
    await page.getByTestId("grid-search-input").fill("jakarta");
    await page.getByTestId("grid-search-input").press("Enter");
    await expect(page.getByTestId("grid-search-count")).toHaveText(`Ditemukan di ${hits} baris`);
    await page.route("**/api/sheets/*/rows", async (route: Route) => {
      const b = route.request().postDataJSON() as { sort?: unknown[] };
      if (!b.sort?.length) return route.continue();
      await route.fulfill({
        status: 504,
        json: {
          ok: false,
          code: "QUERY_TIMEOUT",
          message: "Pengurutan ini terlalu berat; saring data dulu.",
        },
      });
    });
    await sortTarget(page, "c1").click();
    await expect(page.getByTestId("grid-timeout")).toContainText(
      "Pengurutan ini terlalu berat; saring data dulu",
    );
    await expect(page.getByTestId("grid-load-error")).toBeHidden();
    // Tanpa jumlah basi dari tampilan sebelumnya (review #1).
    await expect(page.getByTestId("grid-search-count")).toBeHidden();
    await expect(page.getByTestId("grid-status-rows")).toHaveText("Baris belum dimuat");
    // Grid tetap bisa dipakai: hapus urutan → data kembali, Ke baris jalan.
    await page.getByTestId("grid-clear-sort").click();
    await expect(page.getByTestId("grid-timeout")).toBeHidden();
    await expect(page.getByTestId("grid-search-count")).toHaveText(`Ditemukan di ${hits} baris`);
    await page.getByTestId("grid-search-clear").click();
    await expect(header(page, "c1")).toHaveAttribute("aria-sort", "none");
    await expect(cell(page, 0, "c4")).toHaveText("K1");
    await page.getByTestId("grid-goto-input").fill("40");
    await page.getByTestId("grid-goto-input").press("Enter");
    await expect(cell(page, 39, "c4")).toHaveText("K40");
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await page.close();
  });
});
