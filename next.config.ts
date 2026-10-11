import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Image Docker produksi memakai output standalone (T-023).
  output: "standalone",
  // Paket Node murni yang tidak boleh di-bundle oleh webpack/turbopack.
  serverExternalPackages: ["pino", "@prisma/client", "ioredis", "nodemailer"],
  poweredByHeader: false,
  // Badge overlay dev Next menutupi sudut kiri bawah (tombol ciut sidebar) dan mencegat klik e2e.
  devIndicators: false,
};

export default nextConfig;
