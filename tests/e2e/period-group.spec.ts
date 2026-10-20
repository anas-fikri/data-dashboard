import { execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { apiLogin, registerAndVerify, startWorker, stopWorker, uniqueEmail } from "./helpers";

/*
 * T-060 satu periode dari beberapa file sebagai satu kelompok (worker sungguhan):
 *  - AC1: Maret dipecah ke 3 file → "Satu periode dari beberapa file" → satu versi berisi 3 segmen Maret
 *    yang menggantikan seluruh Maret (tinjauan: diganti); unggah ulang kelompok yang sama → file
 *    identik, data sama persis, tanpa baris ganda. (Fixture kecil mewakili bulan > 1.048.576 baris:
 *    jalurnya sama; skala diuji unit/perf terpisah.)
 *  - AC2: kelompok > PERIOD_MAX_FILES (bawaan 10) → ditolak dengan pesan, tidak ada yang diunggah.
 */
test.describe.configure({ mode: "serial" });

const OWNER = uniqueEmail("period-group");
const dir = mkdtempSync(join(tmpdir(), "dd-e2e-period-group-"));
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
type Version = { id: string; status: string; active: boolean };
const versions = (datasetId: string) => fx("versions", datasetId) as unknown as Version[];
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
            ctx: Document,
            opt: object,
          ) => Promise<{ violations: { id: string; impact: string }[] }>;
        };
      }
    ).axe;
    const r = await axe.run(document, { resultTypes: ["violations"] });
    return r.violations.map((x) => ({ id: x.id, impact: x.impact }));
  });
  return v.filter((x) => x.impact === "serious" || x.impact === "critical");
}

function file(name: string, content: string): string {
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}
const H = "kode;Tanggal Kirim;nilai";
const csv = (rows: string[]) => `${[H, ...rows].join("\n")}\n`;
const march = (from: number, n: number) =>
  Array.from(
    { length: n },
    (_, i) => `M${from + i};2026-03-${String(((from + i) % 28) + 1).padStart(2, "0")};${from + i}`,
  );

async function newDataset(page: Page, name: string, first: string): Promise<string> {
  await page.goto("/datasets/baru");
  await page.getByLabel("Nama dataset").fill(`${name} ${Date.now()}`);
  await page.getByRole("button", { name: "Buat dataset" }).click();
  await expect(page).toHaveURL(/\/datasets\/[a-z0-9]{20,32}\?created=1$/, { timeout: 30_000 });
  const datasetId = new URL(page.url()).pathname.split("/").pop()!;
  await page.getByTestId("upload-input").setInputFiles(first);
  await expect(page.getByTestId("dataset-schema-link")).toBeVisible(SLOW);
  return datasetId;
}

async function setupPeriods(page: Page, datasetId: string) {
  await page.goto(`/datasets/${datasetId}/periode`);
  await page.getByTestId("period-review").click();
  await expect(page.getByTestId("period-preview")).toBeVisible(SLOW);
  const count = versions(datasetId).length;
  await page.getByTestId("period-apply").click();
  await expect.poll(() => versions(datasetId).length, SLOW).toBe(count + 1);
  await expect.poll(() => versions(datasetId)[0]!.active, SLOW).toBe(true);
}

/** Pilih file kelompok, aktifkan sakelar kelompok, unggah, lalu terapkan di layar tinjauan. */
async function uploadGroup(page: Page, datasetId: string, files: string[], identical: boolean) {
  await page.goto(`/datasets/${datasetId}`);
  await page.getByTestId("upload-input").setInputFiles(files);
  const draft = page.getByTestId("upload-queue-draft");
  await expect(draft.getByRole("heading", { name: `Antrean ${files.length} file` })).toBeFocused();
  await draft.getByRole("switch", { name: "Satu periode dari beberapa file" }).click();
  await expect(
    draft.getByRole("heading", { name: "Kelompok 3 file — satu periode" }),
  ).toBeVisible();
  await draft.getByRole("button", { name: "Unggah sebagai satu kelompok (3 file)" }).click();
  const queue = page.getByTestId("upload-queue");
  await expect(queue.getByRole("heading", { name: "Kelompok file satu periode" })).toBeVisible();
  await expect(page.getByTestId("upload-queue-position")).toHaveText(
    "Kelompok 3 file menunggu tinjauan Anda.",
    SLOW,
  );
  // Semua file kelompok berbagi satu versi; file tidak bisa dilewati satu per satu.
  await expect(page.getByTestId("upload-queue-status")).toHaveText([
    "Menunggu tinjauan Anda",
    "Menunggu tinjauan Anda",
    "Menunggu tinjauan Anda",
  ]);
  await expect(queue.getByRole("button", { name: /Lewati/ })).toHaveCount(0);
  expect(await axeSerious(page)).toEqual([]);
  await page
    .getByTestId("upload-queue-held")
    .getByRole("link", { name: "Tinjau perubahan" })
    .click();
  await expect(page).toHaveURL(new RegExp(`/datasets/${datasetId}/tinjau/`));
  await expect(page.getByText("Maret 2026").first()).toBeVisible();
  if (identical) await expect(page.getByText(/identik/).first()).toBeVisible();
  await page.getByTestId("review-apply").click();
  await expect(page).toHaveURL(new RegExp(`/datasets/${datasetId}\\?confirmed=1$`), SLOW);
  await expect(page.getByTestId("upload-queue-position")).toHaveText(
    "Kelompok selesai: 3 file — diterapkan sebagai satu periode.",
    SLOW,
  );
  await page.getByTestId("upload-queue-dismiss").click();
  await expect(page.getByTestId("upload-queue")).toHaveCount(0);
}

test.describe("kelompok file satu periode", () => {
  test.beforeAll(async ({ browser, request }) => {
    execFileSync("node", ["scripts/dev-reset-ratelimit.mjs", "register:ip"]);
    const p = await browser.newPage();
    await registerAndVerify(p, request, OWNER);
    await p.close();
    worker = await startWorker("period-group");
  });

  test.beforeEach(async ({ page }) => {
    await apiLogin(page, OWNER);
  });

  test.afterAll(async () => {
    await stopWorker(worker);
  });

  test("AC1 + AC2: 3 file Maret → satu versi 3 segmen menggantikan Maret; unggah ulang identik; > batas ditolak", async ({
    page,
  }) => {
    test.setTimeout(400_000);
    const datasetId = await newDataset(
      page,
      "Kelompok periode",
      file(
        "jan-mar.csv",
        csv([
          "A;2026-01-05;10",
          "B;2026-01-20;20",
          "C;2026-02-01;30",
          "D;2026-02-10;40",
          "E;2026-03-02;50",
          "F;2026-03-09;60",
          "G;2026-03-15;70",
        ]),
      ),
    );
    await setupPeriods(page, datasetId);
    const parts = [
      file("maret bagian 1.csv", csv(march(0, 4))),
      file("maret bagian 2.csv", csv(march(4, 4))),
      file("maret bagian 3.csv", csv(march(8, 2))),
    ];

    await uploadGroup(page, datasetId, parts, false);
    const first = versions(datasetId).find((v) => v.active)!;
    expect(periodsOf(first.id)).toEqual([
      [
        ["2026-01", 2],
        ["2026-02", 2],
        ["2026-03", 4],
        ["2026-03", 4],
        ["2026-03", 2],
      ],
    ]);

    // Unggah ulang kelompok yang sama → Maret diganti dengan isi yang sama, tanpa baris ganda.
    await uploadGroup(page, datasetId, parts, true);
    const second = versions(datasetId).find((v) => v.active)!;
    expect(second.id).not.toBe(first.id);
    expect(periodsOf(second.id)).toEqual(periodsOf(first.id));
    expect(versions(datasetId).every((v) => v.status === "READY")).toBe(true);

    // AC2: > PERIOD_MAX_FILES (10) file dalam satu kelompok → ditolak dengan pesan, tidak ada antrean.
    await page.goto(`/datasets/${datasetId}`);
    const many = Array.from({ length: 11 }, (_, i) =>
      file(`maret potongan ${i + 1}.csv`, csv(march(i, 1))),
    );
    await page.getByTestId("upload-input").setInputFiles(many);
    const draft = page.getByTestId("upload-queue-draft");
    await draft.getByRole("switch", { name: "Satu periode dari beberapa file" }).click();
    await draft.getByRole("button", { name: "Unggah sebagai satu kelompok (11 file)" }).click();
    await expect(draft.getByRole("alert")).toContainText(
      "Satu kelompok paling banyak 10 file, Anda memilih 11 file.",
    );
    await expect(page.getByTestId("upload-queue")).toHaveCount(0);
    expect(versions(datasetId).find((v) => v.active)!.id).toBe(second.id);
  });
});
