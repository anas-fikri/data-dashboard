import { z } from "zod";

/**
 * Nilai yang dipakai .env.example. Jika salah satu masih terpakai di runtime,
 * konfigurasi dianggap belum aman (lihat /health dan T-001 AC).
 */
export const PLACEHOLDER_MARKERS = [
  "change-me",
  "minioadmin",
  "rustfsadmin",
  "postgres:postgres@",
] as const;

const booleanFromString = z
  .enum(["true", "false"])
  .default("false")
  .transform((v) => v === "true");

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url(),
  APP_HOST: z.string().min(1),
  TRUST_PROXY: booleanFromString,

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  S3_ENDPOINT: z.string().url(),
  S3_PUBLIC_ENDPOINT: z.string().url(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),

  SMTP_URL: z.string().min(1),
  MAIL_FROM: z.string().min(1),

  AUTH_SECRET: z.string().min(1),
  ALLOWED_EMAIL_DOMAINS: z
    .string()
    .min(1)
    .transform((v) =>
      v
        .split(",")
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean),
    ),
  MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(1024 * 1024 * 1024),

  SEED_ADMIN_EMAIL: z.string().email().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Konfigurasi env tidak valid: ${missing}`);
  }
  return parsed.data;
}

/** Nama variabel yang masih memakai nilai placeholder dari .env.example. */
export function findPlaceholderVars(source: NodeJS.ProcessEnv): string[] {
  const sensitive = [
    "DATABASE_URL",
    "REDIS_URL",
    "S3_ACCESS_KEY",
    "S3_SECRET_KEY",
    "AUTH_SECRET",
  ] as const;
  return sensitive.filter((name) => {
    const value = source[name] ?? "";
    return PLACEHOLDER_MARKERS.some((marker) => value.includes(marker));
  });
}

let cached: Env | undefined;

/** Env tervalidasi, dievaluasi sekali per proses. */
export function env(): Env {
  if (!cached) cached = parseEnv(process.env);
  return cached;
}
