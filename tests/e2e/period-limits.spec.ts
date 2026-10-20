import { execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { apiLogin, registerAndVerify, startWorker, stopWorker, uniqueEmail } from "./helpers";

/*
 * T-055 batas periode utuh (worker sungguhan). Dataset Jan–Mar per bulan, "Simpan 3 periode":
 *  - AC3: pemakaian ≥ 80% → kartu Periode dan panel unggah menampilkan meter + proyeksi; init membawa
 *    perkiraan dari ukuran file (hanya peringatan, unggahan tetap berjalan);
 *  - AC1 REJECT: April ditolak setelah file dibaca dengan nama periodenya, data aktif tetap;
 *  - AC1 EVICT_OLDEST: April lewat panel → tinjauan menampilkan Januari "Dilepas karena batas 3 periode";
 *    Terapkan → Feb–Apr utuh (Januari tidak dipotong, dilepas utuh).
 * (AC2 satu periode > batas baris dan penolakan label saat init: tests/features — batas env tidak bisa
 *  diubah per uji di dev server.)
 */
test.describe.configure({ mode: "serial" });

const OWNER = uniqueEmail("period-limits");
const dir = mkdtempSync(join(tmpdir(), "dd-e2e-period-limits-"));
let worker: ChildProcess | null = null;
const SLOW = { timeout: 120_000 };

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
const versionOf = (datasetId: string, id: string) => versions(datasetId).find((v) => v.id === id);
type Periods = { sheets: { segments: { periodKey: string; dataRows: number }[] }[] };
const periodsOf = (versionId: string) =>
  (seg("periods", versionId) as Periods).sheets.map((s) =>
    s.segments.map((g) => [g.periodKey, g.dataRows]),
  );

const csv = (rows: string[]) => `${["kode;Tanggal Kirim;nilai", ...rows].join("\n")}\n`;
const APRIL = csv(["P;2026-04-02;1", "Q;2026-04-15;2", "R;2026-04-28;3"]);

function file(name: string, content: string): string {
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}

async function api(page: Page, baseURL: string, path: string, data: unknown = {}) {
  const res = await page.request.post(path, {
    data: JSON.stringify(data),
    headers: { origin: baseURL, "content-type": "application/json" },
  });
  return { status: res.status(), body: (await res.json()) as Record<string, unknown> };
}

async function newDataset(page: Page, first: string): Promise<string> {
  await page.goto("/datasets/baru");
  await page.getByLabel("Nama dataset").fill(`Batas periode ${Date.now()}`);
  await page.getByRole("button", { name: "Buat dataset" }).click();
  await expect(page).toHaveURL(/\/datasets\/[a-z0-9]{20,32}\?created=1$/, { timeout: 30_000 });
  const datasetId = new URL(page.url()).pathname.split("/").pop()!;
  await page.getByTestId("upload-input").setInputFiles(first);
  await expect(page.getByTestId("dataset-schema-link")).toBeVisible(SLOW);
  return datasetId;
}

async function saveSettings(page: Page, datasetId: string, keep: string, onLimit: string) {
  await page.goto(`/datasets/${datasetId}/periode`);
  await page.getByTestId("period-keep").fill(keep);
  await page.getByTestId(`period-onlimit-${onLimit}`).check();
  await page.getByTestId("period-settings-save").click();
  await expect(page.getByTestId("period-settings-saved")).toHaveText(
    "Pengaturan periode disimpan.",
  );
}

test.describe("batas periode utuh", () => {
  let datasetId = "";

  test.beforeAll(async ({ browser, request }) => {
    execFileSync("node", ["scripts/dev-reset-ratelimit.mjs", "register:ip"]);
    const p = await browser.newPage();
    await registerAndVerify(p, request, OWNER);
    await p.close();
    worker = await startWorker("period-limits");
  });

  test.beforeEach(async ({ page }) => {
    await apiLogin(page, OWNER);
  });

  test.afterAll(async () => {
    await stopWorker(worker);
  });

  test("AC3 meter + proyeksi; AC1 REJECT menolak April dengan nama periodenya", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(300_000);
    datasetId = await newDataset(
      page,
      file(
        "jan-mar.csv",
        csv(["A;2026-01-05;10", "B;2026-01-20;20", "C;2026-02-10;30", "D;2026-03-15;40"]),
      ),
    );
    await page.goto(`/datasets/${datasetId}/periode`);
    await page.getByTestId("period-review").click();
    await expect(page.getByTestId("period-preview")).toBeVisible(SLOW);
    await page.getByTestId("period-apply").click();
    await expect.poll(() => versions(datasetId).length, SLOW).toBe(2);
    await expect.poll(() => versions(datasetId)[0]!.active, SLOW).toBe(true);

    // Di bawah 80%: tanpa meter.
    await page.goto(`/datasets/${datasetId}`);
    await expect(page.getByTestId("period-card")).toBeVisible();
    await expect(page.getByTestId("period-card-capacity")).toHaveCount(0);
    await expect(page.getByTestId("upload-capacity")).toHaveCount(0);

    await saveSettings(page, datasetId, "3", "REJECT");
    await page.goto(`/datasets/${datasetId}`);
    for (const id of ["period-card-capacity", "upload-capacity"]) {
      const box = page.getByTestId(id);
      await expect(box.getByTestId("capacity-meter")).toHaveText(
        "3 dari 3 periode · 4 dari 10 jt baris · 0,0 dari 16 GB",
      );
      await expect(box.getByTestId("capacity-projection")).toHaveText(
        "Dengan rata-rata 1 baris per bulan, dataset ini menyimpan ±3 bulan (batas simpan periode). Batas sudah tercapai: periode baru berikutnya ditolak sampai periode lama dihapus.",
      );
    }

    // Init: perkiraan hanya peringatan (versi tetap dibuat), lalu worker menolak dengan nama periode.
    const path = file("april.csv", APRIL);
    const init = await api(page, baseURL!, "/api/uploads", {
      datasetId,
      name: "april.csv",
      size: statSync(path).size,
      lastModified: Date.now(),
      mode: "PERIOD",
      baseVersionId: versions(datasetId).find((v) => v.active)!.id,
    });
    expect(init.status, JSON.stringify(init.body)).toBe(200);
    expect(init.body.estimate).toMatchObject({ likely: "REJECT" });
    expect(String((init.body.estimate as { message: string }).message)).toContain(
      "kemungkinan ditolak kecuali file ini hanya mengganti periode yang sudah ada",
    );
    const id = String(init.body.versionId);
    const signed = await api(page, baseURL!, `/api/uploads/${id}/parts`, { partNumbers: [1] });
    const url = (signed.body.urls as { url: string }[])[0]!.url;
    expect((await page.request.put(url, { data: Buffer.from(APRIL) })).status()).toBe(200);
    expect((await api(page, baseURL!, `/api/uploads/${id}/complete`)).status).toBe(200);
    await expect.poll(() => versionOf(datasetId, id)?.status, SLOW).toBe("FAILED");
    expect(versionOf(datasetId, id)!.errorMessage).toContain(
      "Menyimpan April 2026 akan melewati batas simpan 3 periode. Hapus periode Januari 2026 dulu",
    );
    const active = versions(datasetId).find((v) => v.active)!;
    expect(periodsOf(active.id)).toEqual([
      [
        ["2026-01", 2],
        ["2026-02", 1],
        ["2026-03", 1],
      ],
    ]);
  });

  test("AC1 EVICT_OLDEST: Januari dilepas utuh lewat tinjauan; perkiraan init tampil di panel", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await saveSettings(page, datasetId, "3", "EVICT_OLDEST");
    await page.goto(`/datasets/${datasetId}`);
    await expect(
      page.getByTestId("upload-capacity").getByTestId("capacity-projection"),
    ).toContainText("periode baru berikutnya akan melepas bulan terlama (selalu ditinjau dulu)");
    const before = versions(datasetId).length;
    await page.getByTestId("upload-input").setInputFiles(file("april-2.csv", APRIL));
    await expect(page.getByTestId("upload-estimate")).toContainText(
      "periode terlama kemungkinan dilepas utuh",
      SLOW,
    );
    await expect.poll(() => versions(datasetId).length, SLOW).toBe(before + 1);
    const v = versions(datasetId)[0]!;
    await expect.poll(() => versionOf(datasetId, v.id)?.status, SLOW).toBe("AWAITING_CONFIRM");

    await page.goto(`/datasets/${datasetId}/tinjau/${v.id}`);
    const jan = page.locator('[data-testid="review-row"][data-period="2026-01"]');
    await expect(jan.getByTestId("review-note")).toHaveText("Dilepas karena batas 3 periode");
    await expect(jan.getByTestId("review-before")).toHaveText("2");
    const apr = page.locator('[data-testid="review-row"][data-period="2026-04"]');
    await expect(apr.getByTestId("review-note")).toHaveText("Baru");
    const ack = page.getByTestId("review-ack-evict");
    if (await ack.count()) await ack.check();
    await page.getByTestId("review-apply").click();
    await expect(page).toHaveURL(new RegExp(`/datasets/${datasetId}\\?confirmed=1$`), SLOW);
    expect(periodsOf(v.id)).toEqual([
      [
        ["2026-02", 1],
        ["2026-03", 1],
        ["2026-04", 3],
      ],
    ]);
  });
});
