import { execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Locator, type Page, type Response } from "@playwright/test";
import { pageFor, registerAndVerify, startWorker, stopWorker, uniqueEmail } from "./helpers";

/*
 * T-032 (polish widget kecil) di kanvas 1440 px dengan data sungguhan (12 kota):
 *   AC1 batang setinggi 2 baris (keterangan "Menampilkan N dari M" tidak muat) → lencana "N dari 12" di
 *       kepala kartu (hanya kartu ≥ 12,5rem / 17rem saat edit, agar judul tidak terperas);
 *   AC2 legenda pai yang muat (kartu tinggi) bukan tab stop; yang meluap (kartu sempit-sedang) bisa difokus;
 *   AC3 forced-colors: swatch legenda berbeda bentuk dan tetap berwarna (bukan hanya warna).
 */
test.describe.configure({ mode: "serial" });

const OWNER = uniqueEmail("chart-polish");
const TAG = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const dir = mkdtempSync(join(tmpdir(), "dd-e2e-chart-polish-"));
const KOTA = Array.from({ length: 12 }, (_, k) => `Kota ${String.fromCharCode(65 + k)}`);

let worker: ChildProcess | null = null;
let owner: Page;
let d = "";
const ids: Record<string, string> = {};

const widgetTitled = (page: Page, title: string) =>
  page.getByTestId("widget").filter({ has: page.getByRole("heading", { name: title }) });

async function addWidget(page: Page, title: string, type: string): Promise<Locator> {
  const before = await page.getByTestId("widget").count();
  await page
    .getByTestId("canvas-toolbar")
    .getByRole("button", { name: "Tambah widget", exact: true })
    .click();
  await expect(page.getByTestId("widget")).toHaveCount(before + 1);
  const panel = page.getByTestId("widget-panel");
  await panel.getByLabel("Judul", { exact: true }).fill(title);
  await panel.getByLabel("Judul", { exact: true }).press("Enter");
  await expect(widgetTitled(page, title)).toHaveCount(1);
  await panel.getByText(type, { exact: true }).click();
  await expect(panel.getByTestId("config-status")).toHaveAttribute("data-state", "saved");
  return panel;
}

test.describe("polish widget kecil (T-032)", () => {
  test.beforeAll(async ({ browser, request }) => {
    test.setTimeout(240_000);
    execFileSync("node", ["scripts/dev-reset-ratelimit.mjs", "register:ip", "verify:ip"]);
    const setup = await browser.newPage();
    await registerAndVerify(setup, request, OWNER);
    await setup.close();
    owner = await pageFor(browser, OWNER);
    worker = await startWorker("chart-polish");

    const csv = join(dir, "kota.csv");
    const rows = KOTA.flatMap((k, i) => [0, 1, 2].map((r) => `${k};${(i + 1) * 100 + r}`));
    writeFileSync(csv, ["Kota;Omzet", ...rows].join("\n"));
    await owner.goto("/datasets/baru");
    await owner.getByLabel("Nama dataset").fill(`Kota ${TAG}`);
    await owner.getByRole("button", { name: "Buat dataset" }).click();
    await expect(owner).toHaveURL(/\/datasets\/[a-z0-9]{20,32}\?created=1$/);
    const datasetId = new URL(owner.url()).pathname.split("/").pop()!;
    await owner.getByTestId("upload-input").setInputFiles(csv);
    await expect(owner.getByTestId("dataset-schema-link")).toBeVisible({ timeout: 120_000 });

    await owner.goto(`/dashboards/baru?dataset=${datasetId}`);
    await owner.getByLabel("Nama dashboard").fill(`Polish ${TAG}`);
    await owner.getByRole("button", { name: "Buat dashboard" }).click();
    await expect(owner).toHaveURL(/\/dashboards\/[a-z0-9]{20,32}\?mode=edit$/);
    d = new URL(owner.url()).pathname.split("/").pop()!;

    let revision = NaN;
    const onResponse = async (r: Response) => {
      if (r.request().method() !== "POST" || !r.url().endsWith(`/dashboards/${d}/widgets`)) return;
      revision = ((await r.json()) as { data: { layoutRevision: number } }).data.layoutRevision;
    };
    owner.on("response", onResponse);
    // Bawaan: kelompok = kolom teks pertama (Kota), nilai = total Omzet.
    for (const [title, type] of [
      ["Batang pendek", "Batang"],
      ["Pai sedang", "Pai"],
      ["Pai tinggi", "Pai"],
      ["Omzet harian per kota tiga puluh hari terakhir", "Batang"],
    ] as const) {
      await addWidget(owner, title, type);
      ids[title] = (await widgetTitled(owner, title).getAttribute("data-widget-id"))!;
    }
    owner.off("response", onResponse);
    expect(Number.isInteger(revision)).toBe(true);
    const put = await owner.request.put(`/api/dashboards/${d}/layout`, {
      headers: { Origin: new URL(owner.url()).origin },
      data: {
        baseRevision: revision,
        items: [
          { i: ids["Batang pendek"]!, x: 0, y: 0, w: 6, h: 2 },
          // Sempit (< 28rem): legenda di bawah donat, setinggi ≤ 45% kartu → meluap.
          { i: ids["Pai sedang"]!, x: 6, y: 0, w: 3, h: 4 },
          { i: ids["Pai tinggi"]!, x: 0, y: 4, w: 6, h: 9 },
          // w3 berjudul panjang: pita lebar tepat di sekitar ambang lencana (review desain T-032 r3).
          { i: ids["Omzet harian per kota tiga puluh hari terakhir"]!, x: 9, y: 0, w: 3, h: 2 },
        ],
      },
    });
    expect(put.status(), await put.text()).toBe(200);
  });

  test.afterAll(async () => {
    await stopWorker(worker);
    await owner?.context().close();
  });

  test.beforeEach(async () => {
    await owner.setViewportSize({ width: 1440, height: 1100 });
    await owner.goto(`/dashboards/${d}`);
  });

  test("AC1: batang 2 baris tanpa ruang keterangan → lencana 'N dari 12' di kepala kartu, judul utuh", async () => {
    const bar = widgetTitled(owner, "Batang pendek");
    const badge = bar.getByTestId("chart-badge");
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText(/^\d+ dari 12$/);
    await expect(badge).toHaveAttribute("title", /^Menampilkan \d+ dari 12 kategori/);
    // Sebaris dengan judul di kepala kartu (tidak menimpa label sumbu di badan grafik); judul utuh.
    const title = bar.getByRole("heading", { name: "Batang pendek" });
    expect(await title.evaluate((h) => h.scrollWidth - h.clientWidth)).toBeLessThanOrEqual(0);
    const [b, t] = [(await badge.boundingBox())!, (await title.boundingBox())!];
    expect(Math.abs(b.y + b.height / 2 - (t.y + t.height / 2))).toBeLessThan(6);
    await expect(bar.getByTestId("chart-note")).toHaveCount(0);
    // Tabel data: lencana disembunyikan (semua baris tampil di tabel).
    await bar.getByTestId("widget-data-toggle").click();
    await expect(badge).toHaveCount(0);
  });

  test("review T-032 r3: lencana hanya bila judul tetap ≥ 4rem (lihat/edit, 1440/1024 px)", async () => {
    for (const mode of ["", "?mode=edit"]) {
      for (const width of [1440, 1024]) {
        await owner.setViewportSize({ width, height: 1100 });
        await owner.goto(`/dashboards/${d}${mode}`);
        await expect(widgetTitled(owner, "Batang pendek").getByTestId("chart-badge")).toBeVisible();
        const cards = await owner.getByTestId("widget").evaluateAll((els) =>
          els.map((e) => {
            const badge = e.querySelector<HTMLElement>("[data-testid=chart-badge]");
            const h = e.querySelector("h2")!;
            return {
              title: h.textContent,
              shown: !!badge && badge.getBoundingClientRect().width > 0,
              titleW: h.getBoundingClientRect().width,
            };
          }),
        );
        for (const c of cards.filter((c) => c.shown)) {
          expect(c.titleW, `${width} px ${mode || "lihat"}: ${c.title}`).toBeGreaterThanOrEqual(64);
        }
      }
    }
  });

  test("AC2: legenda pai muat → bukan tab stop; meluap → bisa difokus dan digulir panah", async () => {
    const tall = widgetTitled(owner, "Pai tinggi").getByTestId("pie-legend-region");
    const mid = widgetTitled(owner, "Pai sedang").getByTestId("pie-legend-region");
    await expect(tall).toBeVisible();
    await expect(mid).toBeVisible();
    const overflows = (l: Locator) => l.evaluate((e) => e.scrollHeight > e.clientHeight + 1);
    expect(await overflows(tall)).toBe(false);
    expect(await overflows(mid)).toBe(true);
    await expect(tall).not.toHaveAttribute("tabindex");
    await expect(mid).toHaveAttribute("tabindex", "0");
    await mid.focus();
    await owner.keyboard.press("ArrowDown");
    await expect.poll(() => mid.evaluate((e) => e.scrollTop)).toBeGreaterThan(0);
  });

  test("AC3: forced-colors — swatch legenda berbeda bentuk dan tetap berwarna", async () => {
    await owner.emulateMedia({ forcedColors: "active" });
    try {
      const swatches = widgetTitled(owner, "Pai tinggi").getByTestId("pie-swatch");
      await expect(swatches).toHaveCount(6);
      const looks = await swatches.evaluateAll((els) =>
        els.map((e) => {
          const s = getComputedStyle(e);
          return {
            shape: `${s.clipPath}|${s.borderRadius}|${s.height}`,
            radius: parseFloat(s.borderTopLeftRadius) || 0,
            bg: s.backgroundColor,
            adjust: s.getPropertyValue("forced-color-adjust"),
          };
        }),
      );
      expect(new Set(looks.map((l) => l.shape)).size, JSON.stringify(looks)).toBe(6);
      // Kotak bersudut tajam: radius besar pada 10 px terbaca lingkaran (review desain T-032).
      // (Urutan legenda = terbesar dulu, bisa diawali "Lainnya": cari kotak tanpa clip-path.)
      const square = looks.filter((l) => l.shape.startsWith("none|") && l.radius <= 1);
      expect(square, JSON.stringify(looks)).toHaveLength(1);
      for (const l of looks) {
        expect(l.adjust).toBe("none");
        expect(l.bg).not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
      }
    } finally {
      await owner.emulateMedia({ forcedColors: "none" });
    }
  });
});
