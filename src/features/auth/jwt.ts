import { errors, jwtVerify, SignJWT } from "jose";

/*
 * Tidak mengimpor "server-only": dipakai juga oleh src/proxy.ts (runtime edge, tetap server).
 * Tidak pernah diimpor dari komponen klien.
 */

export interface SessionClaims {
  /** User id. */
  sub: string;
  /** sessionVersion saat sesi dibuat; dicocokkan ke DB tiap permintaan (D1). */
  sv: number;
}

export const SESSION_MAX_AGE_SEC = 12 * 60 * 60; // 12 jam (T-027)
export const DEVICE_MAX_AGE_SEC = 90 * 24 * 60 * 60; // perangkat-dikenal: 90 hari
const ALG = "HS256";
const ISSUER = "data-dashboard";
const SESSION_AUD = "session";
const DEVICE_AUD = "device";

function keyOf(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

async function sign(
  payload: Record<string, unknown>,
  sub: string,
  aud: string,
  maxAgeSec: number,
  secrets: string[],
  now: number,
) {
  const active = secrets[0];
  if (!active) throw new Error("AUTH_SECRET kosong");
  const iat = Math.floor(now / 1000);
  return new SignJWT(payload)
    .setProtectedHeader({ alg: ALG })
    .setSubject(sub)
    .setIssuer(ISSUER)
    .setAudience(aud)
    .setIssuedAt(iat)
    .setExpirationTime(iat + maxAgeSec)
    .sign(keyOf(active));
}

async function verify(
  token: string,
  aud: string,
  maxAgeSec: number,
  secrets: string[],
  now: number,
): Promise<Record<string, unknown> | null> {
  for (const secret of secrets) {
    try {
      const { payload } = await jwtVerify(token, keyOf(secret), {
        algorithms: [ALG],
        issuer: ISSUER,
        audience: aud,
        requiredClaims: ["sub", "iat", "exp"],
        maxTokenAge: maxAgeSec,
        currentDate: new Date(now),
      });
      return payload as Record<string, unknown>;
    } catch (e) {
      // Tanda tangan salah → coba secret berikutnya (rotasi); kedaluwarsa/claim salah → null.
      if (e instanceof errors.JWSSignatureVerificationFailed) continue;
      return null;
    }
  }
  return null;
}

/** Menandatangani dengan secret pertama (aktif); secret lain hanya untuk verifikasi (rotasi). */
export function signSession(claims: SessionClaims, secrets: string[], now = Date.now()) {
  return sign({ sv: claims.sv }, claims.sub, SESSION_AUD, SESSION_MAX_AGE_SEC, secrets, now);
}

/** null untuk token tidak valid/kedaluwarsa — tidak pernah melempar. */
export async function verifySession(
  token: string,
  secrets: string[],
  now = Date.now(),
): Promise<SessionClaims | null> {
  const p = await verify(token, SESSION_AUD, SESSION_MAX_AGE_SEC, secrets, now);
  if (!p || typeof p.sub !== "string" || typeof p.sv !== "number") return null;
  return { sub: p.sub, sv: p.sv };
}

/** Token perangkat-dikenal: bukti bahwa perangkat ini pernah login sukses untuk user ini. */
export function signDevice(userId: string, secrets: string[], now = Date.now()) {
  return sign({}, userId, DEVICE_AUD, DEVICE_MAX_AGE_SEC, secrets, now);
}

export async function verifyDevice(
  token: string,
  secrets: string[],
  now = Date.now(),
): Promise<string | null> {
  const p = await verify(token, DEVICE_AUD, DEVICE_MAX_AGE_SEC, secrets, now);
  return p && typeof p.sub === "string" ? p.sub : null;
}
