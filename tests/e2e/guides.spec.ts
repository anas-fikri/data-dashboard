import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { pageFor, registerAndVerify, uniqueEmail } from "./helpers";

/*
 * T-020 panduan per peran (admin): A = admin (dev-make-admin), B = pengguna biasa yang menjadi viewer
 * satu dashboard A (dev-share-fixture) — /panduan menyaring per peran (T-022).
 *   AC3 B membuka /admin/panduan → 404;
 *   AC1/AC2/AC6 A menulis artikel viewer + konteks skema berisi <script>, javascript:, gambar luar →
 *     pratinjau tersanitasi (tanpa skrip berjalan), tersimpan draf, diterbitkan → tampil di /panduan;
 *   AC4 dua artikel: tukar urutan → urutan baru tersimpan; draf tidak tampil di /panduan.
 * T-0vjt AC1: tabel markdown tampil sebagai tabel di pratinjau dan /panduan, wilayah gulirnya bisa
 *   difokus dan digulir dengan keyboard (desktop + 320 px).
 */
test.describe.configure({ mode: "serial" });

const A = uniqueEmail("guide-admin");
const B = uniqueEmail("guide-user");
const TAG = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const T1 = `Membaca skema dataset ${TAG}`;
const T2 = `Menyusun dashboard pertama ${TAG}`;
const T3 = `Mengelola pengguna ${TAG}`;
const EVIL = [
  "Halo **viewer**. <script>window.__guideXss = 1</script>",
  "",
  "[klik](javascript:window.__guideXss=2) [data](data:text/html,x)",
  "",
  '<iframe src="https://evil.example"></iframe>',
  "",
  "![luar](https://evil.example/a.png)",
  "",
  "[Dokumentasi luar](https://example.org/doc)",
].join("\n");

let a: Page;
let b: Page;

const row = (page: Page, title: string) =>
  page.getByTestId("guide-row").filter({ has: page.getByRole("link", { name: title }) });

async function expectSanitized(page: Page, scope: ReturnType<Page["getByTestId"]>) {
  await expect(scope.locator("script, iframe, object, form, style")).toHaveCount(0);
  await expect(scope.locator('a[href^="javascript:"], a[href^="data:"]')).toHaveCount(0);
  await expect(scope.locator('img[src*="evil.example"]')).toHaveCount(0);
  await expect(scope.getByRole("link", { name: "Dokumentasi luar" })).toHaveAttribute(
    "rel",
    "noopener noreferrer",
  );
  expect(await page.evaluate(() => (window as { __guideXss?: number }).__guideXss)).toBeUndefined();
}

async function createGuide(page: Page, title: string, role: string, body: string) {
  await page.goto("/admin/panduan/baru");
  await page.getByLabel("Judul").fill(title);
  await page.getByLabel("Peran").click();
  await page.getByRole("option", { name: role, exact: true }).click();
  await page.getByLabel("Isi (markdown)").fill(body);
  await page.getByRole("button", { name: "Simpan sebagai draf" }).click();
  await expect(page).toHaveURL(/\/admin\/panduan\/[a-z0-9]{20,32}\?created=1$/);
}

test.describe("panduan admin (T-020)", () => {
  test.beforeAll(async ({ browser, request }) => {
    test.setTimeout(120_000);
    execFileSync("node", ["scripts/dev-reset-ratelimit.mjs", "register:ip", "verify:ip"]);
    const setup = await browser.newPage();
    for (const email of [A, B]) {
      await setup.context().clearCookies();
      await registerAndVerify(setup, request, email);
    }
    await setup.close();
    execFileSync("node", ["scripts/dev-make-admin.mjs", A]);
    execFileSync("node", ["scripts/dev-share-fixture.mjs", A, B, "VIEWER"]);
    a = await pageFor(browser, A);
    b = await pageFor(browser, B);
  });

  test.afterAll(async () => {
    await Promise.all([a, b].map((p) => p?.context().close()));
  });

  test("AC3: pengguna biasa membuka /admin/panduan → 404", async () => {
    for (const path of ["/admin/panduan", "/admin/panduan/baru"]) {
      const res = await b.goto(path);
      expect(res?.status(), path).toBe(404);
    }
  });

  test("AC1/AC2/AC6: artikel viewer + konteks skema — pratinjau tersanitasi, terbit, tampil di /panduan", async () => {
    a.on("dialog", (d) => {
      throw new Error(`dialog tak terduga: ${d.message()}`);
    });
    await a.goto("/admin/panduan/baru");
    await a.getByLabel("Judul").fill(T1);
    await expect(a.getByLabel("Slug (alamat)")).toHaveValue(/^membaca-skema-dataset-\d+-\d+$/);
    await a.getByLabel("Peran").click();
    await a.getByRole("option", { name: "Viewer", exact: true }).click();
    await a.getByLabel("Bantuan di halaman").click();
    await a.getByRole("option", { name: "Skema dataset", exact: true }).click();
    await a.getByLabel("Isi (markdown)").fill(EVIL);
    const preview = a.getByTestId("guide-markdown");
    await expect(preview.locator("strong")).toHaveText("viewer");
    await expectSanitized(a, preview);
    await a.getByRole("button", { name: "Simpan sebagai draf" }).click();
    await expect(a).toHaveURL(/\/admin\/panduan\/[a-z0-9]{20,32}\?created=1$/);

    await a.goto("/admin/panduan");
    const r = row(a, T1);
    await expect(r).toContainText("Draf");
    await expect(r).toContainText("Viewer");
    await expect(r).toContainText("Bantuan Skema dataset");
    await r.getByRole("button", { name: /^Terbitkan/ }).click();
    // Tunggu hasil aksi (tombol berganti "Tarik"); "Terbit" saja sudah cocok dengan label "Terbitkan".
    await expect(r.getByRole("button", { name: /^Tarik/ })).toBeVisible();
    await expect(r.getByText("Terbit", { exact: true })).toBeVisible();

    await b.goto("/panduan");
    const card = b.getByTestId("guide-card").filter({ hasText: T1 });
    await expect(card).toHaveCount(1);
    await card.getByRole("link", { name: T1 }).click();
    await expect(b).toHaveURL(/\/panduan\/membaca-skema-dataset-\d+-\d+$/);
    await expectSanitized(b, b.getByTestId("guide-markdown"));
  });

  test("AC4: tukar urutan tersimpan; draf tidak tampil di /panduan", async () => {
    await createGuide(a, T2, "Semua peran", "Langkah menyusun dashboard.");
    await a.goto("/admin/panduan");
    const titles = () =>
      a.getByTestId("guide-row").getByRole("link").filter({ hasText: TAG }).allTextContents();
    await expect.poll(titles).toEqual([T1, T2]);
    await row(a, T2)
      .getByRole("button", { name: `Naikkan ${T2}` })
      .click();
    await expect.poll(titles).toEqual([T2, T1]);
    await a.reload();
    await expect.poll(titles).toEqual([T2, T1]);

    await b.goto("/panduan");
    await expect(b.getByTestId("guide-card").filter({ hasText: T1 })).toHaveCount(1);
    await b.goto("/panduan?peran=umum");
    await expect(b.getByTestId("guide-card").filter({ hasText: T2 })).toHaveCount(0);
  });

  test("review AC5: ubah artikel tersimpan; fokus kembali setelah aksi baris dan dialog hapus", async () => {
    await a.goto("/admin/panduan");
    await row(a, T1).getByRole("link", { name: T1, exact: true }).click();
    await expect(a.getByLabel("Isi (markdown)")).toHaveValue(EVIL);
    await a.getByLabel("Isi (markdown)").fill("Isi **diperbarui**.");
    await a.getByRole("button", { name: "Simpan perubahan" }).click();
    await expect(a.getByText("Perubahan tersimpan.")).toBeVisible();
    await a.reload();
    await expect(a.getByLabel("Isi (markdown)")).toHaveValue("Isi **diperbarui**.");

    // Urutan kini [.., T2, T1]: aksi lewat keyboard, fokus kembali ke tombol pemicu.
    await a.goto("/admin/panduan");
    await row(a, T2)
      .getByRole("button", { name: /^Terbitkan/ })
      .focus();
    await a.keyboard.press("Enter");
    await expect(row(a, T2).getByRole("button", { name: /^Tarik/ })).toBeFocused();
    await expect(a.getByText(`“${T2}” diterbitkan.`)).toBeAttached();
    // T2 turun ke paling bawah: Turunkan jadi nonaktif → fokus ke Naikkan di baris yang sama.
    await row(a, T2)
      .getByRole("button", { name: `Turunkan ${T2}` })
      .focus();
    await a.keyboard.press("Enter");
    await expect(row(a, T2).getByRole("button", { name: `Naikkan ${T2}` })).toBeFocused();

    // Dialog hapus: Esc → fokus kembali ke tombol Hapus; hapus → ke baris tetangga.
    const del = row(a, T2).getByRole("button", { name: `Hapus ${T2}` });
    await del.focus();
    await a.keyboard.press("Enter");
    await expect(a.getByRole("alertdialog")).toBeVisible();
    await a.keyboard.press("Escape");
    await expect(del).toBeFocused();
    await a.keyboard.press("Enter");
    await a.getByRole("alertdialog").getByRole("button", { name: "Hapus" }).click();
    await expect(row(a, T2)).toHaveCount(0);
    await expect(row(a, T1).getByRole("link", { name: `Ubah ${T1}` })).toBeFocused();
  });

  test("review R4: artikel peran Admin terbit hanya tampil untuk admin di /panduan", async () => {
    await createGuide(a, T3, "Admin", "Khusus admin.");
    await a.goto("/admin/panduan");
    await row(a, T3)
      .getByRole("button", { name: /^Terbitkan/ })
      .click();
    await expect(row(a, T3).getByRole("button", { name: /^Tarik/ })).toBeVisible();
    await b.goto("/panduan?peran=admin"); // bukan perannya → tab pertama (Viewer)
    await expect(b.getByTestId("guide-card").filter({ hasText: T1 })).toHaveCount(1);
    await expect(b.getByTestId("guide-card").filter({ hasText: T3 })).toHaveCount(0);
    await a.goto("/panduan?peran=admin");
    const card = a.getByTestId("guide-card").filter({ hasText: T3 });
    await expect(card).toHaveCount(1);
    const href = (await card.getByRole("link", { name: T3 }).getAttribute("href"))!;
    expect((await b.goto(href))?.status()).toBe(404);
  });

  test("T-0vjt AC1: tabel markdown di pratinjau dan /panduan — tabel, wilayah gulir bisa dipakai keyboard", async () => {
    const cols = ["Kolom", "Tipe", "Contoh", "Keterangan", "Wajib", "Satuan", "Sumber", "Catatan"];
    const md = [
      "Ringkasan kolom:",
      "",
      `| ${cols.join(" | ")} |`,
      `|${cols.map(() => " --- ").join("|")}|`,
      `| ${cols.map((c) => `${c.toLowerCase()}_contoh_panjang`).join(" | ")} |`,
    ].join("\n");
    const name = `Tabel: ${cols.join(", ")}`;
    /** Tabel sungguhan (bukan teks "| --- |"), wilayah gulir bisa difokus dan digulir panah kanan. */
    async function expectScrollableTable(page: Page) {
      const scope = page.getByTestId("guide-markdown");
      await expect(scope).not.toContainText("| --- |");
      const region = scope.getByRole("region", { name });
      await expect(region.getByRole("columnheader")).toHaveText(cols);
      await expect(region.getByRole("cell", { name: "tipe_contoh_panjang" })).toBeVisible();
      await region.focus();
      await expect(region).toBeFocused();
      const scrollLeft = () => region.evaluate((el) => el.scrollLeft);
      expect(await region.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
      await page.keyboard.press("ArrowRight");
      await expect.poll(scrollLeft).toBeGreaterThan(0);
      // Tabel meluap di wilayahnya sendiri, halaman tidak ikut melebar.
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    }

    await a.goto("/admin/panduan");
    await row(a, T1).getByRole("link", { name: T1, exact: true }).click();
    await a.getByLabel("Isi (markdown)").fill(md);
    await expectScrollableTable(a);
    await a.getByRole("button", { name: "Simpan perubahan" }).click();
    await expect(a.getByText("Perubahan tersimpan.")).toBeVisible();

    // T1 sudah terbit (AC1) untuk Viewer: B membaca artikelnya di desktop dan di ponsel 320 px.
    await b.goto(`/panduan/membaca-skema-dataset-${TAG}`);
    await expectScrollableTable(b);
    await b.setViewportSize({ width: 320, height: 720 });
    try {
      await b.reload();
      await expectScrollableTable(b);
    } finally {
      await b.setViewportSize({ width: 1280, height: 720 });
    }
  });
});
