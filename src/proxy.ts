import { NextResponse, type NextRequest } from "next/server";
import { verifySession } from "@/features/auth/jwt";
import { loginUrl } from "@/features/auth/redirect";

/*
 * Proxy (middleware Next 16): gerbang awal untuk rute terlindungi.
 * Hanya memeriksa keberadaan + tanda tangan + kedaluwarsa JWT (murah, tanpa DB).
 * Keputusan akhir (isActive, sessionVersion, isAdmin) ada di requireUser() Node-side (D1).
 * Juga meneruskan path saat ini lewat header agar requireUser() bisa menyusun ?next=.
 */

// Deny-by-default: hanya rute ini yang boleh tanpa sesi (rute /api/auth eksplisit, bukan prefix).
const PUBLIC_PREFIXES = [
  "/login",
  "/register",
  "/verify",
  "/lupa-password",
  "/reset-password",
  "/health",
  "/api/health",
  "/api/auth/login",
  // Dev/e2e saja; rute sendiri menolak di produksi dan tanpa E2E_ENDPOINTS=1.
  "/api/auth/dev-expire-reset",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function cookieName(): string {
  return (process.env.APP_URL ?? "").startsWith("https://") ? "__Secure-dd.session" : "dd.session";
}

function secrets(): string[] {
  return (process.env.AUTH_SECRET ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-current-path", pathname + search);

  if (isPublic(pathname)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const token = request.cookies.get(cookieName())?.value;
  const claims = token ? await verifySession(token, secrets()) : null;
  if (!claims) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ ok: false, code: "UNAUTHENTICATED" }, { status: 401 });
    }
    return NextResponse.redirect(new URL(loginUrl(pathname + search), request.url));
  }
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  // Semua rute kecuali aset statis dan file di /public.
  matcher: ["/((?!_next/static|_next/image|brand/|favicon.ico|robots.txt).*)"],
};
