/*
 * Versi aplikasi (T-066). Satu sumber: "version" di package.json, di-bundle saat build (Next) atau dibaca
 * tsx saat start (worker); commit pendek opsional dari build arg APP_COMMIT (Dockerfile → ENV).
 * Hanya untuk kode server: komponen klien menerima versi lewat props, agar package.json tidak ikut bundle.
 */
import "server-only";
import pkg from "../../package.json";

export const APP_VERSION: string = pkg.version;

/** Hash commit git (7–40 heksa); nilai lain (kosong, "unknown", teks bebas) diabaikan. */
const COMMIT_RE = /^[0-9a-f]{7,40}$/;

/** Commit pendek (≤ 12 karakter) dari APP_COMMIT, atau null bila tidak tersedia/tidak valid. */
export function appCommit(source: string | undefined = process.env.APP_COMMIT): string | null {
  const v = source?.trim().toLowerCase();
  return v && COMMIT_RE.test(v) ? v.slice(0, 12) : null;
}

export interface VersionInfo {
  version: string;
  commit: string | null;
}

export function versionInfo(env: Record<string, string | undefined> = process.env): VersionInfo {
  return { version: APP_VERSION, commit: appCommit(env.APP_COMMIT) };
}
