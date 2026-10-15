import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SESSION_MAX_AGE_SEC, signSession } from "@/features/auth/jwt";
import {
  buildCsp,
  generateNonce,
  routeSecurityHeaders,
  sessionCookieSpec,
  staticSecurityHeaders,
} from "@/lib/security-headers";
import { proxy } from "@/proxy";

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

describe("routeSecurityHeaders (penimpaan per rute oleh proxy)", () => {
  it("unduh ekspor: Referrer-Policy no-referrer; rute lain tanpa penimpaan", () => {
    expect(routeSecurityHeaders("/api/exports/abc123/download")).toEqual([
      { key: "Referrer-Policy", value: "no-referrer" },
    ]);
    expect(routeSecurityHeaders("/api/exports/abc123/download/")).toHaveLength(1);
    for (const path of [
      "/api/exports",
      "/api/exports/abc123",
      "/api/exports/a/b/download",
      "/api/exports/abc123/downloadx",
      "/dashboards/abc123",
    ]) {
      expect(routeSecurityHeaders(path), path).toEqual([]);
    }
  });

  // Next hanya menambahkan header Route Handler yang belum ada, jadi Referrer-Policy route unduh
  // kalah dari next.config headers() (strict-origin-when-cross-origin); header proxy yang menang.
  describe("proxy", () => {
    const SECRET = "rahasia-uji-proxy-yang-cukup-panjang-123456";
    const saved = { AUTH_SECRET: process.env.AUTH_SECRET, APP_URL: process.env.APP_URL };
    beforeEach(() => {
      process.env.AUTH_SECRET = SECRET;
      process.env.APP_URL = "http://localhost:3100";
    });
    afterEach(() => {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    });
    const request = async (path: string) => {
      const token = await signSession({ sub: "u1", sv: 0 }, [SECRET]);
      return new NextRequest(`http://localhost:3100${path}`, {
        headers: { cookie: `dd.session=${token}` },
      });
    };

    it("unduh ekspor bersesi → no-referrer; status ekspor → tidak ditimpa", async () => {
      const download = await proxy(await request("/api/exports/abc123/download"));
      expect(download.headers.get("referrer-policy")).toBe("no-referrer");
      expect(download.headers.get("content-security-policy")).toContain("default-src 'self'");
      const status = await proxy(await request("/api/exports/abc123"));
      expect(status.headers.get("referrer-policy")).toBeNull();
    });
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
