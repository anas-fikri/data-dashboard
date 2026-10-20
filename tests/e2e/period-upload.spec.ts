import { execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { apiLogin, registerAndVerify, startWorker, stopWorker, uniqueEmail } from "./helpers";

/*
 * T-052 unggahan periode lewat worker sungguhan (layar unggah/tinjauan = T-053/T-054, jadi unggahan
 * memakai API yang sama dengan panel): dataset diatur per bulan (Jan–Mar), lalu
 *  - April (mode kolom) → aktif otomatis, catatan "April 2026 ditambahkan (2 baris)", segmen Jan–Mar
 *    dirujuk ulang tanpa objek baru;
 *  - pengganti Februari → menunggu konfirmasi; "Batalkan unggahan" membuangnya, data aktif tetap;
 *  - pengganti Februari lagi → "Terapkan" dengan sidik basi → PLAN_STALE; "Buang N baris" yang tidak
 *    sesuai → ditolak; dengan sidik tinjauan → aktif, angka berubah, AuditLog dataset.period.confirm;
 *  - file sama dipilih ulang dengan mode lain → tidak dilanjutkan, InitOk menggemakan mode.
 */
test.describe.configure({ mode: "serial" });

const OWNER = uniqueEmail("period-upload");
const dir = mkdtempSync(join(tmpdir(), "dd-e2e-period-up-"));
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
      // Log service (pino, stdout) tidak boleh bercampur dengan hasil JSON.
      { env: { ...process.env, LOG_LEVEL: "error" } },
    ).toString(),
  ) as unknown;

type Version = { id: string; status: string; active: boolean; errorMessage: string | null };
const versions = (datasetId: string) => fx("versions", datasetId) as unknown as Version[];
type Periods = {
  mode: string;
  sheets: {
    id: string;
    segments: { periodKey: string; dataRows: number; segmentId: string; typedId: string }[];
  }[];
};

const csv = (rows: string[]) => `${["kode;Tanggal Kirim;nilai", ...rows].join("\n")}\n`;
const versionRow = (page: Page, id: string) =>
  page.locator(`[data-testid="version-row"][data-version-id="${id}"]`);

async function api(page: Page, baseURL: string, path: string, data: unknown = {}) {
  const res = await page.request.post(path, {
    data: JSON.stringify(data),
    headers: { origin: baseURL, "content-type": "application/json" },
  });
  return { status: res.status(), body: (await res.json()) as Record<string, unknown> };
}

/** Unggah lewat API (init → part → complete), seperti panel unggah; versi baru. */
async function upload(
  page: Page,
  baseURL: string,
  datasetId: string,
  name: string,
  content: string,
  body: Record<string, unknown>,
): Promise<string> {
  const file = join(dir, name);
  writeFileSync(file, content);
  const size = statSync(file).size;
  const init = await api(page, baseURL, "/api/uploads", {
    datasetId,
    name,
    size,
    lastModified: 1,
    ...body,
  });
  expect(init.status, JSON.stringify(init.body)).toBe(200);
  const versionId = String(init.body.versionId);
  const signed = await api(page, baseURL, `/api/uploads/${versionId}/parts`, { partNumbers: [1] });
  const url = (signed.body.urls as { url: string }[])[0]!.url;
  expect((await page.request.put(url, { data: Buffer.from(content) })).status()).toBe(200);
  expect((await api(page, baseURL, `/api/uploads/${versionId}/complete`)).status).toBe(200);
  return versionId;
}

async function kpi(page: Page, baseURL: string, datasetId: string, sheetId: string) {
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

test.describe("unggahan periode", () => {
  let datasetId = "";
  let periodVersion = "";

  test.beforeAll(async ({ browser, request }) => {
    execFileSync("node", ["scripts/dev-reset-ratelimit.mjs", "register:ip"]);
    const p = await browser.newPage();
    await registerAndVerify(p, request, OWNER);
    await p.close();
    worker = await startWorker("period-upload");
  });

  test.beforeEach(async ({ page }) => {
    await apiLogin(page, OWNER);
  });

  test.afterAll(async () => {
    await stopWorker(worker);
  });

  test("AC1: April ditambahkan otomatis; Jan–Mar dirujuk ulang tanpa objek baru", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(300_000);
    await page.goto("/datasets/baru");
    await page.getByLabel("Nama dataset").fill(`Periode unggah ${Date.now()}`);
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

    // Atur periode per bulan (T-051).
    await page.getByTestId("period-link").click();
    await page.getByTestId("period-review").click();
    await expect(page.getByTestId("period-preview")).toBeVisible(SLOW);
    await page.getByTestId("period-apply").click();
    await expect.poll(() => versions(datasetId).length, SLOW).toBe(2);
    await expect.poll(() => versions(datasetId)[0]!.active, SLOW).toBe(true);
    periodVersion = versions(datasetId)[0]!.id;
    const before = seg("periods", periodVersion) as Periods;
    expect(before.sheets[0]!.segments.map((g) => g.periodKey)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
    const prefixCounts = before.sheets[0]!.segments.map((g) =>
      Number(fx("prefix-count", `parquet/${datasetId}/seg/${g.segmentId}/`).count),
    );

    // April lewat unggahan periode (mode kolom, versi dasar = versi aktif).
    const april = await upload(
      page,
      baseURL!,
      datasetId,
      "april.csv",
      csv(["F;2026-04-02;60", "G;2026-04-30;70"]),
      {
        mode: "PERIOD",
        baseVersionId: periodVersion,
      },
    );
    await expect
      .poll(() => versions(datasetId).find((v) => v.id === april)?.status, SLOW)
      .toBe("READY");
    expect(versions(datasetId).find((v) => v.id === april)!.active).toBe(true);
    const after = seg("periods", april) as Periods;
    expect(after.mode).toBe("PERIOD");
    const segs = after.sheets[0]!.segments;
    expect(segs.map((g) => [g.periodKey, g.dataRows])).toEqual([
      ["2026-01", 2],
      ["2026-02", 2],
      ["2026-03", 1],
      ["2026-04", 2],
    ]);
    // Jan–Mar: file typed yang sama (bukan salinan) dan tidak ada objek baru di prefix segmennya.
    expect(segs.slice(0, 3).map((g) => g.typedId)).toEqual(
      before.sheets[0]!.segments.map((g) => g.typedId),
    );
    expect(
      before.sheets[0]!.segments.map((g) =>
        Number(fx("prefix-count", `parquet/${datasetId}/seg/${g.segmentId}/`).count),
      ),
    ).toEqual(prefixCounts);
    expect(await kpi(page, baseURL!, datasetId, after.sheets[0]!.id)).toEqual([280, 7]);

    await page.goto(`/datasets/${datasetId}`);
    await expect(versionRow(page, april).getByTestId("version-note")).toHaveText(
      "April 2026 ditambahkan (2 baris)",
    );
  });

  test("pengganti Februari → menunggu konfirmasi; 'Batalkan unggahan' membuangnya, data aktif tetap", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(180_000);
    const active = versions(datasetId)[0]!.id;
    const feb = await upload(page, baseURL!, datasetId, "februari.csv", csv(["H;2026-02-10;5"]), {
      mode: "PERIOD",
      baseVersionId: active,
    });
    await expect
      .poll(() => versions(datasetId).find((v) => v.id === feb)?.status, SLOW)
      .toBe("AWAITING_CONFIRM");
    // Unggahan lain ditahan selama menunggu konfirmasi.
    const busy = await api(page, baseURL!, "/api/uploads", {
      datasetId,
      name: "lain.csv",
      size: 10,
      lastModified: 2,
    });
    expect(busy.status).toBe(409);
    expect(busy.body.message).toMatch(/menunggu konfirmasi/);

    await page.goto(`/datasets/${datasetId}`);
    const row = versionRow(page, feb);
    await expect(row.getByTestId("version-note")).toHaveText(
      "Menunggu konfirmasi: Februari 2026 diganti (2 → 1 baris)",
    );
    await row.getByTestId("version-cancel-pending").click();
    await page
      .getByTestId("version-confirm")
      .getByRole("button", { name: "Batalkan unggahan", exact: true })
      .click();
    await expect(versionRow(page, feb)).toHaveCount(0, SLOW);
    expect(versions(datasetId).find((v) => v.id === feb)).toBeUndefined();
    expect(versions(datasetId)[0]!.id).toBe(active);
    expect(versions(datasetId)[0]!.active).toBe(true);
  });

  test("AC5: 'Terapkan' dengan rencana basi → PLAN_STALE; dengan rencana tinjauan → aktif + AuditLog", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(180_000);
    const active = versions(datasetId)[0]!.id;
    const feb = await upload(page, baseURL!, datasetId, "februari-2.csv", csv(["I;2026-02-11;6"]), {
      mode: "PERIOD",
      baseVersionId: active,
    });
    await expect
      .poll(() => versions(datasetId).find((v) => v.id === feb)?.status, SLOW)
      .toBe("AWAITING_CONFIRM");
    const review = seg("review", feb) as {
      ok: boolean;
      data: { digest: string; summary: string; plan: { confirm: string[] } };
    };
    expect(review).toMatchObject({
      ok: true,
      data: { summary: "Februari 2026 diganti (2 → 1 baris)" },
    });
    // 2 → 1 baris = menyusut tepat 50% (bukan > 50%): tidak wajib dicentang.
    expect(review.data.plan.confirm).toEqual(["REPLACE"]);
    const stale = seg(
      "confirm",
      feb,
      JSON.stringify({
        include: [],
        digest: "0".repeat(64),
        ack: { shrink: false, droppedRows: 0 },
      }),
    );
    expect(stale).toMatchObject({ ok: false, code: "PLAN_STALE" });
    // "Buang N baris" yang tidak sesuai rencana → ditolak.
    expect(
      seg(
        "confirm",
        feb,
        JSON.stringify({
          include: [],
          digest: review.data.digest,
          ack: { shrink: false, droppedRows: 3 },
        }),
      ),
    ).toMatchObject({ ok: false, code: "INVALID" });
    expect(
      seg(
        "confirm",
        feb,
        JSON.stringify({
          include: [],
          digest: review.data.digest,
          ack: { shrink: false, droppedRows: 0 },
        }),
      ),
    ).toMatchObject({ ok: true, data: { summary: "Februari 2026 diganti (2 → 1 baris)" } });
    expect(versions(datasetId).find((v) => v.id === feb)).toMatchObject({
      status: "READY",
      active: true,
    });
    const now = seg("periods", feb) as Periods;
    expect(now.sheets[0]!.segments.map((g) => [g.periodKey, g.dataRows])).toEqual([
      ["2026-01", 2],
      ["2026-02", 1],
      ["2026-03", 1],
      ["2026-04", 2],
    ]);
    // 280 − (30 + 40) + 6.
    expect(await kpi(page, baseURL!, datasetId, now.sheets[0]!.id)).toEqual([216, 6]);
    const audit = seg("audit", datasetId, "dataset.period.confirm") as {
      meta: Record<string, unknown>;
    }[];
    expect(audit.map((r) => r.meta)).toEqual([
      expect.objectContaining({ from: active, versionId: feb }),
    ]);
  });

  test("AC6: file sama dipilih ulang dengan mode lain → tidak dilanjutkan; InitOk menggemakan mode", async ({
    page,
    baseURL,
  }) => {
    const active = versions(datasetId)[0]!.id;
    const meta = { datasetId, name: "mei.csv", size: 40, lastModified: 7 };
    const replace = await api(page, baseURL!, "/api/uploads", meta);
    expect(replace.body).toMatchObject({ ok: true, resumed: false, mode: "REPLACE" });
    const again = await api(page, baseURL!, "/api/uploads", meta);
    expect(again.body).toMatchObject({
      versionId: replace.body.versionId,
      resumed: true,
      mode: "REPLACE",
    });
    const period = await api(page, baseURL!, "/api/uploads", {
      ...meta,
      mode: "PERIOD",
      baseVersionId: active,
    });
    expect(period.body).toMatchObject({ ok: true, resumed: false, mode: "PERIOD", label: null });
    expect(period.body.versionId).not.toBe(replace.body.versionId);
    expect(fx("version", String(replace.body.versionId))).toEqual({ exists: false });
    const res = await page.request.fetch(`/api/uploads/${String(period.body.versionId)}`, {
      method: "DELETE",
      headers: { origin: baseURL! },
    });
    expect(res.status()).toBe(200);
  });
});
