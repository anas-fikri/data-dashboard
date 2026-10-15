/*
 * Header keamanan (T-027). Fungsi murni agar bisa diuji unit dan dipakai dari proxy (edge)
 * maupun next.config (build). Tidak mengimpor modul server-only.
 */

/** Origin dari URL (mis. "http://localhost:9100"); null bila tidak valid. */
function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export interface CspOptions {
  nonce: string;
  /** Origin object storage publik (presigned PUT/GET, video panduan). */
  storageUrl?: string;
  /** React dev butuh eval; jangan pernah aktif di produksi. */
  dev?: boolean;
}

/**
 * CSP ber-nonce dengan 'strict-dynamic': hanya script yang diberi nonce (framework Next dan
 * script turunannya) yang boleh jalan. style-src 'unsafe-inline' disengaja: ECharts dan
 * react-grid-layout menulis style inline (risiko rendah dibanding script).
 */
export function buildCsp({ nonce, storageUrl, dev = false }: CspOptions): string {
  const storage = originOf(storageUrl);
  const extra = storage ? ` ${storage}` : "";
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${extra}`,
    `media-src 'self' blob:${extra}`,
    `connect-src 'self'${extra}${dev ? " ws: wss:" : ""}`,
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ];
  if (!dev) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

/** Nonce acak 128-bit, base64 (Web Crypto, tersedia di edge dan Node). */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/**
 * Header statis untuk semua respons (next.config headers(), dievaluasi saat BUILD).
 * HSTS sengaja tidak di sini: dipasang proxy saat runtime dari APP_URL produksi.
 */
export function staticSecurityHeaders(): { key: string; value: string }[] {
  const headers = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
  return headers;
}

/** Unduh ekspor (T-017): GET /api/exports/<id>/download → 302 ke URL presigned storage. */
const EXPORT_DOWNLOAD = /^\/api\/exports\/[^/]+\/download\/?$/;

/**
 * Header per rute yang MENIMPA header statis next.config, dipasang proxy saat runtime. Next hanya
 * menambahkan header Route Handler yang belum ada di respons (send-response.js), sehingga
 * Referrer-Policy dari route kalah dari staticSecurityHeaders(); header proxy diterapkan sesudah
 * headers() next.config dan menang. Unduh ekspor: tanpa Referer ke storage (kontrak T-017 E10).
 */
export function routeSecurityHeaders(pathname: string): { key: string; value: string }[] {
  return EXPORT_DOWNLOAD.test(pathname) ? [{ key: "Referrer-Policy", value: "no-referrer" }] : [];
}

/** Atribut cookie sesi sesuai skema URL aplikasi (dipakai session.ts dan diuji unit). */
export function sessionCookieSpec(appUrl: string, maxAgeSec: number) {
  const https = appUrl.startsWith("https://");
  return {
    name: https ? "__Secure-dd.session" : "dd.session",
    options: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: https,
      path: "/",
      maxAge: maxAgeSec,
    },
  };
}
