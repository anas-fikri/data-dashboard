import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { apiLogin, registerAndVerify, uniqueEmail } from "./helpers";

/*
 * T-006/T-007: unggah dari UI → worker sungguhan (proses terpisah) → raw.parquet + typed-1.parquet per
 * sheet di storage, versi READY dan aktif.
 */
test.describe.configure({ mode: "serial" });

const OWNER = uniqueEmail("ing-owner");
let worker: ChildProcess | null = null;

function fx(...args: string[]): Record<string, unknown> {
  return JSON.parse(
    execFileSync("node", ["scripts/dev-upload-fixture.mjs", ...args]).toString(),
  ) as Record<string, unknown>;
}

async function createDataset(page: Page, name: string): Promise<string> {
  await page.goto("/datasets/baru");
  await page.getByLabel("Nama dataset").fill(name);
  await page.getByRole("button", { name: "Buat dataset" }).click();
  await expect(page).toHaveURL(/\/datasets\/[a-z0-9]{20,32}\?created=1$/);
  return new URL(page.url()).pathname.split("/").pop()!;
}

async function uploadAndWait(
  page: Page,
  file: string,
): Promise<{ versionId: string; info: Record<string, unknown> }> {
  await page.getByTestId("upload-input").setInputFiles(file);
  const name = file.split("/").pop()!;
  await expect(page.getByText(`"${name}" terunggah.`)).toBeVisible({ timeout: 30_000 });
  const id = new URL(page.url()).pathname.split("/").pop()!;
  const versionId = String(fx("latest", id).id);
  let info: Record<string, unknown> = {};
  await expect
    .poll(
      () => {
        info = fx("ingest", versionId);
        return info.status === "READY" || info.status === "FAILED" ? "selesai" : "proses";
      },
      { timeout: 90_000, intervals: [500] },
    )
    .toBe("selesai");
  return { versionId, info };
}

test.describe("ingest", () => {
  test.beforeAll(async ({ browser, request }) => {
    execFileSync("node", ["scripts/dev-reset-ratelimit.mjs", "register:ip"]); // batas registrasi per IP di suite penuh
    const p = await browser.newPage();
    await registerAndVerify(p, request, OWNER);
    await p.close();
    worker = spawn("npm", ["run", "worker"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
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
  });

  test.afterAll(() => {
    worker?.kill("SIGTERM");
  });

  test("xlsx 3 sheet → raw + typed per sheet, headerRow 4, SHA-256, versi READY aktif", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await apiLogin(page, OWNER);
    await createDataset(page, "Ingest Tiga Sheet");
    const file = "tests/fixtures/tiga-sheet.xlsx";
    const { info } = await uploadAndWait(page, file);
    expect(info).toMatchObject({
      status: "READY",
      ingestStage: "typed",
      active: true,
      errorMessage: null,
    });
    expect(info.sha256).toBe(createHash("sha256").update(readFileSync(file)).digest("hex"));
    const sheets = info.sheets as {
      name: string;
      headerRow: number;
      rawRows: number;
      rawKey: string;
      typedKey: string;
      schemaRevision: number;
      types: string[];
    }[];
    expect(sheets.map((s) => s.name)).toEqual(["Pengiriman 1", "Pengiriman 2", "Pengiriman 3"]);
    const want = (
      JSON.parse(readFileSync(`${file}.manifest.json`, "utf8")) as {
        sheets: { nonEmptyRows: number }[];
      }
    ).sheets.map((s) => s.nonEmptyRows);
    expect(sheets.map((s) => s.headerRow)).toEqual([4, 4, 4]);
    expect(sheets.map((s) => s.rawRows)).toEqual(want);
    expect(sheets.map((s) => s.schemaRevision)).toEqual([1, 1, 1]);
    expect(sheets.every((s) => s.types.length > 0)).toBe(true);
    expect([...(info.objects as string[])].sort()).toEqual(
      sheets.flatMap((s) => [s.rawKey, s.typedKey]).sort(),
    );
    // Halaman profil tidak lagi "Memproses": versi aktif siap dipakai.
    await page.reload();
    await expect(page.getByTestId("dataset-status")).toContainText("Siap");
  });

  test("CSV Windows-1252 titik koma → satu sheet raw + typed", async ({ page }) => {
    test.setTimeout(120_000);
    await apiLogin(page, OWNER);
    await createDataset(page, "Ingest CSV Lama");
    const { info } = await uploadAndWait(page, "tests/fixtures/kecil-win1252.csv");
    expect(info).toMatchObject({ status: "READY", ingestStage: "typed" });
    expect((info.sheets as { colCount: number }[])[0]!.colCount).toBe(10);
    expect((info.objects as string[]).length).toBe(2);
  });

  test("API query (T-009): pemilik dapat hasil + cache; bukan pemilik 404; Origin asing 403", async ({
    page,
    browser,
    request,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    await apiLogin(page, OWNER);
    const datasetId = await createDataset(page, "Query CSV");
    const { info } = await uploadAndWait(page, "tests/fixtures/kecil-win1252.csv");
    expect(info).toMatchObject({ status: "READY" });
    const sheet = (info.sheets as { id: string; types: string[] }[])[0]!;
    const first = sheet.types[0]!.split(":")[0]!;
    const spec = {
      sheetId: sheet.id,
      dimensions: [{ column: first }],
      measures: [{ agg: "count" }],
      limit: 5,
    };
    const headers = { Origin: baseURL! };

    const a = await page.request.post("/api/query", { data: { datasetId, spec }, headers });
    expect(a.status(), await a.text()).toBe(200);
    const ja = (await a.json()) as { ok: boolean; cached: boolean; rows: unknown[][] };
    expect(ja).toMatchObject({ ok: true, cached: false });
    expect(ja.rows.length).toBeGreaterThan(0);
    const b = await page.request.post("/api/query", {
      data: {
        spec: { limit: 5, measures: spec.measures, dimensions: spec.dimensions, sheetId: sheet.id },
        datasetId,
      },
      headers,
    });
    expect(((await b.json()) as { cached: boolean }).cached).toBe(true);

    const bad = await page.request.post("/api/query", {
      data: { datasetId, spec: { ...spec, measures: [{ agg: "median" }] } },
      headers,
    });
    expect(bad.status()).toBe(400);
    const cross = await page.request.post("/api/query", {
      data: { datasetId, spec },
      headers: { Origin: "https://evil.example" },
    });
    expect(cross.status()).toBe(403);

    const other = await browser.newPage();
    const stranger = uniqueEmail("ing-stranger");
    await registerAndVerify(other, request, stranger);
    await apiLogin(other, stranger);
    const r = await other.request.post("/api/query", { data: { datasetId, spec }, headers });
    expect(r.status()).toBe(404);
    await other.close();
  });

  test("xlsx berisi DOCTYPE → FAILED dengan pesan di halaman, tanpa objek parquet", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await apiLogin(page, OWNER);
    await createDataset(page, "Ingest Berbahaya");
    const { info } = await uploadAndWait(page, "tests/fixtures/hostile/doctype.xlsx");
    expect(info).toMatchObject({ status: "FAILED" });
    expect(String(info.errorMessage)).toContain("DOCTYPE");
    expect(info.objects).toEqual([]);
    await page.reload();
    await expect(page.getByTestId("dataset-status")).toContainText("Gagal");
    await expect(page.getByTestId("dataset-status-message")).toContainText("DOCTYPE");
  });
});
