import { execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { apiLogin, registerAndVerify, startWorker, stopWorker, uniqueEmail } from "./helpers";

/*
 * T-053 panel unggah dataset per periode (worker sungguhan):
 *  - dataset biasa: panel lama (helper `upload-input` tetap jalan) + tautan "Atur periode";
 *  - dataset periode mode kolom: dropzone "Tambah atau perbarui periode — …", "Ganti semua data…"
 *    dengan konfirmasi "Semua 3 periode akan diganti"; file April lewat panel → tahap "Membaca
 *    periode" tampil di progres → April ditambahkan otomatis;
 *  - dataset periode berlabel: pemilih periode terisi dari nama file dan bisa diubah; tanpa tebakan
 *    wajib diisi; unggahan berlabel menunggu konfirmasi dengan periode pilihan.
 */
test.describe.configure({ mode: "serial" });

const OWNER = uniqueEmail("period-panel");
const dir = mkdtempSync(join(tmpdir(), "dd-e2e-period-panel-"));
let worker: ChildProcess | null = null;
const SLOW = { timeout: 120_000 };

const fx = (...args: string[]) =>
  JSON.parse(
    execFileSync("node", ["scripts/dev-upload-fixture.mjs", ...args]).toString(),
  ) as Record<string, unknown>;
type Version = { id: string; status: string; active: boolean };
const versions = (datasetId: string) => fx("versions", datasetId) as unknown as Version[];
const versionRow = (page: Page, id: string) =>
  page.locator(`[data-testid="version-row"][data-version-id="${id}"]`);

function file(name: string, lines: string[]): string {
  const path = join(dir, name);
  writeFileSync(path, `${lines.join("\n")}\n`);
  return path;
}

async function newDataset(page: Page, name: string): Promise<string> {
  await page.goto("/datasets/baru");
  await page.getByLabel("Nama dataset").fill(`${name} ${Date.now()}`);
  await page.getByRole("button", { name: "Buat dataset" }).click();
  await expect(page).toHaveURL(/\/datasets\/[a-z0-9]{20,32}\?created=1$/, { timeout: 30_000 });
  return new URL(page.url()).pathname.split("/").pop()!;
}

/** "Atur periode" (T-051) dengan sumber bawaan, lalu tunggu versi PERIOD_SETUP aktif. */
async function setupPeriods(page: Page, datasetId: string) {
  await page.getByTestId("period-link").click();
  await page.getByTestId("period-review").click();
  await expect(page.getByTestId("period-preview")).toBeVisible(SLOW);
  await page.getByTestId("period-apply").click();
  await expect.poll(() => versions(datasetId).length, SLOW).toBe(2);
  await expect.poll(() => versions(datasetId)[0]!.active, SLOW).toBe(true);
  return versions(datasetId)[0]!.id;
}

test.describe("panel unggah periode", () => {
  test.beforeAll(async ({ browser, request }) => {
    execFileSync("node", ["scripts/dev-reset-ratelimit.mjs", "register:ip"]);
    const p = await browser.newPage();
    await registerAndVerify(p, request, OWNER);
    await p.close();
    worker = await startWorker("period-upload-panel");
  });

  test.beforeEach(async ({ page }) => {
    await apiLogin(page, OWNER);
  });

  test.afterAll(async () => {
    await stopWorker(worker);
  });

  test("AC3 + AC1 + AC4: panel biasa → atur periode → tambah periode lewat panel", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const datasetId = await newDataset(page, "Panel periode");
    // AC3: dataset biasa — panel lama, helper lama.
    await expect(page.getByTestId("upload-period-title")).toHaveCount(0);
    await expect(page.getByTestId("upload-replace-all")).toHaveCount(0);
    await page
      .getByTestId("upload-input")
      .setInputFiles(
        file("jan-mar.csv", [
          "kode;Tanggal Kirim;nilai",
          "A;2026-01-05;10",
          "B;2026-02-03;30",
          "C;2026-03-15;50",
        ]),
      );
    await expect(page.getByTestId("dataset-schema-link")).toBeVisible(SLOW);
    const setup = page.getByTestId("upload-period-setup");
    await expect(setup).toHaveText("Ingin menyimpan data per bulan? Atur periode");
    await expect(setup.getByRole("link", { name: "Atur periode" })).toHaveAttribute(
      "href",
      `/datasets/${datasetId}/periode`,
    );

    const base = await setupPeriods(page, datasetId);
    await page.goto(`/datasets/${datasetId}`);

    // AC1: dropzone utama + tautan sekunder dengan konfirmasi jumlah periode.
    await expect(page.getByTestId("upload-period-title")).toHaveText(
      "Tambah atau perbarui periode — periode yang sudah ada akan diganti, bukan digandakan",
    );
    await expect(page.getByTestId("upload-period-setup")).toHaveCount(0);
    const replace = page.getByTestId("upload-replace-all");
    await replace.click();
    const dialog = page.getByTestId("upload-replace-confirm");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId("upload-replace-count")).toHaveText(
      "Semua 3 periode akan diganti",
    );
    await dialog.getByRole("button", { name: "Batal" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(replace).toBeFocused();

    // AC4: worker berhenti → unggahan menunggu diproses; tahap "Membaca periode" tampil di progres.
    await stopWorker(worker);
    worker = null;
    await page
      .getByTestId("upload-input")
      .setInputFiles(file("april.csv", ["kode;Tanggal Kirim;nilai", "D;2026-04-02;60"]));
    const processing = page.getByTestId("dataset-processing");
    await expect(processing).toBeVisible(SLOW);
    await expect(processing.getByRole("list", { name: "Tahap pemrosesan" })).toContainText(
      "Membaca periode",
    );
    const april = versions(datasetId)[0]!;
    expect(april.id).not.toBe(base);
    worker = await startWorker("period-upload-panel-2");
    await expect
      .poll(() => versions(datasetId).find((v) => v.id === april.id)?.status, SLOW)
      .toBe("READY");
    expect(versions(datasetId).find((v) => v.id === april.id)!.active).toBe(true);
    await page.goto(`/datasets/${datasetId}`);
    await expect(versionRow(page, april.id).getByTestId("version-note")).toHaveText(
      "April 2026 ditambahkan (1 baris)",
    );
  });

  test("AC2: sheet berlabel — pemilih periode dari nama file, bisa diubah, wajib diisi", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const datasetId = await newDataset(page, "Panel label");
    await page
      .getByTestId("upload-input")
      .setInputFiles(file("awal.csv", ["kode;nilai", "A;10", "B;20"]));
    await expect(page.getByTestId("dataset-schema-link")).toBeVisible(SLOW);
    await setupPeriods(page, datasetId); // tanpa kolom tanggal → "Saya pilih saat upload"
    await page.goto(`/datasets/${datasetId}`);
    await expect(page.getByTestId("upload-period-title")).toBeVisible();

    // Tanpa tebakan: pemilih kosong dan wajib diisi; belum ada yang dikirim ke server.
    const count = versions(datasetId).length;
    await page.getByTestId("upload-input").setInputFiles(file("data.csv", ["kode;nilai", "C;1"]));
    const picker = page.getByTestId("upload-period-picker");
    await expect(picker).toBeVisible();
    await expect(page.getByTestId("upload-period-sub")).toBeFocused();
    await expect(page.getByTestId("upload-period-sub")).toHaveText(/Pilih bulan/);
    await page.getByTestId("upload-period-submit").click();
    await expect(picker.getByRole("alert")).toHaveText("Pilih periode untuk file ini.");
    expect(versions(datasetId)).toHaveLength(count);
    await picker.getByRole("button", { name: "Batal" }).click();
    await expect(picker).toHaveCount(0);
    await expect(page.getByTestId("upload-dropzone")).toBeVisible();

    // Dengan tebakan dari nama file → terisi; diubah ke Agustus lewat keyboard-friendly select.
    await page
      .getByTestId("upload-input")
      .setInputFiles(file("laporan_2026-09.csv", ["kode;nilai", "D;5", "E;6"]));
    await expect(page.getByTestId("upload-period-sub")).toHaveText(/September/);
    await expect(page.getByTestId("upload-period-year")).toHaveText(/2026/);
    await expect(page.getByTestId("upload-period-hint")).toContainText("September 2026");
    await page.getByTestId("upload-period-sub").click();
    await page.getByRole("option", { name: "Agustus" }).click();
    await expect(page.getByTestId("upload-period-hint")).toContainText("Agustus 2026");
    await page.getByTestId("upload-period-submit").click();

    // Unggahan berlabel selalu menunggu konfirmasi, dengan periode pilihan pemilik.
    await expect.poll(() => versions(datasetId).length, SLOW).toBe(count + 1);
    const v = versions(datasetId)[0]!;
    await expect
      .poll(() => versions(datasetId).find((x) => x.id === v.id)?.status, SLOW)
      .toBe("AWAITING_CONFIRM");
    await page.goto(`/datasets/${datasetId}`);
    await expect(versionRow(page, v.id).getByTestId("version-note")).toContainText("Agustus 2026");
  });
});
