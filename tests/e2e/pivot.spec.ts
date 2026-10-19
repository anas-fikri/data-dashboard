import { execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Locator, type Page, type Response } from "@playwright/test";
import ExcelJS from "exceljs";
import { pageFor, registerAndVerify, startWorker, stopWorker, uniqueEmail } from "./helpers";

/*
 * T-tcjp: widget pivot lewat panel sungguhan. Workbook 24 customer × 2 layanan × 3 bulan (1 baris per
 * kombinasi, No. = customer·100 + layanan·10 + bulan) → total bisa dihitung di kepala:
 *   Customer 24: Jan 4.810, Total 14.436; total keseluruhan 180.864.
 *   AC1: pilih Pivot → ringkasan + tabel periode + kolom Total tersimpan; rincian Layanan → subtotal;
 *        isian dobel dijelaskan dan tidak tersimpan; format Rupiah.
 *   AC2: 1440 dan 390 px — kepala kolom dan kolom baris menempel saat digulir (keyboard), subtotal/total
 *        tebal, tabel bersemantik header.
 *   AC3: halaman cetak (/render, media print) — pivot dengan subtotal dan baris Total.
 *   T-jwhc: pilihan kolom (9 kolom) berkotak cari pintar — ketik di pemicu, singkatan, panah + Enter,
 *        Escape mengembalikan fokus ke pemicu, jumlah hasil diumumkan.
 * E2E_SHOTS=<folder> menyimpan tangkapan layar untuk review desain.
 */
test.describe.configure({ mode: "serial" });

const OWNER = uniqueEmail("pivot");
const TAG = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const dir = mkdtempSync(join(tmpdir(), "dd-e2e-pivot-"));
const headers = { Origin: process.env.E2E_BASE_URL ?? "http://localhost:3100" };
const SHOTS = process.env.E2E_SHOTS;
const TITLE = "Pivot pengiriman";

let worker: ChildProcess | null = null;
let owner: Page;
let d = "";
let widgetId = "";
let revision = NaN;

async function workbook(): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Kiriman");
  // 9 kolom: pilihan kolom di panel memakai kotak cari pintar (T-jwhc, ≥ 8 pilihan).
  ws.addRow([
    "Customer",
    "Tanggal",
    "No.",
    "Layanan",
    "Kota Asal",
    "Kota Tujuan",
    "Tanggal Kirim",
    "Berat (kg)",
    "Keterangan",
  ]);
  for (let c = 1; c <= 24; c++) {
    for (const [s, layanan] of ["Darat", "Udara"].entries()) {
      for (let m = 0; m < 3; m++) {
        ws.addRow([
          `Customer ${String(c).padStart(2, "0")}`,
          new Date(Date.UTC(2026, m, 10)),
          c * 100 + s * 10 + m,
          layanan,
          "Jakarta",
          c % 2 ? "Bandung" : "Surabaya",
          new Date(Date.UTC(2026, m, 11)),
          1.5,
          "Reguler",
        ]);
      }
    }
  }
  const path = join(dir, "kiriman-pivot.xlsx");
  await wb.xlsx.writeFile(path);
  return path;
}

const card = (page: Page) =>
  page.getByTestId("widget").filter({ has: page.getByRole("heading", { name: TITLE }) });

async function pick(page: Page, scope: Locator, label: string, option: string) {
  await scope.getByLabel(label, { exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

const saved = (panel: Locator) =>
  expect(panel.getByTestId("config-status")).toHaveAttribute("data-state", "saved");

test.describe("widget pivot (T-tcjp)", () => {
  test.beforeAll(async ({ browser, request }) => {
    test.setTimeout(300_000);
    execFileSync("node", ["scripts/dev-reset-ratelimit.mjs", "register:ip", "verify:ip"]);
    const setup = await browser.newPage();
    await registerAndVerify(setup, request, OWNER);
    await setup.close();
    owner = await pageFor(browser, OWNER);
    await owner.setViewportSize({ width: 1440, height: 900 });
    worker = await startWorker("pivot");

    await owner.goto("/datasets/baru");
    await owner.getByLabel("Nama dataset").fill(`Kiriman pivot ${TAG}`);
    await owner.getByRole("button", { name: "Buat dataset" }).click();
    await expect(owner).toHaveURL(/\/datasets\/[a-z0-9]{20,32}\?created=1$/);
    const datasetId = new URL(owner.url()).pathname.split("/").pop()!;
    await owner.getByTestId("upload-input").setInputFiles(await workbook());
    await expect(owner.getByTestId("dataset-schema-link")).toBeVisible({ timeout: 120_000 });

    await owner.goto(`/dashboards/baru?dataset=${datasetId}`);
    await owner.getByLabel("Nama dashboard").fill(`Pivot ${TAG}`);
    await owner.getByRole("button", { name: "Buat dashboard" }).click();
    await expect(owner).toHaveURL(/\/dashboards\/[a-z0-9]{20,32}\?mode=edit$/);
    d = new URL(owner.url()).pathname.split("/").pop()!;
  });

  test.afterAll(async () => {
    await stopWorker(worker);
    await owner?.context().close();
  });

  test("AC1: panel Pivot — ringkasan, tabel per bulan + Total, rincian bersubtotal, isian dobel ditolak", async () => {
    test.setTimeout(120_000);
    const onResponse = async (r: Response) => {
      if (r.request().method() !== "POST" || !r.url().endsWith(`/dashboards/${d}/widgets`)) return;
      const j = (await r.json()) as { data: { layoutRevision: number; widget: { id: string } } };
      revision = j.data.layoutRevision;
      widgetId = j.data.widget.id;
    };
    owner.on("response", onResponse);
    await owner
      .getByTestId("canvas-toolbar")
      .getByRole("button", { name: "Tambah widget", exact: true })
      .click();
    const panel = owner.getByTestId("widget-panel");
    await expect(panel.getByRole("heading", { name: "Pengaturan widget" })).toBeFocused();
    await panel.getByLabel("Judul", { exact: true }).fill(TITLE);
    await panel.getByLabel("Judul", { exact: true }).press("Enter");
    await expect(card(owner)).toHaveCount(1);
    await panel.getByText("Pivot", { exact: true }).click();
    await saved(panel);
    owner.off("response", onResponse);
    expect(widgetId).not.toBe("");

    await expect(panel.getByTestId("pivot-summary")).toHaveText(
      "Satu baris per Customer, satu kolom per Tanggal (per bulan), berisi Total No., dengan kolom dan baris Total.",
    );
    const table = card(owner).getByTestId("widget-pivot");
    // Sel pojok juga berisi menu saring (T-f4a7): teksnya diawali tombol kolom pemisah.
    await expect(table.locator("thead th")).toHaveText([
      /Customer$/,
      "Jan 2026",
      "Feb 2026",
      "Mar 2026",
      "Total No.",
    ]);
    // Urut nilai terbesar: Customer 24 di atas.
    const first = table.locator("tbody tr").first();
    await expect(first.locator("th")).toHaveText("Customer 24");
    await expect(first.locator("td")).toHaveText(["4.810", "4.812", "4.814", "14.436"]);
    await expect(table.locator("tfoot td").last()).toHaveText("180.864");

    // Rincian per Layanan: baris kelompok berisi subtotal di atas rinciannya.
    await panel.getByRole("button", { name: "Rinci baris (mis. per layanan)" }).click();
    await saved(panel);
    await expect(panel.getByTestId("pivot-subtotals")).toBeChecked();
    await expect(table.locator("tbody tr[data-kind=group]")).toHaveCount(24);
    await expect(table.locator("tbody tr[data-kind=leaf]")).toHaveCount(48);
    const group = table.locator("tbody tr[data-kind=group]").first();
    await expect(group.locator("th")).toHaveText("Customer 24");
    await expect(group.locator("td").last()).toHaveText("14.436");
    await expect(table.locator("tbody tr").nth(1).locator("th")).toHaveText(/^(Darat|Udara)$/);

    // Isian dobel: dijelaskan di isiannya, status menyebut alasannya, tidak tersimpan.
    await pick(owner, panel, "Dirinci per", "Customer · Teks");
    await expect(panel.getByRole("alert")).toHaveText(/sudah dipakai di atas/);
    await expect(panel.getByTestId("config-status")).toHaveText(
      "Belum tersimpan — perbaiki isian yang ditandai.",
    );
    await pick(owner, panel, "Dirinci per", "Layanan · Teks");
    await saved(panel);
    await expect(panel.getByRole("alert")).toHaveCount(0);

    // T-jwhc: kotak cari pintar di pilihan kolom (keyboard saja).
    const trigger = panel.getByLabel("Dirinci per", { exact: true });
    await trigger.focus();
    await owner.keyboard.type("tgl krm");
    const search = owner.getByRole("combobox", { name: "Cari Dirinci per" });
    await expect(search).toBeFocused();
    await expect(search).toHaveValue("tgl krm");
    const list = owner.getByRole("listbox", { name: "Dirinci per" });
    await expect(list.getByRole("option")).toHaveText(["Tanggal Kirim · Tanggal"]);
    await expect(list.locator("mark")).toHaveText(["T", "g", "l", "K", "r", "m"]);
    await expect(owner.getByText("1 pilihan cocok")).toBeAttached();
    await search.fill("zzz");
    await expect(owner.getByText("Tidak ada yang cocok dengan “zzz”.")).toBeVisible();
    await search.fill("kota");
    await expect(list.getByRole("option")).toHaveCount(2);
    if (SHOTS) await owner.screenshot({ path: join(SHOTS, "search-select-1440.png") });
    await owner.keyboard.press("ArrowDown");
    await expect(list.getByRole("option").nth(1)).toHaveAttribute("aria-selected", "true");
    await owner.keyboard.press("Enter");
    await expect(list).toHaveCount(0);
    await expect(trigger).toHaveText("Kota Tujuan · Teks");
    await saved(panel);
    await trigger.press("ArrowDown");
    await expect(search).toBeFocused();
    await owner.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await pick(owner, panel, "Dirinci per", "Layanan · Teks");
    await saved(panel);

    // Format angka dipakai di sel pivot.
    await pick(owner, panel, "Format angka", "Rupiah (Rp 1.234)");
    await saved(panel);
    await expect(table.locator("tfoot td").last()).toHaveText(/^Rp\s?180\.864$/);
    if (SHOTS) await owner.screenshot({ path: join(SHOTS, "pivot-panel-1440.png") });

    // Kartu lebar untuk tampilan dan cetak.
    const lr = await owner.request.put(`/api/dashboards/${d}/layout`, {
      headers,
      data: { baseRevision: revision, items: [{ i: widgetId, x: 0, y: 0, w: 8, h: 8 }] },
    });
    expect(lr.status(), await lr.text()).toBe(200);
    revision = ((await lr.json()) as { data: { layoutRevision: number } }).data.layoutRevision;
  });

  for (const width of [1440, 390]) {
    test(`AC2: ${width} px — kepala menempel saat digulir dengan keyboard, subtotal/total tebal`, async () => {
      await owner.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      await owner.goto(`/dashboards/${d}`);
      const region = card(owner).getByRole("region", { name: TITLE });
      await expect(region.locator("tbody tr")).toHaveCount(72);
      if (SHOTS) await owner.screenshot({ path: join(SHOTS, `pivot-view-${width}.png`) });

      await region.focus();
      await expect(region).toBeFocused();
      for (let i = 0; i < 8; i++) await owner.keyboard.press("ArrowDown");
      await expect.poll(() => region.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
      const canX = await region.evaluate((el) => el.scrollWidth > el.clientWidth);
      if (canX) {
        for (let i = 0; i < 8; i++) await owner.keyboard.press("ArrowRight");
        await expect.poll(() => region.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
      }
      expect(canX, "ponsel menggulir ke samping").toBe(width < 768);
      const geo = await region.evaluate((el) => {
        const box = el.getBoundingClientRect();
        const head = el.querySelector("thead th")!.getBoundingClientRect();
        const firstVisible = [...el.querySelectorAll("tbody th")].find(
          (th) => th.getBoundingClientRect().bottom > head.bottom + 1,
        )!;
        const foot = el.querySelector("tfoot tr")!.getBoundingClientRect();
        return {
          headTop: head.top - box.top,
          rowLeft: firstVisible.getBoundingClientRect().left - box.left,
          footBottom: box.bottom - foot.bottom,
        };
      });
      expect(Math.abs(geo.headTop)).toBeLessThanOrEqual(1);
      expect(Math.abs(geo.rowLeft)).toBeLessThanOrEqual(1);
      expect(geo.footBottom).toBeGreaterThanOrEqual(-1);
      if (SHOTS) await owner.screenshot({ path: join(SHOTS, `pivot-scrolled-${width}.png`) });

      const weight = (l: Locator) => l.evaluate((el) => Number(getComputedStyle(el).fontWeight));
      expect(
        await weight(region.locator("tbody tr[data-kind=group] th").first()),
      ).toBeGreaterThanOrEqual(600);
      expect(await weight(region.locator("tfoot th"))).toBeGreaterThanOrEqual(600);
      expect(await weight(region.locator("tbody tr[data-kind=leaf] th").first())).toBeLessThan(600);
      // Nama kepala kolom baris tetap "Customer › Layanan" walau berisi menu saring (T-f4a7).
      await expect(region.locator('thead th[scope="col"]').first()).toHaveAttribute(
        "aria-label",
        "Customer › Layanan",
      );
      await expect(region.locator('tbody th[scope="row"]')).toHaveCount(72);
    });
  }

  test("T-9bc2: ekspor CSV dari kepala kartu — kolom label, Subtotal, Total, angka mentah", async () => {
    test.setTimeout(120_000);
    await owner.setViewportSize({ width: 1440, height: 900 });
    await owner.goto(`/dashboards/${d}`);
    const c = card(owner);
    await expect(c.getByTestId("widget-pivot")).toBeVisible();
    await c.getByTestId("widget-export").click();
    const download = owner.waitForEvent("download", { timeout: 90_000 });
    await owner.getByTestId("export-menu").getByTestId("export-csv").click();
    const dl = await download;
    expect(await dl.failure()).toBeNull();
    const path = join(dir, "pivot.csv");
    await dl.saveAs(path);
    const text = readFileSync(path, "utf8");
    expect(text.startsWith("\uFEFF")).toBe(true);
    const lines = text.slice(1).trimEnd().split("\n");
    expect(lines[0]).toBe('"Customer","Layanan","Jan 2026","Feb 2026","Mar 2026","Total No."');
    expect(lines[1]).toBe('"Customer 24","Subtotal",4810,4812,4814,14436');
    expect(lines[2]).toBe('"Customer 24","Udara",2410,2411,2412,7233');
    expect(lines.at(-1)).toBe('"Total",,60240,60288,60336,180864');
    expect(lines).toHaveLength(1 + 24 + 48 + 1);
  });

  test("T-jwhc: ponsel 390 px — kotak cari di lembar pengaturan, daftar bisa digulir roda/sentuh", async () => {
    await owner.setViewportSize({ width: 390, height: 844 });
    await owner.goto(`/dashboards/${d}?mode=edit`);
    // Tumpukan ponsel baru ada setelah hidrasi (server merender grid): klik sebelum itu hilang.
    await expect(owner.locator("[data-testid=canvas][data-layout=stack]")).toBeVisible();
    await owner.getByRole("button", { name: `Pengaturan ${TITLE}` }).click();
    const sheet = owner.getByRole("dialog");
    await expect(sheet.getByTestId("pivot-config")).toBeVisible();
    await sheet.getByLabel("Satu baris per", { exact: true }).click();
    const search = owner.getByRole("combobox", { name: "Cari Satu baris per" });
    await expect(search).toBeFocused();
    // Huruf ≥ 16 px: iOS tidak memperbesar halaman saat kotak cari difokus.
    expect(
      await search.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
    ).toBeGreaterThanOrEqual(16);
    const list = owner.getByRole("listbox", { name: "Satu baris per" });
    await expect(list.getByRole("option")).toHaveCount(9);
    if (SHOTS) await owner.screenshot({ path: join(SHOTS, "search-select-390.png") });
    const scrollable = await list.evaluate((el) => el.scrollHeight > el.clientHeight);
    if (scrollable) {
      await list.hover();
      await owner.mouse.wheel(0, 300);
      await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    }
    await search.fill("cust");
    await owner.keyboard.press("Enter");
    await expect(list).toHaveCount(0);
    await expect(sheet.getByLabel("Satu baris per", { exact: true })).toBeFocused();
    await expect(sheet.getByLabel("Satu baris per", { exact: true })).toHaveText("Customer · Teks");
  });

  test("AC3: halaman cetak — pivot bersubtotal dan baris Total", async ({ browser }) => {
    test.setTimeout(180_000);
    const { token, exportId } = JSON.parse(
      execFileSync("node", ["scripts/dev-render-token.mjs", "mint", OWNER, d]).toString(),
    ) as { token: string; exportId: string };
    const ctx = await browser.newContext({
      viewport: { width: 1047, height: 740 },
      locale: "id-ID",
    });
    try {
      const page = await ctx.newPage();
      await page.emulateMedia({ media: "print" });
      expect((await page.goto(`/render/${token}`))?.status()).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("data-render-ready", "1", {
        timeout: 120_000,
      });
      const printed = page.getByTestId("print-widget").getByTestId("widget-pivot");
      await expect(printed.locator("thead th").last()).toHaveText("Total No.");
      await expect(printed.locator("tbody tr[data-kind=group]").first()).toContainText(
        "Customer 24",
      );
      await expect(printed.locator("tfoot tr")).toContainText(/Rp\s?180\.864/);
      // Baris yang tidak muat disebut, baris Total tetap di dalam kartu.
      await expect(page.getByTestId("print-pivot-note")).toContainText("dari 48 baris");
      const inside = await page.getByTestId("print-widget").evaluate((el) => {
        const box = el.getBoundingClientRect();
        const foot = el.querySelector("tfoot tr")!.getBoundingClientRect();
        return foot.bottom <= box.bottom + 1;
      });
      expect(inside).toBe(true);
      if (SHOTS) await page.screenshot({ path: join(SHOTS, "pivot-print.png") });
    } finally {
      await ctx.close();
      execFileSync("node", ["scripts/dev-render-token.mjs", "close", exportId]);
    }
  });

  /** Klik sebelum hidrasi hilang: ulangi sampai panel pengaturan pivot terbuka. */
  async function openPanel(page: Page, panel: Locator) {
    await expect(async () => {
      await page.getByRole("button", { name: `Pengaturan ${TITLE}` }).click();
      await expect(panel.getByTestId("pivot-saved-filters")).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 60_000 });
  }

  const total = (page: Page) => card(page).getByTestId("widget-pivot").locator("tfoot td").last();
  const fieldMenu = (page: Page, field: string) =>
    card(page).locator(`[data-testid=pivot-filter][data-field=${field}]`);

  async function exportCsv(page: Page, name: string): Promise<string[]> {
    await card(page).getByTestId("widget-export").click();
    const download = page.waitForEvent("download", { timeout: 90_000 });
    await page.getByTestId("export-menu").getByTestId("export-csv").click();
    const dl = await download;
    expect(await dl.failure()).toBeNull();
    const path = join(dir, name);
    await dl.saveAs(path);
    return readFileSync(path, "utf8").slice(1).trimEnd().split("\n");
  }

  test("T-f4a7 AC1+AC4: menu saring di kepala pivot — cari/centang, total ikut, URL, ekspor, PDF", async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    await owner.setViewportSize({ width: 1440, height: 900 });
    await owner.goto(`/dashboards/${d}`);
    await expect(total(owner)).toHaveText(/^Rp\s?180\.864$/);

    // Layanan: semua tercentang di awal (seperti Excel); lepas Udara = semua kecuali Udara.
    await fieldMenu(owner, "row1").click();
    const layanan = owner.getByRole("dialog", { name: "Saring Layanan" });
    await expect(layanan.getByTestId("filter-slicer-option")).toHaveText(["Darat", "Udara"]);
    await expect(layanan.getByRole("checkbox", { name: "Udara" })).toBeChecked();
    await layanan.getByRole("checkbox", { name: "Udara" }).uncheck();
    await expect(total(owner)).toHaveText(/^Rp\s?90\.072$/);
    const table = card(owner).getByTestId("widget-pivot");
    await expect(table.locator("tbody tr[data-kind=leaf]")).toHaveCount(24);
    await expect(card(owner).getByTestId("pivot-filter-note")).toContainText(
      "Layanan: kecuali Udara",
    );
    if (SHOTS) await owner.screenshot({ path: join(SHOTS, "pivot-filter-menu-1440.png") });
    await owner.keyboard.press("Escape");
    await expect(fieldMenu(owner, "row1")).toBeFocused();

    // Ikut URL: muat ulang tetap tersaring.
    await expect.poll(() => new URL(owner.url()).searchParams.get("f") ?? "").toContain('"pivot"');
    await owner.reload();
    await expect(total(owner)).toHaveText(/^Rp\s?90\.072$/);
    await expect(fieldMenu(owner, "row1")).toHaveAttribute("data-active", "");

    // Kolom pemisah: Hapus pilihan lalu cari + centang Januari saja.
    await fieldMenu(owner, "column").click();
    const bulan = owner.getByRole("dialog", { name: "Saring Tanggal" });
    await expect(bulan.getByTestId("filter-slicer-option")).toHaveText([
      "Jan 2026",
      "Feb 2026",
      "Mar 2026",
    ]);
    await bulan.getByTestId("filter-slicer-clear").click();
    await bulan.getByRole("searchbox", { name: "Cari nilai Tanggal" }).fill("jan");
    await expect(bulan.getByTestId("filter-slicer-option")).toHaveText(["Jan 2026"]);
    await bulan.getByRole("checkbox", { name: "Jan 2026" }).check();
    await owner.keyboard.press("Escape");
    await expect(table.locator("thead th")).toHaveText([/Customer/, "Jan 2026", "Total No."]);
    await expect(total(owner)).toHaveText(/^Rp\s?30\.000$/);

    // AC4: ekspor CSV mengikuti saringan yang sama (subtotal dan total ikut).
    const lines = await exportCsv(owner, "pivot-saring.csv");
    expect(lines[0]).toBe('"Customer","Layanan","Jan 2026","Total No."');
    expect(lines[1]).toBe('"Customer 24","Subtotal",2400,2400');
    expect(lines.at(-1)).toBe('"Total",,30000,30000');
    expect(lines).toHaveLength(1 + 24 + 24 + 1);

    // AC4: PDF dengan status filter layar (?f=) — angka dan catatan saringan sama.
    const f = new URL(owner.url()).searchParams.get("f")!;
    const { token, exportId } = JSON.parse(
      execFileSync("node", ["scripts/dev-render-token.mjs", "mint", OWNER, d, "--f", f]).toString(),
    ) as { token: string; exportId: string };
    const ctx = await browser.newContext({
      viewport: { width: 1047, height: 740 },
      locale: "id-ID",
    });
    try {
      const page = await ctx.newPage();
      await page.emulateMedia({ media: "print" });
      expect((await page.goto(`/render/${token}`))?.status()).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("data-render-ready", "1", {
        timeout: 120_000,
      });
      const printed = page.getByTestId("print-widget").getByTestId("widget-pivot");
      await expect(printed.locator("tfoot tr")).toContainText(/Rp\s?30\.000/);
      await expect(page.getByTestId("print-pivot-filter")).toContainText(
        "Layanan: kecuali Udara; Tanggal: Jan 2026",
      );
    } finally {
      await ctx.close();
      execFileSync("node", ["scripts/dev-render-token.mjs", "close", exportId]);
    }

    // Hapus saringan: kembali ke semua data.
    await card(owner).getByTestId("pivot-filter-clear").click();
    await expect(total(owner)).toHaveText(/^Rp\s?180\.864$/);
    await expect(card(owner).getByTestId("pivot-filter-note")).toHaveCount(0);
  });

  test("T-f4a7 AC2+AC3: bagian Saring tersimpan; klik label pivot menyaring widget lain", async () => {
    test.setTimeout(180_000);
    await owner.setViewportSize({ width: 1440, height: 900 });
    await owner.goto(`/dashboards/${d}?mode=edit`);
    const panel = owner.getByTestId("widget-panel");
    await openPanel(owner, panel);

    // AC2: Saring Layanan = Darat → pivot hanya menghitung Darat, tersimpan di pengaturan.
    const patched = owner.waitForRequest(
      (r) =>
        r.method() === "PATCH" &&
        r.url().includes(`/widgets/${widgetId}`) &&
        !!(r.postDataJSON() as { spec?: { filters?: unknown } } | null)?.spec?.filters,
    );
    await panel.getByRole("button", { name: "Tambah saringan" }).click();
    await pick(owner, panel, "Kolom", "Layanan · Teks");
    const row = panel.getByTestId("pivot-saved-filter");
    await row.getByRole("checkbox", { name: "Darat" }).check();
    await saved(panel);
    const body = (await patched).postDataJSON() as {
      spec: { sheetId: string; filters?: unknown };
    };
    expect(body.spec.filters).toEqual([{ column: 4, op: "in", values: ["Darat"] }]);
    await expect(total(owner)).toHaveText(/^Rp\s?90\.072$/);
    await expect(card(owner).getByTestId("pivot-filter-note")).toContainText(
      "Layanan: Darat (pengaturan widget)",
    );
    await owner.reload();
    await openPanel(owner, panel);
    await expect(row.getByRole("checkbox", { name: "Darat" })).toBeChecked();
    await expect(total(owner)).toHaveText(/^Rp\s?90\.072$/);
    if (SHOTS) await owner.screenshot({ path: join(SHOTS, "pivot-saring-panel-1440.png") });
    await panel.getByRole("button", { name: "Hapus saringan 1" }).click();
    await saved(panel);
    await expect(total(owner)).toHaveText(/^Rp\s?180\.864$/);

    // Sakelar filter silang: mati → label biasa; nyala lagi → label bisa diklik.
    // Simpanan berjeda: tunggu jawaban PATCH sakelar itu sendiri (bukan status yang sudah "tersimpan").
    const toggled = (on: boolean) =>
      owner.waitForResponse(
        (res) =>
          res.request().method() === "PATCH" &&
          res.url().includes(`/widgets/${widgetId}`) &&
          // Pivot: hanya crossFilter === true yang aktif (dimatikan = field dihapus, review M3).
          ((res.request().postDataJSON() as { spec?: { crossFilter?: boolean } } | null)?.spec
            ?.crossFilter ===
            true) ===
            on,
      );
    const sw = panel.getByTestId("widget-crossfilter-switch");
    await expect(sw).toBeChecked();
    const off = toggled(false);
    await sw.click();
    expect((await off).status()).toBe(200);
    await expect(card(owner).getByTestId("crossfilter-item")).toHaveCount(0);
    const on = toggled(true);
    await sw.click();
    expect((await on).status()).toBe(200);
    await expect(card(owner).getByTestId("crossfilter-item").first()).toBeVisible();

    // AC3: KPI kedua; klik label "Customer 24" di pivot → KPI tersaring, chip bisa dihapus.
    const r = await owner.request.post(`/api/dashboards/${d}/widgets`, {
      headers,
      data: {
        baseRevision: revision,
        title: "Total kiriman",
        type: "kpi",
        spec: {
          sheetId: body.spec.sheetId,
          measure: { agg: "sum", column: 3 },
          format: { style: "number", decimals: 0 },
        },
      },
    });
    expect(r.status(), await r.text()).toBe(200);
    await owner.goto(`/dashboards/${d}`);
    const kpi = owner
      .getByTestId("widget")
      .filter({ has: owner.getByRole("heading", { name: "Total kiriman" }) })
      .getByTestId("kpi-value");
    await expect(kpi).toHaveAttribute("title", "180.864");
    const label = card(owner)
      .getByTestId("crossfilter-item")
      .filter({ hasText: /^Customer 24$/ });
    await label.click();
    await expect(label).toHaveAttribute("aria-pressed", "true");
    await expect(kpi).toHaveAttribute("title", "14.436");
    // Pivot sumber tidak menyaring dirinya sendiri.
    await expect(total(owner)).toHaveText(/^Rp\s?180\.864$/);
    const chip = owner.getByTestId("cross-filter-chip");
    await expect(chip).toContainText("Customer 24");
    if (SHOTS) await owner.screenshot({ path: join(SHOTS, "pivot-cross-1440.png") });
    await owner.getByTestId("cross-filter-clear").click();
    await expect(kpi).toHaveAttribute("title", "180.864");
    await expect(chip).toHaveCount(0);
  });
});
