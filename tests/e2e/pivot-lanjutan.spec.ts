import { execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import ExcelJS from "exceljs";
import {
  apiLogin,
  pageFor,
  registerAndVerify,
  startWorker,
  stopWorker,
  uniqueEmail,
} from "./helpers";

/*
 * T-075 (G-7 fase 5): jalur kritis pivot lanjutan lintas fitur di atas dataset sungguhan (worker).
 *   Pivot tersimpan 3 tingkat (Wilayah › Layanan › Kota, Top 5 Kota + "(Lainnya)") × 5 nilai
 *   (Total Pendapatan, % dari total kolom, Jumlah baris, field terhitung Laba dan Margin) per bulan.
 *   Pemilik membuka/menyimpan definisi itu lewat editor (tidak ada yang hilang), mengikat pivot, batang,
 *   KPI, dan tabel lewat Sumber data, lalu sumber diubah (4 tingkat, Pendapatan → Biaya) → keempatnya
 *   berubah serempak. Viewer melihat nilai yang sama, tanpa akses definisi. Ekspor CSV/XLSX pivot 4
 *   tingkat = tabel di layar (uji pembanding sel demi sel), halaman cetak (/render, jalur PDF) memuat
 *   pivot + "(Lainnya)" + catatan potongan. 360 dan 768 px: pivot 4 tingkat, editor field terhitung,
 *   daftar pivot tersimpan tanpa gulir horizontal halaman, axe tanpa pelanggaran serius/kritis.
 * Nilai acuan dihitung di tes ini dari baris CSV yang sama (bukan disalin dari aplikasi).
 * PDF sungguhan (renderer Chromium) tidak bisa jalan di kontainer cloud (root tanpa --no-sandbox):
 * periksa di olympus (docs/ai/perf/T-075.md); di sini halaman cetak yang dirender renderer diuji langsung.
 */
test.describe.configure({ mode: "serial" });

const OWNER = uniqueEmail("pl-owner");
const VIEWER = uniqueEmail("pl-viewer");
const NAME = "Laba per kota";
const SHOTS = process.env.E2E_SHOTS;
const AXE = readFileSync(join(process.cwd(), "node_modules/axe-core/axe.min.js"), "utf8");
const dir = mkdtempSync(join(tmpdir(), "dd-e2e-pivot-lanjutan-"));
let worker: ChildProcess | null = null;
let datasetId = "";
let dash = "";
let pivotId = "";
const widgetIds: Record<string, string> = {};

// ---------- data + acuan ----------
interface Row {
  wilayah: string;
  layanan: string;
  kota: string;
  kurir: string;
  bulan: number;
  p: number;
  b: number;
}
const KOTA: Record<string, number[]> = { Barat: [1, 2, 3, 4, 5, 6, 7], Timur: [8, 9] };
const LAYANAN = ["Reguler", "Kilat"];
const KURIR = ["Andi", "Budi"];
const DATA: Row[] = [];
for (const [wilayah, kotas] of Object.entries(KOTA)) {
  for (const k of kotas) {
    for (const [l, layanan] of LAYANAN.entries()) {
      for (const [c, kurir] of KURIR.entries()) {
        for (const m of [1, 2]) {
          DATA.push({
            wilayah,
            layanan,
            kota: `Kota ${String(k).padStart(2, "0")}`,
            kurir,
            bulan: m,
            p: k * 1000 + (l + 1) * 100 + (c + 1) * 10 + m,
            b: k * 400 + (l + 1) * 30 + (c + 1) * 5 + m,
          });
        }
      }
    }
  }
}
const sum = (rows: Row[], f: (r: Row) => number) => rows.reduce((n, r) => n + f(r), 0);
const where = (pred: (r: Row) => boolean) => DATA.filter(pred);
const P = sum(DATA, (r) => r.p);
const B = sum(DATA, (r) => r.b);
/** Kota Barat di luar 5 teratas (menurut Total Pendapatan per Layanan) = Kota 01 + Kota 02. */
const lainnyaBaratReguler = where(
  (r) =>
    r.wilayah === "Barat" && r.layanan === "Reguler" && ["Kota 01", "Kota 02"].includes(r.kota),
);

// ---------- format Indonesia ----------
const rupiah = (n: number) => new RegExp(`^Rp\\s?${n.toLocaleString("id-ID")}$`);
/** Teks sel pivot → angka (Rp 1.234 / 40,0% / 1.234 / –). */
function num(text: string): number | null {
  const t = text.replace(/\s/g, "").replace(/^Rp/, "");
  if (!t || t === "–" || t === "-") return null;
  const pctSign = t.endsWith("%");
  const n = Number(t.replace("%", "").replace(/\./g, "").replace(",", "."));
  return pctSign ? n / 100 : n;
}

// ---------- helpers UI ----------
const card = (page: Page, title: string) =>
  page.getByTestId("widget").filter({ has: page.getByRole("heading", { name: title }) });
const row = (page: Page, name: string) =>
  page.getByTestId("saved-pivot-row").and(page.locator(`[data-name="${name}"]`));

async function pick(page: Page, scope: Locator, label: string, option: string) {
  await scope.getByLabel(label, { exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function openPanel(page: Page, title: string): Promise<Locator> {
  const panel = page.getByTestId("widget-panel");
  await expect(async () => {
    if (!(await panel.isVisible())) {
      await card(page, title)
        .getByRole("button", { name: /^Pengaturan/ })
        .click();
    }
    await expect(panel.getByRole("heading", { name: "Pengaturan widget" })).toBeVisible({
      timeout: 2_000,
    });
  }).toPass({ timeout: 20_000 });
  return panel;
}

async function bind(page: Page, title: string, type: string) {
  const panel = await openPanel(page, title);
  await panel.getByTestId("widget-source").getByText("Pivot tersimpan").click();
  await panel.getByText(type, { exact: true }).click();
  await pick(page, panel, "Pivot tersimpan yang dipakai", NAME);
  await expect(panel.getByTestId("bound-source")).toContainText(
    `Bersumber dari pivot tersimpan ${NAME}`,
  );
  await expect(panel.getByTestId("config-status")).toHaveAttribute("data-state", "saved");
  await panel.getByRole("button", { name: "Tutup pengaturan" }).first().click();
}

/** Isi tabel pivot di layar: label baris (th) + angka tiap sel (td), termasuk Subtotal dan Total. */
async function screenTable(table: Locator) {
  return table.locator("tbody tr, tfoot tr").evaluateAll((trs) =>
    trs.map((tr) => ({
      kind: (tr as HTMLElement).dataset.kind ?? "",
      labels: [...tr.querySelectorAll("th")].map((th) => th.textContent!.trim()),
      cells: [...tr.querySelectorAll("td")].map((td) => td.textContent!.trim()),
    })),
  );
}

async function download(page: Page, title: string, format: "csv" | "xlsx"): Promise<string> {
  await card(page, title).getByTestId("widget-export").click();
  const dl = page.waitForEvent("download", { timeout: 90_000 });
  await page.getByTestId("export-menu").getByTestId(`export-${format}`).click();
  const file = await dl;
  expect(await file.failure()).toBeNull();
  const path = join(dir, `${title}.${format}`);
  await file.saveAs(path);
  await page.keyboard.press("Escape");
  return path;
}

function parseCsv(path: string): string[][] {
  const lines = readFileSync(path, "utf8")
    .replace(/^\uFEFF/, "")
    .trimEnd()
    .split("\n");
  return lines.map((l) =>
    [...l.matchAll(/("(?:[^"]|"")*"|[^,]*)(,|$)/g)]
      .map((m) => m[1]!)
      .slice(0, -1)
      .map((c) => (c.startsWith('"') ? c.slice(1, -1).replace(/""/g, '"') : c)),
  );
}

async function parseXlsx(path: string): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ws = wb.worksheets[0]!;
  const out: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (r) => {
    const vals = (r.values as unknown[]).slice(1);
    out.push(
      vals.map((v) =>
        v === null || v === undefined
          ? ""
          : typeof v === "object" && v && "result" in v
            ? String((v as { result: unknown }).result)
            : String(v),
      ),
    );
  });
  return out;
}

/**
 * Bandingkan berkas ekspor dengan tabel layar sel demi sel. Layar dibulatkan menurut format (Rupiah
 * tanpa desimal, persen 1 desimal) → toleransi setengah satuan tampilan; berkas memuat angka mentah.
 */
function compareExport(
  screen: Awaited<ReturnType<typeof screenTable>>,
  file: string[][],
  levels: number,
) {
  const body = file.slice(1);
  expect(body).toHaveLength(screen.length);
  screen.forEach((s, i) => {
    const f = body[i]!;
    const label = s.labels.join(" › ");
    // Label baris terdalam/Subtotal/Total ada di salah satu kolom label berkas.
    expect(f.slice(0, levels).join("|"), `label baris ${i}`).toContain(s.labels.at(-1)!);
    const nums = f.slice(levels);
    expect(nums, `jumlah sel baris ${label}`).toHaveLength(s.cells.length);
    s.cells.forEach((text, j) => {
      const shown = num(text);
      const raw = nums[j] === "" ? null : Number(nums[j]);
      if (shown === null) {
        expect(raw, `${label} sel ${j}`).toBeNull();
        return;
      }
      expect(raw, `${label} sel ${j} (${text})`).not.toBeNull();
      const tol = text.includes("%") ? 0.0005 : 0.5;
      expect(
        Math.abs(raw! - shown),
        `${label} sel ${j}: layar ${text}, berkas ${raw}`,
      ).toBeLessThanOrEqual(tol);
    });
  });
}

async function noHorizontalScroll(page: Page, what: string) {
  const { over, wide } = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    // Bahan debug: elemen terdalam yang melewati tepi kanan viewport.
    const wide = [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((el) => el.getBoundingClientRect().right > vw + 1)
      .filter((el) => {
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
          if (getComputedStyle(a).overflowX !== "visible") return false;
        }
        return true;
      })
      .filter((el) => ![...el.children].some((c) => c.getBoundingClientRect().right > vw + 1))
      .slice(0, 5)
      .map(
        (el) =>
          `${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 30)}" ${el.className.toString().slice(0, 60)}`,
      );
    return { over: document.documentElement.scrollWidth - vw, wide };
  });
  expect(
    over,
    `${what}: lebar halaman melebihi viewport (${wide.join(" | ")})`,
  ).toBeLessThanOrEqual(0);
}

/** Pelanggaran axe serius/kritis (disuntik lewat evaluate: CSP nonce tidak menghalangi). */
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

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
}

// ---------- spec pivot tersimpan (kolom ditulis dengan NAMA; fixture memetakan ke posisi) ----------
const total = (column: string) => ({ agg: "sum", column });
const labaExpr = { op: "sub", args: [total("Pendapatan"), total("Biaya")] };
const specOf = (first: string, rows: string[]) => ({
  rows: rows.map((column) => (column === "Kota" ? { column, topN: { n: 5, by: 0 } } : { column })),
  column: { column: "Bulan", timeGrain: "month" },
  values: [
    total(first),
    { ...total(first), showAs: "pct_col" },
    { agg: "count" },
    { kind: "calc", label: "Laba", expr: labaExpr },
    {
      kind: "calc",
      label: "Margin",
      expr: { op: "div", args: [labaExpr, total("Pendapatan")] },
      format: { style: "percent", decimals: 1 },
    },
  ],
  sort: "value_desc",
  format: { style: "rupiah", decimals: 0 },
  totals: true,
  subtotals: true,
});

test.describe("pivot lanjutan lintas fitur (T-075)", () => {
  test.beforeAll(async ({ browser, request, baseURL }) => {
    test.setTimeout(300_000);
    execFileSync("node", ["scripts/dev-reset-ratelimit.mjs", "register:ip", "verify:ip"]);
    const p = await browser.newPage();
    await registerAndVerify(p, request, OWNER);
    await registerAndVerify(p, request, VIEWER);
    await apiLogin(p, OWNER);
    worker = await startWorker("pivot-lanjutan");
    const csv = join(dir, "kiriman-kota.csv");
    writeFileSync(
      csv,
      [
        "Wilayah;Layanan;Kota;Kurir;Bulan;Pendapatan;Biaya",
        ...DATA.map((r) =>
          [r.wilayah, r.layanan, r.kota, r.kurir, `2026-0${r.bulan}-15`, r.p, r.b].join(";"),
        ),
      ].join("\n"),
    );
    await p.goto("/datasets/baru");
    await p.getByLabel("Nama dataset").fill(`Pivot lanjutan ${Date.now()}`);
    await p.getByRole("button", { name: "Buat dataset" }).click();
    await expect(p).toHaveURL(/\/datasets\/[a-z0-9]{20,32}\?created=1$/);
    datasetId = new URL(p.url()).pathname.split("/").pop()!;
    await p.getByTestId("upload-input").setInputFiles(csv);
    await expect(p.getByTestId("dataset-schema-link")).toBeVisible({ timeout: 120_000 });
    dash = (
      JSON.parse(
        execFileSync("node", [
          "scripts/dev-share-fixture.mjs",
          OWNER,
          VIEWER,
          "VIEWER",
          datasetId,
        ]).toString(),
      ) as { dashboardId: string }
    ).dashboardId;
    const headers = { origin: baseURL!, "content-type": "application/json" };
    let revision = 0;
    for (const title of ["Pivot kota", "Batang wilayah", "KPI pendapatan", "Tabel kota"]) {
      const r = await p.request.post(`/api/dashboards/${dash}/widgets`, {
        headers,
        data: { baseRevision: revision, title },
      });
      const j = (await r.json()) as { data: { layoutRevision: number; widget: { id: string } } };
      expect(r.status(), JSON.stringify(j)).toBe(200);
      revision = j.data.layoutRevision;
      widgetIds[title] = j.data.widget.id;
    }
    // Pivot selebar kanvas dan tinggi (pivot terbesar di PDF); kartu lain di bawahnya.
    const at = (title: string, x: number, y: number, w: number, h: number) => ({
      i: widgetIds[title]!,
      x,
      y,
      w,
      h,
    });
    const lr = await p.request.put(`/api/dashboards/${dash}/layout`, {
      headers,
      data: {
        baseRevision: revision,
        items: [
          at("Pivot kota", 0, 0, 12, 16),
          at("KPI pendapatan", 0, 16, 4, 3),
          at("Batang wilayah", 4, 16, 8, 6),
          at("Tabel kota", 0, 22, 12, 8),
        ],
      },
    });
    expect(lr.status(), await lr.text()).toBe(200);
    await p.close();
  });

  test.afterAll(async () => {
    await stopWorker(worker);
  });

  test("pemilik membuat pivot tersimpan 3 tingkat × 5 nilai; editor menyimpannya utuh", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await apiLogin(page, OWNER);
    await page.goto(`/datasets/${datasetId}`);
    await page.getByTestId("saved-pivot-card").getByTestId("saved-pivot-new").click();
    await page.getByRole("textbox", { name: "Nama", exact: true }).fill(NAME);
    await page.getByTestId("saved-pivot-save").click();
    await expect(page).toHaveURL(new RegExp(`/datasets/${datasetId}\\?pivot=dibuat`));
    const href = await row(page, NAME)
      .getByRole("link", { name: `Ubah ${NAME}` })
      .getAttribute("href");
    pivotId = href!.split("/").pop()!;
    // Bentuk lengkap lewat fixture (penyusun tiap bagian sudah diuji di pivot/calc-widgets/
    // saved-pivot-widgets); di sini editor harus memuat dan menyimpan ulang bentuk itu tanpa kehilangan.
    execFileSync("node", [
      "scripts/dev-saved-pivot-fixture.mjs",
      "edit",
      pivotId,
      JSON.stringify(specOf("Pendapatan", ["Wilayah", "Layanan", "Kota"])),
    ]);
    await page.goto(`/datasets/${datasetId}/pivot-tersimpan/${pivotId}`);
    const editor = page.getByTestId("saved-pivot-editor");
    await expect(editor.getByTestId("pivot-summary")).toContainText(
      "5 teratas per Layanan, sisanya (Lainnya)",
    );
    await expect(editor.getByRole("button", { name: "Ubah rumus Laba" })).toBeVisible();
    await expect(editor.getByRole("button", { name: "Ubah rumus Margin" })).toBeVisible();
    await expect(editor.getByTestId("calc-formula").last()).toHaveText(
      "Margin = (Total Pendapatan − Total Biaya) ÷ Total Pendapatan",
    );
    await editor.getByTestId("saved-pivot-save").click();
    await expect(page).toHaveURL(new RegExp(`/datasets/${datasetId}\\?pivot=diubah`));
    // Disimpan ulang lewat editor (aksi server) = bentuk yang sama (tidak ada field yang hilang).
    const stored = JSON.parse(
      execFileSync("node", ["scripts/dev-saved-pivot-fixture.mjs", "show", pivotId]).toString(),
    ) as { spec: { rows: unknown[]; values: unknown[]; column: unknown } };
    expect(stored.spec.rows).toHaveLength(3);
    expect(stored.spec.values).toHaveLength(5);
    expect(stored.spec.values[1]).toMatchObject({ showAs: "pct_col" });
    expect(stored.spec.values[4]).toMatchObject({ kind: "calc", label: "Margin" });
    expect(stored.spec.rows[2]).toMatchObject({ topN: { n: 5, by: 0 } });
  });

  test("pemilik mengikat pivot, batang, KPI, dan tabel; nilai = acuan", async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await apiLogin(page, OWNER);
    await page.goto(`/dashboards/${dash}?mode=edit`);
    await bind(page, "Pivot kota", "Pivot");
    await bind(page, "Batang wilayah", "Batang");
    await bind(page, "KPI pendapatan", "Angka");
    await bind(page, "Tabel kota", "Tabel");

    await page.goto(`/dashboards/${dash}`);
    await expect(card(page, "KPI pendapatan").getByTestId("kpi-value")).toHaveText(rupiah(P));
    const pivot = card(page, "Pivot kota").getByTestId("widget-pivot");
    // Top 5 Kota per Layanan di Barat (7 kota) → 2 baris "(Lainnya)"; Timur (2 kota) tanpa.
    const others = pivot.locator("tbody tr[data-kind=leaf]").filter({ hasText: "(Lainnya)" });
    await expect(others).toHaveCount(2);
    const shown = await screenTable(pivot);
    const grand = shown.find((r) => r.kind === "total")!;
    // Kolom: per bulan × 5 nilai, lalu Total × 5 nilai.
    const t = grand.cells.slice(-5);
    expect(num(t[0]!)).toBe(P);
    expect(t[1]).toBe("100,0%");
    expect(num(t[2]!)).toBe(DATA.length);
    expect(num(t[3]!)).toBe(P - B);
    expect(num(t[4]!)).toBeCloseTo((P - B) / P, 3);
    const lain = shown.find(
      (r) => r.kind === "leaf" && r.labels.at(-1) === "(Lainnya)" && r.cells.length,
    )!;
    // Baris (Lainnya) pertama = Barat › Reguler (urut nilai turun: Reguler < Kilat? cek dua-duanya).
    const lainP = [
      sum(lainnyaBaratReguler, (r) => r.p),
      sum(
        where(
          (r) =>
            r.wilayah === "Barat" &&
            r.layanan === "Kilat" &&
            ["Kota 01", "Kota 02"].includes(r.kota),
        ),
        (r) => r.p,
      ),
    ];
    expect(lainP).toContain(num(lain.cells.at(-5)!));
    // Bulan Januari: % dari total kolom pada baris Total = 100%.
    expect(grand.cells[1]).toBe("100,0%");

    const bars = card(page, "Batang wilayah").getByTestId("chart-data");
    await expect
      .poll(() =>
        bars
          .locator("tbody tr")
          .evaluateAll((trs) =>
            Object.fromEntries(
              trs.map((tr) => [
                tr.querySelector("th")!.textContent!,
                Number((tr.querySelector("td") as HTMLElement).dataset.value),
              ]),
            ),
          ),
      )
      .toEqual({
        Barat: sum(
          where((r) => r.wilayah === "Barat"),
          (r) => r.p,
        ),
        Timur: sum(
          where((r) => r.wilayah === "Timur"),
          (r) => r.p,
        ),
      });
    const table = card(page, "Tabel kota").getByTestId("widget-pivot");
    await expect(table.locator("tfoot td").first()).toHaveText(rupiah(P));
    await page.goto(`/datasets/${datasetId}`);
    await expect(row(page, NAME).getByTestId("saved-pivot-usage")).toContainText(
      "4 widget, 1 dashboard",
    );
  });

  test("sumber berubah (4 tingkat, Biaya) → keempat widget berubah serempak", async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await apiLogin(page, OWNER);
    execFileSync("node", [
      "scripts/dev-saved-pivot-fixture.mjs",
      "edit",
      pivotId,
      JSON.stringify(specOf("Biaya", ["Wilayah", "Layanan", "Kota", "Kurir"])),
    ]);
    await page.goto(`/dashboards/${dash}`);
    await expect(card(page, "KPI pendapatan").getByTestId("kpi-value")).toHaveText(rupiah(B));
    const pivot = card(page, "Pivot kota").getByTestId("widget-pivot");
    await expect(pivot.getByRole("columnheader", { name: "Total Biaya" }).first()).toBeVisible();
    await expect(pivot.locator("tbody tr[data-depth='3']").first()).toBeVisible();
    await expect(pivot.locator("tfoot td").nth(-5)).toHaveText(rupiah(B));
    const table = card(page, "Tabel kota").getByTestId("widget-pivot");
    await expect(
      table.getByRole("columnheader", { name: "Total Biaya", exact: true }),
    ).toBeVisible();
    await expect(table.locator("tfoot td").first()).toHaveText(rupiah(B));
    await expect
      .poll(() =>
        card(page, "Batang wilayah")
          .getByTestId("chart-data")
          .locator("tbody tr td")
          .evaluateAll((tds) => tds.map((td) => Number((td as HTMLElement).dataset.value)).sort()),
      )
      .toEqual(
        [
          sum(
            where((r) => r.wilayah === "Barat"),
            (r) => r.b,
          ),
          sum(
            where((r) => r.wilayah === "Timur"),
            (r) => r.b,
          ),
        ].sort(),
      );
  });

  test("ekspor CSV dan XLSX pivot 4 tingkat = tabel di layar (pembanding sel demi sel)", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await apiLogin(page, OWNER);
    await page.goto(`/dashboards/${dash}`);
    const pivot = card(page, "Pivot kota").getByTestId("widget-pivot");
    await expect(pivot.locator("tbody tr[data-depth='3']").first()).toBeVisible();
    const shown = await screenTable(pivot);
    const csv = parseCsv(await download(page, "Pivot kota", "csv"));
    expect(csv[0]!.slice(0, 4)).toEqual(["Wilayah", "Layanan", "Kota", "Kurir"]);
    compareExport(shown, csv, 4);
    const xlsx = await parseXlsx(await download(page, "Pivot kota", "xlsx"));
    expect(xlsx[0]!.slice(0, 4)).toEqual(["Wilayah", "Layanan", "Kota", "Kurir"]);
    compareExport(shown, xlsx, 4);
    // "(Lainnya)" ikut di berkas dengan label yang sama.
    expect(csv.some((r) => r.includes("(Lainnya)"))).toBe(true);
  });

  test("viewer melihat nilai yang sama tanpa akses definisi", async ({ browser }) => {
    test.setTimeout(150_000);
    const viewer = await pageFor(browser, VIEWER);
    await viewer.setViewportSize({ width: 1440, height: 900 });
    await viewer.goto(`/dashboards/${dash}`);
    await expect(card(viewer, "KPI pendapatan").getByTestId("kpi-value")).toHaveText(rupiah(B));
    const pivot = card(viewer, "Pivot kota").getByTestId("widget-pivot");
    await expect(pivot.locator("tfoot td").nth(-5)).toHaveText(rupiah(B));
    // 4 tingkat: "(Lainnya)" kini kelompok Kota (berisi Kurir), bukan baris terdalam.
    await expect(pivot.locator("tbody th[data-other]").first()).toHaveText("(Lainnya)");
    await expect(viewer.getByRole("button", { name: /^Pengaturan/ })).toHaveCount(0);
    await viewer.goto(`/datasets/${datasetId}/pivot-tersimpan/${pivotId}`);
    await expect(viewer.getByRole("heading", { name: "Halaman tidak ditemukan" })).toBeVisible();
    // D6: body viewer tetap { widgetId, dashboardFilters } strict — savedPivotId/spec → 400 INVALID.
    for (const extra of [{ savedPivotId: pivotId }, { spec: { sheetId: "x" } }]) {
      const r = await viewer.request.post("/api/query", {
        headers: { origin: new URL(viewer.url()).origin, "content-type": "application/json" },
        data: { widgetId: widgetIds["Pivot kota"], dashboardFilters: [], ...extra },
      });
      expect(r.status(), JSON.stringify(extra)).toBe(400);
      expect(((await r.json()) as { code: string }).code).toBe("INVALID");
    }
    await viewer.context().close();
  });

  test("halaman cetak (jalur PDF): pivot 4 tingkat, (Lainnya), KPI, catatan potongan", async ({
    browser,
  }) => {
    test.setTimeout(200_000);
    const { token, exportId } = JSON.parse(
      execFileSync("node", ["scripts/dev-render-token.mjs", "mint", OWNER, dash]).toString(),
    ) as { token: string; exportId: string };
    const ctx = await browser.newContext({
      viewport: { width: 1047, height: 740 },
      locale: "id-ID",
    });
    try {
      const page = await ctx.newPage();
      await page.emulateMedia({ media: "print" });
      const t0 = Date.now();
      expect((await page.goto(`/render/${token}`))?.status()).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("data-render-ready", "1", {
        timeout: 120_000,
      });
      const readyMs = Date.now() - t0;
      // Batas renderer RENDER_TIMEOUT_MS bawaan 60 s (halaman siap jauh di bawahnya di dev).
      expect(readyMs).toBeLessThan(60_000);
      console.log(`halaman cetak siap dalam ${readyMs} ms`);
      const printed = page.getByTestId("print-widget");
      await expect(printed.getByTestId("kpi-value")).toHaveText(rupiah(B));
      const pivots = printed.getByTestId("widget-pivot");
      await expect(pivots).toHaveCount(2);
      await expect(pivots.first().locator("tbody th[data-other]").first()).toHaveText("(Lainnya)");
      // Potongan baris/kolom halaman dijelaskan di catatan (bukan terpotong diam-diam).
      await expect(page.getByTestId("print-pivot-note").first()).toContainText("dari 32 baris");
      await shot(page, "pivot-lanjutan-print");
    } finally {
      await ctx.close();
      execFileSync("node", ["scripts/dev-render-token.mjs", "close", exportId]);
    }
  });

  for (const width of [360, 768]) {
    test(`${width} px: pivot 4 tingkat, editor field terhitung, daftar pivot tersimpan — tanpa gulir horizontal, axe bersih`, async ({
      browser,
    }) => {
      test.setTimeout(180_000);
      const page = await mobile(browser, width);
      await page.goto(`/dashboards/${dash}`);
      const pivot = card(page, "Pivot kota").getByTestId("widget-pivot");
      await expect(pivot.locator("tbody tr[data-depth='3']").first()).toBeVisible();
      await noHorizontalScroll(page, "dashboard");
      expect(await axeSerious(page), "axe dashboard").toEqual([]);
      await shot(page, `pivot-lanjutan-${width}-dashboard`);

      await page.goto(`/datasets/${datasetId}/pivot-tersimpan/${pivotId}`);
      const editor = page.getByTestId("saved-pivot-editor");
      await editor.getByRole("button", { name: "Ubah rumus Margin" }).click();
      await expect(editor.getByTestId("calc-editor")).toBeVisible();
      await noHorizontalScroll(page, "editor field terhitung");
      expect(await axeSerious(page), "axe editor").toEqual([]);
      await shot(page, `pivot-lanjutan-${width}-calc-editor`);

      await page.goto(`/datasets/${datasetId}`);
      await expect(row(page, NAME)).toBeVisible();
      await noHorizontalScroll(page, "daftar pivot tersimpan");
      expect(await axeSerious(page), "axe daftar").toEqual([]);
      await shot(page, `pivot-lanjutan-${width}-list`);
      await page.context().close();
    });
  }
});

async function mobile(browser: Browser, width: number): Promise<Page> {
  const page = await pageFor(browser, OWNER);
  await page.setViewportSize({ width, height: 800 });
  return page;
}
