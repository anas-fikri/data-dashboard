import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { apiLogin, registerAndVerify, uniqueEmail } from "./helpers";

/*
 * T-h807 user online (admin): heartbeat tab terlihat → Redis; admin melihat daftar di Admin › Pengguna;
 * user biasa tidak bisa membaca daftar; heartbeat hanya dari sesi sendiri dan origin aplikasi.
 */
const USER = uniqueEmail("presence-user");
const ADMIN = uniqueEmail("presence-admin");

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser, request }) => {
  for (const email of [USER, ADMIN]) {
    const p = await browser.newPage();
    await registerAndVerify(p, request, email);
    await p.close();
  }
  execFileSync("node", ["scripts/dev-make-admin.mjs", ADMIN]);
});

test("API: tanpa sesi 401; origin lain 403; user biasa tidak bisa membaca daftar (404)", async ({
  page,
  playwright,
}) => {
  const baseURL = test.info().project.use.baseURL!;
  const anon = await playwright.request.newContext({ baseURL });
  const origin = new URL(baseURL).origin;
  expect(
    (await anon.post("/api/presence", { data: { path: "/" }, headers: { origin } })).status(),
  ).toBe(401);
  expect((await anon.get("/api/presence")).status()).toBe(401);
  await anon.dispose();

  await apiLogin(page, USER);
  const cross = await page.request.post("/api/presence", {
    data: { path: "/" },
    headers: { origin: "https://evil.example" },
  });
  expect(cross.status()).toBe(403);
  const ok = await page.request.post("/api/presence", {
    data: { path: "/datasets?f=rahasia" },
    headers: { origin },
  });
  expect(ok.status()).toBe(204);
  expect((await page.request.get("/api/presence")).status()).toBe(404);
});

test("AC1/AC5: tab user terlihat mengirim heartbeat; admin melihatnya di Sedang online", async ({
  browser,
}) => {
  const userCtx = await browser.newContext();
  const user = await userCtx.newPage();
  await apiLogin(user, USER);
  const beat = user.waitForResponse(
    (r) => r.url().endsWith("/api/presence") && r.request().method() === "POST",
  );
  await user.goto("/datasets");
  expect((await beat).status()).toBe(204);

  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  await apiLogin(admin, ADMIN);
  await admin.setViewportSize({ width: 1280, height: 900 });
  // Heartbeat admin sendiri dulu, baru daftar dimuat ulang (daftar diperbarui tiap 30 dtk).
  const own = admin.waitForResponse(
    (r) => r.url().endsWith("/api/presence") && r.request().method() === "POST",
  );
  await admin.goto("/admin/pengguna");
  expect((await own).status()).toBe(204);
  await admin.reload();
  const section = admin.getByTestId("online-users");
  await expect(section.getByRole("heading", { name: /Sedang online/ })).toBeVisible();
  const row = section.getByTestId("online-user").filter({ hasText: USER });
  await expect(row).toBeVisible();
  await expect(row.getByTestId("online-page")).toHaveText("Daftar dataset");
  await expect(row).toContainText(/Aktif (baru saja|\d+ menit lalu)/);
  await expect(row).toContainText("WIB");
  // Admin sendiri juga online.
  await expect(section.getByTestId("online-user").filter({ hasText: ADMIN })).toBeVisible();

  // Daftar dari API: path tanpa query string tidak pernah bocor (label saja), tanpa id user lain selain yang online.
  const body = await (await admin.request.get("/api/presence")).json();
  expect(JSON.stringify(body)).not.toContain("rahasia");
  await admin.screenshot({ path: test.info().outputPath("online-users.png") });

  // Tautan kartu Server (#online) memfokus bagian ini.
  await admin.goto("/admin/pengguna#online");
  await expect(section).toBeFocused();
  await userCtx.close();
  await adminCtx.close();
});

test("Kartu Server (admin): N user online; tautan dari Admin › Pengguna memfokus Sedang online", async ({
  page,
}) => {
  // Kartu Server butuh monitor: ringkasan tiruan (angka online dari server sungguhan diuji unit).
  await page.route("**/api/metrics", (r) =>
    r.fulfill({
      json: {
        ok: true,
        enabled: true,
        available: true,
        latest: null,
        series: [],
        queue: null,
        online: 2,
      },
    }),
  );
  await apiLogin(page, ADMIN);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin/pengguna");
  const link = page.getByTestId("sidebar").getByTestId("server-online");
  await expect(link).toHaveText("2 user online");
  await link.click();
  await expect(page.getByTestId("online-users")).toBeFocused();
});
