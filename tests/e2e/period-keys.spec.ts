import { execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { apiLogin, registerAndVerify, startWorker, stopWorker, uniqueEmail } from "./helpers";

/*
 * v1.20 (T-rbrb, ADR-0011) lewat worker sungguhan: dataset per bulan (Jan–Mar) → kolom kunci "kode" di Atur
 * periode → panel unggah memilih "Perbarui berdasarkan kunci" sebagai bawaan → file berisi koreksi, kunci
 * baru, dan kunci yang pindah bulan aktif otomatis dengan angka yang benar; file dengan kunci dobel ditolak
 * dengan daftar kuncinya (data aktif tetap).
 */
test.describe.configure({ mode: "serial" });

const OWNER = uniqueEmail("period-keys");
const dir = mkdtempSync(join(tmpdir(), "dd-e2e-period-keys-"));
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
  ) as { sheets: { id: string; segments: { periodKey: string; dataRows: number }[] }[] };
type Version = { id: string; status: string; active: boolean; errorMessage: string | null };
const versions = (datasetId: string) => fx("versions", datasetId) as unknown as Version[];
const csv = (rows: string[]) => `${["kode;Tanggal Kirim;nilai", ...rows].join("\n")}\n`;

async function api(page: Page, baseURL: string, path: string, data: unknown = {}) {
  const res = await page.request.post(path, {
    data: JSON.stringify(data),
    headers: { origin: baseURL, "content-type": "application/json" },
  });
  return { status: res.status(), body: (await res.json()) as Record<string, unknown> };
}

async function upload(
  page: Page,
  baseURL: string,
  datasetId: string,
  name: string,
  content: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const file = join(dir, name);
  writeFileSync(file, content);
  const init = await api(page, baseURL, "/api/uploads", {
    datasetId,
    name,
    size: statSync(file).size,
    lastModified: 1,
    ...body,
  });
  if (init.status !== 200) return init;
  const versionId = String(init.body.versionId);
  const signed = await api(page, baseURL, `/api/uploads/${versionId}/parts`, { partNumbers: [1] });
  const url = (signed.body.urls as { url: string }[])[0]!.url;
  expect((await page.request.put(url, { data: Buffer.from(content) })).status()).toBe(200);
  expect((await api(page, baseURL, `/api/uploads/${versionId}/complete`)).status).toBe(200);
  return init;
}

async function totals(page: Page, baseURL: string, datasetId: string, sheetId: string) {
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

test.describe("Perbarui berdasarkan kunci", () => {
  let datasetId = "";

  test.beforeAll(async ({ browser, request }) => {
    execFileSync("node", ["scripts/dev-reset-ratelimit.mjs", "register:ip"]);
    const p = await browser.newPage();
    await registerAndVerify(p, request, OWNER);
    await p.close();
    worker = await startWorker("period-keys");
  });

  test.beforeEach(async ({ page }) => {
    await apiLogin(page, OWNER);
  });

  test.afterAll(async () => {
    await stopWorker(worker);
  });

  test("kolom kunci → unggahan Perbarui aktif otomatis; kunci dobel ditolak dengan daftar", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(400_000);
    await page.goto("/datasets/baru");
    await page.getByLabel("Nama dataset").fill(`Periode kunci ${Date.now()}`);
    await page.getByRole("button", { name: "Buat dataset" }).click();
    await expect(page).toHaveURL(/\/datasets\/[a-z0-9]{20,32}\?created=1$/, { timeout: 30_000 });
    datasetId = new URL(page.url()).pathname.split("/").pop()!;
    const first = join(dir, "jan-mar.csv");
    writeFileSync(
      first,
      csv([
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

    // Tanpa kolom kunci: Perbarui tidak tersedia di panel, dan API menolaknya.
    await page.goto(`/datasets/${datasetId}`);
    const mode = page.getByTestId("upload-period-mode");
    await expect(mode).toBeVisible(SLOW);
    await expect(page.getByTestId("upload-period-mode-upsert")).toBeDisabled();
    await expect(page.getByTestId("upload-period-mode-replace")).toBeChecked();
    const base = versions(datasetId)[0]!.id;
    const refused = await upload(page, baseURL!, datasetId, "x.csv", csv(["A;2026-01-05;1"]), {
      mode: "PERIOD",
      baseVersionId: base,
      periodMode: "UPSERT",
    });
    expect(refused.status).toBe(400);
    expect(String(refused.body.message)).toContain("Belum ada kolom kunci");

    // Atur kolom kunci "kode".
    await page.goto(`/datasets/${datasetId}/periode`);
    const keys = page.getByTestId("period-keys");
    await expect(keys.getByTestId("period-keys-none")).toBeVisible();
    await keys.getByTestId("period-key-add").click();
    await page.getByRole("option", { name: "kode", exact: true }).click();
    await expect(keys.getByTestId("period-key-chip")).toHaveText(["kode"]);
    await keys.getByTestId("period-keys-save").click();
    await expect(keys.getByTestId("period-keys-result")).toContainText("Kolom kunci disimpan.");
    await expect(keys.getByTestId("period-keys-warning")).toHaveCount(0);

    // Panel unggah: Perbarui jadi bawaan dan menyebut kuncinya.
    await page.goto(`/datasets/${datasetId}`);
    await expect(page.getByTestId("upload-period-mode-upsert")).toBeChecked();
    await expect(mode).toContainText("Kunci: kode.");
    await expect(page.getByTestId("upload-period-title")).toContainText("baris berkunci sama");

    // A dikoreksi (10 → 99), H baru di Februari, C pindah Februari → Januari (30 → 31).
    const fix = join(dir, "koreksi.csv");
    writeFileSync(fix, csv(["A;2026-01-05;99", "H;2026-02-10;5", "C;2026-01-25;31"]));
    const count = versions(datasetId).length;
    await page.getByTestId("upload-input").setInputFiles(fix);
    await expect.poll(() => versions(datasetId).length, SLOW).toBe(count + 1);
    const v = versions(datasetId)[0]!;
    await expect.poll(() => versions(datasetId)[0]!.status, SLOW).toBe("READY");
    expect(versions(datasetId)[0]!.active).toBe(true);
    const periods = seg("periods", v.id);
    const sheetId = periods.sheets[0]!.id;
    // Januari = kelompok (baris file + salinan lama), Februari ditulis ulang (C pindah, H masuk).
    const rows = new Map<string, number>();
    for (const g of periods.sheets[0]!.segments)
      rows.set(g.periodKey, (rows.get(g.periodKey) ?? 0) + g.dataRows);
    expect([...rows]).toEqual([
      ["2026-01", 3],
      ["2026-02", 2],
      ["2026-03", 1],
    ]);
    // Sebelum 150 / 5 baris → A +89, H +5, C +1; kunci tidak dobel.
    expect(await totals(page, baseURL!, datasetId, sheetId)).toEqual([245, 6]);
    await page.reload();
    await expect(
      page
        .locator(`[data-testid="version-row"][data-version-id="${v.id}"]`)
        .getByTestId("version-note"),
    ).toContainText("Januari 2026 diperbarui");

    // Kunci dobel di file → FAILED dengan daftar kunci; data aktif tetap.
    const dup = await upload(
      page,
      baseURL!,
      datasetId,
      "dobel.csv",
      csv(["A;2026-01-05;1", "A;2026-01-06;2", "Z;2026-03-01;3"]),
      { mode: "PERIOD", baseVersionId: v.id, periodMode: "UPSERT" },
    );
    expect(dup.status).toBe(200);
    const failedId = String(dup.body.versionId);
    await expect
      .poll(() => versions(datasetId).find((x) => x.id === failedId)?.status, SLOW)
      .toBe("FAILED");
    const msg = versions(datasetId).find((x) => x.id === failedId)!.errorMessage ?? "";
    expect(msg).toContain("1 kunci “kode” muncul lebih dari sekali");
    expect(msg).toContain("A (2×)");
    expect(versions(datasetId).find((x) => x.id === v.id)!.active).toBe(true);
    expect(await totals(page, baseURL!, datasetId, sheetId)).toEqual([245, 6]);
  });
});
