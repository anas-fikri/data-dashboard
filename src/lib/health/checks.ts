import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { rendererClient, type RendererClient } from "@/features/exports/renderer-client";
import { prisma } from "@/lib/db";
import { findPlaceholderVars, parseEnv } from "@/lib/env";
import { mailer, mailerKey } from "@/lib/mail";
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

/** Renderer PDF (T-018): GET /healthz; mati → gagal (detail tanpa URL). */
export function rendererCheck(client: Pick<RendererClient, "health">): HealthCheck {
  return {
    name: "Renderer PDF",
    run: async () => {
      if (!(await client.health())) throw new Error("renderer tidak menjawab /healthz");
      return "renderer menjawab /healthz";
    },
  };
}

/**
 * Renderer ikut diperiksa hanya di produksi dengan RENDERER_URL terisi (T-023 AC: /health memuat
 * renderer). Di dev renderer sering sengaja tidak jalan (npm run renderer terpisah; e2e AC3 mematikannya),
 * jadi tidak membuat /health merah.
 */
export function rendererChecks(source: NodeJS.ProcessEnv = process.env): HealthCheck[] {
  if (source.NODE_ENV !== "production" || !source.RENDERER_URL) return [];
  return [
    rendererCheck(rendererClient({ url: source.RENDERER_URL, secret: source.RENDERER_SECRET })),
  ];
}

/**
 * Kebutuhan inti untuk melayani halaman: dipakai healthcheck container app (/api/health/core). SMTP dan
 * renderer PDF tidak ikut: gangguannya hanya mematikan email/ekspor PDF, bukan seluruh situs.
 */
export function coreChecks(): HealthCheck[] {
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
        // Bukan HeadBucket: service account produksi hanya boleh list dengan prefix aplikasi (T-023).
        await s3Internal().send(
          new ListObjectsV2Command({ Bucket: bucket(), Prefix: "guides/", MaxKeys: 1 }),
        );
        return `bucket ${bucket()} tersedia`;
      },
    },
  ];
}

/**
 * Verifikasi SMTP = login ke server email. Hasil (berhasil atau gagal) disimpan 5 menit per pengaturan:
 * /api/health yang sering dipanggil (deploy.sh tiap 3 dtk) tidak membanjiri server dengan login — login gagal
 * berulang bisa membuat akun/IP dikunci. Pengaturan berubah (Admin › Email) → diverifikasi ulang seketika.
 */
export const SMTP_VERIFY_TTL_MS = 5 * 60_000;
/** Galat selain login ditolak (jaringan, timeout, 421) tidak menambah login gagal: dicoba lagi lebih cepat. */
export const SMTP_RETRY_MS = 30_000;
const smtpVerify = globalThis as unknown as {
  smtpVerify?: { key: string; at: number; ttl: number; result: Promise<string | null> };
};

export function verifySmtpCached(now = Date.now()): Promise<string> {
  const key = mailerKey();
  const hit = smtpVerify.smtpVerify;
  if (!hit || hit.key !== key || now - hit.at >= hit.ttl) {
    const entry = {
      key,
      at: now,
      ttl: SMTP_VERIFY_TTL_MS,
      result: Promise.resolve<string | null>(null),
    };
    entry.result = mailer()
      .verify()
      .then(
        () => null,
        (e: unknown) => {
          if ((e as { code?: string }).code !== "EAUTH") entry.ttl = SMTP_RETRY_MS;
          return e instanceof Error ? e.message : String(e);
        },
      );
    smtpVerify.smtpVerify = entry;
  }
  return smtpVerify.smtpVerify!.result.then((err) => {
    if (err) throw new Error(err);
    return "koneksi SMTP terverifikasi";
  });
}

/** Semua layanan termasuk SMTP + renderer. Dipakai /health, /api/health, dan deploy.sh. */
export function infraChecks(): HealthCheck[] {
  return [
    ...coreChecks(),
    {
      name: "SMTP",
      run: () => verifySmtpCached(),
    },
    ...rendererChecks(),
  ];
}
