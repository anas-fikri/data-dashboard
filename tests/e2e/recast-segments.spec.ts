import { execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { apiLogin, registerAndVerify, startWorker, stopWorker, uniqueEmail } from "./helpers";

/*
 * T-040 AC 1 lewat worker sungguhan: ubah tipe kolom pada sheet 24 segmen (dipecah dengan
 * scripts/dev-segments.ts) — progres "Segmen k dari 24" tampil, recast menunggu ingest yang sedang
 * berjalan (prioritas di bawah ingest), dan manifest berganti ke revisi baru sekaligus.
 */
test.describe.configure({ mode: "serial" });

const OWNER = uniqueEmail("recast-seg");
const dir = mkdtempSync(join(tmpdir(), "dd-e2e-recast-seg-"));
let worker: ChildProcess | null = null;

const fx = (...args: string[]) =>
  JSON.parse(
    execFileSync("node", ["scripts/dev-upload-fixture.mjs", ...args]).toString(),
  ) as Record<string, unknown>;
const segments = (...args: string[]) =>
  JSON.parse(
    execFileSync("npx", [
      "tsx",
      "--conditions=react-server",
      "--env-file-if-exists=.env",
      "scripts/dev-segments.ts",
      ...args,
    ]).toString(),
  ) as unknown;

function csv(name: string, rows: number): string {
  const lines = ["kode;nilai"];
  for (let i = 1; i <= rows; i++) lines.push(`K${i};${i}`);
  const path = join(dir, name);
  writeFileSync(path, `${lines.join("\n")}\n`);
  return path;
}

async function upload(page: Page, name: string, file: string): Promise<string> {
  await page.goto("/datasets/baru");
  await page.getByLabel("Nama dataset").fill(name);
  await page.getByRole("button", { name: "Buat dataset" }).click();
  // Kompilasi pertama server action di dev bisa > 10 s.
  await expect(page).toHaveURL(/\/datasets\/[a-z0-9]{20,32}\?created=1$/, { timeout: 30_000 });
  const id = new URL(page.url()).pathname.split("/").pop()!;
  await page.getByTestId("upload-input").setInputFiles(file);
  return id;
}

test.describe("recast per segmen", () => {
  test.beforeAll(async ({ browser, request }) => {
    execFileSync("node", ["scripts/dev-reset-ratelimit.mjs", "register:ip"]);
    const p = await browser.newPage();
    await registerAndVerify(p, request, OWNER);
    await p.close();
    worker = await startWorker("recast-segments");
  });

  test.beforeEach(async ({ page }) => {
    await apiLogin(page, OWNER);
  });

  test.afterAll(async () => {
    await stopWorker(worker);
  });

  test("AC1: 24 segmen → 'Segmen k dari 24', menunggu ingest, aktif atomik di revisi 2", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(300_000);
    const rows = 480_000;
    const a = await upload(page, `Segmen ${Date.now()}`, csv("segmen.csv", rows));
    await expect(page.getByTestId("dataset-schema-link")).toBeVisible({ timeout: 120_000 });
    const versionA = String(fx("latest", a).id);
    const sheetId = (fx("ingest", versionA).sheets as { id: string }[])[0]!.id;
    expect(segments("split", sheetId, "24")).toEqual({ segments: 24, rows });

    // Ingest lain sedang berjalan saat koreksi dikirim → recast menunggu sebelum segmen pertama.
    const b = await upload(page, `Ingest ${Date.now()}`, csv("ingest-besar.csv", 1_000_000));
    await expect
      .poll(() => fx("latest", b).status, { timeout: 120_000, intervals: [250] })
      .toBe("INGESTING");
    const versionB = String(fx("latest", b).id);

    await page.goto(`/datasets/${a}/skema`);
    await page.getByLabel("Tipe untuk kolom 2").click();
    await page.getByRole("option", { name: "Teks", exact: true }).click();
    const seen: { phase: string; current: number; total: number }[] = [];
    page.on("response", async (res) => {
      if (!/\/api\/sheets\/[^/]+\/recast\/[^/]+$/.test(new URL(res.url()).pathname)) return;
      const body = (await res.json().catch(() => null)) as {
        status?: { progress?: (typeof seen)[number] };
      } | null;
      if (body?.status?.progress) seen.push(body.status.progress);
    });
    await page.getByRole("button", { name: "Simpan perubahan" }).click();
    await expect(page.getByTestId("recast-progress")).toHaveText(/^Segmen \d+ dari 24$/, {
      timeout: 60_000,
    });
    await expect(page.getByTestId("recast-done")).toBeVisible({ timeout: 240_000 });

    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((p) => p.phase === "write" && p.total === 24)).toBe(true);
    const order = seen.map((p) => p.current);
    expect(order).toEqual([...order].sort((x, y) => x - y));

    // Semua segmen pindah ke revisi 2 sekaligus; file baru ditulis setelah ingest lain selesai.
    const manifest = segments("manifest", sheetId) as {
      schemaRevision: number;
      createdAt: string;
    }[];
    expect(manifest).toHaveLength(24);
    expect(new Set(manifest.map((m) => m.schemaRevision))).toEqual(new Set([2]));
    const finished = segments("finished", versionB) as { status: string; ingestFinishedAt: string };
    expect(finished.status).toBe("READY");
    const doneB = new Date(finished.ingestFinishedAt).getTime();
    for (const m of manifest) expect(new Date(m.createdAt).getTime()).toBeGreaterThanOrEqual(doneB);

    // Data utuh lewat 24 file: jumlah baris dan kolom kini teks.
    const res = await page.request.post("/api/query", {
      headers: { Origin: baseURL! },
      data: { datasetId: a, spec: { sheetId, measures: [{ agg: "count" }] } },
    });
    expect(res.status(), await res.text()).toBe(200);
    expect(JSON.stringify((await res.json()).rows)).toContain(String(rows));
    expect((fx("ingest", versionA).sheets as { types: string[] }[])[0]!.types[1]).toBe(
      "nilai:text",
    );
  });
});
