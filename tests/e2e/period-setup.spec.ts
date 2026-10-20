import { execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { apiLogin, registerAndVerify, startWorker, stopWorker, uniqueEmail } from "./helpers";

/*
 * T-051 "Atur periode" lewat worker sungguhan: Tinjau (sebaran, baris tanpa tanggal valid + contoh,
 * proyeksi; tanpa perubahan data), "Terapkan" nonaktif sampai "Buang N baris" dicentang, versi
 * PERIOD_SETUP aktif satu segmen per periode dengan angka sama (minus baris dibuang), riwayat +
 * AuditLog, "Simpan N periode" > maksimal ditolak, pengaturan tersimpan, rollback → mode biasa.
 */
test.describe.configure({ mode: "serial" });

const OWNER = uniqueEmail("period-setup");
const OTHER = uniqueEmail("period-other");
const dir = mkdtempSync(join(tmpdir(), "dd-e2e-period-"));
let worker: ChildProcess | null = null;
const SLOW = { timeout: 120_000 };

const fx = (...args: string[]) =>
  JSON.parse(
    execFileSync("node", ["scripts/dev-upload-fixture.mjs", ...args]).toString(),
  ) as Record<string, unknown>;
const seg = (...args: string[]) =>
  JSON.parse(
    execFileSync("npx", [
      "tsx",
      "--conditions=react-server",
      "--env-file-if-exists=.env",
      "scripts/dev-segments.ts",
      ...args,
    ]).toString(),
  ) as unknown;

// Baris fisik: 1 judul, 2..9 data; baris 6 dan 9 tanpa tanggal.
const CSV = [
  "kode;Tanggal Kirim;nilai",
  "A;2026-01-05;10",
  "B;2026-01-20;20",
  "C;2026-01-31;5",
  "D;2026-02-03;30",
  "E;;40",
  "F;2026-02-28;70",
  "G;2026-03-15;50",
  "H;;60",
].join("\n");

const versionRow = (page: Page, id: string) =>
  page.locator(`[data-testid="version-row"][data-version-id="${id}"]`);

async function kpi(page: Page, baseURL: string, datasetId: string, sheetId: string) {
  const res = await page.request.post("/api/query", {
    data: {
      datasetId,
      spec: {
        sheetId,
        measures: [
          { agg: "sum", column: "nilai" },
          { agg: "count", column: "nilai" },
        ],
      },
    },
    headers: { Origin: baseURL },
  });
  expect(res.status(), await res.text()).toBe(200);
  return ((await res.json()) as { rows: number[][] }).rows[0]!.map(Number);
}

const sheetOf = (versionId: string) => (fx("ingest", versionId).sheets as { id: string }[])[0]!.id;

test.describe("atur periode", () => {
  let datasetId = "";
  let versionA = "";

  test.beforeAll(async ({ browser, request }) => {
    execFileSync("node", ["scripts/dev-reset-ratelimit.mjs", "register:ip"]);
    for (const email of [OWNER, OTHER]) {
      const p = await browser.newPage();
      await registerAndVerify(p, request, email);
      await p.close();
    }
    worker = await startWorker("period-setup");
  });

  test.beforeEach(async ({ page }) => {
    await apiLogin(page, OWNER);
  });

  test.afterAll(async () => {
    await stopWorker(worker);
  });

  test("AC1+AC2+AC4: Tinjau tanpa mengubah data; Terapkan nonaktif sampai 'Buang 2 baris'; batas simpan", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.goto("/datasets/baru");
    await page.getByLabel("Nama dataset").fill(`Periode ${Date.now()}`);
    await page.getByRole("button", { name: "Buat dataset" }).click();
    await expect(page).toHaveURL(/\/datasets\/[a-z0-9]{20,32}\?created=1$/, { timeout: 30_000 });
    datasetId = new URL(page.url()).pathname.split("/").pop()!;
    const file = join(dir, "pengiriman.csv");
    writeFileSync(file, `${CSV}\n`);
    await page.getByTestId("upload-input").setInputFiles(file);
    await expect(page.getByTestId("dataset-schema-link")).toBeVisible(SLOW);
    versionA = String(fx("latest", datasetId).id);

    await page.getByTestId("period-link").click();
    await expect(page.getByTestId("period-page")).toHaveAttribute("data-state", "ready");
    await expect(page.getByTestId("period-source")).toContainText(
      "Dari kolom tanggal: Tanggal Kirim · per bulan",
    );
    // Penjelasan "Saat batas tercapai" ada di layar (AC 4).
    await expect(page.getByText("Tolak unggahan (bawaan)")).toBeVisible();
    await expect(page.getByText("Lepas periode terlama otomatis")).toBeVisible();

    // "Simpan 61 periode" > PERIOD_KEEP_MAX (60) → ditolak.
    await page.getByTestId("period-keep").fill("61");
    await page.getByTestId("period-review").click();
    await expect(page.getByText("Simpan paling banyak 60 periode.")).toBeVisible(SLOW);
    await page.getByTestId("period-keep").fill("");

    await page.getByTestId("period-review").click();
    await expect(page.getByTestId("period-preview")).toBeVisible(SLOW);
    await expect(page.getByTestId("period-row")).toHaveCount(3);
    await expect(page.getByTestId("period-distribution")).toContainText("Januari 2026");
    await expect(page.getByTestId("period-missing")).toContainText("2 baris tanpa tanggal valid");
    await expect(page.getByTestId("period-missing-samples")).toHaveText("6, 9");
    await expect(page.getByTestId("period-usage")).toContainText("3 dari 24 periode disimpan");
    await expect(page.getByTestId("period-projection")).toContainText("Masih ±21 periode lagi");

    const apply = page.getByTestId("period-apply");
    await expect(apply).toBeDisabled();
    await expect(page.getByTestId("period-apply-blocked")).toContainText("Buang 2 baris");
    await page.getByTestId("period-drop").check();
    await expect(apply).toBeEnabled();
    // Mengubah isian membuang hasil tinjauan (Terapkan selalu untuk isian yang ditinjau).
    await page.getByTestId("period-onlimit-EVICT_OLDEST").check();
    await expect(page.getByTestId("period-preview")).toHaveCount(0);
    await page.getByTestId("period-onlimit-REJECT").check();

    // Tinjau tidak mengubah data: tetap satu versi, versi A aktif.
    const versions = fx("versions", datasetId) as unknown as { id: string; active: boolean }[];
    expect(versions.map((v) => [v.id, v.active])).toEqual([[versionA, true]]);
  });

  test("AC3: Terapkan → PERIOD_SETUP aktif satu segmen per periode, angka sama minus dibuang; riwayat + AuditLog; rollback → mode biasa", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(240_000);
    const before = await kpi(page, baseURL!, datasetId, sheetOf(versionA));
    expect(before).toEqual([285, 8]);

    await page.goto(`/datasets/${datasetId}/periode`);
    await page.getByTestId("period-review").click();
    await expect(page.getByTestId("period-preview")).toBeVisible(SLOW);
    await page.getByTestId("period-drop").check();
    await page.getByTestId("period-apply").click();
    await expect(page).toHaveURL(new RegExp(`/datasets/${datasetId}\\?period=1$`), SLOW);

    await expect
      .poll(() => (fx("versions", datasetId) as unknown as { active: boolean }[]).length, SLOW)
      .toBe(2);
    const latest = () =>
      (
        fx("versions", datasetId) as unknown as { id: string; status: string; active: boolean }[]
      )[0]!;
    await expect.poll(() => latest().active, SLOW).toBe(true);
    const versionB = latest().id;
    expect(seg("periods", versionB)).toMatchObject({
      mode: "PERIOD_SETUP",
      periodGrain: "MONTH",
      sheets: [
        {
          periodSource: "COLUMN",
          segments: [
            { periodKey: "2026-01", dataRows: 3 },
            { periodKey: "2026-02", dataRows: 2 },
            { periodKey: "2026-03", dataRows: 1 },
          ],
        },
      ],
    });
    // Angka dashboard sama dikurangi 2 baris yang dibuang (40 + 60).
    expect(await kpi(page, baseURL!, datasetId, sheetOf(versionB))).toEqual([185, 6]);
    const audit = seg("audit", datasetId, "dataset.period.activate") as {
      meta: Record<string, unknown>;
    }[];
    expect(audit).toHaveLength(1);
    expect(audit[0]!.meta).toMatchObject({
      from: versionA,
      versionId: versionB,
      grain: "MONTH",
      periods: 3,
      droppedRows: 2,
    });

    await page.goto(`/datasets/${datasetId}`);
    await expect(versionRow(page, versionB).getByTestId("version-note")).toHaveText(
      "Mode periode diaktifkan (per bulan) · 3 periode · 2 baris tanpa tanggal valid dibuang atas pilihan pemilik",
    );
    await expect(page.getByTestId("period-card")).toContainText("Data disimpan per bulan");

    // Sudah per periode: halaman berisi pengaturan saja; simpan → AuditLog.
    await page.getByTestId("period-link").click();
    await expect(page.getByTestId("period-page")).toHaveAttribute("data-state", "period");
    await expect(page.getByTestId("period-mode")).toContainText("3 periode");
    await page.getByTestId("period-keep").fill("12");
    await page.getByTestId("period-onlimit-EVICT_OLDEST").check();
    await page.getByTestId("period-settings-save").click();
    await expect(page.getByTestId("period-settings-saved")).toHaveText(
      "Pengaturan periode disimpan.",
    );
    expect(
      (seg("audit", datasetId, "dataset.period.settings") as { meta: unknown }[]).map(
        (r) => r.meta,
      ),
    ).toEqual([
      {
        from: { keepPeriods: null, onLimit: "REJECT" },
        to: { keepPeriods: 12, onLimit: "EVICT_OLDEST" },
      },
    ]);

    // Rollback ke versi A → dataset kembali ke mode biasa, angka semula.
    await page.goto(`/datasets/${datasetId}`);
    await versionRow(page, versionA).getByTestId("version-activate").click();
    const dialog = page.getByTestId("version-confirm");
    await dialog.getByRole("button", { name: "Aktifkan", exact: true }).click();
    await expect(versionRow(page, versionA)).toHaveAttribute("data-active", "true", SLOW);
    await page.reload();
    await expect(page.getByTestId("period-card")).toContainText("Ingin menyimpan data per bulan?");
    expect(await kpi(page, baseURL!, datasetId, sheetOf(versionA))).toEqual([285, 8]);
  });

  test("AC4: bukan pemilik → 404 halaman Atur periode", async ({ page }) => {
    await apiLogin(page, OTHER);
    const res = await page.goto(`/datasets/${datasetId}/periode`);
    expect(res?.status()).toBe(404);
  });
});
