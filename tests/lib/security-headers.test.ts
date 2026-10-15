import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SESSION_MAX_AGE_SEC, signSession } from "@/features/auth/jwt";
import {
  buildCsp,
  buildRenderCsp,
  generateNonce,
  isRenderPath,
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

describe("CSP halaman render PDF (T-018 D14)", () => {
  it("produksi: tanpa upgrade-insecure-requests (renderer memakai http internal), tanpa origin storage, form-action 'none'", () => {
    const csp = buildRenderCsp("abc123");
    expect(csp).not.toContain("upgrade-insecure-requests");
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("connect-src 'self';");
    expect(csp).toContain("img-src 'self' data: blob:;");
    expect(csp).toContain("form-action 'none'");
    expect(csp).not.toContain("form-action 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("default-src 'self'");
  });

  it("dev: eval + websocket HMR tetap ada", () => {
    const csp = buildRenderCsp("n", true);
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("ws:");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });

  it("CSP biasa tidak berubah: upgrade-insecure-requests + form-action 'self' di produksi", () => {
    const csp = buildCsp({ nonce: "n" });
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).toContain("form-action 'self'");
  });

  it("isRenderPath: /render dan /render/* saja", () => {
    for (const p of ["/render", "/render/", `/render/${"a".repeat(43)}`]) {
      expect(isRenderPath(p), p).toBe(true);
    }
    for (const p of ["/renderx", "/api/render", "/dashboards/render", "/rendering/x", "/"]) {
      expect(isRenderPath(p), p).toBe(false);
    }
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

  it("/render dan /render/<token>: no-referrer + noindex + no-store", () => {
    const expected = [
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Robots-Tag", value: "noindex" },
      { key: "Cache-Control", value: "no-store" },
    ];
    expect(routeSecurityHeaders("/render")).toEqual(expected);
    expect(routeSecurityHeaders(`/render/${"a".repeat(43)}`)).toEqual(expected);
    expect(routeSecurityHeaders("/renderx")).toEqual([]);
  });

  // Next hanya menambahkan header Route Handler yang belum ada, jadi Referrer-Policy route unduh
  // kalah dari next.config headers() (strict-origin-when-cross-origin); header proxy yang menang.
  describe("proxy", () => {
    const SECRET = "x".repeat(32); // nilai uji (pola sama dengan env.test.ts)
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

    it("/render/<token> tanpa sesi: publik (bukan redirect login), CSP render, path token tidak diteruskan", async () => {
      const saved = process.env.S3_PUBLIC_ENDPOINT;
      process.env.S3_PUBLIC_ENDPOINT = "https://storage.pcpexpress.com";
      try {
        const token = "a".repeat(43);
        for (const path of [`/render/${token}`, "/render"]) {
          const res = await proxy(new NextRequest(`http://web:3000${path}`));
          expect(res.status, path).toBe(200);
          expect(res.headers.get("location")).toBeNull();
          const csp = res.headers.get("content-security-policy") ?? "";
          expect(csp).not.toContain("upgrade-insecure-requests");
          expect(csp).not.toContain("storage.pcpexpress.com");
          expect(csp).toContain("form-action 'none'");
          expect(res.headers.get("referrer-policy")).toBe("no-referrer");
          expect(res.headers.get("x-robots-tag")).toBe("noindex");
          expect(res.headers.get("cache-control")).toBe("no-store");
          // Header permintaan yang diteruskan (x-middleware-request-*) tidak memuat token.
          expect(res.headers.get("x-middleware-request-x-current-path")).toBe("/render");
          for (const [, v] of res.headers) expect(v).not.toContain(token);
        }
        // Rute lain tetap memakai CSP biasa dan gerbang sesi.
        const other = await proxy(new NextRequest("http://web:3000/renderx"));
        expect(other.status).toBe(307);
      } finally {
        if (saved === undefined) delete process.env.S3_PUBLIC_ENDPOINT;
        else process.env.S3_PUBLIC_ENDPOINT = saved;
      }
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
