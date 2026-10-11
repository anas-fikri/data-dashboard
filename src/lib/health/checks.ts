import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db";
import { env, findPlaceholderVars } from "@/lib/env";
import { mailer } from "@/lib/mail";
import { redis } from "@/lib/redis";
import { bucket, s3Internal } from "@/lib/storage/s3";
import type { HealthCheck } from "@/lib/health";

/** Pemeriksaan nyata terhadap layanan infrastruktur. Dipakai /health dan /api/health. */
export function infraChecks(): HealthCheck[] {
  return [
    {
      name: "Konfigurasi",
      run: async () => {
        env(); // melempar jika env tidak lengkap
        const placeholders = findPlaceholderVars(process.env);
        if (placeholders.length > 0) {
          throw new Error(
            `masih memakai nilai placeholder: ${placeholders.join(", ")} (jalankan npm run secrets:dev)`,
          );
        }
        return "env lengkap, tidak ada placeholder";
      },
    },
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
        const r = redis();
        if (r.status === "wait") await r.connect();
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
