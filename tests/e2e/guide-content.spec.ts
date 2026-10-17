import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { pageFor, registerAndVerify, uniqueEmail } from "./helpers";

/*
 * T-xfzy isi awal panduan: seed (idempoten) menerbitkan content/panduan; user baru melihat artikel
 * Umum dan Pemilik data berurutan sesuai alur kerja; viewer melihat artikel viewer. Video rekaman
 * (demo/guide-videos, tidak di-commit) diperiksa terpisah: lihat catatan task.
 */
const N = uniqueEmail("content-new");
const V = uniqueEmail("content-viewer");
const OWNER = uniqueEmail("content-owner");
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
    execFileSync("node", ["scripts/dev-reset-ratelimit.mjs", "register:ip", "verify:ip"]);
    const setup = await browser.newPage();
    for (const email of [N, V, OWNER]) {
      await setup.context().clearCookies();
      await registerAndVerify(setup, request, email);
    }
    await setup.close();
    execFileSync("node", ["scripts/dev-share-fixture.mjs", OWNER, V, "VIEWER"]);
    n = await pageFor(browser, N);
    v = await pageFor(browser, V);
  });

  test.afterAll(async () => {
    await Promise.all([n, v].map((p) => p?.context().close()));
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
});
