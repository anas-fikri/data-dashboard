import { execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { apiLogin, registerAndVerify, startWorker, stopWorker, uniqueEmail } from "./helpers";

/*
 * T-059 antrean unggah banyak file periode (worker sungguhan):
 *  - AC1 + AC2 (mode kolom): 4 file sekaligus → urutan periode (Feb, Mar, Apr, file tanpa periode);
 *    Februari menyusut → antrean berhenti "File 1 dari 4 menunggu tinjauan"; file lain tetap
 *    terunggah dan menunggu; muat ulang halaman tidak menghilangkan apa pun (status server); Terapkan
 *    → antrean lanjut sendiri; file rusak gagal tanpa menghentikan antrean dan tercantum di ringkasan;
 *    periode akhir sesuai; axe tanpa pelanggaran serius.
 *  - AC2 (sheet berlabel): periode per file wajib dipilih; tab dimuat ulang sebelum file terunggah →
 *    "Pilih ulang file" melanjutkan; Hentikan antrean → file yang belum diproses dibatalkan, file yang
 *    ditinjau tetap diselesaikan (dibatalkan di tinjauan) → ringkasan "dihentikan"; Tutup ringkasan.
 */
test.describe.configure({ mode: "serial" });

const OWNER = uniqueEmail("period-queue");
const dir = mkdtempSync(join(tmpdir(), "dd-e2e-period-queue-"));
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
          ) => Promise<{
            violations: { id: string; impact: string; nodes: { target: unknown[] }[] }[];
          }>;
        };
      }
    ).axe;
    const r = await axe.run(document, { resultTypes: ["violations"] });
    return r.violations.map((x) => ({
      id: x.id,
      impact: x.impact,
      targets: x.nodes.slice(0, 3).map((n) => JSON.stringify(n.target)),
    }));
  });
  return v.filter((x) => x.impact === "serious" || x.impact === "critical");
}

function file(name: string, content: string): string {
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}
const csv = (header: string, rows: string[]) => `${[header, ...rows].join("\n")}\n`;

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

/** "Atur periode" (T-051) dengan sumber bawaan; tunggu versi PERIOD_SETUP aktif. */
async function setupPeriods(page: Page, datasetId: string) {
  await page.goto(`/datasets/${datasetId}/periode`);
  await page.getByTestId("period-review").click();
  await expect(page.getByTestId("period-preview")).toBeVisible(SLOW);
  const count = versions(datasetId).length;
  await page.getByTestId("period-apply").click();
  await expect.poll(() => versions(datasetId).length, SLOW).toBe(count + 1);
  await expect.poll(() => versions(datasetId)[0]!.active, SLOW).toBe(true);
}

const item = (page: Page, seq: number) =>
  page.locator(`[data-testid="upload-queue-item"][data-seq="${seq}"]`);

test.describe("antrean unggah periode", () => {
  test.beforeAll(async ({ browser, request }) => {
    execFileSync("node", ["scripts/dev-reset-ratelimit.mjs", "register:ip"]);
    const p = await browser.newPage();
    await registerAndVerify(p, request, OWNER);
    await p.close();
    worker = await startWorker("period-queue");
  });

  test.beforeEach(async ({ page }) => {
    await apiLogin(page, OWNER);
  });

  test.afterAll(async () => {
    await stopWorker(worker);
  });

  test("AC1 + AC2: berurutan, berhenti di tinjauan, lanjut setelah Terapkan, gagal tercatat", async ({
    page,
  }) => {
    test.setTimeout(400_000);
    const H = "kode;Tanggal Kirim;nilai";
    const datasetId = await newDataset(
      page,
      "Antrean periode",
      file(
        "jan-feb.csv",
        csv(H, [
          "A;2026-01-05;10",
          "B;2026-01-20;20",
          "C;2026-02-01;30",
          "D;2026-02-10;40",
          "E;2026-02-20;50",
          "F;2026-02-28;60",
        ]),
      ),
    );
    await setupPeriods(page, datasetId);
    await page.goto(`/datasets/${datasetId}`);

    // Dipilih acak; urutan proses = periode dari nama file, file tanpa periode terakhir.
    await page
      .getByTestId("upload-input")
      .setInputFiles([
        file("rusak.xlsx", "ini bukan file excel"),
        file("april 2026.csv", csv(H, ["G;2026-04-02;70"])),
        file("februari 2026.csv", csv(H, ["H;2026-02-11;5"])),
        file("maret 2026.csv", csv(H, ["I;2026-03-03;80", "J;2026-03-30;90"])),
      ]);
    const draft = page.getByTestId("upload-queue-draft");
    await expect(draft.getByRole("heading", { name: "Antrean 4 file" })).toBeFocused();
    await expect(draft.getByTestId("upload-queue-draft-row")).toHaveText([
      /februari 2026\.csv/,
      /maret 2026\.csv/,
      /april 2026\.csv/,
      /rusak\.xlsx/,
    ]);
    await expect(page.getByTestId("upload-dropzone")).toHaveCount(0);
    await page.getByTestId("upload-queue-start").click();

    // Februari menyusut > 50% → tinjauan; antrean berhenti di file 1, file lain terunggah dan menunggu,
    // file rusak gagal (pra-cek) tanpa menghentikan antrean.
    const queue = page.getByTestId("upload-queue");
    await expect(queue).toBeVisible();
    await expect(page.getByTestId("upload-queue-position")).toHaveText(
      "File 1 dari 4 menunggu tinjauan Anda — antrean berhenti sampai diputuskan.",
      SLOW,
    );
    await expect(item(page, 2)).toHaveAttribute("data-state", "QUEUED", SLOW);
    await expect(item(page, 3)).toHaveAttribute("data-state", "QUEUED", SLOW);
    await expect(item(page, 4)).toHaveAttribute("data-state", "FAILED", SLOW);
    await expect(item(page, 4).getByTestId("upload-queue-message")).toContainText(
      "Format file tidak valid",
    );
    // Satu ajakan tinjau (kartu panel unggah biasa tidak ganda).
    await expect(page.getByTestId("upload-awaiting-confirm")).toHaveCount(0);
    expect(await axeSerious(page)).toEqual([]);

    // AC2: muat ulang (≈ tutup tab) — status dari server, tidak ada file yang hilang.
    await page.reload();
    await expect(page.getByTestId("upload-queue-position")).toContainText("File 1 dari 4");
    await expect(page.getByTestId("upload-queue-item")).toHaveCount(4);
    await expect(item(page, 2)).toHaveAttribute("data-state", "QUEUED");
    await expect(item(page, 3)).toHaveAttribute("data-state", "QUEUED");
    await expect(page.getByTestId("upload-queue-missing")).toHaveCount(0);
    await expect(page.getByTestId("upload-dropzone")).toHaveCount(0);

    // Keputusan di layar tinjauan → antrean lanjut sendiri.
    await page
      .getByTestId("upload-queue-held")
      .getByRole("link", { name: "Tinjau perubahan" })
      .click();
    await expect(page).toHaveURL(new RegExp(`/datasets/${datasetId}/tinjau/`));
    await page
      .getByLabel("Saya paham Februari 2026 diganti dengan data yang lebih sedikit")
      .check();
    await page.getByTestId("review-apply").click();
    await expect(page).toHaveURL(new RegExp(`/datasets/${datasetId}\\?confirmed=1$`), SLOW);

    await expect(page.getByTestId("upload-queue-position")).toHaveText(
      "Antrean selesai: 4 file — 3 berhasil, 1 gagal.",
      { timeout: 240_000 },
    );
    await expect(page.getByTestId("upload-queue-status")).toHaveText([
      "Selesai",
      "Selesai",
      "Selesai",
      "Gagal",
    ]);
    await expect(item(page, 2).getByTestId("upload-queue-message")).toHaveText(
      "Maret 2026 ditambahkan (2 baris)",
    );
    const active = versions(datasetId).find((v) => v.active)!;
    expect(periodsOf(active.id)).toEqual([
      [
        ["2026-01", 2],
        ["2026-02", 1],
        ["2026-03", 2],
        ["2026-04", 1],
      ],
    ]);
    // Tidak ada versi yang tertinggal di tengah jalan (retensi menyimpan beberapa versi terakhir).
    expect(versions(datasetId).every((v) => v.status === "READY")).toBe(true);

    // Ringkasan ditutup → dropzone kembali.
    await page.getByTestId("upload-queue-dismiss").click();
    await expect(page.getByTestId("upload-queue")).toHaveCount(0);
    await expect(page.getByTestId("upload-dropzone")).toBeVisible();
  });

  test("AC2: sheet berlabel — periode per file, pilih ulang setelah muat ulang, hentikan antrean", async ({
    page,
  }) => {
    test.setTimeout(400_000);
    const datasetId = await newDataset(
      page,
      "Antrean label",
      file("awal.csv", csv("kode;nilai", ["A;10", "B;20"])),
    );
    await setupPeriods(page, datasetId); // tanpa kolom tanggal → "Saya pilih saat upload"
    await page.goto(`/datasets/${datasetId}`);
    const count = versions(datasetId).length;

    const sep = file("laporan_2026-09.csv", csv("kode;nilai", ["C;1", "D;2"]));
    const tanpa = file("data.csv", csv("kode;nilai", ["E;3"]));
    // Jaringan ke unggahan antrean putus: file belum terunggah saat tab dimuat ulang.
    await page.route("**/api/upload-queue/items/**", (route) => route.abort());
    await page.getByTestId("upload-input").setInputFiles([sep, tanpa]);
    const draft = page.getByTestId("upload-queue-draft");
    await expect(page.getByTestId("upload-queue-missing-labels")).toContainText("1 file");
    await page.getByTestId("upload-queue-start").click();
    await expect(draft.getByRole("alert")).toHaveText("Pilih periode untuk “data.csv”.");
    const tanpaRow = draft.getByTestId("upload-queue-draft-row").filter({ hasText: "data.csv" });
    await tanpaRow.getByTestId("upload-queue-period-sub").click();
    await page.getByRole("option", { name: "Agustus" }).click();
    await tanpaRow.getByTestId("upload-queue-period-year").click();
    await page.getByRole("option", { name: "2026" }).click();
    // Agustus sebelum September.
    await expect(draft.getByTestId("upload-queue-draft-row")).toHaveText([/data\.csv/, /laporan/]);
    await page.getByTestId("upload-queue-start").click();
    await expect(page.getByTestId("upload-queue")).toBeVisible();
    await expect(page.getByTestId("upload-queue").getByRole("alert")).toContainText(
      "Unggahan “data.csv” terhenti",
      { timeout: 60_000 },
    );
    expect(versions(datasetId)).toHaveLength(count); // belum ada versi sebelum file terunggah

    // Muat ulang sebelum file terunggah → file dipilih ulang (dicocokkan), unggahan lanjut.
    await page.unroute("**/api/upload-queue/items/**");
    await page.reload();
    const missing = page.getByTestId("upload-queue-missing");
    await expect(missing).toContainText("2 file belum terunggah");
    await page.getByTestId("upload-queue-reattach-input").setInputFiles([sep, tanpa]);
    await expect(page.getByTestId("upload-queue-position")).toHaveText(
      "File 1 dari 2 menunggu tinjauan Anda — antrean berhenti sampai diputuskan.",
      SLOW,
    );
    await expect(item(page, 1)).toContainText("Agustus 2026");
    await expect(item(page, 2)).toHaveAttribute("data-state", "QUEUED", SLOW);

    // Hentikan: file 2 (belum diproses) dibatalkan; file 1 yang ditinjau tetap menunggu keputusan.
    await page.getByTestId("upload-queue-stop").click();
    await page.getByTestId("upload-queue-stop-go").click();
    await expect(page.getByTestId("upload-queue-stop-confirm")).toHaveCount(0);
    await expect(item(page, 2)).toHaveAttribute("data-state", "CANCELLED", SLOW);
    await expect(item(page, 1)).toHaveAttribute("data-state", "STARTED");

    // Batalkan upload di tinjauan → antrean selesai sebagai "dihentikan".
    await page.goto(`/datasets/${datasetId}`);
    await page
      .getByTestId("upload-queue-held")
      .getByRole("link", { name: "Tinjau perubahan" })
      .click();
    await page.getByTestId("review-cancel").click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Batalkan upload" }).click();
    await expect(page).toHaveURL(new RegExp(`/datasets/${datasetId}\\?cancelled=1$`), SLOW);
    await expect(page.getByTestId("upload-queue-position")).toHaveText(
      "Antrean dihentikan: 2 file — 0 berhasil, 2 dibatalkan.",
      SLOW,
    );
    expect(versions(datasetId)).toHaveLength(count);
  });
});
