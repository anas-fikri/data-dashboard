import type { NextConfig } from "next";
import { staticSecurityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  // Image Docker produksi memakai output standalone (T-023).
  output: "standalone",
  // Paket Node murni yang tidak boleh di-bundle oleh webpack/turbopack.
  serverExternalPackages: [
    "pino",
    "@prisma/client",
    "ioredis",
    "nodemailer",
    "@node-rs/argon2",
    // Binding native DuckDB (mesin query T-009) dipilih per platform saat runtime.
    "@duckdb/node-api",
    "@duckdb/node-bindings",
  ],
  poweredByHeader: false,
  experimental: {
    // proxy.ts mencakup /api/*: Next menyalin body permintaan ke memori sampai batas ini (default
    // 10 MB) sebelum Route Handler membacanya. Body JSON aplikasi ≤ 65 KB dan Server Action ≤ 1 MB
    // (bawaan); unggahan file langsung ke S3 lewat presigned URL, tidak lewat aplikasi.
    proxyClientMaxBodySize: "1mb",
  },
  // Badge overlay dev Next menutupi sudut kiri bawah (tombol ciut sidebar) dan mencegat klik e2e.
  devIndicators: false,
  // Server Action: Next menolak Origin yang tidak cocok dengan Host/X-Forwarded-Host. Tidak memakai
  // experimental.serverActions.allowedOrigins karena nilainya dibekukan saat build dari .env mana
  // pun (review T-027 #1); reverse proxy (T-023) wajib meneruskan Host atau X-Forwarded-Host asli.
  // Header keamanan statis untuk semua respons; CSP ber-nonce dipasang per permintaan di proxy.
  async headers() {
    return [{ source: "/:path*", headers: staticSecurityHeaders() }];
  },
};

export default nextConfig;
