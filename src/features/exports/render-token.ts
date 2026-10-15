import "server-only";
import type Redis from "ioredis";
import { z } from "zod";
import { generateToken, hashToken, isTokenShape } from "@/features/auth/tokens";
import { PDF_FILTER_MAX } from "./schema";

/*
 * Token render PDF (T-018, D4). Alur:
 *  1. worker: mintRenderToken → token acak 32 byte (base64url 43 karakter); Redis
 *     `render:tok:<sha256>` = klaim { exportId, userId, dashboardId, f, requestedAt, exp } SET PX 60000
 *     NX. Hanya hash yang disimpan; token mentah hanya dikirim ke renderer.
 *  2. renderer: GET /render/<token> → exchangeRenderToken: GETDEL (sekali pakai, atomik) → sesi render
 *     baru `render:sess:<sha256>` dengan SISA umur token → 303 /render + cookie dd.render (Path=/render,
 *     HttpOnly, SameSite=Strict, Max-Age ≤ 60). Token tidak pernah muncul di URL halaman/riwayat/Referer.
 *  3. halaman /render: consumeRenderSessionClaims → GETDEL sesi (halaman juga sekali pakai).
 * Token dipakai ulang, lewat 60 detik, atau bentuknya salah → null (pemanggil menjawab 404 polos).
 * Store diinjeksi (uji tanpa Redis); produksi: redisRenderStore.
 */

export const RENDER_COOKIE = "dd.render";
export const RENDER_COOKIE_PATH = "/render";
/** Umur token render sejak dibuat; sesi render mewarisi sisa umurnya. */
export const RENDER_TOKEN_TTL_MS = 60_000;

const TOKEN_PREFIX = "render:tok:";
const SESSION_PREFIX = "render:sess:";

export interface RenderClaims {
  exportId: string;
  userId: string;
  dashboardId: string;
  /** Status filter (encoded, sudah disaring saat buat); tanpa = tanpa filter. */
  f?: string;
  /** ISO; jam preset tanggal filter (sama dengan saat ekspor diminta). */
  requestedAt: string;
}

export interface RenderTokenStore {
  /** SET key value PX ttl NX → true bila tersimpan (key belum ada). */
  setNx(key: string, value: string, ttlMs: number): Promise<boolean>;
  /** GETDEL: nilai lalu hapus, atomik (sekali pakai). */
  getDel(key: string): Promise<string | null>;
}

const cuid = z.string().regex(/^[a-z0-9]{20,32}$/);
const storedSchema = z
  .object({
    exportId: cuid,
    userId: cuid,
    dashboardId: cuid,
    f: z.string().max(PDF_FILTER_MAX).optional(),
    requestedAt: z.string().datetime(),
    /** Epoch ms kedaluwarsa (token dan sesi turunannya). */
    exp: z.number().int(),
  })
  .strict();
type Stored = z.infer<typeof storedSchema>;

/** Baca + hapus satu entri; rusak/kedaluwarsa → null. */
async function take(store: RenderTokenStore, key: string, now: number): Promise<Stored | null> {
  const raw = await store.getDel(key);
  if (!raw) return null;
  try {
    const p = storedSchema.safeParse(JSON.parse(raw));
    return p.success && p.data.exp > now ? p.data : null;
  } catch {
    return null;
  }
}

/** Worker: token render baru untuk satu percobaan job (tiap ulangan membuat token baru). */
export async function mintRenderToken(
  store: RenderTokenStore,
  claims: RenderClaims,
  now = Date.now(),
): Promise<string> {
  const token = generateToken();
  const value: Stored = {
    exportId: claims.exportId,
    userId: claims.userId,
    dashboardId: claims.dashboardId,
    ...(claims.f ? { f: claims.f } : {}),
    requestedAt: claims.requestedAt,
    exp: now + RENDER_TOKEN_TTL_MS,
  };
  const ok = await store.setNx(
    TOKEN_PREFIX + hashToken(token),
    JSON.stringify(value),
    RENDER_TOKEN_TTL_MS,
  );
  // 256 bit acak tidak pernah bertabrakan; bila terjadi juga, jangan pernah menimpa token orang lain.
  if (!ok) throw new Error("token render gagal disimpan");
  return token;
}

/**
 * GET /render/<token>: tukar token (sekali pakai) dengan sesi render yang berumur sisa umur token.
 * null = token tidak valid, sudah dipakai, atau lewat 60 detik.
 */
export async function exchangeRenderToken(
  store: RenderTokenStore,
  token: unknown,
  now = Date.now(),
): Promise<{ sessionId: string; maxAgeSec: number } | null> {
  if (!isTokenShape(token)) return null;
  const claims = await take(store, TOKEN_PREFIX + hashToken(token), now);
  if (!claims) return null;
  const ttlMs = claims.exp - now;
  const sessionId = generateToken();
  const ok = await store.setNx(
    SESSION_PREFIX + hashToken(sessionId),
    JSON.stringify(claims),
    ttlMs,
  );
  if (!ok) return null;
  return { sessionId, maxAgeSec: Math.min(60, Math.max(1, Math.ceil(ttlMs / 1000))) };
}

/** Halaman /render: klaim sesi render (sekali pakai); null = tidak ada/dipakai/kedaluwarsa. */
export async function consumeRenderSessionClaims(
  store: RenderTokenStore,
  sessionId: unknown,
  now = Date.now(),
): Promise<RenderClaims | null> {
  if (!isTokenShape(sessionId)) return null;
  const s = await take(store, SESSION_PREFIX + hashToken(sessionId), now);
  if (!s) return null;
  return {
    exportId: s.exportId,
    userId: s.userId,
    dashboardId: s.dashboardId,
    ...(s.f ? { f: s.f } : {}),
    requestedAt: s.requestedAt,
  };
}

/**
 * Cookie sesi render. Secure HANYA bila APP_INTERNAL_URL https (Chromium menolak cookie Secure dari
 * origin http selain localhost) dan tanpa awalan __Secure- (bukan sessionCookieSpec yang mengikuti
 * APP_URL). Path=/render: cookie tidak pernah terkirim ke /api/* atau halaman lain.
 */
export function renderCookie(sessionId: string, maxAgeSec: number, internalUrl?: string) {
  return {
    name: RENDER_COOKIE,
    value: sessionId,
    options: {
      httpOnly: true,
      sameSite: "strict" as const,
      secure: (internalUrl ?? "").startsWith("https://"),
      path: RENDER_COOKIE_PATH,
      maxAge: Math.min(60, Math.max(1, Math.floor(maxAgeSec))),
    },
  };
}

/** Store produksi di atas ioredis (Redis ≥ 6.2 untuk GETDEL). */
export function redisRenderStore(r: Pick<Redis, "set" | "getdel">): RenderTokenStore {
  return {
    setNx: async (key, value, ttlMs) =>
      (await r.set(key, value, "PX", Math.max(1, Math.trunc(ttlMs)), "NX")) === "OK",
    getDel: (key) => r.getdel(key),
  };
}
