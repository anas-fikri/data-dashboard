import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { apiLogin, registerAndVerify, uniqueEmail } from "./helpers";

/*
 * T-011: widget tabel, KPI, batang dengan data sungguhan (unggah → ingest worker → query DuckDB).
 * Fixture dibuat di sini sehingga test bisa menghitung SUMIF sendiri; total Omzet dibuat tepat
 * 1.234.567,5 untuk format rupiah; satu nilai cabang dan satu nama kolom berisi HTML berbahaya.
 */
test.describe.configure({ mode: "serial" });

const OWNER = uniqueEmail("widget-owner");
const XSS = "<img src=x onerror=alert(1)>";
const CABANG = ["Bandung", "Jakarta", "Surabaya", "Medan", XSS];
const ROWS = 250;
const dir = mkdtempSync(join(tmpdir(), "dd-e2e-widget-"));
let worker: ChildProcess | null = null;
let datasetId = "";
let dashboardUrl = "";

/** Baris fixture: cabang, tanggal, omzet (jumlah semua = 1.234.567,5). */
const rows = (() => {
  const out: { cabang: string; tanggal: string; omzet: number }[] = [];
  for (let i = 0; i < ROWS - 1; i++) {
    out.push({
      cabang: CABANG[i % CABANG.length]!,
      tanggal: `${String((i % 28) + 1).padStart(2, "0")}-${String((i % 3) + 7).padStart(2, "0")}-2026`,
      omzet: 500 + ((i * 37) % 8000),
    });
  }
  const rest = 1234567.5 - out.reduce((s, r) => s + r.omzet, 0);
  if (rest <= 0) throw new Error("fixture: sisa omzet harus positif");
  out.push({ cabang: "Bandung", tanggal: "15-09-2026", omzet: rest });
  return out;
})();

function fixtureCsv(): string {
  const lines = [`Cabang;Tanggal;Omzet;${XSS}`];
  for (const r of rows) {
    lines.push(`${r.cabang};${r.tanggal};${String(r.omzet).replace(".", ",")};catatan ${r.cabang}`);
  }
  const path = join(dir, "omzet-cabang.csv");
  writeFileSync(path, lines.join("\n"));
  return path;
}

async function startWorker() {
  worker = spawn("npm", ["run", "worker"], { stdio: ["ignore", "pipe", "pipe"], env: process.env });
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("worker tidak siap dalam 30 s")), 30_000);
    worker!.stdout!.on("data", (d: Buffer) => {
      if (d.toString().includes("worker berjalan")) {
        clearTimeout(t);
        resolve();
      }
    });
    worker!.on("exit", (code) => reject(new Error(`worker keluar (${code})`)));
  });
}

const widgetTitled = (page: Page, title: string) =>
  page.getByTestId("widget").filter({ has: page.getByRole("heading", { name: title }) });

/** Tambah widget, beri judul, pilih jenis; tunggu konfigurasi tersimpan. */
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

async function choose(panel: Locator, label: string, option: string) {
  await panel.getByLabel(label, { exact: true }).click();
  await panel.page().getByRole("option", { name: option, exact: true }).click();
}

test.describe("widget", () => {
  const dialogs: string[] = [];

  test.beforeAll(async ({ browser, request }) => {
    test.setTimeout(150_000);
    execFileSync("node", ["scripts/dev-reset-ratelimit.mjs", "register:ip"]);
    const p = await browser.newPage();
    await registerAndVerify(p, request, OWNER);
    await apiLogin(p, OWNER);
    await startWorker();
    await p.goto("/datasets/baru");
    await p.getByLabel("Nama dataset").fill(`Omzet cabang ${Date.now()}`);
    await p.getByRole("button", { name: "Buat dataset" }).click();
    await expect(p).toHaveURL(/\/datasets\/[a-z0-9]{20,32}\?created=1$/);
    datasetId = new URL(p.url()).pathname.split("/").pop()!;
    await p.getByTestId("upload-input").setInputFiles(fixtureCsv());
    await expect(p.getByTestId("dataset-schema-link")).toBeVisible({ timeout: 90_000 });
    await p.goto(`/dashboards/baru?dataset=${datasetId}`);
    await p.getByLabel("Nama dashboard").fill("Ringkasan omzet");
    await p.getByRole("button", { name: "Buat dashboard" }).click();
    await expect(p).toHaveURL(/\?mode=edit$/);
    dashboardUrl = p.url().replace("?mode=edit", "");
    await p.close();
  });

  test.afterAll(() => {
    worker?.kill("SIGTERM");
  });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await apiLogin(page, OWNER);
    page.on("dialog", (d) => {
      dialogs.push(d.message());
      void d.dismiss();
    });
  });

  test("AC 1: batang Cabang × total Omzet = SUMIF dari fixture", async ({ page }) => {
    await page.goto(`${dashboardUrl}?mode=edit`);
    // Pilihan awal otomatis: kolom teks pertama (Cabang) × total kolom angka pertama (Omzet).
    const panel = await addWidget(page, "Omzet per cabang", "Batang");
    await expect(panel.getByLabel("Kelompokkan menurut", { exact: true })).toContainText("Cabang");
    await expect(panel.getByLabel("dari kolom", { exact: true })).toContainText("Omzet");
    const expected = new Map<string, number>();
    for (const r of rows) expected.set(r.cabang, (expected.get(r.cabang) ?? 0) + r.omzet);

    const data = widgetTitled(page, "Omzet per cabang").getByTestId("chart-data");
    await expect(data.locator("tbody tr")).toHaveCount(CABANG.length);
    const got = await data
      .locator("tbody tr")
      .evaluateAll((trs) =>
        trs.map((tr) => [
          tr.querySelector("th")!.textContent!,
          Number(tr.querySelector("td")!.dataset.value),
        ]),
      );
    for (const [cabang, total] of got as [string, number][]) {
      expect(total).toBeCloseTo(expected.get(cabang)!, 6);
    }
    // Urutan bawaan batang: nilai terbesar dulu.
    const totals = (got as [string, number][]).map(([, v]) => v);
    expect(totals).toEqual([...totals].sort((a, b) => b - a));
  });

  test("AC 2: KPI format Rp → 'Rp 1.234.568' dengan spasi U+0020; urungkan hapus memulihkan isinya", async ({
    page,
  }) => {
    await page.goto(`${dashboardUrl}?mode=edit`);
    const panel = await addWidget(page, "Total omzet", "Angka");
    await choose(panel, "Format angka", "Rupiah (Rp 1.234)");
    await expect(panel.getByTestId("config-status")).toHaveAttribute("data-state", "saved");
    const value = widgetTitled(page, "Total omzet").getByTestId("kpi-value");
    await expect(value).toHaveText("Rp 1.234.568");
    expect(await value.evaluate((el) => el.textContent!.charCodeAt(2))).toBe(0x20);

    // KPI kedua yang tidak memakai Omzet (dipakai AC 4).
    const count = await addWidget(page, "Jumlah transaksi", "Angka");
    await choose(count, "Nilai", "Jumlah baris");
    await expect(widgetTitled(page, "Jumlah transaksi").getByTestId("kpi-value")).toHaveText("250");

    // Hapus lalu urungkan: jenis + spec ikut pulih (catatan review T-010 L6).
    await widgetTitled(page, "Total omzet")
      .getByRole("button", { name: /^Pengaturan/ })
      .click();
    await page.getByTestId("widget-panel").getByRole("button", { name: "Hapus widget" }).click();
    await expect(widgetTitled(page, "Total omzet")).toHaveCount(0);
    await page.getByRole("button", { name: "Urungkan hapus widget" }).click();
    await expect(widgetTitled(page, "Total omzet").getByTestId("kpi-value")).toHaveText(
      "Rp 1.234.568",
    );
  });

  test("AC 3: tabel — 100 baris per halaman, urut kolom lalu pindah halaman", async ({ page }) => {
    await page.goto(`${dashboardUrl}?mode=edit`);
    await addWidget(page, "Detail transaksi", "Tabel");
    const table = widgetTitled(page, "Detail transaksi");
    await expect(table.getByTestId("table-range")).toHaveText("Baris 1–100 dari 250");
    await expect(table.locator("tbody tr")).toHaveCount(100);

    const pageResponse = () =>
      page.waitForResponse(
        (r) => r.url().endsWith("/api/query") && r.request().postData()!.includes('"page"'),
      );
    const omzetHeader = table.getByRole("button", { name: /^Omzet/ });
    let res = pageResponse();
    await omzetHeader.click(); // naik
    await res;
    res = pageResponse();
    await omzetHeader.click(); // turun
    const first = await (await res).json();
    expect(JSON.parse((await res).request().postData()!)).toMatchObject({
      page: 0,
      sort: { column: 3, dir: "desc" },
    });
    expect(first.rows).toHaveLength(100);
    await expect(table.getByRole("columnheader", { name: /^Omzet/ })).toHaveAttribute(
      "aria-sort",
      "descending",
    );

    res = pageResponse();
    await table.getByRole("button", { name: "Halaman berikutnya" }).click();
    const second = await (await res).json();
    expect(second.rows).toHaveLength(100);
    const omzet = (r: { rows: unknown[][] }) => r.rows.map((row) => row[2] as number);
    const sortedDesc = [...rows.map((r) => r.omzet)].sort((a, b) => b - a);
    expect(omzet(first)).toEqual(sortedDesc.slice(0, 100));
    expect(omzet(second)).toEqual(sortedDesc.slice(100, 200));
    await expect(table.getByTestId("table-range")).toHaveText("Baris 101–200 dari 250");
  });

  test("AC 7: HTML di nilai sel dan nama kolom tampil sebagai teks (tabel, label, tooltip)", async ({
    page,
  }) => {
    await page.goto(dashboardUrl);
    const table = widgetTitled(page, "Detail transaksi");
    await expect(table.getByRole("columnheader", { name: XSS })).toBeVisible();
    await expect(widgetTitled(page, "Omzet per cabang").getByTestId("chart-data")).toContainText(
      XSS,
    );
    // Tooltip grafik: arahkan ke batang terakhir (cabang berisi HTML ada di daftar).
    const chart = widgetTitled(page, "Omzet per cabang").locator("svg").first();
    const box = (await chart.boundingBox())!;
    for (const fy of [0.2, 0.4, 0.6, 0.8]) {
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * fy);
      await page.waitForTimeout(150);
    }
    expect(await page.locator('img[src="x"]').count()).toBe(0);
    expect(dialogs).toEqual([]);
  });

  test("data diganti (unggahan baru, versi baru aktif) → widget yang ada tetap jalan dengan angka baru", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    // Isi baru, kolom sama: 100 baris, Omzet 1.000 per baris → total Rp 100.000.
    const lines = [`Cabang;Tanggal;Omzet;${XSS}`];
    for (let i = 0; i < 100; i++) lines.push(`Bandung;01-10-2026;1000;catatan ${i}`);
    const path = join(dir, "omzet-oktober.csv");
    writeFileSync(path, lines.join("\n"));
    const before = String(
      (
        JSON.parse(
          execFileSync("node", ["scripts/dev-upload-fixture.mjs", "latest", datasetId]).toString(),
        ) as { id: string }
      ).id,
    );
    await page.goto(`/datasets/${datasetId}`);
    await page.getByTestId("upload-input").setInputFiles(path);
    await expect
      .poll(
        () => {
          const v = JSON.parse(
            execFileSync("node", [
              "scripts/dev-upload-fixture.mjs",
              "latest",
              datasetId,
            ]).toString(),
          ) as { id: string; status: string };
          return v.id !== before && v.status === "READY";
        },
        { timeout: 120_000, intervals: [1_000] },
      )
      .toBe(true);

    await page.goto(dashboardUrl);
    await expect(widgetTitled(page, "Jumlah transaksi").getByTestId("kpi-value")).toHaveText("100");
    await expect(widgetTitled(page, "Total omzet").getByTestId("kpi-value")).toHaveText(
      "Rp 100.000",
    );
    const data = widgetTitled(page, "Omzet per cabang").getByTestId("chart-data");
    await expect(data.locator("tbody tr")).toHaveCount(1);
    await expect(data.locator("tbody td").first()).toHaveAttribute("data-value", "100000");
  });

  test("AC 4: kolom disembunyikan → widget pemakainya memberi pesan, widget lain tetap jalan", async ({
    page,
  }) => {
    await page.goto(`/datasets/${datasetId}/skema`);
    await page.getByLabel("Sembunyikan kolom 3").check();
    await page.getByRole("button", { name: "Simpan perubahan" }).click();
    await expect(page.getByTestId("recast-done")).toBeVisible({ timeout: 30_000 });

    await page.goto(dashboardUrl);
    for (const title of ["Omzet per cabang", "Total omzet", "Detail transaksi"]) {
      const error = widgetTitled(page, title).getByTestId("widget-error");
      await expect(error).toHaveAttribute("data-code", "COLUMN_UNAVAILABLE");
      await expect(error).toContainText('"Omzet" disembunyikan');
    }
    await expect(widgetTitled(page, "Jumlah transaksi").getByTestId("kpi-value")).toHaveText("100");
  });

  test("kolom diganti namanya di unggahan baru → widget menyebut kolom lama, widget lain tetap jalan", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const lines = [`Cabang;Tanggal;Pendapatan;${XSS}`];
    for (let i = 0; i < 40; i++) lines.push(`Bogor;02-10-2026;500;catatan ${i}`);
    const path = join(dir, "omzet-ganti-nama.csv");
    writeFileSync(path, lines.join("\n"));
    const latest = () =>
      JSON.parse(
        execFileSync("node", ["scripts/dev-upload-fixture.mjs", "latest", datasetId]).toString(),
      ) as { id: string; status: string };
    const before = latest().id;
    await page.goto(`/datasets/${datasetId}`);
    await page.getByTestId("upload-input").setInputFiles(path);
    await expect
      .poll(
        () => {
          const v = latest();
          return v.id !== before && v.status === "READY";
        },
        { timeout: 120_000, intervals: [1_000] },
      )
      .toBe(true);

    await page.goto(dashboardUrl);
    for (const title of ["Omzet per cabang", "Total omzet", "Detail transaksi"]) {
      const error = widgetTitled(page, title).getByTestId("widget-error");
      await expect(error).toHaveAttribute("data-code", "COLUMN_UNAVAILABLE");
      await expect(error).toContainText('"Omzet" tidak ada di data terbaru');
    }
    await expect(widgetTitled(page, "Jumlah transaksi").getByTestId("kpi-value")).toHaveText("40");
  });
});
