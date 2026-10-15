import { NextResponse, type NextRequest } from "next/server";
import { verifySession } from "@/features/auth/jwt";
import { loginUrl } from "@/features/auth/redirect";
import {
  buildCsp,
  buildRenderCsp,
  generateNonce,
  isRenderPath,
  routeSecurityHeaders,
  sessionCookieSpec,
} from "@/lib/security-headers";

/*
 * Proxy (middleware Next 16):
 * 1. CSP ber-nonce per permintaan (T-027). Nonce diteruskan ke render lewat header permintaan
 *    `Content-Security-Policy` (Next memasangnya di script framework) dan `x-nonce`. Halaman render PDF
 *    /render dan /render/<token> (T-018) memakai CSP sendiri (tanpa upgrade-insecure-requests).
 * 2. Gerbang awal rute terlindungi: hanya memeriksa keberadaan + tanda tangan + kedaluwarsa JWT
 *    (murah, tanpa DB). Keputusan akhir (isActive, sessionVersion, isAdmin) ada di requireUser()
 *    Node-side (D1).
 * 3. Meneruskan path saat ini lewat header agar requireUser() bisa menyusun ?next=; untuk /render/*
 *    path tidak diteruskan (berisi token render).
 */

// Deny-by-default: hanya rute ini yang boleh tanpa sesi (rute /api/auth eksplisit, bukan prefix).
// /render: autentikasinya token render sekali pakai → cookie dd.render (T-018), bukan sesi user.
const PUBLIC_PREFIXES = [
  "/login",
  "/register",
  "/verify",
  "/lupa-password",
  "/reset-password",
  "/health",
  "/api/health",
  "/api/auth/login",
  "/render",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function secrets(): string[] {
  return (process.env.AUTH_SECRET ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function withCsp(response: NextResponse, csp: string): NextResponse {
  response.headers.set("Content-Security-Policy", csp);
  // HSTS dibaca saat runtime (bukan saat build seperti next.config headers()) agar mengikuti
  // APP_URL produksi; browser menyimpannya per host dari respons dokumen mana pun.
  if ((process.env.APP_URL ?? "").startsWith("https://")) {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const nonce = generateNonce();
  const dev = process.env.NODE_ENV === "development";
  const render = isRenderPath(pathname);
  const csp = render
    ? buildRenderCsp(nonce, dev)
    : buildCsp({ nonce, storageUrl: process.env.S3_PUBLIC_ENDPOINT, dev });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-current-path", render ? "/render" : pathname + search);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const next = () => {
    const res = withCsp(NextResponse.next({ request: { headers: requestHeaders } }), csp);
    // Header route dengan kunci sama kalah dari next.config headers(); penimpaan per rute di sini.
    for (const h of routeSecurityHeaders(pathname)) res.headers.set(h.key, h.value);
    return res;
  };

  if (isPublic(pathname)) return next();

  const cookie = sessionCookieSpec(process.env.APP_URL ?? "", 0).name;
  const token = request.cookies.get(cookie)?.value;
  const claims = token ? await verifySession(token, secrets()) : null;
  if (!claims) {
    if (pathname.startsWith("/api/")) {
      return withCsp(
        NextResponse.json({ ok: false, code: "UNAUTHENTICATED" }, { status: 401 }),
        csp,
      );
    }
    return withCsp(NextResponse.redirect(new URL(loginUrl(pathname + search), request.url)), csp);
  }
  return next();
}

export const config = {
  // Semua rute kecuali aset statis. Pengecualian path persis (bukan awalan string) agar rute baru
  // seperti /brandx atau /robots.txtfoo tidak lolos tanpa CSP dan gerbang sesi (review T-027 #2).
  matcher: ["/((?!_next/static/|_next/image(?:/|$)|brand/|favicon\\.ico$|robots\\.txt$).*)"],
};
