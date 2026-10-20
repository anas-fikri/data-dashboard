import { execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { apiLogin, registerAndVerify, startWorker, stopWorker, uniqueEmail } from "./helpers";

/*
 * T-056 kelola daftar periode. Dataset Jan–Mar diatur per bulan + April diunggah (worker sungguhan),
 * lalu worker DIHENTIKAN — hapus dan pulihkan harus aktif tanpa job worker:
 *  - AC1: kartu Periode: Periode | Baris per sheet | File | Diunggah oleh | Tanggal + "Unggah ulang"
 *    (panel unggah dengan periode terisi) dan "Hapus";
 *  - AC2: "Hapus Februari 2026" → versi PERIOD_REMOVE aktif dalam hitungan detik, periode lain tidak
 *    berubah; periode terakhir tidak bisa dihapus (arahan "Ganti semua data");
 *  - AC3: "Pulihkan" dari versi lama yang tersimpan → periode kembali tanpa membatalkan periode lain;
 *    setelah versi lama dibuang retensi → aksi tidak tersedia + penjelasan;
 *  - AC4: riwayat menyebut "ditambahkan / dihapus / dipulihkan"; "Aktifkan" versi lama memperingatkan
 *    periode yang ikut hilang.
 */
test.describe.configure({ mode: "serial" });

const OWNER = uniqueEmail("period-manage");
const dir = mkdtempSync(join(tmpdir(), "dd-e2e-period-manage-"));
let worker: ChildProcess | null = null;
const SLOW = { timeout: 120_000 };
/** Hapus/pulihkan tanpa worker: "dalam hitungan detik". */
const FAST = { timeout: 10_000 };

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

type Version = { id: string; status: string; active: boolean };
const versions = (datasetId: string) => fx("versions", datasetId) as unknown as Version[];
const activeId = (datasetId: string) => versions(datasetId).find((v) => v.active)!.id;
type Periods = { sheets: { segments: { periodKey: string; dataRows: number }[] }[] };
const periodsOf = (versionId: string) =>
  (seg("periods", versionId) as Periods).sheets.map((s) =>
    s.segments.map((g) => [g.periodKey, g.dataRows]),
  );

const AXE = readFileSync(join(process.cwd(), "node_modules/axe-core/axe.min.js"), "utf8");

async function axeSerious(page: Page) {
  await page.evaluate(AXE);
  const v = await page.evaluate(async () => {
    const axe = (
      window as unknown as {
        axe: {
          run: (
            ctx: Element,
            opt: object,
          ) => Promise<{
            violations: { id: string; impact: string; nodes: { target: unknown[] }[] }[];
          }>;
        };
      }
    ).axe;
    const r = await axe.run(document.querySelector('[data-testid="period-card"]')!, {
      resultTypes: ["violations"],
    });
    return r.violations.map((x) => ({
      id: x.id,
      impact: x.impact,
      targets: x.nodes.slice(0, 3).map((n) => JSON.stringify(n.target)),
    }));
  });
  return v.filter((x) => x.impact === "serious" || x.impact === "critical");
}

const csv = (rows: string[]) => `${["kode;Tanggal Kirim;nilai", ...rows].join("\n")}\n`;

function file(name: string, content: string): string {
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}

const row = (page: Page, key: string) =>
  page.locator(`[data-testid="period-row"][data-period="${key}"]`);
const candidate = (page: Page, key: string) =>
  page.locator(`[data-testid="period-candidate"][data-period="${key}"]`);
const shownPeriods = async (page: Page) =>
  page
    .getByTestId("period-row")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-period")));

async function confirmIn(page: Page, trigger: Locator, confirm: string) {
  await trigger.click();
  const dialog = page.getByTestId("version-confirm");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: confirm }).click();
}

async function removeVia(page: Page, key: string, label: string) {
  await confirmIn(page, row(page, key).getByTestId("period-remove"), `Hapus ${label}`);
  await expect(page.getByTestId("period-result")).toContainText(`${label} dihapus`, FAST);
  await expect(row(page, key)).toHaveCount(0, FAST);
}

async function restoreVia(page: Page, key: string, label: string) {
  await confirmIn(page, candidate(page, key).getByTestId("period-restore"), `Pulihkan ${label}`);
  await expect(page.getByTestId("period-result")).toContainText(`${label} dipulihkan`, FAST);
  await expect(row(page, key)).toHaveCount(1, FAST);
}

test.describe("kelola daftar periode", () => {
  let datasetId = "";

  test.beforeAll(async ({ browser, request }) => {
    execFileSync("node", ["scripts/dev-reset-ratelimit.mjs", "register:ip"]);
    const p = await browser.newPage();
    await registerAndVerify(p, request, OWNER);
    await p.close();
    worker = await startWorker("period-manage");
  });

  test.beforeEach(async ({ page }) => {
    await apiLogin(page, OWNER);
  });

  test.afterAll(async () => {
    await stopWorker(worker);
  });

  test("AC1–AC4: kartu Periode, hapus dan pulihkan tanpa worker, riwayat berlabel, peringatan rollback", async ({
    page,
  }) => {
    test.setTimeout(420_000);
    await page.goto("/datasets/baru");
    await page.getByLabel("Nama dataset").fill(`Kelola periode ${Date.now()}`);
    await page.getByRole("button", { name: "Buat dataset" }).click();
    await expect(page).toHaveURL(/\/datasets\/[a-z0-9]{20,32}\?created=1$/, { timeout: 30_000 });
    datasetId = new URL(page.url()).pathname.split("/").pop()!;
    await page
      .getByTestId("upload-input")
      .setInputFiles(
        file(
          "jan-mar.csv",
          csv(["A;2026-01-05;10", "B;2026-01-20;20", "C;2026-02-10;30", "D;2026-03-15;40"]),
        ),
      );
    await expect(page.getByTestId("dataset-schema-link")).toBeVisible(SLOW);
    await page.goto(`/datasets/${datasetId}/periode`);
    await page.getByTestId("period-review").click();
    await expect(page.getByTestId("period-preview")).toBeVisible(SLOW);
    await page.getByTestId("period-apply").click();
    await expect.poll(() => versions(datasetId).length, SLOW).toBe(2);
    await expect.poll(() => versions(datasetId)[0]!.active, SLOW).toBe(true);
    // April murni ditambahkan → aktif otomatis.
    await page.goto(`/datasets/${datasetId}`);
    await page
      .getByTestId("upload-input")
      .setInputFiles(
        file("april.csv", csv(["P;2026-04-02;1", "Q;2026-04-15;2", "R;2026-04-28;3"])),
      );
    await expect.poll(() => versions(datasetId).length, SLOW).toBe(3);
    await expect.poll(() => versions(datasetId)[0]!.active, SLOW).toBe(true);
    // Mulai sini tanpa worker: hapus/pulihkan hanya mengubah manifest.
    await stopWorker(worker);
    worker = null;

    // AC1: daftar periode terbaru dulu dengan kolom lengkap.
    await page.goto(`/datasets/${datasetId}`);
    const card = page.getByTestId("period-card");
    await expect(card.getByTestId("period-list")).toBeVisible();
    expect(await shownPeriods(page)).toEqual(["2026-04", "2026-03", "2026-02", "2026-01"]);
    for (const h of ["Periode", "Baris per sheet", "File", "Diunggah oleh", "Tanggal"]) {
      await expect(card.getByRole("columnheader", { name: h })).toBeAttached();
    }
    const apr = row(page, "2026-04");
    await expect(apr.getByTestId("period-label")).toHaveText("April 2026");
    await expect(apr.getByTestId("period-rows")).toContainText("3");
    await expect(apr.getByTestId("period-file")).toHaveText("april.csv");
    await expect(apr.getByTestId("period-uploader")).toHaveText("Uji E2E");
    await expect(row(page, "2026-01").getByTestId("period-file")).toHaveText("jan-mar.csv");
    await expect(row(page, "2026-01").getByTestId("period-rows")).toContainText("2");
    // Pengunggah dibawa dari segmen asal saat "Atur periode" memecah data (bukan versi pembuatnya).
    await expect(row(page, "2026-01").getByTestId("period-uploader")).toHaveText("Uji E2E");
    await expect(apr.locator("time")).toBeVisible();
    await expect(apr.getByTestId("period-remove")).toBeVisible();
    expect(await axeSerious(page)).toEqual([]);
    // Ponsel: tanpa gulir horizontal halaman, tombol aksi ≥ 44 px.
    await page.setViewportSize({ width: 360, height: 800 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect((await apr.getByTestId("period-remove").boundingBox())!.height).toBeGreaterThanOrEqual(
      44,
    );
    expect(await axeSerious(page)).toEqual([]);
    await page.setViewportSize({ width: 1280, height: 800 });

    // "Unggah ulang" → panel unggah dengan periode terisi.
    await apr.getByTestId("period-reupload").click();
    await expect(page).toHaveURL(new RegExp(`\\?unggah=2026-04-01#unggah$`));
    await expect(page.getByTestId("upload-reupload")).toContainText("Unggah ulang April 2026");
    await expect(page.getByTestId("upload-dropzone")).toBeVisible();
    await page.goto(`/datasets/${datasetId}`);

    // AC2: hapus Februari → versi baru aktif dalam hitungan detik, periode lain tetap.
    const before = activeId(datasetId);
    const t0 = Date.now();
    await removeVia(page, "2026-02", "Februari 2026");
    expect(Date.now() - t0).toBeLessThan(10_000);
    const removed = activeId(datasetId);
    expect(removed).not.toBe(before);
    expect(periodsOf(removed)).toEqual([
      [
        ["2026-01", 2],
        ["2026-03", 1],
        ["2026-04", 3],
      ],
    ]);
    await page.reload();
    const latest = page.getByTestId("version-row").first();
    await expect(latest).toHaveAttribute("data-active", "true");
    await expect(latest.getByTestId("version-note")).toHaveText("Februari 2026 dihapus (1 baris)");
    await expect(
      page
        .locator(`[data-testid="version-row"][data-version-id="${before}"]`)
        .getByTestId("version-note"),
    ).toHaveText("April 2026 ditambahkan (3 baris)");

    // AC4: rollback ke versi sebelum hapus memperingatkan periode yang kembali/hilang.
    const prev = page.locator(`[data-testid="version-row"][data-version-id="${before}"]`);
    await prev.getByTestId("version-activate").click();
    await expect(page.getByTestId("version-activate-warning")).toHaveText(
      "Februari 2026 kembali ke data aktif.",
    );
    await page.getByTestId("version-confirm").getByRole("button", { name: "Batal" }).click();

    // AC3: pulihkan Februari dari versi lama yang masih tersimpan.
    const feb = candidate(page, "2026-02");
    await expect(feb).toContainText("tidak ada di data aktif");
    await expect(feb).toContainText("Dari versi “april.csv”");
    // Review L1: dialog menyebut baris periode per sheet sebelum → sesudah.
    await feb.getByTestId("period-restore").click();
    await expect(page.getByTestId("period-restore-sheet")).toHaveCount(1);
    await expect(page.getByTestId("period-restore-sheet")).toContainText("tidak ada → 1 baris");
    await page.getByTestId("version-confirm").getByRole("button", { name: "Batal" }).click();
    await restoreVia(page, "2026-02", "Februari 2026");
    const restored = activeId(datasetId);
    expect(periodsOf(restored)).toEqual([
      [
        ["2026-01", 2],
        ["2026-02", 1],
        ["2026-03", 1],
        ["2026-04", 3],
      ],
    ]);
    await page.reload();
    await expect(page.getByTestId("version-row").first().getByTestId("version-note")).toHaveText(
      "Februari 2026 dipulihkan (1 baris)",
    );
    // Rollback ke versi hapus: Februari ikut hilang.
    await page
      .locator(`[data-testid="version-row"][data-version-id="${removed}"]`)
      .getByTestId("version-activate")
      .click();
    await expect(page.getByTestId("version-activate-warning")).toContainText(
      "Februari 2026 ikut hilang dari data aktif.",
    );
    await page.getByTestId("version-confirm").getByRole("button", { name: "Batal" }).click();

    // AC2: sampai tinggal satu periode → tidak bisa dihapus, diarahkan ke "Ganti semua data".
    await removeVia(page, "2026-01", "Januari 2026");
    await removeVia(page, "2026-03", "Maret 2026");
    await removeVia(page, "2026-04", "April 2026");
    await page.reload();
    expect(await shownPeriods(page)).toEqual(["2026-02"]);
    await expect(row(page, "2026-02").getByTestId("period-remove")).toHaveCount(0);
    await expect(page.getByTestId("period-last-note")).toContainText("Ganti semua data");

    // AC3: Januari dihapus tiga versi lalu → versi yang memuatnya sudah dibuang retensi (3 versi siap
    // terakhir disimpan): aksi tidak tersedia + penjelasan; April masih bisa dipulihkan.
    const jan = candidate(page, "2026-01");
    await expect(jan).toHaveAttribute("data-available", "false");
    await expect(jan.getByTestId("period-candidate-why")).toContainText(
      "versi lama yang memuatnya sudah dihapus otomatis",
    );
    await expect(jan.getByTestId("period-restore")).toHaveCount(0);
    await expect(candidate(page, "2026-04")).toHaveAttribute("data-available", "true");
    await restoreVia(page, "2026-04", "April 2026");
    expect(periodsOf(activeId(datasetId))).toEqual([
      [
        ["2026-02", 1],
        ["2026-04", 3],
      ],
    ]);
  });
});
