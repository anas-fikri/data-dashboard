import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { apiLogin, registerAndVerify, uniqueEmail } from "./helpers";

// Butuh compose dev + .env dari `npm run secrets:dev` + migrate.
test("tanpa sesi: /health dan /api/health hanya status, tanpa nama layanan", async ({
  page,
  request,
}) => {
  const api = await request.get("/api/health");
  expect(api.status()).toBe(200);
  expect(Object.keys(await api.json()).sort()).toEqual(["checkedAt", "status"]);

  await page.goto("/health");
  await expect(page).toHaveTitle("Kesehatan sistem · Data Dashboard");
  await expect(page.getByRole("status")).toHaveText("Semua layanan OK");
  for (const name of ["PostgreSQL", "Redis", "Object storage", "SMTP"]) {
    await expect(page.getByText(name)).toHaveCount(0);
  }
});

test("admin: /health dan /api/health menampilkan detail per layanan", async ({
  page,
  request,
  browser,
}) => {
  const email = uniqueEmail("health-admin");
  const setup = await browser.newPage();
  await registerAndVerify(setup, request, email);
  await setup.close();
  execFileSync("node", ["scripts/dev-make-admin.mjs", email]);
  await apiLogin(page, email);

  const api = await page.request.get("/api/health");
  const body = (await api.json()) as { items: { name: string; status: string }[] };
  expect(body.items.map((i) => i.name)).toEqual([
    "Konfigurasi",
    "PostgreSQL",
    "Redis",
    "Object storage",
    "SMTP",
  ]);

  await page.goto("/health");
  for (const name of ["Konfigurasi", "PostgreSQL", "Redis", "Object storage", "SMTP"]) {
    const row = page.locator(`li[data-check="${name}"]`);
    await expect(row).toHaveAttribute("data-status", "ok");
  }
});
