import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { pageFor, registerAndVerify, uniqueEmail } from "./helpers";

/*
 * T-022 panduan per peran. A = admin + pemilik dataset (dev-share-fixture), V = viewer satu dashboard A,
 * N = user baru (tanpa dataset dan share), O = hanya melihat lewat share organisasi.
 *   AC1 V: tab Viewer + Umum saja; artikel Pemilik data tidak tampil dan slug-nya 404;
 *   AC2 N: tab Pemilik data + Umum; kartu "Mulai di sini" di Beranda hilang setelah satu artikel dibaca;
 *   AC3 A di halaman skema: Bantuan → panel samping berisi artikel konteks skema untuk perannya saja;
 *   AC4 cari "upload": hanya artikel yang boleh dilihat user (wildcard LIKE tidak berlaku).
 * T-7rw4: halaman pivot tersimpan baru → Bantuan konteks Pivot tersimpan sesuai peran (pemilik).
 * T-exfc: P = pemilik lain yang membagikan dashboard ke A sebagai editor dan viewer → A punya 5 tab.
 *   AC1 A di 320 px: tab aktif (Umum, paling kanan) tergulir ke layar; pindah tab memberi tanda memuat;
 *       jumlah hasil cari diumumkan (wilayah status diisi setelah halaman tampil);
 *   AC2 N: tombol Tandai sudah dibaca juga di akhir artikel; fokus tetap di tombol selama menunggu;
 *   AC3 Beranda: admin dan pemilik lama yang belum membaca tidak melihat Mulai di sini; viewer baru ya.
 */
test.describe.configure({ mode: "serial" });

const A = uniqueEmail("roles-admin");
const V = uniqueEmail("roles-viewer");
const N = uniqueEmail("roles-new");
const O = uniqueEmail("roles-org");
const P = uniqueEmail("roles-owner");
const TAG = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const O1 = `Cara upload data ${TAG}`;
const V1 = `Membaca dashboard bersama ${TAG}`;
const S1 = `Memeriksa skema ${TAG}`;
const S2 = `Skema untuk viewer ${TAG}`;
const E1 = `Upload widget untuk editor ${TAG}`;
const P1 = `Pivot tersimpan pemilik ${TAG}`;
const P2 = `Pivot tersimpan editor ${TAG}`;
const slugs: Record<string, string> = {};
let a: Page;
let v: Page;
let n: Page;
let o: Page;
let datasetId = "";

async function publish(page: Page, title: string, role: string, body: string, context?: string) {
  await page.goto("/admin/panduan/baru");
  await page.getByLabel("Judul").fill(title);
  slugs[title] = await page.getByLabel("Slug (alamat)").inputValue();
  await page.getByLabel("Peran").click();
  await page.getByRole("option", { name: role, exact: true }).click();
  if (context) {
    await page.getByLabel("Bantuan di halaman").click();
    await page.getByRole("option", { name: context, exact: true }).click();
  }
  await page.getByLabel("Isi (markdown)").fill(body);
  await page.getByRole("button", { name: "Simpan sebagai draf" }).click();
  await expect(page).toHaveURL(/\?created=1$/);
  await page.goto("/admin/panduan");
  const row = page
    .getByTestId("guide-row")
    .filter({ has: page.getByRole("link", { name: title, exact: true }) });
  await row.getByRole("button", { name: /^Terbitkan/ }).click();
  await expect(row.getByRole("button", { name: /^Tarik/ })).toBeVisible();
}

const tabs = (page: Page) =>
  page.getByRole("navigation", { name: "Panduan per peran" }).getByRole("link").allTextContents();
const card = (page: Page, title: string) =>
  page
    .getByTestId("guide-card")
    .filter({ has: page.getByRole("link", { name: title, exact: true }) });

test.describe("panduan per peran (T-022)", () => {
  test.beforeAll(async ({ browser, request }) => {
    test.setTimeout(180_000);
    execFileSync("node", ["scripts/dev-reset-ratelimit.mjs", "register:ip", "verify:ip"]);
    const setup = await browser.newPage();
    for (const email of [A, V, N, O, P]) {
      await setup.context().clearCookies();
      await registerAndVerify(setup, request, email);
    }
    await setup.close();
    execFileSync("node", ["scripts/dev-make-admin.mjs", A]);
    datasetId = JSON.parse(
      execFileSync("node", ["scripts/dev-share-fixture.mjs", A, V, "VIEWER"]).toString(),
    ).datasetId;
    execFileSync("node", ["scripts/dev-share-fixture.mjs", A, O, "ORG"]);
    for (const role of ["EDITOR", "VIEWER"])
      execFileSync("node", ["scripts/dev-share-fixture.mjs", P, A, role]);
    a = await pageFor(browser, A);
    v = await pageFor(browser, V);
    n = await pageFor(browser, N);
    o = await pageFor(browser, O);
    await publish(a, O1, "Pemilik data", "Langkah upload file Excel.", "Unggah data");
    await publish(a, V1, "Viewer", "Cara upload? Tidak perlu: Anda cukup melihat dashboard.");
    await publish(a, S1, "Pemilik data", "Periksa tipe kolom.", "Skema dataset");
    await publish(a, S2, "Viewer", "Viewer tidak membuka skema.", "Skema dataset");
    await publish(a, E1, "Editor", "Editor tidak perlu upload file.");
    await publish(a, P1, "Pemilik data", "Buat pivot tersimpan.", "Pivot tersimpan");
    await publish(a, P2, "Editor", "Editor tidak membuka halaman ini.", "Pivot tersimpan");
  });

  test.afterAll(async () => {
    await Promise.all([a, v, n, o].map((p) => p?.context().close()));
  });

  test("AC1: viewer satu dashboard → tab Viewer + Umum; artikel pemilik tidak tampil, slug-nya 404", async () => {
    await v.goto("/panduan");
    await expect.poll(() => tabs(v)).toEqual(["Viewer", "Umum"]);
    await expect(card(v, V1)).toHaveCount(1);
    await expect(card(v, O1)).toHaveCount(0);
    expect((await v.goto(`/panduan/${slugs[O1]}`))?.status()).toBe(404);
    expect((await v.goto(`/panduan/${slugs[V1]}`))?.status()).toBe(200);
    await expect(v.getByRole("heading", { level: 1, name: V1 })).toBeVisible();
  });

  test("AC2: user baru → tab Pemilik data + Umum; kartu Mulai di sini hilang setelah satu artikel dibaca", async () => {
    await n.goto("/panduan");
    // Share organisasi milik user lain di DB dev bisa menambah tab Viewer; Pemilik data + Umum wajib.
    await expect.poll(() => tabs(n)).toEqual(expect.arrayContaining(["Pemilik data", "Umum"]));
    await expect(card(n, O1)).toHaveCount(1);
    await expect(card(n, V1)).toHaveCount(0);
    await n.goto("/");
    const start = n.getByTestId("start-here");
    await expect(start).toBeVisible();
    await start.getByRole("link", { name: "Baca panduan" }).click();
    await expect(n).toHaveURL(/\/panduan\/[a-z0-9-]+$/);
    const read = (await n.getByRole("heading", { level: 1 }).textContent())!.trim();
    // T-exfc AC2: tombol juga di akhir artikel; Server Action ditahan → fokus tetap di tombol yang
    // menunggu (tombol disabled melepas fokus ke body), lalu pindah ke status "Sudah dibaca"-nya.
    const article = n.getByRole("article", { name: read });
    const end = article.locator("footer").getByRole("button", { name: "Tandai sudah dibaca" });
    await expect(n.getByRole("button", { name: "Tandai sudah dibaca" })).toHaveCount(2);
    let release = () => {};
    const gate = new Promise<void>((r) => (release = r));
    await n.route("**/panduan/**", async (route, req) => {
      if (req.method() === "POST" && req.headers()["next-action"]) await gate;
      await route.fallback();
    });
    try {
      await end.click();
      await expect(end).toHaveAttribute("aria-busy", "true");
      // Chromium memindahkan fokus dari tombol disabled ke body beberapa saat kemudian (bukan
      // seketika): periksa sekali (tanpa ulang) setelah jeda, saat aksi masih ditahan.
      await n.waitForTimeout(500);
      expect(await end.evaluate((el) => el === document.activeElement)).toBe(true);
    } finally {
      release();
    }
    await expect(article.locator("footer").getByRole("status")).toBeFocused();
    // Kedua salinan berganti "Sudah dibaca"; hanya yang diklik berperan status (tanpa pengumuman ganda).
    await expect(n.getByText("Sudah dibaca", { exact: true })).toHaveCount(2);
    await expect(n.getByRole("status").filter({ hasText: "Sudah dibaca" })).toHaveCount(1);
    await n.unrouteAll({ behavior: "ignoreErrors" });
    await n.goto("/");
    await expect(n.getByTestId("start-here")).toHaveCount(0);
    // Artikel pertama bisa di tab mana pun (mis. Umum dari isi seed): cari judulnya.
    await n.goto(`/panduan?q=${encodeURIComponent(read)}`);
    await expect(card(n, read).getByText("Sudah dibaca")).toBeVisible();
  });

  test("AC3: halaman skema → Bantuan membuka panel artikel konteks skema sesuai peran, tanpa pindah halaman", async () => {
    const url = `/datasets/${datasetId}/skema`;
    await a.goto(url);
    const open = a.getByRole("button", { name: "Bantuan" });
    await open.click();
    const panel = a.getByTestId("help-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("heading", { name: S1 })).toBeVisible();
    await expect(panel.getByRole("heading", { name: S2 })).toHaveCount(0);
    await expect(panel.getByRole("heading", { name: O1 })).toHaveCount(0); // konteks unggah, bukan skema
    expect(new URL(a.url()).pathname).toBe(url);
    await a.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(open).toBeFocused();
  });

  test("T-7rw4: halaman pivot tersimpan → Bantuan berisi artikel konteks pivot tersimpan untuk pemilik saja", async () => {
    await a.goto(`/datasets/${datasetId}/pivot-tersimpan/baru`);
    const panel = a.getByTestId("help-panel");
    // Klik sebelum hidrasi hilang: ulangi sampai panel terbuka.
    await expect(async () => {
      await a.getByRole("button", { name: "Bantuan" }).click();
      await expect(panel).toBeVisible({ timeout: 2_000 });
    }).toPass();
    await expect(panel.getByRole("heading", { name: "Bantuan: Pivot tersimpan" })).toBeVisible();
    await expect(panel.getByRole("heading", { name: P1 })).toBeVisible();
    await expect(panel.getByRole("heading", { name: P2 })).toHaveCount(0); // peran editor
    await expect(panel.getByRole("heading", { name: O1 })).toHaveCount(0); // konteks unggah
  });

  test("AC4: cari 'upload' → hanya artikel yang boleh dilihat user; % tidak menjadi wildcard", async () => {
    await v.goto("/panduan?q=upload");
    await expect(card(v, V1)).toHaveCount(1);
    await expect(card(v, O1)).toHaveCount(0);
    await expect(card(v, E1)).toHaveCount(0);
    // N tidak punya peran Editor (Viewer bisa ada dari share organisasi lain di DB dev).
    await n.goto("/panduan?q=upload");
    await expect(card(n, O1)).toHaveCount(1);
    await expect(card(n, E1)).toHaveCount(0);
    await n.getByLabel("Cari panduan").fill("%%");
    await n.getByRole("button", { name: "Cari" }).click();
    await expect(n.getByRole("status")).toContainText("0 artikel cocok");
    // Byte NUL di kata kunci dibersihkan (Postgres menolaknya) → bukan galat 500.
    expect((await n.goto("/panduan?q=up%00load"))?.status()).toBe(200);
  });
  test("review AC5: kata panjang tidak menggeser halaman di 320 px; judul isi tidak melompat tingkat", async () => {
    const LONG = `Nomor resi ${"A1B2C3D4E5".repeat(8)} ${TAG}`;
    await publish(a, LONG, "Semua peran", `## Bagian\n\nResi ${"X9".repeat(60)} tanpa spasi.`);
    await n.setViewportSize({ width: 320, height: 800 });
    await n.goto("/panduan?peran=umum");
    await expect(card(n, LONG)).toHaveCount(1);
    expect(await n.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await n.goto(`/panduan/${slugs[LONG]}`);
    const levels = await n
      .locator("main h1, main h2, main h3, main h4")
      .evaluateAll((els) => els.map((e) => Number(e.tagName[1])));
    expect(levels).toEqual([1, 2]);
    expect(await n.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });

  test("review INT-1: hanya melihat lewat share organisasi → mendapat artikel Viewer", async () => {
    await o.goto("/panduan?peran=viewer");
    await expect.poll(() => tabs(o)).toEqual(expect.arrayContaining(["Viewer", "Umum"]));
    await expect(card(o, V1)).toHaveCount(1);
    expect((await o.goto(`/panduan/${slugs[V1]}`))?.status()).toBe(200);
  });

  test("T-exfc AC1: 5 tab di 320 px → tab aktif terlihat; pindah tab memberi tanda memuat; hasil cari diumumkan", async () => {
    await a.setViewportSize({ width: 320, height: 800 });
    const toOwner = (url: URL) =>
      url.pathname === "/panduan" && url.searchParams.get("peran") === "pemilik";
    let release = () => {};
    try {
      await a.goto("/panduan?peran=umum");
      await expect
        .poll(() => tabs(a))
        .toEqual(["Pemilik data", "Editor", "Viewer", "Admin", "Umum"]);
      const nav = a.getByRole("navigation", { name: "Panduan per peran" });
      const umum = nav.getByRole("link", { name: "Umum", exact: true });
      await expect(umum).toHaveAttribute("aria-current", "page");
      await expect(umum).toBeInViewport({ ratio: 1 });
      expect(await a.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);

      // Server lambat: tab yang diklik menandai memuat, daftar lama redup, "Memuat artikel…" diumumkan.
      const gate = new Promise<void>((r) => (release = r));
      await a.route(toOwner, async (route) => {
        await gate;
        await route.fallback();
      });
      const owner = nav.getByRole("link", { name: "Pemilik data", exact: true });
      const loading = a.getByText("Memuat artikel…");
      await expect(loading).toBeHidden();
      await owner.click();
      await expect(owner.locator("[data-pending]")).toBeAttached();
      await expect(loading).toBeVisible();
      await expect(a.getByRole("list", { name: "Artikel Umum" }).locator("..")).toHaveCSS(
        "opacity",
        "0.6",
      );
      release();
      await expect(owner).toHaveAttribute("aria-current", "page");
      await expect(nav.locator("[data-pending]")).toHaveCount(0);
      await expect(loading).toBeHidden();
      await expect(owner).toBeInViewport({ ratio: 1 });

      // Jumlah hasil diumumkan: wilayah status (tersembunyi) diisi sesudah halaman tampil.
      await a.goto("/panduan?q=upload");
      const announce = a.getByRole("status");
      await expect(announce).toHaveText(/^\d+ artikel cocok dengan “upload”\.$/);
      await expect(announce).toHaveClass(/\bsr-only\b/);
      await expect(a.getByText(/artikel cocok dengan “upload”/).first()).toBeVisible();
      // NB1: ?q=%00%00 dibersihkan → bukan pencarian (tab tampil), bukan “0 artikel … “””.
      await a.goto("/panduan?q=%00%00");
      await expect(a.getByText("artikel cocok dengan “”")).toHaveCount(0);
      await expect(a.getByRole("navigation", { name: "Panduan per peran" })).toBeVisible();
    } finally {
      release();
      await a.unrouteAll({ behavior: "ignoreErrors" });
      await a.setViewportSize({ width: 1440, height: 900 });
    }
  });

  test("T-exfc AC3: Beranda — admin dan pemilik lama yang belum membaca tidak melihat Mulai di sini; viewer baru melihatnya", async ({
    browser,
  }) => {
    await a.goto("/");
    await expect(a.getByRole("heading", { level: 1, name: "Beranda" })).toBeVisible();
    await expect(a.getByTestId("start-here")).toHaveCount(0);
    const p = await pageFor(browser, P);
    try {
      await p.goto("/");
      await expect(p.getByRole("heading", { level: 1, name: "Beranda" })).toBeVisible();
      await expect(p.getByTestId("start-here")).toHaveCount(0);
    } finally {
      await p.context().close();
    }
    await v.goto("/");
    await expect(v.getByTestId("start-here")).toBeVisible();
  });
});
