import { expect, test } from "@playwright/test";

// Butuh compose dev + .env dari `npm run secrets:dev` + migrate.
test("/health menampilkan semua layanan OK", async ({ page, request }) => {
  const api = await request.get("/api/health");
  expect(api.status(), "api/health harus 200 saat semua layanan hidup").toBe(200);

  await page.goto("/health");
  await expect(page).toHaveTitle("Kesehatan sistem · Data Dashboard");
  await expect(page.getByRole("heading", { level: 1, name: "Kesehatan sistem" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Semua layanan OK");
  for (const name of ["Konfigurasi", "PostgreSQL", "Redis", "Object storage", "SMTP"]) {
    const row = page.locator(`li[data-check="${name}"]`);
    await expect(row).toHaveAttribute("data-status", "ok");
    await expect(row).toContainText("OK");
  }
});
