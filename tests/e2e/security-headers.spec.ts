import { expect, test, type Page } from "@playwright/test";
import { apiLogin, registerAndVerify, uniqueEmail } from "./helpers";

/* T-027: header keamanan, CSP ber-nonce tanpa pelanggaran, Server Action menolak Origin asing. */

function trackCspViolations(page: Page): string[] {
  const violations: string[] = [];
  page.on("console", (m) => {
    const t = m.text();
    if (/Content Security Policy|Refused to (execute|load|apply)/i.test(t)) violations.push(t);
  });
  return violations;
}

test.describe("security headers", () => {
  for (const path of ["/login", "/register", "/lupa-password", "/health"]) {
    test(`${path}: CSP ber-nonce + header statis`, async ({ request }) => {
      const res = await request.get(path);
      const h = res.headers();
      const csp = h["content-security-policy"] ?? "";
      expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("base-uri 'self'");
      expect(h["x-content-type-options"]).toBe("nosniff");
      expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      expect(h["x-frame-options"]).toBe("DENY");
      expect(h["x-powered-by"]).toBeUndefined();
    });
  }

  test("nonce berbeda di tiap permintaan", async ({ request }) => {
    const a = (await request.get("/login")).headers()["content-security-policy"];
    const b = (await request.get("/login")).headers()["content-security-policy"];
    expect(a).not.toBe(b);
  });

  test("tidak ada pelanggaran CSP di halaman auth dan shell (termasuk ganti tema)", async ({
    page,
    request,
    browser,
  }) => {
    const violations = trackCspViolations(page);
    await page.goto("/login");
    await page.getByTestId("theme-toggle").click();
    await page.goto("/register");

    const email = uniqueEmail("csp");
    const setup = await browser.newPage();
    await registerAndVerify(setup, request, email);
    await setup.close();
    await apiLogin(page, email);
    await page.goto("/");
    await page.getByTestId("account-menu-trigger").click();
    await page.keyboard.press("Escape");
    await page.goto("/akun/keamanan");
    expect(violations, violations.join("\n")).toEqual([]);
  });

  test("Server Action dengan Origin asing ditolak", async ({ page, request }) => {
    // Tangkap permintaan Server Action asli (header Next-Action), lalu kirim ulang dengan Origin
    // asing. (Intersepsi route Chromium tidak bisa menimpa header Origin.)
    let captured: { url: string; headers: Record<string, string>; body: string } | null = null;
    page.on("request", (r) => {
      if (r.method() === "POST" && r.headers()["next-action"] && !captured) {
        captured = { url: r.url(), headers: r.headers(), body: r.postData() ?? "" };
      }
    });
    await page.goto("/login");
    await page.getByLabel("Email perusahaan").fill("siapa@pcpexpress.com");
    await page.locator("input[name=password]").fill("dummy-password-uji-1234");
    await page.getByRole("button", { name: "Masuk" }).click();
    await expect.poll(() => captured !== null).toBe(true);
    const req = captured!;

    const same = await request.fetch(req.url, {
      method: "POST",
      headers: req.headers,
      data: req.body,
    });
    expect(same.status()).toBe(200);
    const evil = await request.fetch(req.url, {
      method: "POST",
      headers: { ...req.headers, origin: "https://evil.example" },
      data: req.body,
    });
    expect(evil.status()).toBeGreaterThanOrEqual(400);
    expect(await evil.text()).toContain("Invalid Server Actions request");
  });
});
