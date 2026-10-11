import { describe, expect, it } from "vitest";
import { SESSION_MAX_AGE_SEC } from "@/features/auth/jwt";
import {
  buildCsp,
  generateNonce,
  sessionCookieSpec,
  staticSecurityHeaders,
} from "@/lib/security-headers";

describe("buildCsp", () => {
  it("produksi: nonce + strict-dynamic, tanpa unsafe-eval, dengan origin storage", () => {
    const csp = buildCsp({ nonce: "abc123", storageUrl: "https://storage.pcpexpress.com/x" });
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("connect-src 'self' https://storage.pcpexpress.com");
    expect(csp).toContain("img-src 'self' data: blob: https://storage.pcpexpress.com");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("dev: unsafe-eval dan websocket HMR diizinkan, tanpa upgrade-insecure-requests", () => {
    const csp = buildCsp({ nonce: "n", dev: true });
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("ws:");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });

  it("URL storage tidak valid diabaikan", () => {
    expect(buildCsp({ nonce: "n", storageUrl: "bukan url" })).toContain("connect-src 'self'");
  });
});

describe("generateNonce", () => {
  it("acak dan berbentuk base64 128-bit", () => {
    const a = generateNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(generateNonce()).not.toBe(a);
  });
});

describe("staticSecurityHeaders", () => {
  it("memuat header dasar; HSTS tidak di sini (dipasang proxy saat runtime)", () => {
    const keys = staticSecurityHeaders().map((h) => h.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "X-Content-Type-Options",
        "Referrer-Policy",
        "X-Frame-Options",
        "Permissions-Policy",
      ]),
    );
    expect(keys).not.toContain("Strict-Transport-Security");
  });
});

describe("sessionCookieSpec", () => {
  it("https: __Secure-, HttpOnly, SameSite=Lax, Secure, maxAge ≤ 12 jam", () => {
    const spec = sessionCookieSpec("https://dashboard.pcpexpress.com", SESSION_MAX_AGE_SEC);
    expect(spec.name).toBe("__Secure-dd.session");
    expect(spec.options).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
    });
    expect(spec.options.maxAge).toBeLessThanOrEqual(12 * 60 * 60);
  });

  it("http (dev): nama polos tanpa Secure", () => {
    const spec = sessionCookieSpec("http://localhost:3100", SESSION_MAX_AGE_SEC);
    expect(spec.name).toBe("dd.session");
    expect(spec.options.secure).toBe(false);
  });
});
