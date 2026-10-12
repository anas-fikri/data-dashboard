import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import yazl from "yazl";
import { apiLogin, registerAndVerify, uniqueEmail } from "./helpers";

/*
 * T-008: progres ingest diperbarui sendiri, review skema (kolom, statistik, 50 baris sampel), dan
 * koreksi lewat worker sungguhan: baris judul, tipe tanggal dd-mm-yyyy, ganti nama tampil.
 * Worker baru dinyalakan setelah unggahan pertama agar status "menunggu" bisa diamati.
 */
test.describe.configure({ mode: "serial" });

const OWNER = uniqueEmail("skema-owner");
const dir = mkdtempSync(join(tmpdir(), "dd-e2e-skema-"));
let worker: ChildProcess | null = null;
let datasetId = "";
let sheetId = "";

function fx(...args: string[]): Record<string, unknown> {
  return JSON.parse(
    execFileSync("node", ["scripts/dev-upload-fixture.mjs", ...args]).toString(),
  ) as Record<string, unknown>;
}

type Sheet = { id: string; headerRow: number; schemaRevision: number; types: string[] };
const sheetOf = (versionId: string) => (fx("ingest", versionId).sheets as Sheet[])[0]!;

/** Dua baris judul laporan penuh teks di atas header asli (baris 3) → tebakan header jatuh ke baris 1. */
function reportCsv(): string {
  const lines = [
    "Laporan Pengiriman;Cabang Bandung;Periode Desember;Disusun Gudang",
    "Dicetak Sistem;Bagian Gudang;Kantor Pusat;Rahasia Internal",
    "No Resi;Tanggal Kirim;Kota;Ongkir",
  ];
  const kota = ["Bandung", "Jakarta", "Surabaya"];
  for (let i = 1; i <= 200; i++) {
    // 5% tanggal kosong-teks → kolom terdeteksi teks (< 98% tanggal)
    const tgl = i % 20 === 0 ? "belum ada" : `${String((i % 28) + 1).padStart(2, "0")}-12-2025`;
    lines.push(`R${String(i).padStart(4, "0")};${tgl};${kota[i % 3]};${15000 + i}`);
  }
  const path = join(dir, "pengiriman-cabang.csv");
  writeFileSync(path, lines.join("\n"));
  return path;
}

async function brokenXlsx(): Promise<string> {
  const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const zip = new yazl.ZipFile();
  const add = (name: string, xml: string) => zip.addBuffer(Buffer.from(xml), name);
  add(
    "[Content_Types].xml",
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`,
  );
  add(
    "xl/workbook.xml",
    `<?xml version="1.0"?><workbook xmlns="${NS}" xmlns:r="${REL}"><sheets><sheet name="Rusak" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  );
  add(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
  );
  const rows = Array.from(
    { length: 40 },
    (_, i) => `<row r="${i + 1}"><c r="A${i + 1}"><v>${i}</v></c></row>`,
  ).join("");
  add(
    "xl/worksheets/sheet1.xml",
    `<worksheet xmlns="${NS}"><sheetData>${rows}<row r="41"><c </bad></sheetData></worksheet>`,
  );
  zip.end();
  const chunks: Buffer[] = [];
  for await (const c of zip.outputStream) chunks.push(c as Buffer);
  const path = join(dir, "laporan-rusak.xlsx");
  writeFileSync(path, Buffer.concat(chunks));
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

async function createDataset(page: Page, name: string): Promise<string> {
  await page.goto("/datasets/baru");
  await page.getByLabel("Nama dataset").fill(name);
  await page.getByRole("button", { name: "Buat dataset" }).click();
  await expect(page).toHaveURL(/\/datasets\/[a-z0-9]{20,32}\?created=1$/);
  return new URL(page.url()).pathname.split("/").pop()!;
}

/** Simpan koreksi lalu tunggu worker selesai (halaman dirender ulang dengan pemberitahuan). */
/**
 * Simpan koreksi lalu tunggu hasilnya (halaman dirender ulang dengan pemberitahuan). `queued`: lewat
 * antrean worker (tipe/format/baris judul) — status antre harus tampil lebih dulu; ganti nama dan
 * sembunyikan diterapkan langsung tanpa antrean.
 */
async function saveAndWait(page: Page, click: () => Promise<void>, queued = true) {
  await click();
  if (queued) await expect(page.getByTestId("recast-status")).toBeVisible();
  await expect(page.getByTestId("recast-done")).toBeVisible({ timeout: 90_000 });
}

test.describe("skema", () => {
  test.beforeAll(async ({ browser, request }) => {
    execFileSync("node", ["scripts/dev-reset-ratelimit.mjs", "register:ip"]);
    const p = await browser.newPage();
    await registerAndVerify(p, request, OWNER);
    await p.close();
  });

  test.beforeEach(async ({ page }) => {
    await apiLogin(page, OWNER);
  });

  test.afterAll(() => {
    worker?.kill("SIGTERM");
  });

  test("AC 1: progres tampil saat menunggu/diproses dan halaman berubah sendiri saat siap", async ({
    page,
  }) => {
    datasetId = await createDataset(page, `Skema ${Date.now()}`);
    await page.getByTestId("upload-input").setInputFiles(reportCsv());
    const panel = page.getByTestId("dataset-processing");
    await expect(panel).toBeVisible({ timeout: 30_000 });
    await expect(panel).toContainText("pengiriman-cabang.csv");
    await expect(panel).toContainText("Menunggu giliran diproses");
    const progress = await page.request.get(`/api/datasets/${datasetId}/progress`);
    expect((await progress.json()).status.status).toBe("UPLOADED");

    await startWorker();
    // Tanpa muat ulang: polling ≤ 5 s membawa halaman ke keadaan siap.
    await expect(page.getByTestId("dataset-schema-link")).toBeVisible({ timeout: 60_000 });
    await expect(panel).toHaveCount(0);
    const versionId = String(fx("latest", datasetId).id);
    const s = sheetOf(versionId);
    sheetId = s.id;
    expect(s.headerRow).toBe(1); // tebakan salah yang akan dikoreksi di AC 3
  });

  test("AC 2: tab skema menampilkan kolom, tipe, % kosong, unik, dan 50 baris sampel", async ({
    page,
  }) => {
    await page.goto(`/datasets/${datasetId}`);
    await page.getByTestId("dataset-schema-link").click();
    await expect(page.getByRole("heading", { level: 1, name: "Skema data" })).toBeVisible();
    const cols = page.getByTestId("schema-column");
    await expect(cols).toHaveCount(4);
    await expect(page.getByLabel("Nama kolom untuk kolom 1")).toHaveValue("Laporan Pengiriman");
    await expect(cols.first()).toContainText("Kosong");
    await expect(cols.first()).toContainText("Unik");
    const sample = page.getByTestId("sample-table");
    await expect(sample.locator("tbody tr")).toHaveCount(50);
    // Tabel lebar bergulir di wilayahnya sendiri: halaman tidak pernah bergulir ke samping.
    for (const width of [320, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `scroll horizontal di ${width}px`).toBeLessThanOrEqual(0);
    }
  });

  test("AC 3: pilih baris 3 sebagai judul → nama dari baris 3, baris 1–3 tidak ada di data", async ({
    page,
  }) => {
    await page.goto(`/datasets/${datasetId}/skema`);
    await page.getByRole("button", { name: "Ganti baris judul" }).click();
    await page.locator('[data-testid="header-row-option"][data-row="3"]').click();
    // Kiriman ditahan 1,5 s: selama pending tombol tetap bernama (pembaca layar) dan ditandai sibuk.
    await page.route("**/api/sheets/*/recast", async (route) => {
      await new Promise((r) => setTimeout(r, 1_500));
      await route.continue();
    });
    await saveAndWait(page, async () => {
      const submit = page.getByRole("button", { name: "Pakai baris 3 sebagai judul" });
      await submit.click();
      await expect(submit).toHaveAttribute("aria-busy", "true");
    });
    await page.unroute("**/api/sheets/*/recast");
    await expect(page.getByTestId("recast-done")).toContainText("Baris judul sekarang baris 3");
    await expect(page.getByLabel("Nama kolom untuk kolom 1")).toHaveValue("No Resi");
    await expect(page.getByLabel("Nama kolom untuk kolom 2")).toHaveValue("Tanggal Kirim");
    const sample = page.getByTestId("sample-table");
    await expect(sample.locator("tbody tr").first().locator("th")).toHaveText("4");
    await expect(sample.locator("tbody")).not.toContainText("Laporan Pengiriman");
    await expect(sample.locator("tbody")).not.toContainText("No Resi");
    const s = sheetOf(String(fx("latest", datasetId).id));
    expect(s).toMatchObject({ headerRow: 3, schemaRevision: 2 });
    expect(s.types[1]).toBe("Tanggal Kirim:text");
  });

  test("AC 4: teks '31-12-2025' diubah ke tanggal dd-mm-yyyy → DATE dan jumlah gagal dilaporkan", async ({
    page,
  }) => {
    await page.goto(`/datasets/${datasetId}/skema`);
    await page.getByLabel("Tipe untuk kolom 2").click();
    await page.getByRole("option", { name: "Tanggal", exact: true }).click();
    await page.getByLabel("Format tanggal untuk kolom 2").click();
    await page.getByRole("option", { name: "31-12-2025" }).click();
    await expect(page.getByTestId("schema-save-bar")).toContainText("1 kolom diubah");
    await saveAndWait(page, () => page.getByRole("button", { name: "Simpan perubahan" }).click());
    // 10 dari 200 baris berisi "belum ada" → dilaporkan, bukan diubah diam-diam.
    await expect(page.getByTestId("recast-done")).toContainText('"Tanggal Kirim" 10 baris');
    await expect(page.locator('[data-pos="2"]').getByTestId("cast-fail")).toContainText("10");
    await expect(page.getByTestId("sample-table")).toContainText("2 Des 2025");
    const s = sheetOf(String(fx("latest", datasetId).id));
    expect(s.types[1]).toBe("Tanggal Kirim:date");
  });

  test("AC 5: nama tampil baru dipakai query builder; nama asli tetap tersimpan", async ({
    page,
    baseURL,
  }) => {
    await page.goto(`/datasets/${datasetId}/skema`);
    await page.getByLabel("Nama kolom untuk kolom 3").fill("Kota Tujuan");
    await saveAndWait(
      page,
      () => page.getByRole("button", { name: "Simpan perubahan" }).click(),
      false,
    );
    // Langsung diterapkan: tidak lewat worker, revisi naik (3 → 4 setelah AC 3 dan AC 4).
    expect(sheetOf(String(fx("latest", datasetId).id)).schemaRevision).toBe(4);
    await expect(page.locator('[data-pos="3"]')).toContainText('asli: "Kota"');
    const query = (column: string) =>
      page.request.post("/api/query", {
        headers: { Origin: baseURL! },
        data: {
          datasetId,
          spec: { sheetId, dimensions: [{ column }], measures: [{ agg: "count" }] },
        },
      });
    const ok = await query("Kota Tujuan");
    expect(ok.status(), await ok.text()).toBe(200);
    expect((await ok.json()).rows).toHaveLength(3);
    expect((await query("Kota")).status()).toBe(400);
  });

  test("workbook banyak sheet: tab per sheet, pindah sheet lewat tautan (?sheet=)", async ({
    page,
  }) => {
    const id = await createDataset(page, `Tiga sheet ${Date.now()}`);
    await page.getByTestId("upload-input").setInputFiles("tests/fixtures/tiga-sheet.xlsx");
    await expect(page.getByTestId("dataset-schema-link")).toBeVisible({ timeout: 90_000 });
    await page.goto(`/datasets/${id}/skema`);
    const tabs = page.getByRole("navigation", { name: "Sheet" }).getByRole("link");
    await expect(tabs).toHaveCount(3);
    await expect(tabs.first()).toHaveAttribute("aria-current", "page");
    await tabs.nth(1).click();
    await expect(page).toHaveURL(/\?sheet=1$/);
    await expect(tabs.nth(1)).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { level: 2, name: /^Sheet "/ })).toContainText(
      await tabs.nth(1).innerText(),
    );
    await expect(page.getByTestId("sample-table")).toBeVisible();
  });

  test("AC 1: ingest gagal di dalam sheet → pesan menyebut sheet dan baris, tanpa muat ulang", async ({
    page,
  }) => {
    const id = await createDataset(page, `Rusak ${Date.now()}`);
    await page.getByTestId("upload-input").setInputFiles(await brokenXlsx());
    const msg = page.getByTestId("dataset-status-message");
    await expect(msg).toBeVisible({ timeout: 60_000 });
    await expect(msg).toContainText('"Rusak"');
    await expect(msg).toContainText(/baris \d+/);
    expect(fx("latest", id).status).toBe("FAILED");
  });
});
