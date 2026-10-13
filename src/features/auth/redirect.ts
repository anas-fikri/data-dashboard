/**
 * Hanya path relatif internal yang diterima sebagai tujuan setelah login (anti open-redirect):
 * harus diawali satu "/" (bukan "//" atau "/\"), tanpa skema, tanpa karakter kontrol.
 */
export function safeNext(value: unknown, fallback = "/"): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return fallback; // karakter kontrol
  }
  if (/^\/[^/?#]*:/.test(value)) return fallback; // "/javascript:..." dan sejenisnya
  return value;
}

/** Alasan yang ditampilkan halaman login (T-019: "disabled" = akun dinonaktifkan admin). */
export type LoginReason = "disabled";

export function loginUrl(next?: string | null, reason?: LoginReason): string {
  const target = safeNext(next ?? undefined);
  const params: string[] = [];
  if (target !== "/") params.push(`next=${encodeURIComponent(target)}`);
  if (reason) params.push(`reason=${reason}`);
  return params.length ? `/login?${params.join("&")}` : "/login";
}
