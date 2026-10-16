import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { pageFor, registerAndVerify, uniqueEmail } from "./helpers";

/*
 * T-022 panduan per peran. A = admin + pemilik dataset (dev-share-fixture), V = viewer satu dashboard A,
 * N = user baru (tanpa dataset dan share).
 *   AC1 V: tab Viewer + Umum saja; artikel Pemilik data tidak tampil dan slug-nya 404;
 *   AC2 N: tab Pemilik data + Umum; kartu "Mulai di sini" di Beranda hilang setelah satu artikel dibaca;
 *   AC3 A di halaman skema: Bantuan → panel samping berisi artikel konteks skema untuk perannya saja;
 *   AC4 cari "upload": hanya artikel yang boleh dilihat user (wildcard LIKE tidak berlaku).
 */
test.describe.configure({ mode: "serial" });

const A = uniqueEmail("roles-admin");
const V = uniqueEmail("roles-viewer");
const N = uniqueEmail("roles-new");
const TAG = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const O1 = `Cara upload data ${TAG}`;
const V1 = `Membaca dashboard bersama ${TAG}`;
const S1 = `Memeriksa skema ${TAG}`;
const S2 = `Skema untuk viewer ${TAG}`;
const slugs: Record<string, string> = {};
let a: Page;
let v: Page;
let n: Page;
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
    for (const email of [A, V, N]) {
      await setup.context().clearCookies();
      await registerAndVerify(setup, request, email);
    }
    await setup.close();
    execFileSync("node", ["scripts/dev-make-admin.mjs", A]);
    datasetId = JSON.parse(
      execFileSync("node", ["scripts/dev-share-fixture.mjs", A, V, "VIEWER"]).toString(),
    ).datasetId;
    a = await pageFor(browser, A);
    v = await pageFor(browser, V);
    n = await pageFor(browser, N);
    await publish(a, O1, "Pemilik data", "Langkah upload file Excel.", "Unggah data");
    await publish(a, V1, "Viewer", "Cara upload? Tidak perlu: Anda cukup melihat dashboard.");
    await publish(a, S1, "Pemilik data", "Periksa tipe kolom.", "Skema dataset");
    await publish(a, S2, "Viewer", "Viewer tidak membuka skema.", "Skema dataset");
  });

  test.afterAll(async () => {
    await Promise.all([a, v, n].map((p) => p?.context().close()));
  });

  test("AC1: viewer satu dashboard → tab Viewer + Umum; artikel pemilik tidak tampil, slug-nya 404", async () => {
    await v.goto("/panduan");
    expect(await tabs(v)).toEqual(["Viewer", "Umum"]);
    await expect(card(v, V1)).toHaveCount(1);
    await expect(card(v, O1)).toHaveCount(0);
    expect((await v.goto(`/panduan/${slugs[O1]}`))?.status()).toBe(404);
    expect((await v.goto(`/panduan/${slugs[V1]}`))?.status()).toBe(200);
    await expect(v.getByRole("heading", { level: 1, name: V1 })).toBeVisible();
  });

  test("AC2: user baru → tab Pemilik data + Umum; kartu Mulai di sini hilang setelah satu artikel dibaca", async () => {
    await n.goto("/panduan");
    expect(await tabs(n)).toEqual(["Pemilik data", "Umum"]);
    await expect(card(n, O1)).toHaveCount(1);
    await expect(card(n, V1)).toHaveCount(0);
    await n.goto("/");
    const start = n.getByTestId("start-here");
    await expect(start).toBeVisible();
    await start.getByRole("link", { name: "Baca panduan" }).click();
    await expect(n).toHaveURL(/\/panduan\/[a-z0-9-]+$/);
    await n.getByRole("button", { name: "Tandai sudah dibaca" }).click();
    await expect(n.getByRole("status").filter({ hasText: "Sudah dibaca" })).toBeFocused();
    await n.goto("/");
    await expect(n.getByTestId("start-here")).toHaveCount(0);
    await n.goto("/panduan");
    await expect(n.getByTestId("guide-card").getByText("Sudah dibaca").first()).toBeVisible();
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

  test("AC4: cari 'upload' → hanya artikel yang boleh dilihat user; % tidak menjadi wildcard", async () => {
    await v.goto("/panduan?q=upload");
    await expect(card(v, V1)).toHaveCount(1);
    await expect(card(v, O1)).toHaveCount(0);
    await n.goto("/panduan?q=upload");
    await expect(card(n, O1)).toHaveCount(1);
    await expect(card(n, V1)).toHaveCount(0);
    await n.getByLabel("Cari panduan").fill("%%");
    await n.getByRole("button", { name: "Cari" }).click();
    await expect(n.getByRole("status")).toContainText("0 artikel cocok");
  });
});
