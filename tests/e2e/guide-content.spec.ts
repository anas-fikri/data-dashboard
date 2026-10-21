import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { pageFor, registerAndVerify, uniqueEmail } from "./helpers";

/*
 * T-xfzy isi awal panduan: seed (idempoten) menerbitkan content/panduan; user baru melihat artikel
 * Umum dan Pemilik data berurutan sesuai alur kerja; viewer melihat artikel viewer. Video rekaman
 * (demo/guide-videos, tidak di-commit) diperiksa terpisah: lihat catatan task.
 * T-064: artikel Lihat data dan data per periode (pemilik) + bagian Lihat data/Perbesar di artikel editor
 * dan viewer terender (tabel tersanitasi), dan artikel pemilik tetap tidak terbuka untuk viewer.
 * T-076: artikel perhitungan seperti PivotTable dan pivot tersimpan (pemilik) + bagian editor/viewer.
 */
const N = uniqueEmail("content-new");
const V = uniqueEmail("content-viewer");
const OWNER = uniqueEmail("content-owner");
const E = uniqueEmail("content-editor");
/** Artikel yang ditambah/diubah T-064: DB dev yang sudah di-seed sebelumnya diperbarui (--update). */
const T064 = [
  "lihat-data-seperti-excel",
  "data-per-periode",
  "editor-ubah-dashboard",
  "viewer-lihat-filter-ekspor",
  "ganti-data-pemetaan",
];
/** Artikel yang ditambah/diubah T-076 (rilis G-7). */
const T076 = [
  "perhitungan-seperti-pivottable",
  "satu-pivot-banyak-widget",
  "widget-pivot",
  "mengenal-data-dashboard",
];
const seeded = readdirSync(join(process.cwd(), "content/panduan"))
  .filter((f) => f.endsWith(".md"))
  .sort()
  .map((f) => {
    const text = readFileSync(join(process.cwd(), "content/panduan", f), "utf8");
    return {
      title: /^title:\s*(.+)$/m.exec(text)![1]!.trim(),
      role: /^role:\s*(.+)$/m.exec(text)![1]!.trim(),
    };
  });
const titles = (role: string) => seeded.filter((g) => g.role === role).map((g) => g.title);

let n: Page;
let v: Page;
let e: Page;

/** Judul kartu artikel seed di halaman, dalam urutan tampil. */
const shown = async (page: Page, role: string) => {
  const all = await page.getByTestId("guide-card").getByRole("link").allTextContents();
  return all.filter((t) => titles(role).includes(t));
};

test.describe("isi panduan (T-xfzy)", () => {
  test.beforeAll(async ({ browser, request }) => {
    test.setTimeout(150_000);
    const seed = ["tsx", "--conditions=react-server", "--env-file-if-exists=.env"];
    for (let i = 0; i < 2; i++) execFileSync("npx", [...seed, "scripts/seed-guides.ts"]); // idempoten
    execFileSync("npx", [
      ...seed,
      "scripts/seed-guides.ts",
      "--update",
      "--only",
      [...T064, ...T076].join(","),
    ]);
    execFileSync("node", ["scripts/dev-reset-ratelimit.mjs", "register:ip", "verify:ip"]);
    const setup = await browser.newPage();
    for (const email of [N, V, OWNER, E]) {
      await setup.context().clearCookies();
      await registerAndVerify(setup, request, email);
    }
    await setup.close();
    execFileSync("node", ["scripts/dev-share-fixture.mjs", OWNER, V, "VIEWER"]);
    execFileSync("node", ["scripts/dev-share-fixture.mjs", OWNER, E, "EDITOR"]);
    n = await pageFor(browser, N);
    v = await pageFor(browser, V);
    e = await pageFor(browser, E);
  });

  test.afterAll(async () => {
    await Promise.all([n, v, e].map((p) => p?.context().close()));
  });

  test("AC1/AC3: artikel Umum dan Pemilik data terbit, urut sesuai alur kerja", async () => {
    await n.goto("/panduan?peran=umum");
    await expect.poll(() => shown(n, "ALL")).toEqual(titles("ALL"));
    await n.goto("/panduan?peran=pemilik");
    await expect.poll(() => shown(n, "OWNER")).toEqual(titles("OWNER"));
    // Seed dua kali tidak menggandakan artikel.
    for (const t of titles("OWNER"))
      await expect(
        n.getByTestId("guide-card").getByRole("link", { name: t, exact: true }),
      ).toHaveCount(1);
  });

  test("AC3: viewer melihat artikel viewer; artikel pemilik tidak", async () => {
    await v.goto("/panduan?peran=viewer");
    await expect.poll(() => shown(v, "VIEWER")).toEqual(titles("VIEWER"));
    await v.goto("/panduan?q=dataset");
    // Daftar dirender bersama judul halaman (satu batas loading.tsx): tunggu tampil, lalu baca.
    await expect(v.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await shown(v, "OWNER")).toEqual([]);
  });

  test("T-064 AC2: Lihat data dan data per periode terbit; editor/viewer mendapat bagian perannya", async () => {
    const article = (p: Page) => p.getByTestId("guide-markdown");
    await n.goto("/panduan/lihat-data-seperti-excel");
    await expect(n.getByRole("heading", { level: 1 })).toHaveText(
      "Melihat data seperti Excel (Lihat data)",
    );
    for (const h of [
      "Menyalin ke Excel",
      "Mengunduh tampilan",
      "Pintasan keyboard",
      "Yang bisa dan belum bisa",
    ])
      await expect(article(n).getByRole("heading", { level: 2, name: h })).toBeVisible();
    // Tabel markdown terender sebagai tabel (bukan teks mentah dengan "|").
    await expect(article(n).locator("table")).toHaveCount(3);
    await expect(article(n)).not.toContainText("| ---");

    await n.goto("/panduan/data-per-periode");
    for (const h of [
      "Layar tinjauan",
      "Batas penyimpanan",
      "Mengelola periode: unggah ulang, hapus, pulihkan",
    ])
      await expect(article(n).getByRole("heading", { level: 2, name: h })).toBeVisible();
    await expect(article(n).locator("table")).toHaveCount(2);
    // Kedua artikel ada di tab Pemilik data (urut sesuai berkas: 14 lalu 15; 16–17 dari T-076 di belakangnya).
    await n.goto("/panduan?peran=pemilik");
    await expect
      .poll(async () => (await shown(n, "OWNER")).slice(-4, -2))
      .toEqual([
        "Melihat data seperti Excel (Lihat data)",
        "Mengunggah data per periode (bulanan, kuartalan, tahunan)",
      ]);

    await e.goto("/panduan/editor-ubah-dashboard");
    await expect(
      article(e).getByRole("heading", { level: 2, name: "Melihat seluruh data (Lihat data)" }),
    ).toBeVisible();
    await v.goto("/panduan/viewer-lihat-filter-ekspor");
    await expect(
      article(v).getByRole("heading", { level: 2, name: "Memperbesar tabel" }),
    ).toBeVisible();
    // Artikel pemilik tetap tertutup untuk viewer (slug di luar peran → 404).
    expect((await v.goto("/panduan/data-per-periode"))?.status()).toBe(404);
  });

  test("T-076 AC2: perhitungan seperti PivotTable dan pivot tersimpan terbit; editor/viewer mendapat bagiannya", async () => {
    const article = (p: Page) => p.getByTestId("guide-markdown");
    await n.goto("/panduan/perhitungan-seperti-pivottable");
    await expect(n.getByRole("heading", { level: 1 })).toHaveText(
      "Membuat perhitungan seperti PivotTable",
    );
    for (const h of [
      "Tampilkan nilai sebagai",
      "Field terhitung",
      "Pivot bertingkat: 4 tingkat baris dan 8 nilai",
      "N teratas dan (Lainnya)",
    ])
      await expect(article(n).getByRole("heading", { level: 2, name: h })).toBeVisible();
    await expect(
      article(n).getByRole("heading", { level: 3, name: "Menulis angka di rumus" }),
    ).toBeVisible();
    // Tabel padanan Excel, Tampilkan sebagai, cara tulis angka, contoh rumus.
    await expect(article(n).locator("table")).toHaveCount(4);
    await expect(article(n)).not.toContainText("| ---");

    await n.goto("/panduan/satu-pivot-banyak-widget");
    for (const h of [
      "Memakai pivot tersimpan di widget",
      "Mengubah pivot tersimpan",
      "Lepas dari sumber",
      "Menghapus pivot tersimpan",
      "Siapa bisa apa",
    ])
      await expect(article(n).getByRole("heading", { level: 2, name: h })).toBeVisible();
    await expect(article(n).locator("table")).toHaveCount(2);
    // Keduanya di tab Pemilik data, urut sesuai berkas (16 lalu 17) setelah artikel T-064.
    await n.goto("/panduan?peran=pemilik");
    await expect
      .poll(async () => (await shown(n, "OWNER")).slice(-2))
      .toEqual(["Membuat perhitungan seperti PivotTable", "Satu pivot untuk banyak widget"]);

    await e.goto("/panduan/editor-ubah-dashboard");
    await expect(
      article(e).getByRole("heading", { level: 2, name: "Field terhitung dan pivot tersimpan" }),
    ).toBeVisible();
    await v.goto("/panduan/viewer-lihat-filter-ekspor");
    await expect(
      article(v).getByRole("heading", { level: 2, name: "Membaca angka pivot dan grafik" }),
    ).toBeVisible();
    // Definisi pivot tersimpan hanya untuk pemilik: artikelnya 404 untuk viewer.
    expect((await v.goto("/panduan/satu-pivot-banyak-widget"))?.status()).toBe(404);
  });
});
