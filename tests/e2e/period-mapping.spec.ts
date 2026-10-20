import { execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { apiLogin, registerAndVerify, startWorker, stopWorker, uniqueEmail } from "./helpers";

/*
 * T-057 pemetaan kolom pada unggahan periode, lewat worker + halaman pemetaan sungguhan. Dataset per
 * bulan (Jan–Mar, kolom periode "Tanggal Kirim"), lalu
 *  - April berjudul "Tgl Kirim" + kolom baru "catatan" → menunggu pemetaan; halaman pemetaan tanpa pilihan
 *    tipe + arahan ke halaman Skema (AC3); dipetakan → April aktif, Jan–Mar file typed yang sama (AC1),
 *    "catatan" kolom tersembunyi baru, periode lama NULL (AC2);
 *  - Mei berjudul "Tgl Kirim" lagi → terpetakan otomatis lewat alias, tanpa menunggu pemetaan (AC4);
 *  - Juni tanpa "nilai" → "Kosongkan" → NULL hanya untuk Juni, kolom tetap bukan absent (AC2).
 */
test.describe.configure({ mode: "serial" });

const OWNER = uniqueEmail("period-map");
const dir = mkdtempSync(join(tmpdir(), "dd-e2e-period-map-"));
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
type Periods = {
  sheets: {
    id: string;
    columns: { pos: number; name: string; hidden: boolean; absent: boolean; aliases: string[] }[];
    segments: { periodKey: string; dataRows: number; typedId: string }[];
  }[];
};
const periods = (versionId: string) => seg("periods", versionId) as Periods;

const csv = (header: string, rows: string[]) => `${[header, ...rows].join("\n")}\n`;
const missingRow = (page: Page, pos: number) =>
  page.locator(`[data-testid="mapping-missing-row"][data-active-pos="${pos}"]`);

async function api(page: Page, baseURL: string, path: string, data: unknown = {}) {
  const res = await page.request.post(path, {
    data: JSON.stringify(data),
    headers: { origin: baseURL, "content-type": "application/json" },
  });
  return { status: res.status(), body: (await res.json()) as Record<string, unknown> };
}

/** Unggah periode lewat API (init → part → complete), seperti panel unggah; id versi baru. */
async function upload(
  page: Page,
  baseURL: string,
  datasetId: string,
  name: string,
  content: string,
) {
  const file = join(dir, name);
  writeFileSync(file, content);
  const base = versions(datasetId).find((v) => v.active)!.id;
  const init = await api(page, baseURL, "/api/uploads", {
    datasetId,
    name,
    size: statSync(file).size,
    lastModified: 1,
    mode: "PERIOD",
    baseVersionId: base,
  });
  expect(init.status, JSON.stringify(init.body)).toBe(200);
  const versionId = String(init.body.versionId);
  const signed = await api(page, baseURL, `/api/uploads/${versionId}/parts`, { partNumbers: [1] });
  const url = (signed.body.urls as { url: string }[])[0]!.url;
  expect((await page.request.put(url, { data: Buffer.from(content) })).status()).toBe(200);
  expect((await api(page, baseURL, `/api/uploads/${versionId}/complete`)).status).toBe(200);
  return versionId;
}

const settled = (datasetId: string, id: string) => () => {
  const s = versions(datasetId).find((v) => v.id === id)?.status;
  return s && ["READY", "FAILED", "AWAITING_MAPPING", "AWAITING_CONFIRM"].includes(s) ? s : "…";
};

async function query(
  page: Page,
  baseURL: string,
  datasetId: string,
  sheetId: string,
  cols: string[],
) {
  const res = await page.request.post("/api/query", {
    data: {
      datasetId,
      spec: {
        sheetId,
        measures: [
          { agg: "sum", column: "nilai" },
          ...cols.map((column) => ({ agg: "count", column })),
        ],
      },
    },
    headers: { Origin: baseURL },
  });
  expect(res.status(), await res.text()).toBe(200);
  return ((await res.json()) as { rows: number[][] }).rows[0]!.map(Number);
}

test.describe("pemetaan unggahan periode", () => {
  let datasetId = "";
  let setupVersion = "";

  test.beforeAll(async ({ browser, request }) => {
    execFileSync("node", ["scripts/dev-reset-ratelimit.mjs", "register:ip"]);
    const p = await browser.newPage();
    await registerAndVerify(p, request, OWNER);
    await p.close();
    worker = await startWorker("period-mapping");
  });

  test.beforeEach(async ({ page }) => {
    await apiLogin(page, OWNER);
  });

  test.afterAll(async () => {
    await stopWorker(worker);
  });

  test("AC1 + AC3: 'Tgl Kirim' → menunggu pemetaan; layar tanpa ubah tipe; dipetakan → hanya April baru", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(300_000);
    await page.goto("/datasets/baru");
    await page.getByLabel("Nama dataset").fill(`Periode pemetaan ${Date.now()}`);
    await page.getByRole("button", { name: "Buat dataset" }).click();
    await expect(page).toHaveURL(/\/datasets\/[a-z0-9]{20,32}\?created=1$/, { timeout: 30_000 });
    datasetId = new URL(page.url()).pathname.split("/").pop()!;
    const first = join(dir, "jan-mar.csv");
    writeFileSync(
      first,
      csv("kode;Tanggal Kirim;nilai", [
        "A;2026-01-05;10",
        "B;2026-01-20;20",
        "C;2026-02-03;30",
        "D;2026-02-28;40",
        "E;2026-03-15;50",
      ]),
    );
    await page.getByTestId("upload-input").setInputFiles(first);
    await expect(page.getByTestId("dataset-schema-link")).toBeVisible(SLOW);
    await page.getByTestId("period-link").click();
    await page.getByTestId("period-review").click();
    await expect(page.getByTestId("period-preview")).toBeVisible(SLOW);
    await page.getByTestId("period-apply").click();
    await expect.poll(() => versions(datasetId).length, SLOW).toBe(2);
    await expect.poll(() => versions(datasetId)[0]!.active, SLOW).toBe(true);
    setupVersion = versions(datasetId)[0]!.id;
    const before = periods(setupVersion).sheets[0]!.segments.map((g) => g.typedId);

    const april = await upload(
      page,
      baseURL!,
      datasetId,
      "april.csv",
      csv("kode;Tgl Kirim;nilai;catatan", ["F;2026-04-02;60;baru", "G;2026-04-30;70;lagi"]),
    );
    await expect.poll(settled(datasetId, april), SLOW).toBe("AWAITING_MAPPING");
    expect(versions(datasetId).find((v) => v.id === april)!.errorMessage).toMatch(/Tanggal Kirim/);

    await page.goto(`/datasets/${datasetId}/pemetaan`);
    await expect(page.getByTestId("mapping-page")).toBeVisible(SLOW);
    // AC3: arahan ke halaman Skema; tidak ada pilihan tipe di layar pemetaan periode.
    const notice = page.getByTestId("mapping-period-notice");
    await expect(notice).toContainText("Tipe kolom tidak bisa diubah di sini");
    await expect(page.getByTestId("mapping-schema-link")).toHaveAttribute(
      "href",
      `/datasets/${datasetId}/skema`,
    );
    const kirim = missingRow(page, 2);
    await expect(kirim).toContainText("Tanggal Kirim");
    await kirim.getByTestId("mapping-picker").click();
    await page.getByRole("option", { name: /^“Tgl Kirim”/ }).click();
    await expect(kirim).toHaveAttribute("data-state", "mapped");
    await expect(page.locator('[id$="-cast-type"]')).toHaveCount(0);
    await expect(page.getByTestId("mapping-extra")).toContainText("“catatan”");
    await page.getByTestId("mapping-save").click();
    await expect(page).toHaveURL(new RegExp(`/datasets/${datasetId}\\?mapped=1$`), SLOW);
    await expect(page.getByTestId("mapping-done")).toContainText(
      "Pemetaan disimpan. Versi “april.csv” aktif.",
      SLOW,
    );

    expect(versions(datasetId).find((v) => v.id === april)).toMatchObject({
      status: "READY",
      active: true,
    });
    const after = periods(april).sheets[0]!;
    expect(after.segments.map((g) => [g.periodKey, g.dataRows])).toEqual([
      ["2026-01", 2],
      ["2026-02", 2],
      ["2026-03", 1],
      ["2026-04", 2],
    ]);
    // Periode lama tidak di-cast ulang: file typed yang sama.
    expect(after.segments.slice(0, 3).map((g) => g.typedId)).toEqual(before);
    // Judul pengganti diingat; kolom tambahan = kolom tersembunyi baru.
    expect(after.columns.find((c) => c.name === "Tanggal Kirim")!.aliases).toEqual(["Tgl Kirim"]);
    expect(after.columns.find((c) => c.name === "catatan")).toMatchObject({
      hidden: true,
      absent: false,
    });
    expect(await query(page, baseURL!, datasetId, after.id, ["nilai"])).toEqual([280, 7]);

    // Tampilkan "catatan" dari halaman Skema: hanya baris April berisi (periode lama NULL lewat
    // proyeksi), dan file typed periode lama tidak ditulis ulang.
    await page.goto(`/datasets/${datasetId}/skema`);
    const hide = page.getByLabel("Sembunyikan kolom 4");
    await expect(hide).toBeChecked(SLOW);
    await hide.uncheck();
    await page.getByRole("button", { name: "Simpan perubahan" }).click();
    await expect(page.getByTestId("recast-done")).toBeVisible({ timeout: 90_000 });
    const shown = periods(april).sheets[0]!;
    expect(shown.segments.slice(0, 3).map((g) => g.typedId)).toEqual(before);
    expect(await query(page, baseURL!, datasetId, shown.id, ["nilai", "catatan"])).toEqual([
      280, 7, 2,
    ]);
  });

  test("AC4: Mei kembali memakai 'Tgl Kirim' → terpetakan otomatis lewat alias, tanpa menunggu pemetaan", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(180_000);
    const mei = await upload(
      page,
      baseURL!,
      datasetId,
      "mei.csv",
      csv("kode;Tgl Kirim;nilai;catatan", ["H;2026-05-03;5;ok"]),
    );
    await expect.poll(settled(datasetId, mei), SLOW).toBe("READY");
    expect(versions(datasetId).find((v) => v.id === mei)!.active).toBe(true);
    const s = periods(mei).sheets[0]!;
    expect(s.segments.map((g) => g.periodKey)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
    ]);
    expect(await query(page, baseURL!, datasetId, s.id, ["nilai", "catatan"])).toEqual([285, 8, 3]);
  });

  test("AC2: Juni tanpa 'nilai' → 'Kosongkan' → NULL hanya untuk Juni; kolom tetap (bukan absent)", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(300_000);
    const prev = versions(datasetId).find((v) => v.active)!.id;
    const before = periods(prev).sheets[0]!.segments.map((g) => g.typedId);
    const juni = await upload(
      page,
      baseURL!,
      datasetId,
      "juni.csv",
      csv("kode;Tgl Kirim;catatan", ["I;2026-06-01;x", "J;2026-06-02;y"]),
    );
    await expect.poll(settled(datasetId, juni), SLOW).toBe("AWAITING_MAPPING");
    await page.goto(`/datasets/${datasetId}/pemetaan`);
    await expect(page.getByTestId("mapping-page")).toBeVisible(SLOW);
    const nilai = missingRow(page, 3);
    await nilai.getByTestId("mapping-picker").click();
    await page.getByRole("option", { name: "Tidak ada di file — kosongkan (NULL)" }).click();
    await page.getByTestId("mapping-save").click();
    const dialog = page.getByTestId("mapping-confirm");
    await expect(dialog).toContainText("hanya untuk periode di file ini");
    await dialog.getByRole("button", { name: "Simpan pemetaan" }).click();
    await expect(page).toHaveURL(new RegExp(`/datasets/${datasetId}\\?mapped=1$`), SLOW);

    expect(versions(datasetId).find((v) => v.id === juni)).toMatchObject({
      status: "READY",
      active: true,
    });
    const s = periods(juni).sheets[0]!;
    expect(s.segments.slice(0, 5).map((g) => g.typedId)).toEqual(before);
    expect(s.segments.at(-1)).toMatchObject({ periodKey: "2026-06", dataRows: 2 });
    expect(s.columns.find((c) => c.name === "nilai")).toMatchObject({
      absent: false,
      hidden: false,
    });
    // nilai: Juni kosong (jumlah dan hitungan tidak berubah), periode lama tetap berisi.
    expect(await query(page, baseURL!, datasetId, s.id, ["nilai", "kode"])).toEqual([285, 8, 10]);
  });
});
