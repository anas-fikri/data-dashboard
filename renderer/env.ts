/*
 * Env renderer PDF (T-018 D11). Sengaja TIDAK memakai src/lib/env.ts: skema app mewajibkan secret
 * DB/S3/SMTP, sedangkan renderer hanya butuh secret pemanggil dan origin internal app (least privilege).
 */
import { z } from "zod";

/**
 * Label terakhir host yang ada di daftar HSTS preload bawaan Chromium (TLD dipreload beserta subdomain).
 * http://<label>:port dipaksa ke https lalu gagal ERR_SSL_PROTOCOL_ERROR, jadi render via http internal
 * tidak akan pernah jalan. Diverifikasi 2026-10-16 terhadap Chromium 156.0.8078.4 (playwright-core
 * 1.64.0, revisi 1248) dengan --host-resolver-rules; nama seperti web, dashboard, renderer, prod, docs,
 * mail, api, postgres lolos. Daftar ini tidak lengkap (TLD merek lain bisa ikut dipreload): pilih nama
 * service internal yang jelas bukan TLD, mis. "dashboard-web".
 */
export const HSTS_PRELOADED_LABELS: ReadonlySet<string> = new Set([
  "amazon",
  "android",
  "app",
  "azure",
  "bank",
  "bing",
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
  "gmail",
  "google",
  "hangout",
  "hotmail",
  "ing",
  "insurance",
  "meet",
  "meme",
  "microsoft",
  "mov",
  "new",
  "nexus",
  "office",
  "page",
  "phd",
  "play",
  "prof",
  "rsvp",
  "search",
  "skype",
  "windows",
  "xbox",
  "youtube",
  "zip",
]);

/** true bila Chromium memaksa host ini ke https (label terakhirnya TLD yang dipreload HSTS). */
export function isHstsPreloadedHost(hostname: string): boolean {
  const labels = hostname.toLowerCase().replace(/\.$/, "").split(".");
  return HSTS_PRELOADED_LABELS.has(labels[labels.length - 1] ?? "");
}

/** Penanda nilai placeholder .env.example (disalin dari src/lib/env.ts, tidak diimpor). */
const PLACEHOLDER_MARKER = "change-me";

const booleanFromString = z
  .enum(["true", "false"])
  .default("false")
  .transform((v) => v === "true");

/** Origin app (tanpa path/kredensial/query); renderer hanya membuka <origin>/render/<token>. */
const appInternalUrl = z
  .string()
  .url()
  .superRefine((value, ctx) => {
    // zod 3 tetap menjalankan refine setelah .url() gagal (status dirty).
    if (!URL.canParse(value)) return;
    const u = new URL(value);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      ctx.addIssue({ code: "custom", message: "wajib http:// atau https://" });
      return;
    }
    if (
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      (u.pathname !== "/" && u.pathname !== "")
    ) {
      ctx.addIssue({
        code: "custom",
        message: "hanya origin (skema://host:port), tanpa path, query, atau kredensial",
      });
    }
    if (u.protocol === "http:" && isHstsPreloadedHost(u.hostname)) {
      ctx.addIssue({
        code: "custom",
        message: `host "${u.hostname}" dipaksa ke https oleh HSTS preload Chromium; pakai nama lain (mis. dashboard-web)`,
      });
    }
  })
  .transform((value) => new URL(value).origin);

export const rendererEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    /** Secret bersama dengan worker (header x-renderer-secret). Minimal 32 karakter. */
    RENDERER_SECRET: z.string().min(32, "wajib ≥ 32 karakter"),
    APP_INTERNAL_URL: appInternalUrl,
    /** Alamat bind: 127.0.0.1 di host dev; 0.0.0.0 di container (jaringan internal "render"). */
    RENDERER_HOST: z.string().min(1).default("127.0.0.1"),
    RENDERER_PORT: z.coerce.number().int().min(1).max(65_535).default(3200),
    /** Job render bersamaan (satu context Chromium per job); penuh → 503. */
    RENDERER_CONCURRENCY: z.coerce.number().int().min(1).max(2).default(1),
    /** Batas tunggu halaman /render sampai data-render-ready="1"; lewat → 504 RENDER_TIMEOUT. */
    RENDER_READY_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(30_000),
    /** Hanya dev: izinkan WebSocket same-origin (HMR next dev). Default false = semua WebSocket diblokir. */
    ALLOW_DEV_WEBSOCKET: booleanFromString,
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;
    if (env.ALLOW_DEV_WEBSOCKET) {
      ctx.addIssue({
        code: "custom",
        path: ["ALLOW_DEV_WEBSOCKET"],
        message: "tidak boleh true di produksi",
      });
    }
    if (env.RENDERER_SECRET.toLowerCase().includes(PLACEHOLDER_MARKER)) {
      ctx.addIssue({
        code: "custom",
        path: ["RENDERER_SECRET"],
        message: "masih nilai placeholder",
      });
    }
  });

export type RendererEnv = z.infer<typeof rendererEnvSchema>;

/** Validasi env renderer; pesan error menyebut nama variabel tetapi tidak pernah nilainya. */
export function parseRendererEnv(source: Record<string, string | undefined>): RendererEnv {
  const parsed = rendererEnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Konfigurasi env renderer tidak valid: ${issues}`);
  }
  return parsed.data;
}
