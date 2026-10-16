import { execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  expect,
  test,
  type Locator,
  type Page,
  type Request,
  type Response,
} from "@playwright/test";
import ExcelJS from "exceljs";
import { pageFor, registerAndVerify, startWorker, stopWorker, uniqueEmail } from "./helpers";

/*
 * T-p24e (bug, ditemukan review T-018 r3): kartu KPI setinggi 2 baris grid dengan catatan "N filter tidak
 * berlaku" — ukuran angka dulu hanya dari lebar kartu, jadi di kartu lebar angkanya terpotong setengah
 * (layar 1440/1920 px dan PDF). Workbook 2 sheet: Data (Cabang, Omzet) dan Lain (Wilayah, Omzet); kolom
 * filter Data/Cabang bernilai Jakarta → KPI di sheet Lain bercatatan "1 filter tidak berlaku", KPI di sheet
 * Data tanpa catatan. Tiap kartu h=2 lebar 3/4/5/12 kolom, dan pembanding h=4 selebar sama (batas tinggi
 * tidak berlaku = ukuran angka sebelum perbaikan).
 *   AC1: di 1024/1440/1920 px dan di halaman cetak (/render, viewport renderer) kotak angka utuh di dalam
 *        setiap leluhur yang memotong isi (overflow ≠ visible) sampai kartu, dan tidak meluap di dalamnya.
 *   AC2: KPI tanpa catatan h=2 berukuran huruf sama dengan pembanding h=4 selebar sama (tidak mengecil).
 */
test.describe.configure({ mode: "serial" });

const OWNER = uniqueEmail("kpi-fit");
const TAG = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const dir = mkdtempSync(join(tmpdir(), "dd-e2e-kpi-fit-"));
const headers = { Origin: process.env.E2E_BASE_URL ?? "http://localhost:3100" };
const WIDTHS = [3, 4, 5, 12];
/** Omzet besar (jumlah 10 baris = 1.234.567.890): angka panjang seperti dashboard sungguhan. */
const OMZET = 123_456_789;

type Kind = "noted" | "plain" | "tall";
interface Card {
  id: string;
  kind: Kind;
  w: number;
}

let worker: ChildProcess | null = null;
let owner: Page;
let d = "";
let f = "";
let cards: Card[] = [];

async function workbook(): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const data = wb.addWorksheet("Data");
  data.addRow(["Cabang", "Omzet"]);
  for (let i = 0; i < 20; i++) data.addRow([i % 2 ? "Bandung" : "Jakarta", OMZET]);
  const other = wb.addWorksheet("Lain");
  other.addRow(["Wilayah", "Omzet"]);
  for (let i = 0; i < 10; i++) other.addRow([i % 2 ? "Barat" : "Timur", OMZET]);
  const path = join(dir, "omzet-dua-sheet.xlsx");
  await wb.xlsx.writeFile(path);
  return path;
}

const widgetTitled = (page: Page, title: string) =>
  page.getByTestId("widget").filter({ has: page.getByRole("heading", { name: title }) });

/** Tambah widget lewat UI, beri judul, pilih jenis; tunggu konfigurasi tersimpan (pola pdf.spec.ts). */
async function addWidget(page: Page, title: string, type: string): Promise<Locator> {
  const before = await page.getByTestId("widget").count();
  await page
    .getByTestId("canvas-toolbar")
    .getByRole("button", { name: "Tambah widget", exact: true })
    .click();
  await expect(page.getByTestId("widget")).toHaveCount(before + 1);
  const panel = page.getByTestId("widget-panel");
  await expect(panel.getByRole("heading", { name: "Pengaturan widget" })).toBeFocused();
  await panel.getByLabel("Judul", { exact: true }).fill(title);
  await panel.getByLabel("Judul", { exact: true }).press("Enter");
  await expect(widgetTitled(page, title)).toHaveCount(1);
  await panel.getByText(type, { exact: true }).click();
  await expect(panel.getByTestId("config-status")).toHaveAttribute("data-state", "saved");
  return panel;
}

/**
 * Pengukuran di halaman: tiap kartu KPI → ukuran huruf angka, ada tidaknya catatan filter (layar: "1 filter
 * tidak berlaku"; cetak: "Filter Cabang tidak berlaku …"), dan seberapa jauh teks angka (kotak teks Range =
 * tinggi huruf, bukan kotak baris leading-tight) keluar dari kotak padding leluhur yang memotong isi
 * (px; 0 = utuh) atau meluap di dalam angka itu sendiri. `side` = sisi terburuk (bahan debug).
 */
function measure(page: Page, root: string) {
  return page.evaluate(
    (root) =>
      [...document.querySelectorAll<HTMLElement>(root)].map((card) => {
        const value = card.querySelector<HTMLElement>("[data-testid=kpi-value]");
        const id = card.dataset.widgetId ?? "";
        if (!value) return { id, px: 0, note: false, cut: -1, side: "tanpa angka" };
        const range = document.createRange();
        // Bentuk ringkas: teks tampil (aria-hidden) + nilai lengkap sr-only yang tidak tergambar.
        range.selectNodeContents(value.querySelector("[aria-hidden]") ?? value);
        const v = range.getBoundingClientRect();
        let cut = Math.max(0, value.scrollWidth - value.clientWidth);
        let side = cut ? "meluap" : "";
        for (let el = value.parentElement; el && card.contains(el); el = el.parentElement) {
          const s = getComputedStyle(el);
          if (s.overflowX === "visible" && s.overflowY === "visible") continue;
          const r = el.getBoundingClientRect();
          const top = r.top + el.clientTop;
          const left = r.left + el.clientLeft;
          const sides = {
            atas: top - v.top,
            bawah: v.bottom - (top + el.clientHeight),
            kiri: left - v.left,
            kanan: v.right - (left + el.clientWidth),
          };
          for (const [k, n] of Object.entries(sides)) {
            if (n > cut) [cut, side] = [n, `${k} ${el.className.slice(0, 60)}`];
          }
        }
        return {
          id,
          px: parseFloat(getComputedStyle(value).fontSize),
          note: !!card.textContent?.includes("tidak berlaku"),
          cut,
          side,
        };
      }),
    root,
  );
}

/** Semua kartu berisi angka KPI yang sudah diukur (bukan kartu galat / render pertama). */
async function expectMeasured(page: Page) {
  await expect(page.getByTestId("kpi-value")).toHaveCount(cards.length);
  for (const v of await page.getByTestId("kpi-value").all()) {
    await expect(v).toHaveText(/\d/);
    await expect(v).toHaveAttribute("style", /font-size/);
  }
}

function expectFit(rows: Awaited<ReturnType<typeof measure>>, where: string) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const c of cards) {
    const r = byId.get(c.id);
    expect(r, `${where}: kartu ${c.kind} w${c.w} ada`).toBeTruthy();
    expect(r!.note, `${where}: catatan di kartu ${c.kind} w${c.w}`).toBe(c.kind === "noted");
    // Toleransi 0,5 px: pembulatan sub-piksel tata letak, bukan potongan glif.
    expect(
      r!.cut,
      `${where}: angka ${c.kind} w${c.w} terpotong (${r!.px} px, ${r!.side})`,
    ).toBeLessThanOrEqual(0.5);
  }
  return byId;
}

test.describe("ukuran angka KPI di kartu pendek (T-p24e)", () => {
  test.beforeAll(async ({ browser, request }) => {
    test.setTimeout(300_000);
    execFileSync("node", ["scripts/dev-reset-ratelimit.mjs", "register:ip", "verify:ip"]); // suite penuh: batas per IP
    const setup = await browser.newPage();
    await registerAndVerify(setup, request, OWNER);
    await setup.close();
    owner = await pageFor(browser, OWNER);
    await owner.setViewportSize({ width: 1440, height: 900 });
    worker = await startWorker("kpi-fit");

    await owner.goto("/datasets/baru");
    await owner.getByLabel("Nama dataset").fill(`Omzet KPI ${TAG}`);
    await owner.getByRole("button", { name: "Buat dataset" }).click();
    await expect(owner).toHaveURL(/\/datasets\/[a-z0-9]{20,32}\?created=1$/);
    const datasetId = new URL(owner.url()).pathname.split("/").pop()!;
    await owner.getByTestId("upload-input").setInputFiles(await workbook());
    await expect(owner.getByTestId("dataset-schema-link")).toBeVisible({ timeout: 120_000 });

    await owner.goto(`/dashboards/baru?dataset=${datasetId}`);
    await owner.getByLabel("Nama dashboard").fill(`KPI pendek ${TAG}`);
    await owner.getByRole("button", { name: "Buat dashboard" }).click();
    await expect(owner).toHaveURL(/\/dashboards\/[a-z0-9]{20,32}\?mode=edit$/);
    d = new URL(owner.url()).pathname.split("/").pop()!;

    // Dua KPI lewat panel (Total Omzet di sheet Data dan di sheet Lain); isi tersimpannya dipakai ulang
    // untuk kartu lain lewat API (14 kartu lewat panel terlalu lambat).
    const saved = new Map<string, unknown>();
    let revision = NaN;
    const onRequest = (r: Request) => {
      const body = r.method() === "PATCH" ? (r.postDataJSON() as { type?: string } | null) : null;
      if (body?.type === "kpi") saved.set(new URL(r.url()).pathname, body);
    };
    // Revisi tata letak naik hanya saat widget ditambah/dihapus (bukan saat isinya diubah).
    const onResponse = async (r: Response) => {
      if (r.request().method() !== "POST" || !r.url().endsWith(`/dashboards/${d}/widgets`)) return;
      revision = ((await r.json()) as { data: { layoutRevision: number } }).data.layoutRevision;
    };
    owner.on("request", onRequest);
    owner.on("response", onResponse);
    type Config = { type: string; spec: { sheetId: string } };
    await addWidget(owner, "Omzet Data", "Angka");
    const idOf = async (title: string) =>
      (await widgetTitled(owner, title).getAttribute("data-widget-id"))!;
    const ids = [await idOf("Omzet Data")];
    const dataSpec = [...saved].find(([path]) => path.endsWith(`/widgets/${ids[0]}`))?.[1] as
      Config | undefined;
    expect(dataSpec, "isi KPI sheet Data tersimpan").toBeTruthy();
    const lain = await addWidget(owner, "Omzet Lain", "Angka");
    ids.push(await idOf("Omzet Lain"));
    // Ganti sheet disimpan lewat PATCH berjeda: tunggu permintaan berisi sheet lain, bukan status saja.
    const moved = owner.waitForRequest(
      (r) =>
        r.method() === "PATCH" &&
        r.url().endsWith(`/widgets/${ids[1]}`) &&
        [undefined, dataSpec!.spec.sheetId].every(
          (id) => (r.postDataJSON() as Config | null)?.spec?.sheetId !== id,
        ),
    );
    await lain.getByLabel("Sheet", { exact: true }).click();
    await owner.getByRole("option", { name: "Lain", exact: true }).click();
    const lainSpec = (await moved).postDataJSON() as Config;
    expect((await (await moved).response())?.ok(), "ganti sheet tersimpan").toBe(true);
    await expect(lain.getByTestId("config-status")).toHaveAttribute("data-state", "saved");
    owner.off("request", onRequest);
    owner.off("response", onResponse);
    expect(Number.isInteger(revision), "revisi tata letak dari tambah widget").toBe(true);
    expect(lainSpec.type).toBe("kpi");

    // Tata letak: baris h=2 bercatatan (Lain), h=2 tanpa catatan (Data), h=4 pembanding (Data).
    const plan: { kind: Kind; w: number; h: number }[] = (
      ["noted", "plain", "tall"] as const
    ).flatMap((kind) => WIDTHS.map((w) => ({ kind, w, h: kind === "tall" ? 4 : 2 })));
    const created: string[] = [];
    for (const [k, p] of plan.entries()) {
      // Dua kartu pertama dipakai ulang (Data → plain w3, Lain → noted w3).
      if (k === 0) {
        created.push(ids[1]!);
        continue;
      }
      if (k === WIDTHS.length) {
        created.push(ids[0]!);
        continue;
      }
      const config = p.kind === "noted" ? lainSpec : dataSpec;
      const r = await owner.request.post(`/api/dashboards/${d}/widgets`, {
        headers,
        data: { baseRevision: revision, title: `Omzet ${p.kind} ${p.w}`, ...config },
      });
      const j = (await r.json()) as { data: { layoutRevision: number; widget: { id: string } } };
      expect(r.status(), JSON.stringify(j)).toBe(200);
      revision = j.data.layoutRevision;
      created.push(j.data.widget.id);
    }
    let y = 0;
    const items = [];
    for (const kind of ["noted", "plain", "tall"] as const) {
      const row = plan.map((p, k) => ({ ...p, i: created[k]! })).filter((p) => p.kind === kind);
      let x = 0;
      for (const p of row) {
        if (x + p.w > 12) {
          x = 0;
          y += p.h;
        }
        items.push({ i: p.i, x, y, w: p.w, h: p.h });
        x += p.w;
      }
      y += row[0]!.h;
    }
    const lr = await owner.request.put(`/api/dashboards/${d}/layout`, {
      headers,
      data: { baseRevision: revision, items },
    });
    expect(lr.status(), await lr.text()).toBe(200);
    cards = plan.map((p, k) => ({ id: created[k]!, kind: p.kind, w: p.w }));

    // Kolom filter Cabang (sheet Data) bernilai Jakarta: tidak berlaku untuk KPI di sheet Lain.
    await owner.goto(`/dashboards/${d}?mode=edit`);
    const section = owner.getByTestId("dashboard-filter-columns");
    await section.getByRole("button", { name: "Tambah kolom filter" }).click();
    const patched = owner.waitForResponse(
      (r) => r.url().endsWith("/filter-columns") && r.request().method() === "PATCH",
    );
    await owner.getByRole("menuitem", { name: /^Cabang/ }).click();
    expect((await patched).status()).toBe(200);
    await owner.goto(`/dashboards/${d}`);
    await owner.locator('[data-testid=filter-slicer][data-column="Cabang"]').click();
    await owner.locator('[data-testid=filter-slicer-option][data-value="Jakarta"] input').check();
    await owner.keyboard.press("Escape");
    await expect(owner).toHaveURL(/[?&]f=/);
    f = new URL(owner.url()).searchParams.get("f")!;
  });

  test.afterAll(async () => {
    await stopWorker(worker);
    await owner?.context().close();
  });

  for (const width of [1024, 1440, 1920]) {
    test(`AC1+AC2: layar ${width} px — angka KPI h=2 bercatatan utuh, tanpa catatan tidak mengecil`, async () => {
      await owner.setViewportSize({ width, height: 1000 });
      await owner.goto(`/dashboards/${d}?f=${encodeURIComponent(f)}`);
      await expect(owner.getByTestId("widget-skipped-filters")).toHaveCount(WIDTHS.length);
      // Ukuran inline terpasang setelah KPI mengukur kotaknya (render pertama = ukuran dari lebar saja).
      await expectMeasured(owner);
      const byId = expectFit(await measure(owner, "[data-testid=widget]"), `${width} px`);
      for (const w of WIDTHS) {
        const plain = cards.find((c) => c.kind === "plain" && c.w === w)!;
        const tall = cards.find((c) => c.kind === "tall" && c.w === w)!;
        expect(byId.get(plain.id)!.px, `${width} px w${w}: h=2 vs h=4`).toBe(byId.get(tall.id)!.px);
      }
    });
  }

  test("AC1: halaman cetak (viewport renderer 1047 px, media print) — angka KPI h=2 bercatatan utuh", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const { token, exportId } = JSON.parse(
      execFileSync("node", ["scripts/dev-render-token.mjs", "mint", OWNER, d, "--f", f]).toString(),
    ) as { token: string; exportId: string };
    // Sama dengan renderer/renderer.ts CONTEXT_OPTIONS (lebar cetak 277 mm).
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
      await expect(page.getByTestId("print-widget")).toHaveCount(cards.length);
      await expectMeasured(page);
      expectFit(await measure(page, "[data-testid=print-widget]"), "cetak");
    } finally {
      await ctx.close();
      execFileSync("node", ["scripts/dev-render-token.mjs", "close", exportId]);
    }
  });
});
