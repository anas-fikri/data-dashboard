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
  // Server Action: Next menolak Origin yang tidak cocok dengan Host/X-Forwarded-Host. Tidak memakai
  // experimental.serverActions.allowedOrigins karena nilainya dibekukan saat build dari .env mana
  // pun (review T-027 #1); reverse proxy (T-023) wajib meneruskan Host atau X-Forwarded-Host asli.
  // Header keamanan statis untuk semua respons; CSP ber-nonce dipasang per permintaan di proxy.
  async headers() {
    return [{ source: "/:path*", headers: staticSecurityHeaders() }];
  },
};

export default nextConfig;
