import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db";
import { findPlaceholderVars, parseEnv } from "@/lib/env";
import { mailer } from "@/lib/mail";
import { redisReady } from "@/lib/redis";
import { bucket, s3Internal } from "@/lib/storage/s3";
import type { HealthCheck } from "@/lib/health";

/** Pemeriksaan konfigurasi: env lengkap dan tidak ada nilai placeholder. Terpisah agar mudah diuji. */
export function configCheck(source: NodeJS.ProcessEnv = process.env): HealthCheck {
  return {
    name: "Konfigurasi",
    run: async () => {
      parseEnv(source); // melempar jika env tidak lengkap/tidak valid
      const placeholders = findPlaceholderVars(source);
      if (placeholders.length > 0) {
        throw new Error(
          `masih memakai nilai placeholder: ${placeholders.join(", ")} (jalankan npm run secrets:dev)`,
        );
      }
      return "env lengkap, tidak ada placeholder";
    },
  };
}

/** Pemeriksaan nyata terhadap layanan infrastruktur. Dipakai /health dan /api/health. */
export function infraChecks(): HealthCheck[] {
  return [
    configCheck(),
    {
      name: "PostgreSQL",
      run: async () => {
        await prisma.$queryRaw`SELECT 1`;
        return "SELECT 1 berhasil";
      },
    },
    {
      name: "Redis",
      run: async () => {
        const r = await redisReady();
        const pong = await r.ping();
        return `PING → ${pong}`;
      },
    },
    {
      name: "Object storage",
      run: async () => {
        await s3Internal().send(new HeadBucketCommand({ Bucket: bucket() }));
        return `bucket ${bucket()} tersedia`;
      },
    },
    {
      name: "SMTP",
      run: async () => {
        await mailer().verify();
        return "koneksi SMTP terverifikasi";
      },
    },
  ];
}
