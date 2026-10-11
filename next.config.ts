import type { NextConfig } from "next";
import { staticSecurityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  // Image Docker produksi memakai output standalone (T-023).
  output: "standalone",
  // Paket Node murni yang tidak boleh di-bundle oleh webpack/turbopack.
  serverExternalPackages: ["pino", "@prisma/client", "ioredis", "nodemailer", "@node-rs/argon2"],
  poweredByHeader: false,
  // Badge overlay dev Next menutupi sudut kiri bawah (tombol ciut sidebar) dan mencegat klik e2e.
  devIndicators: false,
  experimental: {
    serverActions: {
      // Di balik reverse proxy, Server Action hanya diterima dari origin aplikasi (T-027).
      // Dievaluasi saat build: image produksi (T-023) wajib dibangun dengan APP_HOST produksi.
      // Tanpa itu Next tetap menolak Origin yang tidak cocok dengan x-forwarded-host/Host.
      allowedOrigins: process.env.APP_HOST ? [process.env.APP_HOST] : [],
    },
  },
  // Header keamanan statis untuk semua respons; CSP ber-nonce dipasang per permintaan di proxy.
  async headers() {
    return [{ source: "/:path*", headers: staticSecurityHeaders() }];
  },
};

export default nextConfig;
