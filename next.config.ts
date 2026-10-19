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
    // Klien SFTP tes koneksi NAS (T-y8qq); binding native opsional dimuat saat runtime bila ada.
    "ssh2",
    // Binding native DuckDB (mesin query T-009) dipilih per platform saat runtime.
    "@duckdb/node-api",
    "@duckdb/node-bindings",
  ],
  poweredByHeader: false,
  // Build produksi di VM kecil (T-023): bawaan Next memakai semua CPU host untuk pekerja build (47 di
  // olympus 2 vCPU) sehingga halaman melewati batas 60 dtk; pekerja dibatasi NEXT_BUILD_CPUS (Dockerfile)
  // dan batas waktu per halaman dinaikkan.
  staticPageGenerationTimeout: 180,
  experimental: {
    ...(process.env.NEXT_BUILD_CPUS ? { cpus: Number(process.env.NEXT_BUILD_CPUS) } : {}),
    // proxy.ts mencakup /api/*: Next menyalin body permintaan ke memori sampai batas ini (default
    // 10 MB) sebelum Route Handler membacanya. Body JSON aplikasi ≤ 65 KB, Server Action ≤ 1 MB
    // (bawaan), poster PNG video panduan ≤ 2 MB (T-021); unggahan file (data, video) langsung ke S3
    // lewat presigned URL, tidak lewat aplikasi.
    // Body di atas batas ini dipotong diam-diam (hanya peringatan di log, bukan 413), jadi
    // serverActions.bodySizeLimit dan batas body Route Handler harus tetap ≤ nilai ini. Proxy tetap
    // menunggu seluruh body tiba; yang dibatasi memori, bukan durasi (durasi: requestTimeout Node dan
    // client_max_body_size reverse proxy, T-023).
    proxyClientMaxBodySize: "3mb",
  },
  // Badge overlay dev Next menutupi sudut kiri bawah (tombol ciut sidebar) dan mencegat klik e2e.
  devIndicators: false,
  // Token render sekali pakai ada di path /render/<token>: logger permintaan dev Next tidak boleh
  // mencetaknya (T-018 D15; produksi tidak mencatat permintaan, proxy akses log diredaksi di T-023).
  logging: { incomingRequests: { ignore: [/^\/render\//] } },
  // Server Action: Next menolak Origin yang tidak cocok dengan Host/X-Forwarded-Host. Tidak memakai
  // experimental.serverActions.allowedOrigins karena nilainya dibekukan saat build dari .env mana
  // pun (review T-027 #1); reverse proxy (T-023) wajib meneruskan Host atau X-Forwarded-Host asli.
  // Header keamanan statis untuk semua respons; CSP ber-nonce dipasang per permintaan di proxy.
  async headers() {
    return [{ source: "/:path*", headers: staticSecurityHeaders() }];
  },
};

export default nextConfig;
