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
  "RENDERER_SECRET",
] as const;

/**
 * TLD yang seluruhnya ada di daftar HSTS preload Chromium (mis. .app, .dev): http://app:3100 atau
 * http://x.dev selalu dipaksa https oleh Chromium dan gagal ERR_SSL_PROTOCOL_ERROR (probe T-018). Nama
 * host internal renderer → app tidak boleh berakhiran label ini bila memakai http.
 */
export const HSTS_PRELOADED_TLDS = [
  "android",
  "app",
  "bank",
  "boo",
  "channel",
  "chrome",
  "dad",
  "day",
  "dev",
  "eat",
  "esq",
  "fly",
  "foo",
  "gle",
  "google",
  "how",
  "ing",
  "insurance",
  "meme",
  "mov",
  "new",
  "nexus",
  "page",
  "phd",
  "prof",
  "rsvp",
  "soy",
  "youtube",
  "zip",
] as const;

/** URL http dengan host berakhiran TLD HSTS preload (selalu gagal dibuka Chromium lewat http). */
export function isHstsPreloadedHttp(url: string): boolean {
  try {
    const u = new URL(url);
    const last = u.hostname.toLowerCase().replace(/\.$/, "").split(".").pop() ?? "";
    return u.protocol === "http:" && (HSTS_PRELOADED_TLDS as readonly string[]).includes(last);
  } catch {
    return false;
  }
}

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

  // --- Query (T-009) ---
  /** Direktori cache typed.parquet lokal + temp DuckDB aplikasi (per replika). */
  QUERY_CACHE_DIR: z.string().optional(),
  /** Volume bersama service backup: offsite.json (Admin › Backup) + status.json (T-7psf). */
  BACKUP_CONFIG_DIR: z.string().optional(),
  /** Batas total cache typed.parquet lokal (LRU). */
  MAX_LOCAL_PARQUET_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 1024 * 1024 * 1024),
  /** Query DuckDB bersamaan per proses aplikasi. */
  MAX_QUERY_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(4),
  QUERY_MEMORY_LIMIT: z
    .string()
    .regex(/^\d+(\.\d+)?\s*(MB|GB|MiB|GiB)$/i)
    .default("1GB"),
  /**
   * Cache hasil query di memori proses aplikasi (LRU berbatas byte, TTL 24 jam). Byte = perkiraan heap
   * (rowBytes); dibatasi 512 MiB agar salah ketik tidak menghabiskan memori proses (review T-009 N1).
   */
  QUERY_RESULT_CACHE_BYTES: z.coerce
    .number()
    .int()
    .min(0)
    .max(512 * 1024 * 1024)
    .default(64 * 1024 * 1024),
  /** Batas waktu satu query; lewat → interrupt + QUERY_TIMEOUT. */
  QUERY_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(300_000).default(30_000),

  // --- Ekspor widget (T-017) ---
  /** Batas baris hasil ekspor CSV/XLSX; lebih → EXPORT_TOO_LARGE (XLSX maksimal 1.048.575 baris data). */
  EXPORT_MAX_ROWS: z.coerce.number().int().min(1).max(1_048_575).default(1_000_000),
  /** Umur tautan unduh ekspor sejak selesai; setelahnya objek dihapus job pembersihan. */
  EXPORT_TTL_MS: z.coerce
    .number()
    .int()
    .min(60_000)
    .max(24 * 60 * 60 * 1000)
    .default(60 * 60 * 1000),
  /**
   * memory_limit DuckDB job ekspor. 768MB: sort penuh tabel lebar 1 juta baris (±16–20 kolom teks unik)
   * lewat COPY (CSV langsung, XLSX lewat parquet kerja) gagal OOM di 512MB tetapi selesai di 768MB
   * (review T-017 INT-R2-1, INT-R3-1); memori gabungan worker (ingest + recast + ekspor) diukur di T-024.
   */
  /**
   * Thread DuckDB per job ingest (T-024). Ingest 1 GB di VM 8 vCPU dua pertiga waktunya jenuh CPU pada
   * 2 thread; worker × thread sebaiknya ≤ vCPU − 2 (app + layanan lain).
   */
  INGEST_DUCKDB_THREADS: z.coerce.number().int().min(1).max(16).default(2),
  /**
   * Worker thread pembaca sheet xlsx per job ingest (T-de1b): file dengan ≥ 2 sheet besar di-parse
   * paralel, penulisan DuckDB tetap satu koneksi (memory_limit sama). 1 = berurutan seperti sebelumnya.
   * Anggaran CPU: WORKER_REPLICAS × (1 + nilai ini) sebaiknya ≤ vCPU − 2 (thread utama job + pembaca
   * sheet). Maksimal 4: di atas itu thread utama (penulis DuckDB) yang membatasi, heap ≤ 4 × 256 MB.
   */
  INGEST_XLSX_SHEET_THREADS: z.coerce.number().int().min(1).max(4).default(2),
  EXPORT_DUCKDB_MEMORY: z
    .string()
    .regex(/^\d+(\.\d+)?\s*(MB|GB|MiB|GiB)$/i)
    .default("768MB"),
  /** Batas waktu satu job ekspor di worker (unduh parquet + DuckDB + tulis + unggah). */
  EXPORT_DEADLINE_MS: z.coerce
    .number()
    .int()
    .min(10_000)
    .max(60 * 60 * 1000)
    .default(10 * 60 * 1000),

  // --- PDF dashboard lewat renderer (T-018) ---
  /**
   * URL internal app yang dibuka renderer (http://<host internal>:<port>). Di app hanya menentukan
   * atribut Secure cookie render (Secure hanya bila https). Host http tidak boleh ber-TLD HSTS preload
   * (mis. "app", "dev"): Chromium memaksanya https lalu gagal.
   */
  APP_INTERNAL_URL: z
    .string()
    .url()
    .refine((v) => !isHstsPreloadedHttp(v), {
      message:
        "APP_INTERNAL_URL: host http ber-TLD HSTS preload (mis. app, dev) selalu dipaksa https oleh Chromium; pakai nama lain (mis. web, dashboard)",
    })
    .optional(),
  /** Renderer PDF (worker + cek kesehatan app). Kosong → ekspor PDF dijawab RENDERER_UNAVAILABLE. */
  RENDERER_URL: z.string().url().optional(),
  /** Header x-renderer-secret ke renderer; ≥ 32 karakter, wajib bersama RENDERER_URL. */
  RENDERER_SECRET: z.string().min(32).optional(),
  /** Batas waktu satu permintaan render (POST /render sampai PDF selesai dibaca). */
  RENDER_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(300_000).default(60_000),
  /** Ukuran PDF maksimum yang diterima dari renderer; lebih → EXPORT_TOO_LARGE. */
  PDF_MAX_BYTES: z.coerce
    .number()
    .int()
    .min(1024 * 1024)
    .max(200 * 1024 * 1024)
    .default(25 * 1024 * 1024),
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
  // Renderer opsional, tapi URL tanpa secret (atau sebaliknya) pasti salah konfigurasi.
  if (!parsed.data.RENDERER_URL !== !parsed.data.RENDERER_SECRET) {
    throw new Error(
      "Konfigurasi env tidak valid: RENDERER_URL dan RENDERER_SECRET wajib diisi bersama (atau keduanya kosong)",
    );
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
