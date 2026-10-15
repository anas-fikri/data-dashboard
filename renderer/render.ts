/*
 * Helper murni renderer PDF (T-018 D5/D12): validasi body, cek secret, allowlist origin, keputusan route.
 * Tanpa I/O agar bisa diuji unit; renderer/renderer.ts yang memakai semuanya.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/** Token render = generateToken() app: 32 byte base64url tanpa padding (43 karakter). */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Body POST /render maksimal 1 KB ({"token":"<43 karakter>"} ± 54 byte). */
export const MAX_BODY_BYTES = 1024;

/**
 * Kontrak respons error renderer → worker (body JSON {ok:false, code}). Worker memetakan 504 ke
 * EXPORT_TIMEOUT, 503 ke RENDERER_UNAVAILABLE (atau retry), sisanya ke EXPORT_FAILED.
 */
export const RENDER_ERRORS = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  /** Token ditolak app (langkah tukar token → cookie tidak 303 ke /render): dipakai/kedaluwarsa. */
  RENDER_TOKEN_REJECTED: 502,
  /** Halaman /render tidak 200 atau gagal dimuat. */
  RENDER_FAILED: 502,
  /** Fail closed: ada permintaan di luar origin app, 3xx, atau WebSocket lintas origin. */
  RENDER_BLOCKED: 502,
  /** Semua slot render terpakai (RENDERER_CONCURRENCY). */
  RENDERER_BUSY: 503,
  /** Chromium belum/tidak tersambung atau renderer sedang berhenti. */
  RENDERER_UNAVAILABLE: 503,
  /** data-render-ready="1" tidak muncul dalam RENDER_READY_TIMEOUT_MS. */
  RENDER_TIMEOUT: 504,
} as const;

export type RenderErrorCode = keyof typeof RENDER_ERRORS;

export type BodyCheck =
  | { ok: true; token: string }
  | { ok: false; code: "BAD_REQUEST" | "PAYLOAD_TOO_LARGE" | "UNSUPPORTED_MEDIA_TYPE" };

/** Persis {token}; kunci lain (mis. url) → 400 (AC5: renderer tidak pernah menerima URL). */
const bodySchema = z.object({ token: z.string().regex(TOKEN_PATTERN) }).strict();

/** Media type application/json (parameter seperti charset diabaikan). */
export function isJsonContentType(header: string | undefined): boolean {
  if (!header) return false;
  return header.split(";")[0]?.trim().toLowerCase() === "application/json";
}

export function validateBody(contentType: string | undefined, raw: Buffer): BodyCheck {
  if (!isJsonContentType(contentType)) return { ok: false, code: "UNSUPPORTED_MEDIA_TYPE" };
  if (raw.byteLength > MAX_BODY_BYTES) return { ok: false, code: "PAYLOAD_TOO_LARGE" };
  let json: unknown;
  try {
    json = JSON.parse(raw.toString("utf8"));
  } catch {
    return { ok: false, code: "BAD_REQUEST" };
  }
  const parsed = bodySchema.safeParse(json);
  return parsed.success
    ? { ok: true, token: parsed.data.token }
    : { ok: false, code: "BAD_REQUEST" };
}

const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest();

/**
 * Header x-renderer-secret dibandingkan lewat digest sha256 (panjang sama) dengan timingSafeEqual,
 * jadi waktu tidak membocorkan isi maupun panjang secret. Header ganda (array) ditolak.
 */
export function checkSecret(provided: string | string[] | undefined, expected: string): boolean {
  if (typeof provided !== "string" || provided.length === 0 || expected.length === 0) return false;
  return timingSafeEqual(sha256(provided), sha256(expected));
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/**
 * true hanya untuk http(s) dengan origin persis APP_INTERNAL_URL (tanpa kredensial di URL).
 * data:, blob:, about:, file:, ws: dan origin lain → false.
 */
export function isAllowedUrl(url: string, origin: string): boolean {
  const u = parseUrl(url);
  if (!u || (u.protocol !== "http:" && u.protocol !== "https:")) return false;
  if (u.username || u.password) return false;
  return u.origin === origin;
}

/** WebSocket same-origin: ws ↔ http, wss ↔ https. */
export function isAllowedWebSocketUrl(url: string, origin: string): boolean {
  const u = parseUrl(url);
  if (!u || (u.protocol !== "ws:" && u.protocol !== "wss:")) return false;
  u.protocol = u.protocol === "wss:" ? "https:" : "http:";
  return isAllowedUrl(u.href, origin);
}

export type RouteDecision = "fetch" | "fulfill" | "abort";

/**
 * Keputusan context.route untuk satu permintaan. Tanpa status: origin app → "fetch" (route.fetch
 * dengan maxRedirects 0), selain itu → "abort". Dengan status respons hasil fetch: 3xx → "abort"
 * (route.continue mengikuti redirect ke origin lain tanpa melewati route lagi — terbukti di probe),
 * selain itu → "fulfill".
 */
export function decideRoute(url: string, origin: string, status?: number): RouteDecision {
  if (!isAllowedUrl(url, origin)) return "abort";
  if (status === undefined) return "fetch";
  return status >= 300 && status < 400 ? "abort" : "fulfill";
}

/**
 * Env untuk proses Chromium: allowlist variabel yang dibutuhkan peramban saja, jadi RENDERER_SECRET dan
 * secret app lain di .env dev tidak ikut terbaca dari /proc/<pid>/environ proses peramban.
 */
const BROWSER_ENV_ALLOWED =
  /^(PATH|HOME|TMPDIR|TMP|TEMP|LANG|LANGUAGE|LC_[A-Z_]+|TZ|USER|LOGNAME|SHELL|XDG_[A-Z_]+|FONTCONFIG_[A-Z_]+|DISPLAY|WAYLAND_DISPLAY|DBUS_SESSION_BUS_ADDRESS|SYSTEMROOT|WINDIR)$/;

export function browserEnv(source: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && BROWSER_ENV_ALLOWED.test(key)) out[key] = value;
  }
  return out;
}
