import { execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import yazl from "yazl";
import { apiLogin, registerAndVerify, startWorker, stopWorker, uniqueEmail } from "./helpers";

/*
 * T-054 layar tinjauan unggahan periode (worker sungguhan): dataset diatur per bulan, lalu
 *  - AC1/AC2/AC4: pengganti Februari yang menyusut > 50% → panel "Tinjau perubahan" → tabel
 *    Periode | Sekarang | Setelah | Keterangan; "Terapkan" baru aktif setelah centang; "Lihat isi file"
 *    membuka grid versi tertunda (hanya pemilik); Terapkan → aktif;
 *  - AC3/AC4: file identik dengan file asal Februari → "File ini identik dengan periode Februari 2026";
 *    "Batalkan upload" → versi dibuang, data aktif tetap;
 *  - AC2: periode kemungkinan nyasar bawaan "Kecualikan" (jumlah baris tercatat), bisa "Masukkan";
 *    pengaturan berubah sejak ditinjau → PLAN_STALE, rencana dimuat ulang, Terapkan lagi berhasil;
 *  - AC3: sheet berlabel dengan kolom tanggal acuan di luar label → peringatan;
 *  - AC5: dataset dua sheet, file hanya berisi satu → "Pertahankan data lama sheet itu".
 */
test.describe.configure({ mode: "serial" });

const OWNER = uniqueEmail("period-review");
const OTHER = uniqueEmail("period-review-x");
const dir = mkdtempSync(join(tmpdir(), "dd-e2e-period-review-"));
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
const statusOf = (datasetId: string, id: string) =>
  versions(datasetId).find((v) => v.id === id)?.status;
type Periods = { sheets: { segments: { periodKey: string; dataRows: number }[] }[] };
const periodsOf = (versionId: string) =>
  (seg("periods", versionId) as Periods).sheets.map((s) =>
    s.segments.map((g) => [g.periodKey, g.dataRows]),
  );

const AXE = readFileSync(join(process.cwd(), "node_modules/axe-core/axe.min.js"), "utf8");

/** Pelanggaran axe serius/kritis di halaman (disuntik lewat evaluate: CSP nonce tidak menghalangi). */
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

const csv = (rows: string[]) => `${["kode;Tanggal Kirim;nilai", ...rows].join("\n")}\n`;

function file(name: string, content: string | Buffer): string {
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}

/** xlsx kecil (inline string, tanpa gaya): satu entri per sheet. */
async function xlsx(sheets: { name: string; rows: string[][] }[]): Promise<Buffer> {
  const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const PKG = "http://schemas.openxmlformats.org/package/2006/relationships";
  const zip = new yazl.ZipFile();
  const add = (name: string, xml: string) =>
    zip.addBuffer(Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>${xml}`), name, {
      mtime: new Date(0),
    });
  add(
    "[Content_Types].xml",
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets
      .map(
        (_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join("")}</Types>`,
  );
  add(
    "_rels/.rels",
    `<Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  );
  add(
    "xl/workbook.xml",
    `<workbook xmlns="${NS}" xmlns:r="${REL}"><sheets>${sheets
      .map((s, i) => `<sheet name="${s.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join("")}</sheets></workbook>`,
  );
  add(
    "xl/_rels/workbook.xml.rels",
    `<Relationships xmlns="${PKG}">${sheets
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join("")}</Relationships>`,
  );
  sheets.forEach((s, i) => {
    const col = (c: number) => String.fromCharCode(65 + c);
    const rows = s.rows
      .map(
        (r, ri) =>
          `<row r="${ri + 1}">${r
            .map((v, ci) =>
              /^\d+$/.test(v)
                ? `<c r="${col(ci)}${ri + 1}"><v>${v}</v></c>`
                : `<c r="${col(ci)}${ri + 1}" t="inlineStr"><is><t>${v}</t></is></c>`,
            )
            .join("")}</row>`,
      )
      .join("");
    add(
      `xl/worksheets/sheet${i + 1}.xml`,
      `<worksheet xmlns="${NS}"><sheetData>${rows}</sheetData></worksheet>`,
    );
  });
  zip.end();
  const chunks: Buffer[] = [];
  for await (const c of zip.outputStream) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

async function api(page: Page, baseURL: string, path: string, data: unknown = {}) {
  const res = await page.request.post(path, {
    data: JSON.stringify(data),
    headers: { origin: baseURL, "content-type": "application/json" },
  });
  return { status: res.status(), body: (await res.json()) as Record<string, unknown> };
}

/** Unggahan periode lewat API (init → part → complete), seperti panel unggah. */
async function uploadPeriod(
  page: Page,
  baseURL: string,
  datasetId: string,
  name: string,
  content: string | Buffer,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const path = file(name, content);
  const init = await api(page, baseURL, "/api/uploads", {
    datasetId,
    name,
    size: statSync(path).size,
    lastModified: Date.now(),
    mode: "PERIOD",
    baseVersionId: versions(datasetId).find((v) => v.active)!.id,
    ...extra,
  });
  expect(init.status, JSON.stringify(init.body)).toBe(200);
  const versionId = String(init.body.versionId);
  const signed = await api(page, baseURL, `/api/uploads/${versionId}/parts`, { partNumbers: [1] });
  const url = (signed.body.urls as { url: string }[])[0]!.url;
  expect((await page.request.put(url, { data: Buffer.from(content) })).status()).toBe(200);
  expect((await api(page, baseURL, `/api/uploads/${versionId}/complete`)).status).toBe(200);
  await expect.poll(() => statusOf(datasetId, versionId), SLOW).toBe("AWAITING_CONFIRM");
  return versionId;
}

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

/** "Atur periode" (T-051); `label` = sumber "Saya pilih saat upload" untuk sheet pertama. */
async function setupPeriods(page: Page, datasetId: string, label = false) {
  await page.goto(`/datasets/${datasetId}/periode`);
  if (label) {
    await page.getByTestId("period-source").first().click();
    await page.getByRole("option", { name: "Saya pilih saat upload" }).click();
  }
  await page.getByTestId("period-review").click();
  await expect(page.getByTestId("period-preview")).toBeVisible(SLOW);
  const count = versions(datasetId).length;
  await page.getByTestId("period-apply").click();
  await expect.poll(() => versions(datasetId).length, SLOW).toBe(count + 1);
  await expect.poll(() => versions(datasetId)[0]!.active, SLOW).toBe(true);
}

const row = (page: Page, key: string) =>
  page.locator(`[data-testid="review-row"][data-period="${key}"]`);

test.describe("layar tinjauan periode", () => {
  let datasetId = "";

  test.beforeAll(async ({ browser, request }) => {
    execFileSync("node", ["scripts/dev-reset-ratelimit.mjs", "register:ip"]);
    for (const email of [OWNER, OTHER]) {
      const p = await browser.newPage();
      await registerAndVerify(p, request, email);
      await p.close();
    }
    worker = await startWorker("period-review");
  });

  test.beforeEach(async ({ page }) => {
    await apiLogin(page, OWNER);
  });

  test.afterAll(async () => {
    await stopWorker(worker);
  });

  test("AC1 + AC2 + AC4: menyusut > 50% wajib dicentang; Lihat isi file; Terapkan", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(300_000);
    datasetId = await newDataset(
      page,
      "Tinjau periode",
      file(
        "jan-mar.csv",
        csv([
          "A;2026-01-05;10",
          "B;2026-01-20;20",
          "C;2026-02-01;30",
          "D;2026-02-10;40",
          "E;2026-02-20;50",
          "F;2026-02-28;60",
          "G;2026-03-15;70",
        ]),
      ),
    );
    await setupPeriods(page, datasetId);
    const feb = await uploadPeriod(
      page,
      baseURL!,
      datasetId,
      "februari.csv",
      csv(["H;2026-02-11;5"]),
    );

    // Panel unggah mengarahkan ke tinjauan (dropzone ditahan).
    await page.goto(`/datasets/${datasetId}`);
    const panel = page.getByTestId("upload-awaiting-confirm");
    await expect(panel).toContainText("“februari.csv” menunggu konfirmasi");
    await expect(page.getByTestId("upload-dropzone")).toHaveCount(0);
    await panel.getByRole("link", { name: "Tinjau perubahan" }).click();
    await expect(page).toHaveURL(new RegExp(`/datasets/${datasetId}/tinjau/${feb}$`));

    // AC1: tabel Periode | Sekarang | Setelah | Keterangan.
    const table = page.getByTestId("review-table");
    for (const h of ["Periode", "Sekarang", "Setelah", "Keterangan"]) {
      await expect(table.getByRole("columnheader", { name: h })).toBeAttached();
    }
    await expect(page.getByTestId("review-row")).toHaveCount(1);
    await expect(row(page, "2026-02").getByTestId("review-before")).toHaveText("4");
    await expect(row(page, "2026-02").getByTestId("review-after")).toHaveText("1");
    await expect(row(page, "2026-02").getByTestId("review-note")).toHaveText("Diganti");
    await expect(page.getByTestId("review-unchanged")).toHaveText("2 periode lain tidak berubah.");
    await expect(page.getByTestId("review-summary")).toHaveText(
      "Februari 2026 diganti (4 → 1 baris).",
    );
    await expect(page.getByTestId("period-usage")).toContainText("3 dari 24 periode disimpan");

    // AC2: Terapkan nonaktif sampai centang.
    const apply = page.getByTestId("review-apply");
    await expect(apply).toBeDisabled();
    const ack = page.getByLabel("Saya paham Februari 2026 diganti dengan data yang lebih sedikit");
    await expect(ack).not.toBeChecked();
    await expect(page.getByTestId("review-apply-blocked")).toContainText("Centang");

    // AC4: Lihat isi file = grid versi tertunda (pemilik), Jan 2 + Feb 1 + Mar 1 baris.
    await page.getByTestId("review-view-file").click();
    await expect(page).toHaveURL(new RegExp(`/datasets/${datasetId}/data\\?version=${feb}$`));
    await expect(page.getByTestId("grid-preview-banner")).toBeVisible();
    await expect(page.getByTestId("grid-status-rows")).toHaveText(/dari 4$/, SLOW);
    await page.getByRole("link", { name: "Kembali ke tinjauan" }).click();
    await expect(page).toHaveURL(new RegExp(`/tinjau/${feb}$`));

    await page
      .getByLabel("Saya paham Februari 2026 diganti dengan data yang lebih sedikit")
      .check();
    await expect(page.getByTestId("review-apply")).toBeEnabled();
    await page.getByTestId("review-apply").click();
    await expect(page).toHaveURL(new RegExp(`/datasets/${datasetId}\\?confirmed=1$`), SLOW);
    await expect(page.getByTestId("review-confirmed")).toContainText("“februari.csv” aktif");
    expect(versions(datasetId).find((v) => v.id === feb)).toMatchObject({
      status: "READY",
      active: true,
    });
    expect(periodsOf(feb)).toEqual([
      [
        ["2026-01", 2],
        ["2026-02", 1],
        ["2026-03", 1],
      ],
    ]);
  });

  test("AC4: versi tertunda hanya untuk pemilik (pengguna lain → 404)", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(180_000);
    const pending = await uploadPeriod(
      page,
      baseURL!,
      datasetId,
      "maret.csv",
      csv(["I;2026-03-02;8"]),
    );
    await apiLogin(page, OTHER);
    for (const url of [
      `/datasets/${datasetId}/tinjau/${pending}`,
      `/datasets/${datasetId}/data?version=${pending}`,
    ]) {
      const res = await page.goto(url);
      expect(res!.status(), url).toBe(404);
    }
    await apiLogin(page, OWNER);
    await page.goto(`/datasets/${datasetId}/tinjau/${pending}`);
    await page.getByTestId("review-cancel").click();
    await page
      .getByTestId("version-confirm")
      .getByRole("button", { name: "Batalkan upload", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/datasets/${datasetId}\\?cancelled=1$`), SLOW);
  });

  test("AC3 + AC4: file identik dengan file asal periode; Batalkan upload → data aktif tetap", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(180_000);
    const active = versions(datasetId).find((v) => v.active)!.id;
    const again = await uploadPeriod(
      page,
      baseURL!,
      datasetId,
      "februari-lagi.csv",
      csv(["H;2026-02-11;5"]),
    );
    await page.goto(`/datasets/${datasetId}/tinjau/${again}`);
    await expect(page.getByTestId("review-identical")).toContainText(
      "File ini identik dengan periode Februari 2026",
    );
    await expect(page.getByTestId("review-expiry")).toContainText("dibuang otomatis pada");
    await page.getByTestId("review-cancel").click();
    const dialog = page.getByTestId("version-confirm");
    await expect(dialog).toContainText("data aktif sekarang tetap dipakai");
    await dialog.getByRole("button", { name: "Batalkan upload", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/datasets/${datasetId}\\?cancelled=1$`), SLOW);
    await expect(page.getByTestId("review-cancelled")).toHaveText(
      "Unggahan dibatalkan. Data aktif tidak berubah.",
    );
    expect(versions(datasetId).find((v) => v.id === again)).toBeUndefined();
    expect(versions(datasetId).find((v) => v.active)!.id).toBe(active);
    // Halaman tinjauan versi yang sudah dibuang → keadaan "tidak lagi menunggu".
    await page.goto(`/datasets/${datasetId}/tinjau/${again}`);
    await expect(page.getByTestId("review-page")).toHaveAttribute("data-state", "gone");
  });

  test("AC2: periode nyasar bawaan Kecualikan, bisa Masukkan; PLAN_STALE memuat ulang rencana", async ({
    page,
    baseURL,
    browser,
  }) => {
    test.setTimeout(240_000);
    const april = Array.from(
      { length: 11 },
      (_, i) => `P${i};2026-04-${String(i + 1).padStart(2, "0")};1`,
    );
    const v = await uploadPeriod(
      page,
      baseURL!,
      datasetId,
      "april.csv",
      csv([...april, "Q;2026-03-31;99"]),
    );
    await page.goto(`/datasets/${datasetId}/tinjau/${v}`);
    const mar = row(page, "2026-03");
    await expect(mar.getByTestId("review-note")).toHaveText("Dikecualikan — data lama tetap");
    await expect(mar.getByTestId("review-stray")).toContainText("Maret 2026: 1 baris di file");
    await expect(mar.getByTestId("review-stray-exclude")).toBeChecked();
    await expect(row(page, "2026-04").getByTestId("review-note")).toHaveText("Baru");
    await expect(row(page, "2026-04").getByTestId("review-after")).toHaveText("11");
    expect(await axeSerious(page)).toEqual([]);
    // Ponsel (360 px): tabel menjadi kartu, tanpa gulir horizontal halaman, CTA ≥ 44 px.
    await page.setViewportSize({ width: 360, height: 800 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect((await page.getByTestId("review-apply").boundingBox())!.height).toBeGreaterThanOrEqual(
      44,
    );
    expect(await axeSerious(page)).toEqual([]);
    await page.setViewportSize({ width: 1280, height: 800 });

    // Masukkan → Maret diganti utuh (rencana dihitung ulang); kembali ke Kecualikan.
    await mar.getByTestId("review-stray-include").check();
    await expect(mar).toHaveAttribute("data-action", "REPLACED");
    await mar.getByTestId("review-stray-exclude").check();
    await expect(mar).toHaveAttribute("data-action", "EXCLUDED");

    // Pengaturan berubah di tab lain sejak ditinjau → PLAN_STALE, rencana baru tampil.
    const other = await browser.newPage();
    await apiLogin(other, OWNER);
    await other.goto(`/datasets/${datasetId}/periode`);
    await other.getByTestId("period-keep").fill("30");
    await other.getByTestId("period-settings-save").click();
    await expect(other.getByTestId("period-settings-saved")).toHaveText(
      "Pengaturan periode disimpan.",
    );
    await other.close();
    await page.getByTestId("review-apply").click();
    await expect(page.getByTestId("review-error")).toContainText("Tinjau ulang", SLOW);
    await expect(page.getByTestId("period-usage")).toContainText("dari 30 periode");
    await page.getByTestId("review-apply").click();
    await expect(page).toHaveURL(new RegExp(`/datasets/${datasetId}\\?confirmed=1$`), SLOW);
    expect(periodsOf(v)).toEqual([
      [
        ["2026-01", 2],
        ["2026-02", 1],
        ["2026-03", 1],
        ["2026-04", 11],
      ],
    ]);
  });

  test("AC3: sheet berlabel, kolom tanggal acuan di luar label → peringatan", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(300_000);
    const id = await newDataset(
      page,
      "Tinjau label",
      file("awal.csv", csv(["A;2026-01-05;10", "B;2026-01-20;20"])),
    );
    await setupPeriods(page, id, true);
    const v = await uploadPeriod(
      page,
      baseURL!,
      id,
      "data.csv",
      csv(["C;2026-04-02;1", "D;2026-04-30;2"]),
      { label: "2026-05-01" },
    );
    await page.goto(`/datasets/${id}/tinjau/${v}`);
    const warn = page.getByTestId("review-label-range");
    await expect(warn).toHaveAttribute("data-outside", "true");
    await expect(warn).toContainText("Peringatan:");
    await expect(warn).toContainText("Mei 2026");
    await expect(warn).toContainText(
      "Kolom “Tanggal Kirim” berisi tanggal 2 Apr 2026 – 30 Apr 2026",
    );
    await expect(row(page, "2026-05").getByTestId("review-note")).toHaveText("Baru");
    await page.getByTestId("review-cancel").click();
    await page
      .getByTestId("version-confirm")
      .getByRole("button", { name: "Batalkan upload", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/datasets/${id}\\?cancelled=1$`), SLOW);
  });

  test("AC5: sheet lama yang tidak ada di file baru → 'Pertahankan data lama sheet itu'", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(300_000);
    const header = ["kode", "Tanggal Kirim", "nilai"];
    const kirim = [header, ["A", "2026-01-05", "10"], ["B", "2026-02-05", "20"]];
    const retur = [header, ["R", "2026-01-07", "3"], ["S", "2026-02-07", "4"]];
    const id = await newDataset(
      page,
      "Tinjau dua sheet",
      file(
        "dua-sheet.xlsx",
        await xlsx([
          { name: "Pengiriman", rows: kirim },
          { name: "Retur", rows: retur },
        ]),
      ),
    );
    await setupPeriods(page, id);
    const v = await uploadPeriod(
      page,
      baseURL!,
      id,
      "pengiriman-feb.xlsx",
      await xlsx([{ name: "Pengiriman", rows: [header, ["C", "2026-02-09", "7"]] }]),
    );
    await page.goto(`/datasets/${id}/tinjau/${v}`);
    await expect(page.getByTestId("review-kept-sheet")).toContainText(
      "Sheet “Retur” tidak ada di file ini: Pertahankan data lama sheet itu",
    );
    const feb = row(page, "2026-02");
    await expect(feb).toContainText("Pengiriman: 1");
    await expect(feb).toContainText("Retur: 1");
    await expect(feb.getByTestId("review-before")).toHaveText("2");
    await expect(feb.getByTestId("review-after")).toHaveText("2");
  });
});
