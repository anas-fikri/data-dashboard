import { execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  apiLogin,
  pageFor,
  registerAndVerify,
  startWorker,
  stopWorker,
  uniqueEmail,
} from "./helpers";

/*
 * T-041 lewat HTTP sungguhan: POST /api/sheets/:id/rows dan GET …/cell pada sheet 3 segmen (dipecah
 * dengan scripts/dev-segments.ts). Pemilik dan editor mendapat baris; viewer dan pengguna asing 403
 * tanpa nama kolom; batas → 400; versi lain → 409; Origin lain → 403.
 */
test.describe.configure({ mode: "serial" });

const OWNER = uniqueEmail("grid-owner");
const EDITOR = uniqueEmail("grid-editor");
const VIEWER = uniqueEmail("grid-viewer");
const STRANGER = uniqueEmail("grid-asing");
const ROWS = 900;
const dir = mkdtempSync(join(tmpdir(), "dd-e2e-grid-"));
let worker: ChildProcess | null = null;
let datasetId = "";
let versionId = "";
let sheetId = "";

const node = (script: string, ...args: string[]) =>
  JSON.parse(execFileSync("node", [script, ...args]).toString()) as Record<string, unknown>;
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

function csv(): string {
  const lines = ["KodeRahasia;Nilai"];
  for (let i = 1; i <= ROWS; i++) lines.push(`K${i};${i === 7 ? "bukan-angka" : i}`);
  const path = join(dir, "grid.csv");
  writeFileSync(path, `${lines.join("\n")}\n`);
  return path;
}

const rows = (page: Page, origin: string, body: Record<string, unknown>, id = sheetId) =>
  page.request.post(`/api/sheets/${id}/rows`, { headers: { Origin: origin }, data: body });

test.describe("Lihat data: jendela baris", () => {
  test.beforeAll(async ({ browser, request }) => {
    test.setTimeout(240_000);
    execFileSync("node", ["scripts/dev-reset-ratelimit.mjs", "register:ip"]);
    for (const email of [OWNER, EDITOR, VIEWER, STRANGER]) {
      const p = await browser.newPage();
      await registerAndVerify(p, request, email);
      await p.close();
    }
    worker = await startWorker("grid");
    const page = await pageFor(browser, OWNER);
    await page.goto("/datasets/baru");
    await page.getByLabel("Nama dataset").fill(`Grid ${Date.now()}`);
    await page.getByRole("button", { name: "Buat dataset" }).click();
    await expect(page).toHaveURL(/\/datasets\/[a-z0-9]{20,32}\?created=1$/, { timeout: 30_000 });
    datasetId = new URL(page.url()).pathname.split("/").pop()!;
    await page.getByTestId("upload-input").setInputFiles(csv());
    await expect(page.getByTestId("dataset-schema-link")).toBeVisible({ timeout: 120_000 });
    await page.close();
    versionId = String(node("scripts/dev-upload-fixture.mjs", "latest", datasetId).id);
    sheetId = (
      node("scripts/dev-upload-fixture.mjs", "ingest", versionId).sheets as { id: string }[]
    )[0]!.id;
    expect(segments("split", sheetId, "3")).toEqual({ segments: 3, rows: ROWS });
    node("scripts/dev-share-fixture.mjs", OWNER, EDITOR, "EDITOR", datasetId);
    node("scripts/dev-share-fixture.mjs", OWNER, VIEWER, "VIEWER", datasetId);
  });

  test.afterAll(async () => {
    await stopWorker(worker);
  });

  test("AC1/AC4: pemilik dan editor mendapat jendela lintas segmen + isi sel", async ({
    page,
    baseURL,
  }) => {
    for (const email of [OWNER, EDITOR]) {
      await apiLogin(page, email);
      const res = await rows(page, baseURL!, {
        versionId,
        rowStart: 295,
        rowCount: 10,
        cols: [1, 2],
      });
      expect(res.status(), await res.text()).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({ versionId, total: ROWS, filteredTotal: ROWS });
      expect(body.rows.map((r: { n: number }) => r.n)).toEqual(
        Array.from({ length: 10 }, (_, i) => 296 + i),
      );
      expect(body.rows.map((r: { cells: unknown[] }) => r.cells[0])).toEqual(
        Array.from({ length: 10 }, (_, i) => `K${296 + i}`),
      );
      const sorted = {
        versionId,
        rowStart: 0,
        rowCount: 5,
        cols: [1, 2],
        sort: [{ pos: 2, dir: "desc" }],
      };
      const a = await (await rows(page, baseURL!, sorted)).json();
      const b = await (await rows(page, baseURL!, sorted)).json();
      expect(a.rows).toEqual(b.rows);
      expect(a.rows[0].cells).toEqual(["K900", 900]);
    }
    // Isi sel: baris 7 gagal cast → nilai asli + sumber.
    const first = await (
      await rows(page, baseURL!, { versionId, rowStart: 6, rowCount: 1, cols: [2] })
    ).json();
    const row = first.rows[0]._row;
    const cell = await page.request.get(
      `/api/sheets/${sheetId}/cell?versionId=${versionId}&row=${row}&pos=2`,
    );
    expect(cell.status(), await cell.text()).toBe(200);
    expect(await cell.json()).toMatchObject({
      value: null,
      raw: "bukan-angka",
      castFailed: true,
      source: { fileName: "grid.csv", srcRow: expect.any(Number), period: null },
    });
  });

  test("AC2/AC3: viewer, asing, batas, versi lain, dan Origin lain ditolak tanpa nama kolom", async ({
    page,
    baseURL,
  }) => {
    const ok = { versionId, rowStart: 0, rowCount: 10, cols: [1, 2] };
    for (const email of [VIEWER, STRANGER]) {
      await apiLogin(page, email);
      const res = await rows(page, baseURL!, ok);
      expect(res.status()).toBe(403);
      expect(await res.text()).not.toMatch(/KodeRahasia|Nilai/);
      const cell = await page.request.get(
        `/api/sheets/${sheetId}/cell?versionId=${versionId}&row=2&pos=1`,
      );
      expect(cell.status()).toBe(403);
    }
    await apiLogin(page, OWNER);
    for (const bad of [
      { ...ok, rowCount: 501 },
      { ...ok, cols: Array.from({ length: 65 }, (_, i) => i + 1) },
      { ...ok, sort: [1, 2, 1, 2].map((pos) => ({ pos, dir: "asc" })) },
      { ...ok, filters: Array.from({ length: 21 }, () => ({ pos: 1, op: "in", values: ["a"] })) },
      { ...ok, search: { text: "a".repeat(101), cols: [1] } },
      { ...ok, cols: [3] },
    ]) {
      const res = await rows(page, baseURL!, bad);
      expect(res.status()).toBe(400);
      expect(await res.text()).not.toMatch(/KodeRahasia|Nilai/);
    }
    const other = await rows(page, baseURL!, { ...ok, versionId: "cmv4kljx40009oczvdgridzzz0" });
    expect(other.status()).toBe(409);
    expect(await other.json()).toMatchObject({
      code: "VERSION_CHANGED",
      activeVersionId: versionId,
    });
    const cross = await rows(page, "https://evil.example", ok);
    expect(cross.status()).toBe(403);
  });
});
