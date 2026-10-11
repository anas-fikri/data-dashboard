import { errors, jwtVerify, SignJWT } from "jose";

export interface SessionClaims {
  /** User id. */
  sub: string;
  /** sessionVersion saat sesi dibuat; dicocokkan ke DB tiap permintaan (D1). */
  sv: number;
}

export const SESSION_MAX_AGE_SEC = 12 * 60 * 60; // 12 jam (T-027)
const ALG = "HS256";
const ISSUER = "data-dashboard";

function keyOf(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

/** Menandatangani dengan secret pertama (yang aktif); `kid` = indeks untuk rotasi. */
export async function signSession(claims: SessionClaims, secrets: string[], now = Date.now()) {
  const active = secrets[0];
  if (!active) throw new Error("AUTH_SECRET kosong");
  const iat = Math.floor(now / 1000);
  return new SignJWT({ sv: claims.sv })
    .setProtectedHeader({ alg: ALG, kid: "0" })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setIssuedAt(iat)
    .setExpirationTime(iat + SESSION_MAX_AGE_SEC)
    .sign(keyOf(active));
}

/**
 * Memverifikasi terhadap setiap secret (rotasi: secret lama tetap diterima sampai kedaluwarsa).
 * Mengembalikan null untuk token tidak valid/kedaluwarsa — tidak pernah melempar.
 */
export async function verifySession(
  token: string,
  secrets: string[],
  now = Date.now(),
): Promise<SessionClaims | null> {
  for (const secret of secrets) {
    try {
      const { payload } = await jwtVerify(token, keyOf(secret), {
        algorithms: [ALG],
        issuer: ISSUER,
        currentDate: new Date(now),
      });
      if (typeof payload.sub !== "string" || typeof payload.sv !== "number") return null;
      return { sub: payload.sub, sv: payload.sv };
    } catch (e) {
      // Tanda tangan salah → coba secret berikutnya; kedaluwarsa/claim salah → langsung null.
      if (e instanceof errors.JWSSignatureVerificationFailed) continue;
      return null;
    }
  }
  return null;
}
