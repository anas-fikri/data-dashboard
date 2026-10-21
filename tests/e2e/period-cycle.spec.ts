import { execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { apiLogin, registerAndVerify, startWorker, stopWorker, uniqueEmail } from "./helpers";

/*
 * T-063 AC3: siklus periode bulanan ujung-ke-ujung (worker sungguhan, satu dataset, satu dashboard
 * dengan KPI "Jumlah baris"). Di SETIAP langkah diperiksa: angka KPI di dashboard, baris per periode
 * menurut metadata versi aktif (manifest segmen), dan baris per periode menurut data itu sendiri
 * (/api/query berdimensi kolom sistem "Periode").
 *   1. unggah Desember 2025 (ganti semua data) → Atur periode per bulan
 *   2. tambah Januari, tambah Februari (aktif otomatis)
 *   3. ganti Februari lewat tinjauan (satu file), lalu ganti lagi sebagai kelompok 3 file satu periode
 *   4. "Simpan 2 periode" + "Lepas periode terlama otomatis" → Maret: Desember dan Januari dilepas utuh
 *      lewat tinjauan
 *   5. rollback (Aktifkan versi sebelum Maret) → Desember–Februari kembali
 *   6. hapus Januari → pulihkan ditolak batas 2 periode → pengaturan kembali bawaan → pulihkan Januari
 *   7. atur ulang per kuartal (angka sama) → rollback ke per bulan
 * Alur REPLACE lama tetap diuji versions.spec.ts / ingest.spec.ts tanpa perubahan helper.
 */
test.describe.configure({ mode: "serial" });

const OWNER = uniqueEmail("period-cycle");
const dir = mkdtempSync(join(tmpdir(), "dd-e2e-period-cycle-"));
let worker: ChildProcess | null = null;
const SLOW = { timeout: 120_000 };
const FAST = { timeout: 15_000 };
const KPI = "Jumlah baris";

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

type Version = { id: string; status: string; active: boolean; errorMessage: string | null };
const versions = (datasetId: string) => fx("versions", datasetId) as unknown as Version[];
const activeId = (datasetId: string) => versions(datasetId).find((v) => v.active)!.id;
type Periods = {
  periodGrain: string | null;
  sheets: { id: string; segments: { periodKey: string; dataRows: number }[] }[];
};
/** Baris per periode menurut manifest versi (segmen satu periode dijumlah). */
function metaRows(versionId: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const g of (seg("periods", versionId) as Periods).sheets[0]!.segments) {
    out[g.periodKey] = (out[g.periodKey] ?? 0) + g.dataRows;
  }
  return out;
}

const H = "kode;Tanggal Kirim;nilai";
/** n baris di bulan `ym` (YYYY-MM), kode berawalan `tag` agar setiap file berisi baris berbeda. */
const rows = (tag: string, ym: string, n: number, from = 0) =>
  Array.from(
    { length: n },
    (_, i) => `${tag}${from + i};${ym}-${String(((from + i) % 27) + 1).padStart(2, "0")};${i + 1}`,
  );
function file(name: string, lines: string[]): string {
  const path = join(dir, name);
  writeFileSync(path, `${[H, ...lines].join("\n")}\n`);
  return path;
}

const widgetTitled = (page: Page, title: string) =>
  page.getByTestId("widget").filter({ has: page.getByRole("heading", { name: title }) });
const versionRow = (page: Page, id: string) =>
  page.locator(`[data-testid="version-row"][data-version-id="${id}"]`);
const reviewRow = (page: Page, key: string) =>
  page.locator(`[data-testid="review-row"][data-period="${key}"]`);
const periodRow = (page: Page, key: string) =>
  page.locator(`[data-testid="period-row"][data-period="${key}"]`);

async function confirmIn(page: Page, trigger: Locator, confirm: string) {
  await trigger.click();
  const dialog = page.getByTestId("version-confirm");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: confirm, exact: true }).click();
}

test.describe("siklus periode bulanan", () => {
  let datasetId = "";
  let dashboardUrl = "";

  /** Baris per periode menurut data (kolom sistem Periode, query widget sungguhan). */
  async function dataRows(page: Page, baseURL: string): Promise<Record<string, number>> {
    const sheetId = (seg("periods", activeId(datasetId)) as Periods).sheets[0]!.id;
    const res = await page.request.post("/api/query", {
      data: {
        datasetId,
        spec: {
          sheetId,
          dimensions: [{ column: "Periode", timeGrain: "month" }],
          measures: [{ agg: "count", column: "nilai" }],
        },
      },
      headers: { Origin: baseURL },
    });
    expect(res.status(), await res.text()).toBe(200);
    const out: Record<string, number> = {};
    for (const [k, n] of ((await res.json()) as { rows: [string, number][] }).rows) {
      out[String(k).slice(0, 7)] = Number(n);
    }
    return out;
  }

  /**
   * Satu langkah siklus: KPI dashboard = total, metadata versi aktif = `meta` (kunci periode versi),
   * dan data per bulan = `data` (bulan awal periode).
   */
  async function expectStep(
    page: Page,
    baseURL: string,
    meta: Record<string, number>,
    data: Record<string, number> = meta,
  ) {
    const total = Object.values(meta).reduce((a, b) => a + b, 0);
    expect(metaRows(activeId(datasetId))).toEqual(meta);
    expect(await dataRows(page, baseURL)).toEqual(data);
    await page.goto(dashboardUrl);
    await expect(widgetTitled(page, KPI).getByTestId("kpi-value")).toHaveText(String(total), SLOW);
  }

  /** Unggah satu file periode lewat panel; tunggu versinya aktif atau menunggu tinjauan. */
  async function uploadPeriod(page: Page, path: string): Promise<Version> {
    const before = versions(datasetId).length;
    await page.goto(`/datasets/${datasetId}`);
    await expect(page.getByTestId("upload-period-title")).toContainText(
      "Tambah atau perbarui periode",
    );
    await page.getByTestId("upload-input").setInputFiles(path);
    await expect.poll(() => versions(datasetId).length, SLOW).toBe(before + 1);
    const id = versions(datasetId)[0]!.id;
    await expect
      .poll(() => versions(datasetId).find((v) => v.id === id)!.status, SLOW)
      .toMatch(/^(READY|AWAITING_CONFIRM|FAILED|AWAITING_MAPPING)$/);
    return versions(datasetId).find((v) => v.id === id)!;
  }

  async function apply(page: Page) {
    const ack = page.getByTestId("review-ack-evict");
    if (await ack.count()) await ack.check();
    await page.getByTestId("review-apply").click();
    await expect(page).toHaveURL(new RegExp(`/datasets/${datasetId}\\?confirmed=1$`), SLOW);
  }

  test.beforeAll(async ({ browser, request }) => {
    execFileSync("node", ["scripts/dev-reset-ratelimit.mjs", "register:ip"]);
    const p = await browser.newPage();
    await registerAndVerify(p, request, OWNER);
    await p.close();
    worker = await startWorker("period-cycle");
  });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await apiLogin(page, OWNER);
  });

  test.afterAll(async () => {
    await stopWorker(worker);
  });

  test("atur periode → tambah → ganti (tinjauan, kelompok) → lepas terlama → rollback → hapus → pulihkan → atur ulang", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(900_000);
    const url = baseURL!;

    // 1. Desember 2025 sebagai data biasa, dashboard KPI "Jumlah baris", lalu Atur periode.
    await page.goto("/datasets/baru");
    await page.getByLabel("Nama dataset").fill(`Siklus periode ${Date.now()}`);
    await page.getByRole("button", { name: "Buat dataset" }).click();
    await expect(page).toHaveURL(/\/datasets\/[a-z0-9]{20,32}\?created=1$/, { timeout: 30_000 });
    datasetId = new URL(page.url()).pathname.split("/").pop()!;
    await page
      .getByTestId("upload-input")
      .setInputFiles(file("desember-2025.csv", rows("D", "2025-12", 4)));
    await expect(page.getByTestId("dataset-schema-link")).toBeVisible(SLOW);

    await page.goto(`/dashboards/baru?dataset=${datasetId}`);
    await page.getByLabel("Nama dashboard").fill("Siklus periode");
    await page.getByRole("button", { name: "Buat dashboard" }).click();
    await expect(page).toHaveURL(/\?mode=edit$/, SLOW);
    dashboardUrl = page.url().replace("?mode=edit", "");
    await page
      .getByTestId("canvas-toolbar")
      .getByRole("button", { name: "Tambah widget", exact: true })
      .click();
    const panel = page.getByTestId("widget-panel");
    await expect(panel.getByRole("heading", { name: "Pengaturan widget" })).toBeFocused();
    await panel.getByLabel("Judul", { exact: true }).fill(KPI);
    await panel.getByLabel("Judul", { exact: true }).press("Enter");
    await expect(widgetTitled(page, KPI)).toHaveCount(1);
    await panel.getByText("Angka", { exact: true }).click();
    await expect(panel.getByTestId("config-status")).toHaveAttribute("data-state", "saved", SLOW);
    await panel.getByLabel("Nilai", { exact: true }).click();
    await page.getByRole("option", { name: "Jumlah baris", exact: true }).click();
    await expect(panel.getByTestId("config-status")).toHaveAttribute("data-state", "saved", SLOW);
    await expect(widgetTitled(page, KPI).getByTestId("kpi-value")).toHaveText("4", SLOW);

    await page.goto(`/datasets/${datasetId}/periode`);
    await page.getByTestId("period-review").click();
    await expect(page.getByTestId("period-preview")).toBeVisible(SLOW);
    await page.getByTestId("period-apply").click();
    await expect.poll(() => versions(datasetId).length, SLOW).toBe(2);
    await expect.poll(() => versions(datasetId)[0]!.active, SLOW).toBe(true);
    await expectStep(page, url, { "2025-12": 4 });

    // 2. Januari, Februari: periode baru murni → aktif otomatis tanpa tinjauan.
    const jan = await uploadPeriod(page, file("januari-2026.csv", rows("J", "2026-01", 5)));
    expect(jan).toMatchObject({ status: "READY", active: true });
    await expectStep(page, url, { "2025-12": 4, "2026-01": 5 });
    const feb = await uploadPeriod(page, file("februari-2026.csv", rows("F", "2026-02", 6)));
    expect(feb).toMatchObject({ status: "READY", active: true });
    await expectStep(page, url, { "2025-12": 4, "2026-01": 5, "2026-02": 6 });

    // 3a. Ganti Februari (satu file, 8 baris) → menunggu tinjauan; data aktif tetap sampai Terapkan.
    const feb2 = await uploadPeriod(
      page,
      file("februari-2026-revisi.csv", rows("G", "2026-02", 8)),
    );
    expect(feb2.status).toBe("AWAITING_CONFIRM");
    await expectStep(page, url, { "2025-12": 4, "2026-01": 5, "2026-02": 6 });
    await page.goto(`/datasets/${datasetId}/tinjau/${feb2.id}`);
    await expect(reviewRow(page, "2026-02").getByTestId("review-before")).toHaveText("6");
    await expect(reviewRow(page, "2026-02").getByTestId("review-after")).toHaveText("8");
    await expect(reviewRow(page, "2026-02").getByTestId("review-note")).toHaveText("Diganti");
    await apply(page);
    await expectStep(page, url, { "2025-12": 4, "2026-01": 5, "2026-02": 8 });

    // 3b. Ganti Februari lagi sebagai kelompok 3 file satu periode (3 + 3 + 1 baris).
    await page.goto(`/datasets/${datasetId}`);
    const before3b = versions(datasetId).length;
    await page
      .getByTestId("upload-input")
      .setInputFiles([
        file("februari bagian 1.csv", rows("K", "2026-02", 3, 0)),
        file("februari bagian 2.csv", rows("K", "2026-02", 3, 3)),
        file("februari bagian 3.csv", rows("K", "2026-02", 1, 6)),
      ]);
    const draft = page.getByTestId("upload-queue-draft");
    await draft.getByRole("switch", { name: "Satu periode dari beberapa file" }).click();
    await draft.getByRole("button", { name: "Unggah sebagai satu kelompok (3 file)" }).click();
    await expect(page.getByTestId("upload-queue-position")).toHaveText(
      "Kelompok 3 file menunggu tinjauan Anda.",
      SLOW,
    );
    expect(versions(datasetId)).toHaveLength(before3b + 1);
    const group = versions(datasetId)[0]!;
    await page.goto(`/datasets/${datasetId}/tinjau/${group.id}`);
    await expect(reviewRow(page, "2026-02").getByTestId("review-before")).toHaveText("8");
    await expect(reviewRow(page, "2026-02").getByTestId("review-after")).toHaveText("7");
    await apply(page);
    await expect(page.getByTestId("upload-queue-position")).toHaveText(
      "Kelompok selesai: 3 file — diterapkan sebagai satu periode.",
      SLOW,
    );
    await page.getByTestId("upload-queue-dismiss").click();
    await expect(page.getByTestId("upload-queue")).toHaveCount(0);
    const grouped = activeId(datasetId);
    expect(grouped).toBe(group.id);
    expect(
      (seg("periods", grouped) as Periods).sheets[0]!.segments.filter(
        (g) => g.periodKey === "2026-02",
      ),
    ).toHaveLength(3);
    await expectStep(page, url, { "2025-12": 4, "2026-01": 5, "2026-02": 7 });

    // 4. Simpan 2 periode + lepas terlama otomatis → Maret: Desember dan Januari dilepas utuh.
    await page.goto(`/datasets/${datasetId}/periode`);
    await page.getByTestId("period-keep").fill("2");
    await page.getByTestId("period-onlimit-EVICT_OLDEST").check();
    await page.getByTestId("period-settings-save").click();
    await expect(page.getByTestId("period-settings-saved")).toHaveText(
      "Pengaturan periode disimpan.",
    );
    const mar = await uploadPeriod(page, file("maret-2026.csv", rows("M", "2026-03", 3)));
    expect(mar.status).toBe("AWAITING_CONFIRM");
    await page.goto(`/datasets/${datasetId}/tinjau/${mar.id}`);
    for (const [key, n] of [
      ["2025-12", "4"],
      ["2026-01", "5"],
    ] as const) {
      await expect(reviewRow(page, key).getByTestId("review-note")).toHaveText(
        "Dilepas karena batas 2 periode",
      );
      await expect(reviewRow(page, key).getByTestId("review-before")).toHaveText(n);
    }
    await expect(reviewRow(page, "2026-03").getByTestId("review-note")).toHaveText("Baru");
    await apply(page);
    await expectStep(page, url, { "2026-02": 7, "2026-03": 3 });

    // 5. Rollback ke versi kelompok Februari: Desember dan Januari kembali, Maret hilang.
    await page.goto(`/datasets/${datasetId}`);
    await versionRow(page, grouped).getByTestId("version-activate").click();
    await expect(page.getByTestId("version-activate-warning")).toContainText("Desember 2025");
    await page
      .getByTestId("version-confirm")
      .getByRole("button", { name: "Aktifkan", exact: true })
      .click();
    await expect(versionRow(page, grouped)).toHaveAttribute("data-active", "true", SLOW);
    await expectStep(page, url, { "2025-12": 4, "2026-01": 5, "2026-02": 7 });

    // 6. Hapus Januari (tanpa job worker) → pulihkan dari versi yang masih tersimpan.
    await page.goto(`/datasets/${datasetId}`);
    await confirmIn(
      page,
      periodRow(page, "2026-01").getByTestId("period-remove"),
      "Hapus Januari 2026",
    );
    await expect(page.getByTestId("period-result")).toContainText("Januari 2026 dihapus", FAST);
    await expectStep(page, url, { "2025-12": 4, "2026-02": 7 });
    // Batas "Simpan 2 periode" masih berlaku: pulihkan ditolak dengan arahan, data aktif tetap.
    const restoreJan = async () => {
      await page.goto(`/datasets/${datasetId}`);
      await confirmIn(
        page,
        page
          .locator('[data-testid="period-candidate"][data-period="2026-01"]')
          .getByTestId("period-restore"),
        "Pulihkan Januari 2026",
      );
    };
    const removed = activeId(datasetId);
    await restoreJan();
    await expect(page.getByTestId("version-confirm").getByRole("alert")).toContainText(
      "Memulihkan Januari 2026 akan melewati batas simpan 2 periode. Hapus periode Desember 2025 dulu",
      FAST,
    );
    expect(activeId(datasetId)).toBe(removed);
    // Kembali ke bawaan (24 periode, tolak unggahan) → pulihkan berhasil.
    await page.goto(`/datasets/${datasetId}/periode`);
    await page.getByTestId("period-keep").fill("");
    await page.getByTestId("period-onlimit-REJECT").check();
    await page.getByTestId("period-settings-save").click();
    await expect(page.getByTestId("period-settings-saved")).toHaveText(
      "Pengaturan periode disimpan.",
    );
    await restoreJan();
    await expect(page.getByTestId("period-result")).toContainText("Januari 2026 dipulihkan", FAST);
    const restored = activeId(datasetId);
    await expectStep(page, url, { "2025-12": 4, "2026-01": 5, "2026-02": 7 });

    // 7. Atur ulang per kuartal (versi baru, angka sama) → rollback ke per bulan.
    await page.goto(`/datasets/${datasetId}/periode`);
    const reset = page.getByTestId("period-reset");
    await reset.getByTestId("period-grain").click();
    await page.getByRole("option", { name: "Kuartal", exact: true }).click();
    await reset.getByTestId("period-review").click();
    await expect(reset.getByTestId("period-preview")).toBeVisible(SLOW);
    const beforeReset = versions(datasetId).length;
    await reset.getByTestId("period-apply").click();
    await expect.poll(() => versions(datasetId).length, SLOW).toBe(beforeReset + 1);
    await expect.poll(() => versions(datasetId)[0]!.active, SLOW).toBe(true);
    expect((seg("periods", activeId(datasetId)) as Periods).periodGrain).toBe("QUARTER");
    await expectStep(page, url, { "2025-Q4": 4, "2026-Q1": 12 }, { "2025-10": 4, "2026-01": 12 });
    await page.goto(`/datasets/${datasetId}`);
    await versionRow(page, restored).getByTestId("version-activate").click();
    await page
      .getByTestId("version-confirm")
      .getByRole("button", { name: "Aktifkan", exact: true })
      .click();
    await expect(versionRow(page, restored)).toHaveAttribute("data-active", "true", SLOW);
    await expectStep(page, url, { "2025-12": 4, "2026-01": 5, "2026-02": 7 });
    // Tidak ada versi yang gagal sepanjang siklus.
    expect(versions(datasetId).filter((v) => v.status === "FAILED")).toEqual([]);
  });
});
