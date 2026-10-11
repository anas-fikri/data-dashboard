/** Normalisasi email: trim + lowercase. Mengembalikan null bila bentuknya tidak valid. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length > 254) return null;
  // Satu "@", local part tanpa spasi, domain dengan titik; tanpa karakter non-ASCII (homoglyph).
  if (!/^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(email)) return null;
  return email;
}

/** Domain harus sama persis dengan salah satu whitelist (bukan endsWith). */
export function isAllowedDomain(email: string, allowed: readonly string[]): boolean {
  const domain = email.split("@")[1];
  return !!domain && allowed.includes(domain);
}
