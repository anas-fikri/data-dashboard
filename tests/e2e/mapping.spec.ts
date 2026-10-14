import { execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { apiLogin, registerAndVerify, startWorker, stopWorker, uniqueEmail } from "./helpers";

/*
 * T-014: pemetaan kolom saat skema versi baru tidak cocok, dari sudut pandang pemilik (worker sungguhan).
 *  V1 Cabang;Kode;Nilai → dashboard: KPI total Nilai, KPI jumlah nilai unik Cabang, batang per Cabang.
 *  V2 Cabang diganti nama "Kantor" (+ kolom baru "Keterangan") → AWAITING_MAPPING, dashboard tetap V1 (AC 1);
 *     file asli dihapus job retensi SEBELUM dipetakan → petakan Cabang ← Kantor → READY + aktif (AC 2).
 *  V3 tanpa Cabang → kosongkan (NULL) → aktif; widget pemakai Cabang "(kosong)" + catatan, bukan galat;
 *  V4 masih tanpa Cabang → langsung aktif (Cabang kosong terbawa, AC 3).
 *  V5 + kolom "Catatan" → aktif, Catatan tersembunyi di Skema lalu ditampilkan lewat editor skema (AC 4).
 * Total Nilai per versi berbeda (100/210/180/65/80) sehingga angka yang tampil membuktikan versi mana
 * yang dibaca. Worker sendiri (proses grup terpisah), dimatikan di afterAll.
 */
test.describe.configure({ mode: "serial" });

const OWNER = uniqueEmail("pemetaan-owner");
const dir = mkdtempSync(join(tmpdir(), "dd-e2e-pemetaan-"));
const TOTAL = "Total nilai";
const UNIQUE = "Cabang unik";
const CHART = "Nilai per cabang";
const ABSENT_NOTE = "Kolom “Cabang” kosong di versi data ini.";
/** Mesin dev bersama: ingest/job dipoll sampai 120 s. */
const INGEST_MS = 120_000;
const SLOW = { timeout: 30_000 };

let worker: ChildProcess | null = null;
let datasetId = "";
let dashboardUrl = "";
const v: Record<"v1" | "v2" | "v3" | "v4" | "v5", string> = {
  v1: "",
  v2: "",
  v3: "",
  v4: "",
  v5: "",
};

type Version = {
  id: string;
  status: string;
  active: boolean;
  sourceDeletedAt: string | null;
  errorMessage: string | null;
};

function fx<T = Record<string, unknown>>(...args: string[]): T {
  return JSON.parse(
    execFileSync("node", ["scripts/dev-upload-fixture.mjs", ...args], {
      timeout: 90_000,
    }).toString(),
  ) as T;
}
const versions = () => fx<Version[]>("versions", datasetId);
const versionOf = (id: string) => versions().find((x) => x.id === id);
const prefixCount = (prefix: string) => fx<{ count: number }>("prefix-count", prefix).count;
const sourceExists = (id: string) => fx<{ exists: boolean }>("object", id).exists;

function csv(name: string, header: string, rows: string[]): string {
  const path = join(dir, name);
  writeFileSync(path, [header, ...rows].join("\n"));
  return path;
}
const times = (n: number, f: (i: number) => string) => Array.from({ length: n }, (_, i) => f(i));
const OLD_BRANCH = ["Jakarta", "Bandung"];
const NEW_BRANCH = ["Medan", "Surabaya", "Makassar"];

/** "nama:tipe" per kolom sheet pertama versi itu (langsung dari DB). */
const sheetTypes = (versionId: string) =>
  (fx<{ sheets?: { types: string[] }[] }>("ingest", versionId).sheets ?? [])[0]?.types ?? [];
const sheetId = (versionId: string) =>
  (fx<{ sheets?: { id: string }[] }>("ingest", versionId).sheets ?? [])[0]?.id ?? "";

/**
 * Unggah dari profil dataset lalu tunggu versi baru mencapai status terminal (READY/FAILED/
 * AWAITING_MAPPING) lewat fixture DB (pola versions.spec).
 */
async function uploadVersion(page: Page, file: string): Promise<{ id: string; status: string }> {
  await page.goto(`/datasets/${datasetId}`);
  const before = fx<{ id?: string }>("latest", datasetId).id ?? null;
  await page.getByTestId("upload-input").setInputFiles(file);
  const name = file.split("/").pop()!;
  await expect(page.getByText(`"${name}" terunggah.`)).toBeVisible({ timeout: 60_000 });
  let latest = { id: "", status: "" };
  await expect
    .poll(
      () => {
        latest = fx<{ id: string; status: string }>("latest", datasetId);
        return latest.id !== before &&
          ["READY", "FAILED", "AWAITING_MAPPING"].includes(latest.status)
          ? "selesai"
          : latest.status;
      },
      { timeout: INGEST_MS, intervals: [2_000] },
    )
    .toBe("selesai");
  return latest;
}

const widgetTitled = (page: Page, title: string) =>
  page.getByTestId("widget").filter({ has: page.getByRole("heading", { name: title }) });
const kpiValue = (page: Page, title: string) => widgetTitled(page, title).getByTestId("kpi-value");
const versionRow = (page: Page, id: string) =>
  page.locator(`[data-testid="version-row"][data-version-id="${id}"]`);
const missingRow = (page: Page, pos: number) =>
  page.locator(`[data-testid="mapping-missing-row"][data-active-pos="${pos}"]`);
const schemaRow = (page: Page, pos: number) =>
  page.locator(`[data-testid="schema-column"][data-pos="${pos}"]`);

/** [kategori, nilai] dari tabel data grafik (sr-only) widget batang, urutan tampil. */
async function chartRows(page: Page, title: string): Promise<[string, number][]> {
  return widgetTitled(page, title)
    .getByTestId("chart-data")
    .locator("tbody tr")
    .evaluateAll((trs) =>
      trs.map((tr) => [
        tr.querySelector("th")!.textContent!.trim(),
        Number(tr.querySelector("td")!.dataset.value),
      ]),
    ) as Promise<[string, number][]>;
}
const sortRows = (rows: [string, number][]) =>
  [...rows].sort((a, b) => a[0].localeCompare(b[0], "id"));

/** Posisi kolom skema yang nama tampilnya `name` (-1 bila tidak ada). */
async function schemaPos(page: Page, name: string): Promise<number> {
  await expect(page.getByTestId("schema-column").first()).toBeVisible(SLOW);
  return page
    .getByTestId("schema-column")
    .evaluateAll(
      (els, n) =>
        Number(
          els
            .find((e) => e.querySelector<HTMLInputElement>('input[id$="-name"]')?.value === n)
            ?.getAttribute("data-pos") ?? -1,
        ),
      name,
    );
}

/** Tambah widget, beri judul, pilih jenis; tunggu konfigurasi tersimpan (pola widgets.spec). */
async function addWidget(page: Page, title: string, type: string): Promise<Locator> {
  const before = await page.getByTestId("widget").count();
  await page
    .getByTestId("canvas-toolbar")
    .getByRole("button", { name: "Tambah widget", exact: true })
    .click();
  await expect(page.getByTestId("widget")).toHaveCount(before + 1, SLOW);
  const panel = page.getByTestId("widget-panel");
  await expect(panel.getByRole("heading", { name: "Pengaturan widget" })).toBeFocused();
  await panel.getByLabel("Judul", { exact: true }).fill(title);
  await panel.getByLabel("Judul", { exact: true }).press("Enter");
  await expect(widgetTitled(page, title)).toHaveCount(1);
  await panel.getByText(type, { exact: true }).click();
  await expect(panel.getByTestId("config-status")).toHaveAttribute("data-state", "saved", SLOW);
  return panel;
}

async function choose(panel: Locator, label: string, option: string) {
  await panel.getByLabel(label, { exact: true }).click();
  await panel.page().getByRole("option", { name: option, exact: true }).click();
  await expect(panel.getByTestId("config-status")).toHaveAttribute("data-state", "saved", SLOW);
}

/** Pilih kolom file baru (atau "kosongkan") untuk satu kolom aktif yang hilang. */
async function pickFor(page: Page, row: Locator, option: string | RegExp) {
  await row.getByTestId("mapping-picker").click();
  await page.getByRole("option", { name: option }).click();
}

/** Simpan pemetaan lalu tunggu job selesai: halaman pindah ke dataset dengan pemberitahuan. */
async function expectMappedRedirect(page: Page, fileName: string) {
  await expect(page).toHaveURL(new RegExp(`/datasets/${datasetId}\\?mapped=1$`), {
    timeout: INGEST_MS,
  });
  await expect(page.getByTestId("mapping-done")).toContainText(
    `Pemetaan disimpan. Versi “${fileName}” aktif.`,
    SLOW,
  );
}

/** Widget tanpa galat (tidak ada pesan COLUMN_UNAVAILABLE / gaya galat). */
async function expectNoWidgetError(page: Page) {
  await expect(page.getByTestId("widget-error")).toHaveCount(0);
  await expect(page.getByText("COLUMN_UNAVAILABLE")).toHaveCount(0);
}

test.describe("pemetaan kolom", () => {
  test.beforeAll(async ({ browser, request }) => {
    test.setTimeout(300_000);
    execFileSync("node", ["scripts/dev-reset-ratelimit.mjs", "register:ip"]);
    const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await registerAndVerify(p, request, OWNER);
    await apiLogin(p, OWNER);
    worker = await startWorker("mapping");

    // V1: Cabang (teks pertama → pengelompokan bawaan), Kode teks, Nilai 10 × 10 baris = 100.
    await p.goto("/datasets/baru");
    await p.getByLabel("Nama dataset").fill(`Penjualan pemetaan ${Date.now()}`);
    await p.getByRole("button", { name: "Buat dataset" }).click();
    await expect(p).toHaveURL(/\/datasets\/[a-z0-9]{20,32}\?created=1$/, SLOW);
    datasetId = new URL(p.url()).pathname.split("/").pop()!;
    const first = await uploadVersion(
      p,
      csv(
        "pemetaan-1.csv",
        "Cabang;Kode;Nilai",
        times(10, (i) => `${OLD_BRANCH[i % 2]};K-${101 + i};10`),
      ),
    );
    expect(first.status).toBe("READY");
    v.v1 = first.id;
    expect([...sheetTypes(v.v1)].sort()).toEqual(["Cabang:text", "Kode:text", "Nilai:integer"]);

    await p.goto(`/dashboards/baru?dataset=${datasetId}`);
    await p.getByLabel("Nama dashboard").fill("Ringkasan pemetaan");
    await p.getByRole("button", { name: "Buat dashboard" }).click();
    await expect(p).toHaveURL(/\?mode=edit$/, SLOW);
    dashboardUrl = p.url().replace("?mode=edit", "");

    // KPI bawaan = total kolom angka pertama (Nilai).
    const total = await addWidget(p, TOTAL, "Angka");
    await expect(total.getByLabel("dari kolom", { exact: true })).toContainText("Nilai");
    await expect(kpiValue(p, TOTAL)).toHaveText("100", SLOW);
    // KPI ukuran pada kolom teks Cabang (jumlah nilai unik).
    const unique = await addWidget(p, UNIQUE, "Angka");
    await choose(unique, "Nilai", "Jumlah nilai unik");
    await choose(unique, "dari kolom", "Cabang · Teks");
    await expect(kpiValue(p, UNIQUE)).toHaveText("2", SLOW);
    // Batang bawaan = kolom teks pertama (Cabang) × total Nilai.
    const bar = await addWidget(p, CHART, "Batang");
    await expect(bar.getByLabel("Kelompokkan menurut", { exact: true })).toContainText("Cabang");
    await expect(bar.getByLabel("dari kolom", { exact: true })).toContainText("Nilai");
    await expect
      .poll(async () => sortRows(await chartRows(p, CHART)), SLOW)
      .toEqual([
        ["Bandung", 50],
        ["Jakarta", 50],
      ]);
    await p.close();
  });

  test.afterAll(async () => {
    await stopWorker(worker);
  });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await apiLogin(page, OWNER);
  });

  test("AC 1: kolom diganti nama → AWAITING_MAPPING, dashboard tetap versi lama, halaman pemetaan menyebut kolom yang tidak ditemukan", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    // Cabang → "Kantor", urutan kolom berbeda, plus kolom baru "Keterangan". 21 × 10 = 210.
    const v2 = await uploadVersion(
      page,
      csv(
        "pemetaan-2.csv",
        "Kode;Kantor;Nilai;Keterangan",
        times(21, (i) => `K-${201 + i};${NEW_BRANCH[i % 3]};10;catatan ${i}`),
      ),
    );
    expect(v2.status, JSON.stringify(fx("latest", datasetId))).toBe("AWAITING_MAPPING");
    v.v2 = v2.id;
    expect(versionOf(v.v2)).toMatchObject({ active: false });
    expect(versionOf(v.v2)?.errorMessage).toContain('Kolom "Cabang"');
    expect(versions().find((x) => x.active)?.id).toBe(v.v1);

    // Dashboard masih membaca V1.
    await page.goto(dashboardUrl);
    await expect(kpiValue(page, TOTAL)).toHaveText("100", SLOW);
    await expect(kpiValue(page, UNIQUE)).toHaveText("2", SLOW);
    await expect
      .poll(async () => sortRows(await chartRows(page, CHART)), SLOW)
      .toEqual([
        ["Bandung", 50],
        ["Jakarta", 50],
      ]);

    // Profil dataset: pemberitahuan pemetaan dengan ajakan utama "Petakan kolom".
    await page.goto(`/datasets/${datasetId}`);
    await expect(
      page.getByTestId("dataset-status").locator('[data-badge="awaiting_mapping"]'),
    ).toHaveText(/Menunggu pemetaan/, SLOW);
    const notice = page.getByTestId("dataset-processing");
    await expect(notice).toHaveAttribute("data-state", "mapping");
    await expect(notice).toContainText("“pemetaan-2.csv” perlu pemetaan kolom");
    await expect(page.getByTestId("dataset-mapping-reason")).toContainText(
      'Kolom "Cabang" tidak ada di file baru.',
    );
    await expect(versionRow(page, v.v2)).toHaveAttribute("data-status", "AWAITING_MAPPING");
    await expect(versionRow(page, v.v2).getByTestId("version-map")).toBeVisible();
    await expect(versionRow(page, v.v1)).toHaveAttribute("data-active", "true");
    const link = notice.getByTestId("dataset-mapping-link");
    await expect(link).toHaveText(/Petakan kolom/);
    await link.click();

    // Halaman pemetaan: Cabang tidak ditemukan; Kantor + Keterangan belum dipakai (akan disembunyikan).
    await expect(page).toHaveURL(new RegExp(`/datasets/${datasetId}/pemetaan$`), SLOW);
    await expect(page.getByTestId("mapping-page")).toBeVisible(SLOW);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pemetaan kolom");
    await expect(page.getByTestId("mapping-sheet")).toHaveCount(1);
    await expect(page.getByTestId("mapping-missing-row")).toHaveCount(1);
    const cabang = missingRow(page, 1);
    await expect(cabang).toContainText("Cabang");
    await expect(cabang).toContainText("Kolom aktif 1 · Teks");
    await expect(cabang).toHaveAttribute("data-state", "open");
    await expect(cabang).toContainText("Belum dipilih");
    await expect(page.getByTestId("mapping-summary")).toContainText(/Kolom tidak ditemukan\s*1/);
    await expect(page.getByTestId("mapping-progress")).toHaveText("0 dari 1 diputuskan");
    const extra = page.getByTestId("mapping-extra");
    await expect(extra).toContainText("“Kantor”");
    await expect(extra).toContainText("“Keterangan”");
    // Pilihan kolom file baru: kolom yang belum cocok + contoh nilai, lalu "kosongkan".
    await cabang.getByTestId("mapping-picker").click();
    await expect(page.getByRole("option", { name: /^“Kantor”/ })).toContainText("“Medan”");
    await expect(page.getByRole("option", { name: /^“Keterangan”/ })).toBeVisible();
    await expect(
      page.getByRole("option", { name: "Tidak ada di file — kosongkan (NULL)" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    // Belum ada yang disimpan: versi tetap menunggu.
    expect(versionOf(v.v2)?.status).toBe("AWAITING_MAPPING");
  });

  test("AC 2: file asli sudah dihapus retensi → petakan Cabang ← Kantor → READY + aktif tanpa membaca file asli", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    // File asli versi yang menunggu dihapus job retensi (> 7 hari) sebelum dipetakan.
    expect(sourceExists(v.v2)).toBe(true);
    fx("backdate", v.v2, "8");
    fx("run-job", "raw-retention");
    expect(sourceExists(v.v2)).toBe(false);
    expect(prefixCount(`raw/${datasetId}/${v.v2}/`)).toBe(0);
    expect(versionOf(v.v2)).toMatchObject({ status: "AWAITING_MAPPING", active: false });
    expect(versionOf(v.v2)?.sourceDeletedAt).not.toBeNull();
    expect(prefixCount(`parquet/${datasetId}/${v.v2}/`)).toBeGreaterThan(0);

    await page.goto(`/datasets/${datasetId}/pemetaan`);
    await expect(page.getByTestId("mapping-page")).toBeVisible(SLOW);
    await expect(
      page.getByText("File asli sudah dihapus; pemetaan memakai data yang sudah diproses."),
    ).toBeVisible();
    const cabang = missingRow(page, 1);
    await pickFor(page, cabang, /^“Kantor”/);
    await expect(cabang).toHaveAttribute("data-state", "mapped");
    await expect(cabang).toContainText("Dipetakan");
    await expect(cabang.getByTestId("mapping-picker")).toHaveText("“Kantor”");
    await expect(page.getByTestId("mapping-progress")).toHaveText("1 dari 1 diputuskan");
    // Kantor kini dipakai; hanya Keterangan yang masuk tersembunyi.
    await expect(page.getByTestId("mapping-extra")).not.toContainText("Kantor");
    await expect(page.getByTestId("mapping-extra")).toContainText("“Keterangan”");

    await page.getByTestId("mapping-save").click();
    // Tanpa kolom dikosongkan: tidak ada dialog konfirmasi.
    await expect(page.getByTestId("mapping-confirm")).toHaveCount(0);
    await expectMappedRedirect(page, "pemetaan-2.csv");

    const after = versionOf(v.v2)!;
    expect(after).toMatchObject({ status: "READY", active: true, errorMessage: null });
    expect(after.sourceDeletedAt).not.toBeNull();
    expect(sourceExists(v.v2)).toBe(false);
    expect(versionOf(v.v1)).toMatchObject({ status: "READY", active: false });
    // Kolom yang dipetakan mewarisi nama/tipe aktif; kolom baru ikut tersimpan.
    expect([...sheetTypes(v.v2)].sort()).toEqual([
      "Cabang:text",
      "Keterangan:text",
      "Kode:text",
      "Nilai:integer",
    ]);
    await expect(versionRow(page, v.v2)).toHaveAttribute("data-active", "true", SLOW);
    await expect(versionRow(page, v.v2).getByTestId("version-source-deleted")).toHaveText(
      "File asli sudah dihapus",
    );
    await expect(page.getByTestId("dataset-processing")).toHaveCount(0);

    // Dashboard: angka versi baru; widget per Cabang memakai isi kolom Kantor.
    await page.goto(dashboardUrl);
    await expect(kpiValue(page, TOTAL)).toHaveText("210", SLOW);
    await expect(kpiValue(page, UNIQUE)).toHaveText("3", SLOW);
    await expect
      .poll(async () => sortRows(await chartRows(page, CHART)), SLOW)
      .toEqual([
        ["Makassar", 70],
        ["Medan", 70],
        ["Surabaya", 70],
      ]);
    await expectNoWidgetError(page);
    await expect(page.getByTestId("widget-absent-note")).toHaveCount(0);

    // Skema: Cabang asli "Kantor"; Keterangan (kolom baru) tersembunyi.
    await page.goto(`/datasets/${datasetId}/skema`);
    const cabangPos = await schemaPos(page, "Cabang");
    expect(cabangPos).toBeGreaterThan(0);
    await expect(schemaRow(page, cabangPos)).toContainText('asli: "Kantor"');
    const ketPos = await schemaPos(page, "Keterangan");
    expect(ketPos).toBeGreaterThan(0);
    await expect(page.getByLabel(`Sembunyikan kolom ${ketPos}`)).toBeChecked();
  });

  test("AC 3: kolom hilang → kosongkan (NULL) → aktif; widget pemakainya kosong + catatan, bukan galat; refresh berikutnya tetap tanpa pemetaan", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    // Tanpa Cabang (dan tanpa Keterangan yang tersembunyi → dibuang diam-diam). 15 × 12 = 180.
    const v3 = await uploadVersion(
      page,
      csv(
        "pemetaan-3.csv",
        "Kode;Nilai",
        times(15, (i) => `K-${301 + i};12`),
      ),
    );
    expect(v3.status, JSON.stringify(fx("latest", datasetId))).toBe("AWAITING_MAPPING");
    v.v3 = v3.id;
    expect(versions().find((x) => x.active)?.id).toBe(v.v2);

    await page.goto(`/datasets/${datasetId}`);
    await page.getByTestId("dataset-mapping-link").click();
    await expect(page.getByTestId("mapping-page")).toBeVisible(SLOW);
    await expect(page.getByTestId("mapping-missing-row")).toHaveCount(1);
    const cabang = page.getByTestId("mapping-missing-row");
    await expect(cabang).toContainText("Cabang");
    await expect(cabang).toContainText("kolom ini hanya bisa dikosongkan");
    await expect(page.getByTestId("mapping-extra")).toHaveCount(0);

    // Simpan sebelum memutuskan → fokus ke keputusan yang belum dibuat + pesan galat.
    await page.getByTestId("mapping-save").click();
    await expect(cabang.getByTestId("mapping-picker")).toBeFocused();
    await expect(cabang).toContainText("Pilih kolom file baru, atau kosongkan kolom ini.");
    expect(versionOf(v.v3)?.status).toBe("AWAITING_MAPPING");

    await pickFor(page, cabang, "Tidak ada di file — kosongkan (NULL)");
    await expect(cabang).toHaveAttribute("data-state", "null");
    await expect(cabang).toContainText("Dikosongkan");
    await page.getByTestId("mapping-save").click();
    const dialog = page.getByTestId("mapping-confirm");
    await expect(dialog).toContainText("Kosongkan 1 kolom?");
    await expect(dialog).toContainText("Cabang");
    await dialog.getByRole("button", { name: "Simpan & aktifkan" }).click();
    await expectMappedRedirect(page, "pemetaan-3.csv");

    expect(versionOf(v.v3)).toMatchObject({ status: "READY", active: true });
    expect([...sheetTypes(v.v3)].sort()).toEqual(["Cabang:text", "Kode:text", "Nilai:integer"]);

    // Widget pemakai Cabang: nilai kosong + catatan, bukan galat. Total Nilai tetap jalan.
    await page.goto(dashboardUrl);
    await expect(kpiValue(page, TOTAL)).toHaveText("180", SLOW);
    await expect(kpiValue(page, UNIQUE)).toHaveText("(kosong)", SLOW);
    await expect(widgetTitled(page, UNIQUE).getByTestId("widget-absent-note")).toHaveText(
      ABSENT_NOTE,
    );
    await expect.poll(async () => chartRows(page, CHART), SLOW).toEqual([["(kosong)", 180]]);
    await expect(widgetTitled(page, CHART).getByTestId("widget-absent-note")).toHaveText(
      ABSENT_NOTE,
    );
    await expect(widgetTitled(page, TOTAL).getByTestId("widget-absent-note")).toHaveCount(0);
    await expectNoWidgetError(page);

    // Skema: Cabang tetap ada sebagai kolom kosong (setelah kolom nyata file).
    await page.goto(`/datasets/${datasetId}/skema`);
    const pos = await schemaPos(page, "Cabang");
    expect(pos).toBe(3);
    await expect(schemaRow(page, pos).getByTestId("schema-absent")).toHaveText(
      "Tidak ada di file — kosong",
    );

    // Refresh berikutnya masih tanpa Cabang → langsung aktif, kolom kosong terbawa. 5 × 13 = 65.
    const v4 = await uploadVersion(
      page,
      csv(
        "pemetaan-4.csv",
        "Kode;Nilai",
        times(5, (i) => `K-${401 + i};13`),
      ),
    );
    expect(v4.status, JSON.stringify(fx("latest", datasetId))).toBe("READY");
    v.v4 = v4.id;
    expect(versionOf(v.v4)).toMatchObject({ status: "READY", active: true });
    expect([...sheetTypes(v.v4)].sort()).toEqual(["Cabang:text", "Kode:text", "Nilai:integer"]);
    await page.goto(dashboardUrl);
    await expect(kpiValue(page, TOTAL)).toHaveText("65", SLOW);
    await expect(kpiValue(page, UNIQUE)).toHaveText("(kosong)", SLOW);
    await expect(widgetTitled(page, UNIQUE).getByTestId("widget-absent-note")).toHaveText(
      ABSENT_NOTE,
    );
    await expectNoWidgetError(page);
  });

  test("AC 4: kolom tambahan → aktif sebagai kolom tersembunyi, bisa ditampilkan dari halaman Skema", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(240_000);
    // Kolom baru "Catatan"; Cabang masih tidak ada (tetap kolom kosong). 8 × 10 = 80.
    const v5 = await uploadVersion(
      page,
      csv(
        "pemetaan-5.csv",
        "Kode;Nilai;Catatan",
        times(8, (i) => `K-${501 + i};10;info ${i}`),
      ),
    );
    expect(v5.status, JSON.stringify(fx("latest", datasetId))).toBe("READY");
    v.v5 = v5.id;
    expect(versionOf(v.v5)).toMatchObject({ status: "READY", active: true });
    expect([...sheetTypes(v.v5)].sort()).toEqual([
      "Cabang:text",
      "Catatan:text",
      "Kode:text",
      "Nilai:integer",
    ]);

    const query = (column: string) =>
      page.request.post("/api/query", {
        headers: { Origin: baseURL! },
        data: {
          datasetId,
          spec: { sheetId: sheetId(v.v5), dimensions: [{ column }], measures: [{ agg: "count" }] },
        },
      });
    // Tersembunyi: tidak bisa dipakai query/builder.
    expect((await query("Catatan")).status()).toBe(400);

    await page.goto(`/datasets/${datasetId}/skema`);
    const pos = await schemaPos(page, "Catatan");
    expect(pos).toBeGreaterThan(0);
    const hide = page.getByLabel(`Sembunyikan kolom ${pos}`);
    await expect(hide).toBeChecked();
    await expect(
      schemaRow(page, await schemaPos(page, "Cabang")).getByTestId("schema-absent"),
    ).toBeVisible();
    await hide.uncheck();
    await expect(page.getByTestId("schema-save-bar")).toContainText("1 kolom diubah");
    await page.getByRole("button", { name: "Simpan perubahan" }).click();
    await expect(page.getByTestId("recast-done")).toBeVisible({ timeout: 90_000 });

    await page.reload();
    await expect(page.getByLabel(`Sembunyikan kolom ${pos}`)).not.toBeChecked(SLOW);
    const ok = await query("Catatan");
    expect(ok.status(), await ok.text()).toBe(200);
    expect((await ok.json()).rows).toHaveLength(8);

    await page.goto(dashboardUrl);
    await expect(kpiValue(page, TOTAL)).toHaveText("80", SLOW);
    await expectNoWidgetError(page);
  });
});
