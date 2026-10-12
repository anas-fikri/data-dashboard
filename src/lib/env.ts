import { z } from "zod";

/**
 * Nilai yang dipakai .env.example. Jika salah satu masih terpakai di runtime,
 * konfigurasi dianggap belum aman: /health merah, dan di produksi aplikasi menolak start.
 */
export const PLACEHOLDER_MARKERS = [
  "change-me",
  "minioadmin",
  "rustfsadmin",
  "postgres:postgres@",
] as const;

const SENSITIVE_VARS = [
  "DATABASE_URL",
  "REDIS_URL",
  "S3_ACCESS_KEY",
  "S3_SECRET_KEY",
  "AUTH_SECRET",
] as const;

const booleanFromString = z
  .enum(["true", "false"])
  .default("false")
  .transform((v) => v === "true");

const redisUrlWithPassword = z
  .string()
  .url()
  .refine(
    (v) => {
      try {
        return new URL(v).password.length > 0;
      } catch {
        return false;
      }
    },
    { message: "REDIS_URL wajib memuat password (redis://:password@host:port/db)" },
  );

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).optional(),
  APP_URL: z.string().url(),
  APP_HOST: z.string().min(1),
  TRUST_PROXY: booleanFromString,

  DATABASE_URL: z.string().url(),
  REDIS_URL: redisUrlWithPassword,

  S3_ENDPOINT: z.string().url(),
  S3_PUBLIC_ENDPOINT: z.string().url(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(8),

  SMTP_URL: z.string().url(),
  MAIL_FROM: z.string().min(1),

  /** Minimal 32 karakter (256 bit). Rotasi: nilai dipisah koma, yang pertama dipakai menandatangani. */
  AUTH_SECRET: z
    .string()
    .transform((v) =>
      v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    )
    .refine((arr) => arr.length > 0 && arr.every((s) => s.length >= 32), {
      message: "AUTH_SECRET wajib ≥ 32 karakter (boleh beberapa, dipisah koma, untuk rotasi)",
    }),
  ALLOWED_EMAIL_DOMAINS: z
    .string()
    .transform((v) =>
      v
        .split(",")
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean),
    )
    .refine((arr) => arr.length > 0 && arr.every((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)), {
      message: "ALLOWED_EMAIL_DOMAINS wajib berisi ≥ 1 domain valid, dipisah koma",
    }),
  MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(1024 * 1024 * 1024),
  /** Kuota storage per pengguna (ukuran versi non-FAILED, termasuk ukuran terdeklarasi UPLOADING). */
  USER_STORAGE_QUOTA_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(20 * 1024 * 1024 * 1024),

  SEED_ADMIN_EMAIL: z.string().email().optional(),
  /** Direktori kerja worker ingest (unduhan sumber + spill + DuckDB); butuh ± ukuran upload + 8 GiB. */
  WORKER_TMP_DIR: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/** Nama variabel sensitif yang masih memakai nilai placeholder dari .env.example (tidak peka kapital). */
export function findPlaceholderVars(source: NodeJS.ProcessEnv): string[] {
  return SENSITIVE_VARS.filter((name) => {
    const value = (source[name] ?? "").toLowerCase();
    return PLACEHOLDER_MARKERS.some((marker) => value.includes(marker));
  });
}

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Konfigurasi env tidak valid: ${missing}`);
  }
  if (parsed.data.NODE_ENV === "production") {
    const placeholders = findPlaceholderVars(source);
    if (placeholders.length > 0) {
      throw new Error(
        `Menolak start produksi: nilai placeholder masih dipakai di ${placeholders.join(", ")}`,
      );
    }
    // Tanpa proxy tepercaya semua klien berbagi satu bucket rate limit (siapa pun bisa
    // mengunci login seluruh perusahaan) — review T-002 #5.
    if (!parsed.data.TRUST_PROXY) {
      throw new Error("Menolak start produksi: TRUST_PROXY wajib true (di balik reverse proxy)");
    }
    // Cookie sesi wajib Secure + prefix __Secure- — review T-002 #13.
    if (!parsed.data.APP_URL.startsWith("https://")) {
      throw new Error("Menolak start produksi: APP_URL wajib https://");
    }
  }
  return parsed.data;
}

let cached: Env | undefined;

/** Env tervalidasi, dievaluasi sekali per proses. */
export function env(): Env {
  if (!cached) cached = parseEnv(process.env);
  return cached;
}
