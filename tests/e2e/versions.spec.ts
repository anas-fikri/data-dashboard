import { execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import yazl from "yazl";
import { apiLogin, registerAndVerify, startWorker, stopWorker, uniqueEmail } from "./helpers";

/*
 * T-013: versi dataset sungguhan (unggah → worker → finish) dari sudut pandang pemilik.
 *  V1 unggahan pertama (inferensi) → koreksi skema (Kode dipaksa Teks, Nilai → "Omzet Bersih") → KPI.
 *  V2 kolom sama (urutan/kapital/spasi beda) → aktif, KPI angka baru, koreksi terbawa (AC 1).
 *  V3 xlsx rusak → FAILED, KPI tetap V2, badge Gagal (AC 2).
 *  V4, V5 → 4 READY: V1 dibuang retensi + job pembersihan; rollback ke V4 lewat UI (AC 3).
 *  V4 berumur > 7 hari → job retensi file asli; dashboard tetap jalan (AC 4).
 *  V6 kolom terlihat diganti nama → AWAITING_MAPPING → "Buang versi ini".
 * Total KPI per versi berbeda (100/220/340/460) sehingga angka yang tampil membuktikan versi mana yang
 * dibaca (cache memakai versionId di kuncinya). Worker sendiri (proses grup terpisah), dimatikan di afterAll.
 */
test.describe.configure({ mode: "serial" });

const OWNER = uniqueEmail("versi-owner");
const dir = mkdtempSync(join(tmpdir(), "dd-e2e-versi-"));
const KPI = "Total omzet bersih";
const COUNT_KPI = "Jumlah baris";
/** Mesin dev berbeban tinggi: ingest dipoll sampai 120 s. */
const INGEST_MS = 120_000;
const SLOW = { timeout: 30_000 };

let worker: ChildProcess | null = null;
let datasetId = "";
let dashboardUrl = "";
/** Id versi + prefix segmen V1 setelah dibuang retensi (T-038). */
const v: Record<"v1" | "v2" | "v3" | "v4" | "v5" | "v1Seg", string> = {
  v1: "",
  v2: "",
  v3: "",
  v4: "",
  v5: "",
  v1Seg: "",
};

type Version = {
  id: string;
  status: string;
  active: boolean;
  sourceDeletedAt: string | null;
  errorMessage: string | null;
};
type CleanupRow = { prefix: string; reason: string; notBefore: string; attempts: number };
type SegmentRow = {
  id: string;
  prefix: string;
  createdByVersionId: string | null;
  unreferencedAt: string | null;
  versions: string[];
};

function fx<T = Record<string, unknown>>(...args: string[]): T {
  return JSON.parse(
    execFileSync("node", ["scripts/dev-upload-fixture.mjs", ...args], {
      timeout: 90_000,
    }).toString(),
  ) as T;
}
const versions = () => fx<Version[]>("versions", datasetId);
const prefixCount = (prefix: string) => fx<{ count: number }>("prefix-count", prefix).count;
const runJob = (name: "storage-cleanup" | "raw-retention" | "segment-gc") => fx("run-job", name);
/** Segmen dataset (T-038): objeknya di parquet/<ds>/seg/<id>/, `versions` = versi yang merujuknya. */
const segments = () => fx<SegmentRow[]>("segments", datasetId);
const segmentOf = (versionId: string) => segments().find((g) => g.versions.includes(versionId))!;

function csv(name: string, header: string, rows: string[]): string {
  const path = join(dir, name);
  writeFileSync(path, [header, ...rows].join("\n"));
  return path;
}
const cabang = (i: number) => (i % 2 ? "Jakarta" : "Bandung");
const times = (n: number, f: (i: number) => string) => Array.from({ length: n }, (_, i) => f(i));

/** xlsx yang lolos cek unggah (zip valid) tetapi XML sheet-nya rusak → ingest FAILED. */
async function brokenXlsx(): Promise<string> {
  const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const zip = new yazl.ZipFile();
  const add = (name: string, xml: string) => zip.addBuffer(Buffer.from(xml), name);
  add(
    "[Content_Types].xml",
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`,
  );
  add(
    "xl/workbook.xml",
    `<?xml version="1.0"?><workbook xmlns="${NS}" xmlns:r="${REL}"><sheets><sheet name="Rusak" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  );
  add(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
  );
  const rows = Array.from(
    { length: 40 },
    (_, i) => `<row r="${i + 1}"><c r="A${i + 1}"><v>${i}</v></c></row>`,
  ).join("");
  add(
    "xl/worksheets/sheet1.xml",
    `<worksheet xmlns="${NS}"><sheetData>${rows}<row r="41"><c </bad></sheetData></worksheet>`,
  );
  zip.end();
  const chunks: Buffer[] = [];
  for await (const c of zip.outputStream) chunks.push(c as Buffer);
  const path = join(dir, "penjualan-rusak.xlsx");
  writeFileSync(path, Buffer.concat(chunks));
  return path;
}

/**
 * Unggah dari profil dataset lalu tunggu versi baru mencapai status terminal (READY/FAILED/
 * AWAITING_MAPPING) lewat fixture DB. Mengembalikan id + status versi itu.
 */
async function uploadVersion(page: Page, file: string): Promise<{ id: string; status: string }> {
  await page.goto(`/datasets/${datasetId}`);
  const before = fx<{ id?: string }>("latest", datasetId).id ?? null;
  await page.getByTestId("upload-input").setInputFiles(file);
  const name = file.split("/").pop()!;
  await expect(page.getByText(`"${name}" terunggah.`)).toBeVisible({ timeout: 60_000 });
  let latest = { id: "", status: "" };
  await expect
    .poll(
      () => {
        latest = fx<{ id: string; status: string }>("latest", datasetId);
        return latest.id !== before &&
          ["READY", "FAILED", "AWAITING_MAPPING"].includes(latest.status)
          ? "selesai"
          : latest.status;
      },
      { timeout: INGEST_MS, intervals: [2_000] },
    )
    .toBe("selesai");
  return latest;
}

const widgetTitled = (page: Page, title: string) =>
  page.getByTestId("widget").filter({ has: page.getByRole("heading", { name: title }) });
const kpiValue = (page: Page, title = KPI) => widgetTitled(page, title).getByTestId("kpi-value");
const versionRow = (page: Page, id: string) =>
  page.locator(`[data-testid="version-row"][data-version-id="${id}"]`);

/** Tambah widget, beri judul, pilih jenis; tunggu konfigurasi tersimpan (pola widgets.spec). */
async function addWidget(page: Page, title: string, type: string): Promise<Locator> {
  const before = await page.getByTestId("widget").count();
  await page
    .getByTestId("canvas-toolbar")
    .getByRole("button", { name: "Tambah widget", exact: true })
    .click();
  await expect(page.getByTestId("widget")).toHaveCount(before + 1, SLOW);
  const panel = page.getByTestId("widget-panel");
  await expect(panel.getByRole("heading", { name: "Pengaturan widget" })).toBeFocused();
  await panel.getByLabel("Judul", { exact: true }).fill(title);
  await panel.getByLabel("Judul", { exact: true }).press("Enter");
  await expect(widgetTitled(page, title)).toHaveCount(1);
  await panel.getByText(type, { exact: true }).click();
  await expect(panel.getByTestId("config-status")).toHaveAttribute("data-state", "saved", SLOW);
  return panel;
}

/** "nama:tipe" per kolom sheet pertama versi itu (langsung dari DB). */
const sheetTypes = (versionId: string) =>
  (fx<{ sheets?: { types: string[] }[] }>("ingest", versionId).sheets ?? [])[0]?.types ?? [];

/**
 * Simpan koreksi skema lalu tunggu sampai tersimpan di DB. Pemberitahuan recast-done dari simpanan
 * sebelumnya bisa masih tampil sesaat setelah klik, jadi kebenarannya diambil dari DB.
 */
async function saveSchema(page: Page, versionId: string, expected: string) {
  await page.getByRole("button", { name: "Simpan perubahan" }).click();
  await expect
    .poll(() => sheetTypes(versionId), { timeout: 90_000, intervals: [1_500] })
    .toContain(expected);
  await expect(page.getByTestId("recast-done")).toBeVisible(SLOW);
}

test.describe("versi dataset", () => {
  test.beforeAll(async ({ browser, request }) => {
    test.setTimeout(300_000);
    execFileSync("node", ["scripts/dev-reset-ratelimit.mjs", "register:ip"]);
    const p = await browser.newPage();
    await registerAndVerify(p, request, OWNER);
    await apiLogin(p, OWNER);
    worker = await startWorker("versions");

    // V1: Kode (angka → nanti dipaksa Teks), Cabang, Nilai 10 × 10 baris = 100.
    await p.goto("/datasets/baru");
    await p.getByLabel("Nama dataset").fill(`Penjualan versi ${Date.now()}`);
    await p.getByRole("button", { name: "Buat dataset" }).click();
    await expect(p).toHaveURL(/\/datasets\/[a-z0-9]{20,32}\?created=1$/, SLOW);
    datasetId = new URL(p.url()).pathname.split("/").pop()!;
    const first = await uploadVersion(
      p,
      csv(
        "penjualan-1.csv",
        "Kode;Cabang;Nilai",
        times(10, (i) => `${101 + i};${cabang(i)};10`),
      ),
    );
    expect(first.status).toBe("READY");
    v.v1 = first.id;

    // Koreksi user di skema aktif: tipe dipaksa (lewat worker) lalu ganti nama tampil (langsung).
    await p.goto(`/datasets/${datasetId}/skema`);
    await expect(p.getByLabel("Tipe untuk kolom 1")).toContainText("Bilangan bulat", SLOW);
    await p.getByLabel("Tipe untuk kolom 1").click();
    await p.getByRole("option", { name: "Teks", exact: true }).click();
    await saveSchema(p, v.v1, "Kode:text");
    await p.goto(`/datasets/${datasetId}/skema`);
    await p.getByLabel("Nama kolom untuk kolom 3").fill("Omzet Bersih");
    await saveSchema(p, v.v1, "Omzet Bersih:integer");

    // Dashboard dengan KPI default (total kolom angka pertama = Omzet Bersih).
    await p.goto(`/dashboards/baru?dataset=${datasetId}`);
    await p.getByLabel("Nama dashboard").fill("Ringkasan versi");
    await p.getByRole("button", { name: "Buat dashboard" }).click();
    await expect(p).toHaveURL(/\?mode=edit$/, SLOW);
    dashboardUrl = p.url().replace("?mode=edit", "");
    const panel = await addWidget(p, KPI, "Angka");
    await expect(panel.getByLabel("dari kolom", { exact: true })).toContainText("Omzet Bersih");
    await expect(kpiValue(p)).toHaveText("100", SLOW);
    await p.close();
  });

  test.afterAll(async () => {
    await stopWorker(worker);
  });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await apiLogin(page, OWNER);
  });

  test("AC 1: file baru kolom sama (urutan/kapital/spasi beda) → versi baru aktif, KPI angka baru, koreksi skema terbawa", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    // Urutan kolom dibalik, kapital dan spasi berbeda; Kode tetap berisi angka (inferensi akan
    // memilih bilangan bulat, jadi "Teks" hanya bisa datang dari skema aktif). 20 × 11 = 220.
    const file = csv(
      "penjualan-2.csv",
      " nilai ;KODE;  Cabang",
      times(20, (i) => `11;${201 + i};${cabang(i)}`),
    );
    const v2 = await uploadVersion(page, file);
    expect(v2.status, JSON.stringify(fx("latest", datasetId))).toBe("READY");
    v.v2 = v2.id;
    const list = versions();
    expect(list.find((x) => x.id === v.v2)).toMatchObject({ status: "READY", active: true });
    expect(list.find((x) => x.id === v.v1)).toMatchObject({ status: "READY", active: false });

    // Dashboard tanpa konfigurasi ulang memakai angka versi baru.
    await page.goto(dashboardUrl);
    await expect(kpiValue(page)).toHaveText("220", SLOW);

    // Tipe paksaan dan nama tampil user tetap berlaku di skema aktif (posisi menurut file baru).
    expect([...sheetTypes(v.v2)].sort()).toEqual([
      "Cabang:text",
      "Kode:text",
      "Omzet Bersih:integer",
    ]);
    await page.goto(`/datasets/${datasetId}/skema`);
    await expect(page.getByLabel("Nama kolom untuk kolom 1")).toHaveValue("Omzet Bersih", SLOW);
    await expect(page.locator('[data-pos="1"]')).toContainText(/asli: "\s*nilai\s*"/);
    await expect(page.getByLabel("Tipe untuk kolom 2")).toContainText("Teks");
    await expect(page.getByLabel("Nama kolom untuk kolom 2")).toHaveValue("Kode");
  });

  test("AC 2: ingest versi baru gagal → dashboard tetap data aktif lama, badge Gagal di profil", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const v3 = await uploadVersion(page, await brokenXlsx());
    expect(v3.status).toBe("FAILED");
    v.v3 = v3.id;
    const list = versions();
    expect(list.find((x) => x.active)?.id).toBe(v.v2);

    await page.goto(dashboardUrl);
    await expect(kpiValue(page)).toHaveText("220", SLOW);

    await page.goto(`/datasets/${datasetId}`);
    await expect(page.getByTestId("dataset-status").locator('[data-badge="failed"]')).toHaveText(
      /Gagal/,
    );
    await expect(page.getByTestId("dataset-status-message")).toContainText('"Rusak"');
    await expect(page.getByTestId("dataset-active")).toContainText("penjualan-2.csv");
    const row = versionRow(page, v.v3);
    await expect(row).toHaveAttribute("data-status", "FAILED");
    await expect(row).toContainText("Gagal");
    await expect(row.getByTestId("version-message")).toContainText('"Rusak"');
    await expect(versionRow(page, v.v2)).toHaveAttribute("data-active", "true");
  });

  test("AC 3a: versi READY ke-4 → versi tertua dihapus, hanya 3 READY, prefix-nya diantrekan pembersihan", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const v4 = await uploadVersion(
      page,
      csv(
        "penjualan-4.csv",
        "Kode;Cabang;Nilai",
        times(17, (i) => `${401 + i};${cabang(i)};20`),
      ),
    );
    expect(v4.status).toBe("READY");
    v.v4 = v4.id;
    const v5 = await uploadVersion(
      page,
      csv(
        "penjualan-5.csv",
        "Kode;Cabang;Nilai",
        times(23, (i) => `${501 + i};${cabang(i)};20`),
      ),
    );
    expect(v5.status).toBe("READY");
    v.v5 = v5.id;

    const list = versions();
    expect(list.map((x) => x.id)).toEqual([v.v5, v.v4, v.v2]); // terbaru dulu; V1 dan FAILED V3 dibuang
    expect(list.every((x) => x.status === "READY")).toBe(true);
    expect(list[0]).toMatchObject({ active: true });

    // Objek V1 belum dihapus: segmennya tidak lagi dirujuk versi hidup, menunggu GC mark-and-sweep
    // (tenggang 24 jam, T-038); prefix versi (file asli + sisa legacy) diantrekan seperti sebelumnya.
    const orphans = segments().filter((g) => g.versions.length === 0);
    expect(orphans).toHaveLength(1);
    expect(orphans[0]).toMatchObject({ createdByVersionId: null, unreferencedAt: null });
    expect(prefixCount(orphans[0]!.prefix)).toBeGreaterThan(0);
    v.v1Seg = orphans[0]!.prefix;
    const rows = fx<CleanupRow[]>("cleanup-rows", datasetId);
    const forV1 = rows.filter((r) => r.prefix.includes(v.v1));
    expect(forV1.map((r) => r.prefix).sort()).toEqual([
      `parquet/${datasetId}/${v.v1}/`,
      `raw/${datasetId}/${v.v1}/`,
    ]);
    for (const r of forV1) {
      expect(r.reason).toBe("retensi versi");
      expect(new Date(r.notBefore).getTime()).toBeGreaterThan(Date.now() + 50 * 60 * 1000);
    }
    expect(rows.some((r) => r.prefix === `raw/${datasetId}/${v.v3}/`)).toBe(true);

    await page.goto(dashboardUrl);
    await expect(kpiValue(page)).toHaveText("460", SLOW);
    await page.goto(`/datasets/${datasetId}`);
    await expect(page.getByTestId("version-row")).toHaveCount(3, SLOW);
    await expect(page.locator('[data-testid="version-row"][data-status="READY"]')).toHaveCount(3);
    await expect(versionRow(page, v.v1)).toHaveCount(0);
  });

  test("AC 3b: GC segmen + pembersihan menghapus Parquet + file asli versi tertua, versi hidup utuh", async () => {
    test.setTimeout(240_000);
    // Putaran 1 menandai segmen V1 (tidak dirujuk); belum dihapus selama tenggang.
    runJob("segment-gc");
    const marked = segments().find((g) => g.prefix === v.v1Seg)!;
    expect(marked.unreferencedAt).not.toBeNull();
    expect(prefixCount(v.v1Seg)).toBeGreaterThan(0);
    // Tenggang lewat → putaran 2 menyapu baris segmennya dan mengantrekan objeknya.
    expect(fx<{ segments: number }>("gc-due", datasetId).segments).toBe(1);
    runJob("segment-gc");
    expect(segments().some((g) => g.prefix === v.v1Seg)).toBe(false);
    expect(fx<CleanupRow[]>("cleanup-rows", datasetId).map((r) => r.prefix)).toContain(v.v1Seg);
    expect(fx<{ updated: number }>("cleanup-due", datasetId).updated).toBeGreaterThanOrEqual(3);
    runJob("storage-cleanup");
    expect(prefixCount(v.v1Seg)).toBe(0);
    expect(prefixCount(`parquet/${datasetId}/${v.v1}/`)).toBe(0);
    expect(prefixCount(`raw/${datasetId}/${v.v1}/`)).toBe(0);
    expect(prefixCount(`raw/${datasetId}/${v.v3}/`)).toBe(0);
    expect(fx<CleanupRow[]>("cleanup-rows", datasetId)).toEqual([]);
    // Versi hidup (aktif V5 + READY tersimpan V4, V2) tetap punya objeknya.
    for (const id of [v.v5, v.v4, v.v2]) {
      expect(prefixCount(segmentOf(id).prefix), id).toBeGreaterThan(0);
    }
    expect(prefixCount(`raw/${datasetId}/${v.v5}/`)).toBeGreaterThan(0);
  });

  test("AC 3c: pemilik mengaktifkan versi sebelumnya lewat UI → versi aktif pindah, KPI berganti angka", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.goto(`/datasets/${datasetId}`);
    await expect(versionRow(page, v.v5)).toHaveAttribute("data-active", "true", SLOW);
    await expect(versionRow(page, v.v5).getByTestId("version-activate")).toHaveCount(0);
    await versionRow(page, v.v4).getByTestId("version-activate").click();
    const dialog = page.getByTestId("version-confirm");
    await expect(dialog).toContainText("Aktifkan versi “penjualan-4.csv”?");
    await dialog.getByRole("button", { name: "Aktifkan", exact: true }).click();
    await expect(page.getByTestId("version-result")).toContainText(
      "Versi “penjualan-4.csv” aktif.",
      SLOW,
    );
    await expect(dialog).toBeHidden();
    await expect(versionRow(page, v.v4)).toHaveAttribute("data-active", "true", SLOW);
    await expect(versionRow(page, v.v5)).toHaveAttribute("data-active", "false");
    await expect(versionRow(page, v.v5).getByTestId("version-activate")).toBeVisible();
    expect(versions().find((x) => x.active)?.id).toBe(v.v4);

    // 460 (V5) sebelumnya → 340 (V4): hasil cache V5 tidak dipakai lagi.
    await page.goto(dashboardUrl);
    await expect(kpiValue(page)).toHaveText("340", SLOW);
  });

  test("AC 4: file asli > 7 hari → job retensi menghapusnya, riwayat memberi tanda, dashboard tetap jalan", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    expect(fx<{ exists: boolean }>("object", v.v4).exists).toBe(true);
    fx("backdate", v.v4, "8");
    runJob("raw-retention");
    expect(fx<{ exists: boolean }>("object", v.v4).exists).toBe(false);
    expect(prefixCount(`raw/${datasetId}/${v.v4}/`)).toBe(0);
    expect(prefixCount(segmentOf(v.v4).prefix)).toBeGreaterThan(0);
    const list = versions();
    expect(list.find((x) => x.id === v.v4)?.sourceDeletedAt).not.toBeNull();
    // Versi lain (< 7 hari) tidak tersentuh.
    expect(list.find((x) => x.id === v.v5)?.sourceDeletedAt).toBeNull();
    expect(fx<{ exists: boolean }>("object", v.v5).exists).toBe(true);

    await page.goto(`/datasets/${datasetId}`);
    await expect(versionRow(page, v.v4).getByTestId("version-source-deleted")).toHaveText(
      "File asli sudah dihapus",
      SLOW,
    );
    await expect(versionRow(page, v.v5).getByTestId("version-source-deleted")).toHaveCount(0);

    // KPI lama tetap tampil; KPI baru (query yang belum pernah di-cache) membaca Parquet versi aktif.
    await page.goto(`${dashboardUrl}?mode=edit`);
    await expect(kpiValue(page)).toHaveText("340", SLOW);
    const panel = await addWidget(page, COUNT_KPI, "Angka");
    await panel.getByLabel("Nilai", { exact: true }).click();
    await page.getByRole("option", { name: "Jumlah baris", exact: true }).click();
    await expect(panel.getByTestId("config-status")).toHaveAttribute("data-state", "saved", SLOW);
    await expect(kpiValue(page, COUNT_KPI)).toHaveText("17", SLOW);
  });

  test("kolom terlihat diganti nama → menunggu pemetaan dengan alasan, dashboard tetap data aktif, versi bisa dibuang", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const v6 = await uploadVersion(
      page,
      csv(
        "penjualan-ganti-kolom.csv",
        "Kode;Kantor;Nilai",
        times(5, (i) => `${601 + i};${cabang(i)};99`),
      ),
    );
    expect(v6.status).toBe("AWAITING_MAPPING");
    const listed = versions().find((x) => x.id === v6.id)!;
    expect(listed.active).toBe(false);
    expect(listed.errorMessage).toContain('Kolom "Cabang"');
    expect(versions().find((x) => x.active)?.id).toBe(v.v4);

    await page.goto(dashboardUrl);
    await expect(kpiValue(page)).toHaveText("340", SLOW);
    await expect(kpiValue(page, COUNT_KPI)).toHaveText("17", SLOW);

    await page.goto(`/datasets/${datasetId}`);
    await expect(
      page.getByTestId("dataset-status").locator('[data-badge="awaiting_mapping"]'),
    ).toHaveText(/Menunggu pemetaan/);
    const notice = page.getByTestId("dataset-processing");
    await expect(notice).toContainText("“penjualan-ganti-kolom.csv” perlu pemetaan kolom");
    await expect(page.getByTestId("dataset-mapping-reason")).toContainText(
      'Kolom "Cabang" tidak ada di file baru.',
    );
    await expect(page.getByTestId("upload-dropzone")).toHaveCount(0);
    await expect(versionRow(page, v6.id)).toHaveAttribute("data-status", "AWAITING_MAPPING");

    await notice.getByTestId("version-discard").click();
    const dialog = page.getByTestId("version-confirm");
    await expect(dialog).toContainText("Buang versi “penjualan-ganti-kolom.csv”?");
    await dialog.getByRole("button", { name: "Buang versi", exact: true }).click();
    await expect(page.getByTestId("version-discard-result")).toContainText(
      "Versi “penjualan-ganti-kolom.csv” dibuang.",
      SLOW,
    );
    await expect(page.getByTestId("upload-dropzone")).toBeVisible(SLOW);
    await expect(page.getByTestId("dataset-processing")).toHaveCount(0);
    await expect(versionRow(page, v6.id)).toHaveCount(0);
    await expect(page.getByTestId("dataset-status").locator("[data-badge]")).toHaveCount(0);

    expect(versions().map((x) => x.id)).not.toContain(v6.id);
    const rows = fx<CleanupRow[]>("cleanup-rows", datasetId).filter((r) =>
      r.prefix.includes(v6.id),
    );
    expect(rows.map((r) => r.prefix).sort()).toEqual([
      `parquet/${datasetId}/${v6.id}/`,
      `raw/${datasetId}/${v6.id}/`,
    ]);
    // Dibuang atas permintaan pemilik: langsung jatuh tempo (tanpa masa tenggang).
    runJob("storage-cleanup");
    expect(prefixCount(`raw/${datasetId}/${v6.id}/`)).toBe(0);
    expect(prefixCount(`parquet/${datasetId}/${v6.id}/`)).toBe(0);

    await page.goto(dashboardUrl);
    await expect(kpiValue(page)).toHaveText("340", SLOW);
  });
});
