import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { apiLogin, registerAndVerify, uniqueEmail } from "./helpers";

/* T-006: unggah dari UI → worker sungguhan (proses terpisah) → raw.parquet per sheet di storage. */
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
        return info.ingestStage === "raw" || info.status === "FAILED" ? "selesai" : "proses";
      },
      { timeout: 90_000, intervals: [500] },
    )
    .toBe("selesai");
  return { versionId, info };
}

test.describe("ingest", () => {
  test.beforeAll(async ({ browser, request }) => {
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

  test("xlsx 3 sheet → raw.parquet per sheet di storage, headerRow 4, SHA-256 tersimpan", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await apiLogin(page, OWNER);
    await createDataset(page, "Ingest Tiga Sheet");
    const file = "tests/fixtures/tiga-sheet.xlsx";
    const { info } = await uploadAndWait(page, file);
    expect(info).toMatchObject({ status: "INGESTING", ingestStage: "raw", errorMessage: null });
    expect(info.sha256).toBe(createHash("sha256").update(readFileSync(file)).digest("hex"));
    const sheets = info.sheets as {
      name: string;
      headerRow: number;
      rawRows: number;
      rawKey: string;
    }[];
    expect(sheets.map((s) => s.name)).toEqual(["Pengiriman 1", "Pengiriman 2", "Pengiriman 3"]);
    const want = (
      JSON.parse(readFileSync(`${file}.manifest.json`, "utf8")) as {
        sheets: { nonEmptyRows: number }[];
      }
    ).sheets.map((s) => s.nonEmptyRows);
    expect(sheets.map((s) => s.headerRow)).toEqual([4, 4, 4]);
    expect(sheets.map((s) => s.rawRows)).toEqual(want);
    expect([...(info.objects as string[])].sort()).toEqual(sheets.map((s) => s.rawKey).sort());
  });

  test("CSV Windows-1252 titik koma → satu sheet raw", async ({ page }) => {
    test.setTimeout(120_000);
    await apiLogin(page, OWNER);
    await createDataset(page, "Ingest CSV Lama");
    const { info } = await uploadAndWait(page, "tests/fixtures/kecil-win1252.csv");
    expect(info).toMatchObject({ ingestStage: "raw" });
    expect((info.sheets as { colCount: number }[])[0]!.colCount).toBe(10);
    expect((info.objects as string[]).length).toBe(1);
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
