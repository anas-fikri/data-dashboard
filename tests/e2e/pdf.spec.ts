import { execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  expect,
  request,
  test,
  type APIResponse,
  type Locator,
  type Page,
  type Response,
} from "@playwright/test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  envFileValue,
  pageFor,
  registerAndVerify,
  RENDERER_URL,
  startRenderer,
  startWorker,
  stopRenderer,
  stopWorker,
  uniqueEmail,
} from "./helpers";

/*
 * T-018: ekspor dashboard ke PDF di atas stack sungguhan — app (next dev) → antrean `pdf` → worker →
 * renderer (`npm run renderer`, Chromium) → GET /render/<token> → /render → PDF → storage → unduh.
 *   A = pemilik dataset (48 baris: Cabang, Tanggal, Omzet, Produk) + dashboard D berisi 6 widget (2 KPI,
 *       batang, garis, pai, tabel) dan kolom filter Cabang
 *   B = viewer D (dibagikan A lewat dialog Bagikan) · X = orang asing
 * Serial: AC5 renderer langsung (tanpa secret 401, {url} 400, /healthz tanpa rincian) → AC2 token render
 * (skrip dev-render-token: 303 + cookie sekali pakai, dipakai ulang/kedaluwarsa/tanpa cookie 404) → AC1
 * slicer aktif → "Ekspor PDF" → PDF (pdfjs) A4 lanskap, judul, nilai KPI/batang/garis/pai, baris tabel,
 * ringkasan filter, footer "Halaman i dari N" = layar → AuditLog dashboard.export → AC3 renderer
 * dimatikan → RENDERER_UNAVAILABLE ≤ 10 s (lalu renderer dinyalakan lagi) → peran (viewer mengekspor,
 * tombol tidak ada di mode edit, orang asing 404).
 * AC6 (route allowlist origin app, 3xx/origin lain/WebSocket lintas origin diblokir; Chromium non-root +
 * seccomp Playwright) TIDAK diuji di sini (tanpa docker di e2e): allowlist dibuktikan
 * tests/renderer/server.test.ts (Chromium sungguhan terhadap app tiruan + origin lain) dan
 * tests/renderer/render.test.ts (keputusan rute murni); non-root + seccomp di renderer/README.md bagian
 * "Bukti AC6" (perintah docker compose --profile renderer + keluaran uid 1001 / Seccomp: 2).
 */
test.describe.configure({ mode: "serial" });

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const A = uniqueEmail("pdf-owner");
const B = uniqueEmail("pdf-viewer");
const X = uniqueEmail("pdf-stranger");
const TAG = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const DATASET = `Omzet PDF ${TAG}`;
const D_NAME = `Ringkasan PDF ${TAG}`;
const KPI_SUM = "Omzet keseluruhan";
const KPI_MAX = "Omzet tertinggi";
const BAR = "Omzet per cabang";
const LINE = "Omzet per bulan";
const PIE = "Omzet per produk";
const TABLE = "Detail transaksi";
const TITLES = [KPI_SUM, KPI_MAX, BAR, LINE, PIE, TABLE];
const HEADERS = ["Cabang", "Tanggal", "Omzet", "Produk"];
const ROWS = 48;
const CABANG = ["Jakarta", "Bandung", "Surabaya", "Medan"];
const PRODUK = ["Kopi", "Teh", "Gula"];
/** 16 baris per bulan (Agustus–Oktober 2026). */
const MONTHS = [8, 9, 10];
const pad = (n: number) => String(n).padStart(2, "0");
/** Omzet unik (7919 prima, bukan faktor 48 → permutasi 0..47), 10.000–16.439. */
const rows = Array.from({ length: ROWS }, (_, i) => ({
  cabang: CABANG[i % CABANG.length]!,
  produk: PRODUK[i % PRODUK.length]!,
  month: MONTHS[Math.floor(i / 16)]!,
  day: (i % 28) + 1,
  omzet: 10_000 + ((i * 7919) % ROWS) * 137,
}));
/** Slicer AC1: dua cabang = 24 baris. */
const PICKED = ["Jakarta", "Bandung"];
const picked = rows.filter((r) => PICKED.includes(r.cabang));
const sumBy = (key: (r: (typeof rows)[number]) => string | number) => {
  const m = new Map<string, number>();
  for (const r of picked) m.set(String(key(r)), (m.get(String(key(r))) ?? 0) + r.omzet);
  return m;
};
const dir = mkdtempSync(join(tmpdir(), "dd-e2e-pdf-"));
const headers = { Origin: BASE };
const RENDERER_SECRET = envFileValue("RENDERER_SECRET") ?? "";

interface AuditRow {
  action: string;
  actorId: string | null;
  targetType: string;
  targetId: string;
  meta: Record<string, unknown> | null;
  ip: string;
  at: string;
}

let worker: ChildProcess | null = null;
let renderer: ChildProcess | null = null;
let ids: Record<string, string> = {};
let d = "";
let pdfId = "";
const dPath = () => `/dashboards/${d}`;

const node = (script: string, ...args: string[]): unknown =>
  JSON.parse(execFileSync("node", [script, ...args]).toString());
const pdfAudits = (exportId: string) =>
  (node("scripts/dev-audit-log.mjs", "dashboard", d) as AuditRow[]).filter(
    (r) => r.action === "dashboard.export" && r.meta?.exportId === exportId,
  );

const api = (page: Page, method: string, path: string, data?: unknown) =>
  page.request.fetch(path, { method, headers, ...(data === undefined ? {} : { data }) });

async function expectStatus(res: APIResponse, status: number, code?: string) {
  const text = await res.text();
  expect(res.status(), text).toBe(status);
  if (code) expect((JSON.parse(text) as { code?: string }).code, text).toBe(code);
}

/** Item teks pdfjs (spasi dinormalkan) dengan posisi titik awal garis dasar (pt, asal kiri bawah). */
interface PdfItem {
  str: string;
  x: number;
  y: number;
}

interface PdfPage {
  width: number;
  height: number;
  items: PdfItem[];
  /** Semua teks halaman, digabung spasi. */
  text: string;
}

/** \s di JS termasuk NBSP (U+00A0) dan NNBSP (U+202F) dari format angka/tanggal id-ID. */
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

async function readPdf(bytes: Buffer): Promise<PdfPage[]> {
  const task = getDocument({ data: new Uint8Array(bytes), disableFontFace: true, verbosity: 0 });
  const doc = await task.promise;
  const pages: PdfPage[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const { width, height } = page.getViewport({ scale: 1 });
    const items = (await page.getTextContent()).items
      .flatMap((it) =>
        "str" in it
          ? [{ str: norm(it.str), x: it.transform[4] as number, y: it.transform[5] as number }]
          : [],
      )
      .filter((it) => it.str);
    pages.push({ width, height, items, text: norm(items.map((it) => it.str).join(" ")) });
  }
  await task.destroy();
  return pages;
}

/** `needle` muncul berurutan dan bersebelahan di `hay`. */
function hasRun(hay: string[], needle: string[]): boolean {
  for (let i = 0; i + needle.length <= hay.length; i++) {
    if (needle.every((v, k) => hay[i + k] === v)) return true;
  }
  return false;
}

/** Teks `v` utuh di salah satu item (item boleh berisi beberapa kata, mis. legenda pai "110.140 35%"). */
const hasText = (items: string[], v: string) => items.some((s) => ` ${s} `.includes(` ${v} `));

const FOOTER = /^Halaman \d+ dari \d+$/;

/**
 * Item teks milik tiap kartu widget menurut POSISI (urutan cat PDF tidak mengikuti DOM: teks SVG grafik
 * dicat sesudah teks HTML satu pita). Judul kartu wajib muncul tepat sekali di seluruh PDF; item milik
 * kartu = di halaman yang sama, tidak di atas judulnya, dan tidak di kiri tepinya — dipilih judul paling
 * kanan lalu paling dekat di atas (grid kolom). Kepala dashboard (di atas semua judul) dan footer halaman
 * tidak masuk kartu mana pun. Isi kartu diurutkan baca (atas → bawah, kiri → kanan).
 */
function cards(pages: PdfPage[]): Map<string, string[]> {
  const heads = TITLES.map((t) => {
    const hits = pages.flatMap((p, page) =>
      p.items.filter((it) => it.str === t).map((it) => ({ t, page, x: it.x, y: it.y })),
    );
    expect(hits, `judul "${t}" tepat sekali di PDF`).toHaveLength(1);
    return hits[0]!;
  });
  const out = new Map<string, PdfItem[]>(TITLES.map((t) => [t, []]));
  pages.forEach((p, page) => {
    for (const it of p.items) {
      if (TITLES.includes(it.str) || FOOTER.test(it.str)) continue;
      const owner = heads
        .filter((h) => h.page === page && h.x <= it.x + 12 && h.y >= it.y)
        .sort((a, b) => b.x - a.x || a.y - b.y)[0];
      if (owner) out.get(owner.t)!.push(it);
    }
  });
  return new Map(
    [...out].map(([t, its]) => [
      t,
      its.sort((a, b) => Math.round(b.y) - Math.round(a.y) || a.x - b.x).map((it) => it.str),
    ]),
  );
}

function csv(name: string, lines: string[]): string {
  const path = join(dir, name);
  writeFileSync(path, lines.join("\n"));
  return path;
}

async function createDataset(page: Page, name: string, file: string): Promise<string> {
  await page.goto("/datasets/baru");
  await page.getByLabel("Nama dataset").fill(name);
  await page.getByRole("button", { name: "Buat dataset" }).click();
  await expect(page).toHaveURL(/\/datasets\/[a-z0-9]{20,32}\?created=1$/);
  const id = new URL(page.url()).pathname.split("/").pop()!;
  await page.getByTestId("upload-input").setInputFiles(file);
  await expect(page.getByTestId("dataset-schema-link")).toBeVisible({ timeout: 120_000 });
  return id;
}

async function createDashboard(page: Page, datasetId: string, name: string): Promise<string> {
  await page.goto(`/dashboards/baru?dataset=${datasetId}`);
  await page.getByLabel("Nama dashboard").fill(name);
  await page.getByRole("button", { name: "Buat dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboards\/[a-z0-9]{20,32}\?mode=edit$/);
  return new URL(page.url()).pathname.split("/").pop()!;
}

const widgetTitled = (page: Page, title: string) =>
  page.getByTestId("widget").filter({ has: page.getByRole("heading", { name: title }) });

/** Tambah widget, beri judul, pilih jenis; tunggu konfigurasi tersimpan (pola widgets.spec.ts). */
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

/** Pilih opsi Select kustom di panel lalu tunggu konfigurasi tersimpan. */
async function choose(panel: Locator, label: string, option: string | RegExp) {
  await panel.getByLabel(label, { exact: true }).click();
  await panel
    .page()
    .getByRole(
      "option",
      typeof option === "string" ? { name: option, exact: true } : { name: option },
    )
    .click();
  await expect(panel.getByTestId("config-status")).toHaveAttribute("data-state", "saved");
}

/** Kolom filter lewat menu "Tambah kolom filter" (mode edit, pemilik); tunggu PATCH selesai. */
async function addFilterColumn(page: Page, column: string) {
  const section = page.getByTestId("dashboard-filter-columns");
  await section.getByRole("button", { name: "Tambah kolom filter" }).click();
  const saved = page.waitForResponse(
    (r) => r.url().endsWith("/filter-columns") && r.request().method() === "PATCH",
  );
  await page.getByRole("menuitem", { name: new RegExp(`^${column}`) }).click();
  const res = await saved;
  expect(res.status(), await res.text()).toBe(200);
}

/** Pilih nilai slicer Cabang (popover) lalu tutup dengan Escape. */
async function pickCabang(page: Page, values: string[]) {
  await page.locator('[data-testid=filter-slicer][data-column="Cabang"]').click();
  for (const v of values) {
    await page.locator(`[data-testid=filter-slicer-option][data-value="${v}"] input`).check();
  }
  await page.keyboard.press("Escape");
}

const range = (page: Page) => widgetTitled(page, TABLE).getByTestId("table-range");

/** Nilai KPI di layar: teks tampil = nilai lengkap (title), tidak dipendekkan. */
async function screenKpi(page: Page, title: string): Promise<string> {
  const value = widgetTitled(page, title).getByTestId("kpi-value");
  await expect(value).toHaveAttribute("title", /\d/);
  const full = (await value.getAttribute("title"))!;
  await expect(value).toHaveText(full);
  return norm(full);
}

/**
 * Nilai grafik di layar lewat tombol data kartu (tabel data): label (title th), teks nilai lengkap
 * (title td, formatMeasure — sama dengan label nilai di PDF), dan nilai mentah (data-value).
 */
async function screenChart(page: Page, title: string, n: number) {
  const w = widgetTitled(page, title);
  const toggle = w.getByTestId("widget-data-toggle");
  await expect(toggle).not.toHaveAttribute("aria-disabled", "true");
  if ((await toggle.getAttribute("aria-pressed")) !== "true") await toggle.click();
  const trs = w.getByTestId("chart-table").locator("tbody tr");
  await expect(trs).toHaveCount(n);
  return trs.evaluateAll((list) =>
    list.map((tr) => ({
      label: tr.querySelector("th")!.getAttribute("title")!,
      text: tr.querySelector("td")!.getAttribute("title")!,
      value: Number((tr.querySelector("td") as HTMLElement).dataset.value),
    })),
  );
}

/** Tabel di layar: kepala kolom + teks sel tiap baris yang tampil. */
async function screenTable(page: Page) {
  const t = widgetTitled(page, TABLE).getByTestId("widget-table");
  const head = (await t.getByRole("columnheader").allTextContents()).map(norm);
  const body = await t
    .locator("tbody tr")
    .evaluateAll((trs) =>
      trs.map((tr) => [...tr.querySelectorAll("td")].map((td) => td.textContent ?? "")),
    );
  return { head, rows: body.map((r) => r.map(norm)) };
}

const isCreate = (r: Response) =>
  new URL(r.url()).pathname === "/api/exports" && r.request().method() === "POST";

/** Panel "Ekspor PDF" di kepala halaman (dibuka bila belum). */
async function openPdfPanel(page: Page): Promise<Locator> {
  const panel = page.getByTestId("dashboard-pdf-panel");
  if (!(await panel.isVisible())) await page.getByTestId("dashboard-pdf-export").click();
  await expect(panel).toBeVisible();
  return panel;
}

/**
 * "Ekspor PDF" → "Buat PDF": POST /api/exports (202) → antrean pdf → worker → renderer → unduhan
 * otomatis (event download Playwright; isinya bisa datang dari endpoint publik presigned). Galat ekspor
 * di panel (data-code) menggagalkan langsung dengan kodenya, tidak menunggu batas unduhan.
 */
async function exportPdfViaUi(page: Page) {
  const panel = await openPdfPanel(page);
  const created = page.waitForResponse(isCreate);
  const download = page.waitForEvent("download", { timeout: 150_000 });
  const error = panel.getByTestId("export-error");
  await panel.getByTestId("export-pdf").click();
  const res = await created;
  const json = (await res.json()) as { ok: boolean; exportId: string };
  expect(res.status(), JSON.stringify(json)).toBe(202);
  await expect(panel.getByTestId("export-status")).toContainText("Menyiapkan PDF…");
  const failed = error.waitFor({ timeout: 150_000 }).then(
    async () => ({ code: await error.getAttribute("data-code") }),
    () => ({ code: null }),
  );
  const first = await Promise.race([download.then((dl) => ({ dl })), failed]);
  download.catch(() => {});
  expect("code" in first ? `ekspor gagal: ${first.code}` : "unduhan").toBe("unduhan");
  const dl = (first as { dl: Awaited<typeof download> }).dl;
  expect(await dl.failure()).toBeNull();
  const path = join(dir, `${json.exportId}.pdf`);
  await dl.saveAs(path);
  await expect(panel.getByTestId("export-status")).toContainText("Siap diunduh");
  return {
    id: json.exportId,
    request: res.request().postDataJSON() as { dashboardId: string; format: string; f?: string },
    name: dl.suggestedFilename(),
    file: readFileSync(path),
    panel,
  };
}

function expectA4Landscape(pages: PdfPage[]) {
  expect(pages.length).toBeGreaterThanOrEqual(1);
  for (const p of pages) {
    // A4 lanskap 297 × 210 mm = 841,89 × 595,28 pt.
    expect(Math.abs(p.width - 841.89), `lebar ${p.width}`).toBeLessThan(2);
    expect(Math.abs(p.height - 595.28), `tinggi ${p.height}`).toBeLessThan(2);
  }
  pages.forEach((p, i) => {
    expect(p.text, `footer halaman ${i + 1}`).toContain(`Halaman ${i + 1} dari ${pages.length}`);
  });
}

test.describe("ekspor PDF dashboard", () => {
  let a: Page;
  let b: Page;
  let x: Page;

  test.beforeAll(async ({ browser, request: req }) => {
    test.setTimeout(420_000);
    expect(RENDERER_SECRET.length, "RENDERER_SECRET di .env").toBeGreaterThanOrEqual(32);
    execFileSync("node", ["scripts/dev-reset-ratelimit.mjs", "register:ip", "verify:ip"]); // suite penuh: batas per IP
    const setup = await browser.newPage();
    for (const email of [A, B, X]) {
      await setup.context().clearCookies();
      await registerAndVerify(setup, req, email);
    }
    await setup.close();
    ids = node("scripts/dev-audit-log.mjs", "ids", A, B, X) as Record<string, string>;
    for (const email of [A, B, X]) expect(ids[email], email).toBeTruthy();
    a = await pageFor(browser, A);
    b = await pageFor(browser, B);
    x = await pageFor(browser, X);

    worker = await startWorker("pdf");
    renderer = await startRenderer("pdf");
    const datasetId = await createDataset(
      a,
      DATASET,
      csv("omzet-pdf.csv", [
        "Cabang;Tanggal;Omzet;Produk",
        ...rows.map((r) => `${r.cabang};${pad(r.day)}-${pad(r.month)}-2026;${r.omzet};${r.produk}`),
      ]),
    );
    d = await createDashboard(a, datasetId, D_NAME);
    // 6 widget: 2 KPI, batang (Cabang), garis (Tanggal per bulan), pai (Produk), tabel.
    await addWidget(a, KPI_SUM, "Angka");
    const max = await addWidget(a, KPI_MAX, "Angka");
    await choose(max, "Nilai", "Terbesar");
    await addWidget(a, BAR, "Batang");
    const line = await addWidget(a, LINE, "Garis");
    await choose(line, "Kelompokkan menurut", /^Tanggal ·/);
    await expect(line.getByLabel("Rentang waktu", { exact: true })).toContainText("Per bulan");
    const pie = await addWidget(a, PIE, "Pai");
    await choose(pie, "Kelompokkan menurut", /^Produk ·/);
    await addWidget(a, TABLE, "Tabel");
    await expect(
      widgetTitled(a, TABLE).getByTestId("widget-table").getByRole("columnheader"),
    ).toHaveText(HEADERS);
    await addFilterColumn(a, "Cabang");
  });

  test.afterAll(async () => {
    await stopRenderer(renderer);
    await stopWorker(worker);
    await Promise.all([a, b, x].map((p) => p?.context().close()));
  });

  test("AC5: renderer langsung — tanpa/salah secret 401, body {url} atau {token,url} 400, /healthz 200 tanpa rincian", async () => {
    const r = await request.newContext();
    try {
      const token = "A".repeat(43);
      const post = (data: unknown, secret?: string) =>
        r.post(`${RENDERER_URL}/render`, {
          data,
          headers: secret === undefined ? {} : { "x-renderer-secret": secret },
          maxRedirects: 0,
        });
      await expectStatus(await post({ token }), 401, "UNAUTHORIZED");
      await expectStatus(await post({ token }, "x".repeat(40)), 401, "UNAUTHORIZED");
      await expectStatus(await post({ url: "http://evil" }), 401, "UNAUTHORIZED");
      await expectStatus(await post({ url: "http://evil" }, RENDERER_SECRET), 400, "BAD_REQUEST");
      await expectStatus(
        await post({ token, url: "http://evil" }, RENDERER_SECRET),
        400,
        "BAD_REQUEST",
      );
      const health = await r.get(`${RENDERER_URL}/healthz`);
      expect(health.status()).toBe(200);
      expect(await health.text()).toBe('{"ok":true}');
    } finally {
      await r.dispose();
    }
  });

  test("AC2: token render — pertama 303 + cookie dd.render (Path=/render, sekali pakai); dipakai ulang, kedaluwarsa, tanpa cookie → 404", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const minted: string[] = [];
    const mint = (...extra: string[]) => {
      const t = node("scripts/dev-render-token.mjs", "mint", A, d, ...extra) as {
        token: string;
        exportId: string;
      };
      minted.push(t.exportId);
      return t;
    };
    // `own` = peramban renderer (cookie jar bersama halaman); `other` = klien lain tanpa cookie.
    const own = await browser.newContext({ baseURL: BASE });
    const other = await request.newContext({ baseURL: BASE });
    try {
      const { token } = mint();
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const first = await own.request.get(`/render/${token}`, { maxRedirects: 0 });
      expect(first.status(), await first.text()).toBe(303);
      const h = first.headers();
      expect(h["location"]).toMatch(/^(https?:\/\/[^/]+)?\/render$/);
      expect(h["cache-control"]).toContain("no-store");
      expect(h["referrer-policy"]).toBe("no-referrer");
      expect(h["x-robots-tag"]).toBe("noindex");
      const cookies = first
        .headersArray()
        .filter((x) => x.name.toLowerCase() === "set-cookie")
        .map((x) => x.value);
      expect(cookies).toHaveLength(1);
      const cookie = cookies[0]!;
      expect(cookie).toMatch(/^dd\.render=[A-Za-z0-9_-]{43};/);
      expect(cookie).not.toContain(token);
      expect(cookie).toMatch(/;\s*Path=\/render(;|$)/i);
      expect(cookie).toMatch(/;\s*HttpOnly(;|$)/i);
      expect(cookie).toMatch(/;\s*SameSite=Strict(;|$)/i);
      expect(cookie).not.toMatch(/;\s*Secure(;|$)/i);
      const maxAge = Number(cookie.match(/;\s*Max-Age=(\d+)/i)?.[1]);
      expect(maxAge).toBeGreaterThan(0);
      expect(maxAge).toBeLessThanOrEqual(60);

      // Cookie membuka halaman render SEKALI di peramban (seperti renderer): 6 kartu dari data server,
      // tanda siap cetak terpasang; muat ulang → 404. Sekaligus memanaskan kompilasi /render di
      // `next dev` sebelum renderer (batas siap 30 s) memakainya di AC1.
      const page = await own.newPage();
      const shown = await page.goto("/render");
      expect(shown?.status()).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("data-render-ready", "1", {
        timeout: 120_000,
      });
      await expect(
        page.getByTestId("print-dashboard").getByRole("heading", { level: 1 }),
      ).toHaveText(D_NAME);
      await expect(page.getByTestId("print-widget")).toHaveCount(TITLES.length);
      await expect(page.getByTestId("print-filters")).toHaveText("Tanpa filter");
      expect((await page.reload())?.status()).toBe(404);

      // Token yang sama dipakai lagi (konteks lain, tanpa cookie) → 404 tanpa cookie.
      const reuse = await other.get(`/render/${token}`, { maxRedirects: 0 });
      expect(reuse.status()).toBe(404);
      expect(reuse.headers()["set-cookie"]).toBeUndefined();
      // Klaim lewat 60 detik (kunci Redis masih ada) → 404.
      const expired = mint("--expired");
      const late = await other.get(`/render/${expired.token}`, { maxRedirects: 0 });
      expect(late.status()).toBe(404);
      expect(late.headers()["set-cookie"]).toBeUndefined();
      // Bentuk token salah → 404; /render tanpa cookie → 404.
      expect((await other.get(`/render/${"x".repeat(42)}`, { maxRedirects: 0 })).status()).toBe(
        404,
      );
      expect((await other.get("/render", { maxRedirects: 0 })).status()).toBe(404);
    } finally {
      await own.close();
      await other.dispose();
      // Ekspor RUNNING buatan skrip dilepas: jatah 2 ekspor berjalan A kembali penuh.
      for (const id of minted) node("scripts/dev-render-token.mjs", "close", id);
    }
  });

  test("AC1: 6 widget + slicer aktif → PDF A4 lanskap memuat semua widget dengan nilai sama dengan layar", async () => {
    test.setTimeout(300_000);
    await a.goto(dPath());
    await expect(a.getByTestId("dashboard-pdf-export")).toBeVisible();
    await expect(range(a)).toHaveText(`Baris 1–${ROWS} dari ${ROWS}`);
    await pickCabang(a, PICKED);
    await expect(range(a)).toHaveText(`Baris 1–${picked.length} dari ${picked.length}`);

    // Nilai layar (dengan filter) — dicek juga terhadap fixture agar "sama" bukan sama-sama salah.
    const kpiSum = await screenKpi(a, KPI_SUM);
    const kpiMax = await screenKpi(a, KPI_MAX);
    expect(Number(kpiSum.replace(/\D/g, ""))).toBe(picked.reduce((s, r) => s + r.omzet, 0));
    expect(Number(kpiMax.replace(/\D/g, ""))).toBe(Math.max(...picked.map((r) => r.omzet)));
    const bar = await screenChart(a, BAR, PICKED.length);
    const byCabang = sumBy((r) => r.cabang);
    for (const r of bar) expect(r.value, r.label).toBe(byCabang.get(r.label));
    const line = await screenChart(a, LINE, MONTHS.length);
    expect(line.map((r) => r.value)).toEqual(
      MONTHS.map((m) => picked.filter((r) => r.month === m).reduce((s, r) => s + r.omzet, 0)),
    );
    const pie = await screenChart(a, PIE, PRODUK.length);
    const byProduk = sumBy((r) => r.produk);
    for (const r of pie) expect(r.value, r.label).toBe(byProduk.get(r.label));
    const table = await screenTable(a);
    expect(table.head).toEqual(HEADERS);
    expect(table.rows).toHaveLength(picked.length);

    const exp = await exportPdfViaUi(a);
    pdfId = exp.id;
    expect(exp.request.dashboardId).toBe(d);
    expect(exp.request.format).toBe("pdf");
    const f = JSON.parse(exp.request.f ?? "null") as {
      filters: { column: string; op: string; values: string[] }[];
    };
    expect(f.filters).toHaveLength(1);
    expect(f.filters[0]).toMatchObject({ column: "Cabang", op: "in" });
    expect([...f.filters[0]!.values].sort()).toEqual([...PICKED].sort());
    expect(exp.name).toMatch(new RegExp(`^${D_NAME}-\\d{8}-\\d{4}\\.pdf$`));
    expect(exp.file.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    const pages = await readPdf(exp.file);
    await test.info().attach("pdf-text.json", {
      body: JSON.stringify(pages, null, 1),
      contentType: "application/json",
    });
    expectA4Landscape(pages);
    const text = pages.map((p) => p.text).join(" ");
    // Kepala: nama dashboard, dataset, ringkasan filter (teks chip: urutan nilai seperti dikirim).
    expect(text).toContain(D_NAME);
    expect(text).toContain(DATASET);
    expect(pages[0]!.items.map((it) => it.str)).toContain("Filter");
    expect(text).toContain(`Cabang: ${f.filters[0]!.values.join(", ")}`);
    expect(text).toContain("Diekspor");

    const card = cards(pages);
    const dump = (t: string) => `${t}: ${card.get(t)!.join(" | ")}`;
    // KPI: teks nilai = layar.
    expect(card.get(KPI_SUM), dump(KPI_SUM)).toContain(kpiSum);
    expect(card.get(KPI_MAX), dump(KPI_MAX)).toContain(kpiMax);
    // Grafik: kategori dan setiap nilai layar tercetak sebagai teks di kartunya (label nilai batang/
    // titik garis, legenda pai).
    for (const [title, shown] of [
      [BAR, bar],
      [LINE, line],
      [PIE, pie],
    ] as const) {
      for (const r of shown) {
        expect(
          hasText(card.get(title)!, norm(r.text)),
          `${r.label} = ${r.text}\n${dump(title)}`,
        ).toBe(true);
        expect(hasText(card.get(title)!, norm(r.label)), `${r.label}\n${dump(title)}`).toBe(true);
      }
    }
    // Tabel: kepala kolom + baris pertama layar (urutan bawaan) sebanyak yang muat di kartu.
    const t = card.get(TABLE)!;
    expect(hasRun(t, HEADERS), dump(TABLE)).toBe(true);
    const note = t.map((s) => s.match(/^Menampilkan (\d+) dari (\d+) baris$/)).find(Boolean);
    expect(note, dump(TABLE)).toBeTruthy();
    const shownRows = Number(note![1]);
    expect(Number(note![2])).toBe(picked.length);
    expect(shownRows).toBeGreaterThanOrEqual(1);
    const flat = table.rows.slice(0, shownRows).flat();
    expect(hasRun(t, flat), `${flat.join(" | ")}\n---\n${dump(TABLE)}`).toBe(true);
    // Baris berikutnya tidak tercetak setengah.
    if (shownRows < table.rows.length) {
      expect(hasRun(t, table.rows.slice(0, shownRows + 1).flat())).toBe(false);
    }
  });

  test("AuditLog: unduhan PDF tercatat dashboard.export {exportId, format pdf, role OWNER}", async () => {
    expect(pdfId).not.toBe("");
    const trail = pdfAudits(pdfId);
    // Unduhan otomatis = satu tautan presigned = satu baris.
    expect(trail).toHaveLength(1);
    expect(trail[0]).toMatchObject({
      action: "dashboard.export",
      actorId: ids[A],
      targetType: "dashboard",
      targetId: d,
      meta: { exportId: pdfId, format: "pdf", role: "OWNER" },
    });
    expect(trail[0]!.ip).toBeTruthy();
    // Status dan unduhan ulang lewat API: PDF, attachment, presigned 5 menit.
    expect(await (await a.request.get(`/api/exports/${pdfId}`)).json()).toMatchObject({
      ok: true,
      state: "done",
    });
    const res = await a.request.get(`/api/exports/${pdfId}/download`, { maxRedirects: 0 });
    expect(res.status(), await res.text()).toBe(302);
    const loc = new URL(res.headers()["location"]!);
    expect(loc.pathname).toContain(`/exports/${ids[A]}/${pdfId}.pdf`);
    expect(loc.searchParams.get("response-content-type")).toBe("application/pdf");
    expect(loc.searchParams.get("X-Amz-Expires")).toBe("300");
    const file = await a.request.get(loc.toString());
    expect(file.status()).toBe(200);
    expect((await file.body()).subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdfAudits(pdfId)).toHaveLength(2);
  });

  test("AC3: renderer mati → 'Buat PDF' menampilkan RENDERER_UNAVAILABLE ≤ 10 detik (bukan menggantung)", async () => {
    test.setTimeout(120_000);
    await stopRenderer(renderer);
    renderer = null;
    await expect
      .poll(() =>
        fetch(`${RENDERER_URL}/healthz`).then(
          (r) => r.status,
          () => "mati",
        ),
      )
      .toBe("mati");
    try {
      await a.goto(dPath());
      await expect(range(a)).toHaveText(`Baris 1–${ROWS} dari ${ROWS}`);
      const panel = await openPdfPanel(a);
      const created = a.waitForResponse(isCreate);
      const started = Date.now();
      await panel.getByTestId("export-pdf").click();
      const error = panel.getByTestId("export-error");
      await expect(error).toHaveAttribute("data-code", "RENDERER_UNAVAILABLE", { timeout: 10_000 });
      await expect(panel.getByTestId("export-error-code")).toHaveText("Kode: RENDERER_UNAVAILABLE");
      await expect(error.getByRole("alert")).toBeVisible();
      expect(Date.now() - started).toBeLessThanOrEqual(10_000);
      const res = await created;
      expect(res.status()).toBe(503);
      expect(await res.json()).toMatchObject({ ok: false, code: "RENDERER_UNAVAILABLE" });
    } finally {
      // Uji berikutnya butuh renderer lagi.
      renderer = await startRenderer("pdf-restart");
    }
  });

  test("peran: VIEWER (dibagikan A) melihat 'Ekspor PDF' di mode lihat dan bisa mengekspor; tidak ada di mode edit; orang asing 404", async () => {
    test.setTimeout(240_000);
    await a.goto(dPath());
    await a.getByTestId("share-open").click();
    const dialog = a.getByTestId("share-dialog");
    await expect(dialog.getByTestId("share-search")).toBeVisible();
    await dialog.getByTestId("share-search").fill(B.split("@")[0]!);
    const option = dialog.getByTestId("share-option");
    await expect(option).toHaveCount(1);
    await expect(option).toHaveAttribute("data-email", B);
    await option.click();
    await expect(dialog.getByTestId("share-role")).toContainText("Hanya lihat");
    await dialog.getByTestId("share-add").click();
    await expect(dialog.getByTestId("share-add-done")).toHaveText(
      `${B} kini bisa melihat dashboard ini.`,
    );
    await dialog.getByRole("button", { name: "Selesai" }).click();
    await expect(dialog).toHaveCount(0);

    await b.goto(dPath());
    await expect(b.getByText("Hanya lihat", { exact: true })).toBeVisible();
    await expect(range(b)).toHaveText(`Baris 1–${ROWS} dari ${ROWS}`);
    const exp = await exportPdfViaUi(b);
    expect(exp.request).toEqual({ dashboardId: d, format: "pdf" });
    const pages = await readPdf(exp.file);
    expectA4Landscape(pages);
    const text = pages.map((p) => p.text).join(" ");
    expect(text).toContain(D_NAME);
    expect(text).toContain("Tanpa filter");
    cards(pages); // semua judul widget tepat sekali
    const trail = pdfAudits(exp.id);
    expect(trail).toHaveLength(1);
    expect(trail[0]).toMatchObject({
      actorId: ids[B],
      meta: { exportId: exp.id, format: "pdf", role: "VIEWER" },
    });
    // Viewer tidak punya mode edit: ?mode=edit dialihkan ke mode lihat, tombol tetap ada.
    await b.goto(`${dPath()}?mode=edit`);
    await expect(b).toHaveURL(new RegExp(`${dPath()}$`));
    await expect(b.getByTestId("dashboard-pdf-export")).toBeVisible();

    // Pemilik di mode edit: tombol tidak ada.
    await a.goto(`${dPath()}?mode=edit`);
    await expect(a.getByTestId("canvas-toolbar")).toBeVisible();
    await expect(a.getByTestId("dashboard-pdf-export")).toHaveCount(0);

    // Orang asing: dashboard tidak terlihat → 404 (dengan atau tanpa filter); ekspor lain 404.
    await expectStatus(
      await api(x, "POST", "/api/exports", { dashboardId: d, format: "pdf" }),
      404,
      "NOT_FOUND",
    );
    await expectStatus(
      await api(x, "POST", "/api/exports", {
        dashboardId: d,
        format: "pdf",
        f: JSON.stringify({ filters: [{ column: "Cabang", op: "in", values: ["Medan"] }] }),
      }),
      404,
      "NOT_FOUND",
    );
    await expectStatus(await x.request.get(`/api/exports/${exp.id}`), 404, "NOT_FOUND");
    await expectStatus(
      await x.request.get(`/api/exports/${pdfId}/download`, { maxRedirects: 0 }),
      404,
      "NOT_FOUND",
    );
  });
});
