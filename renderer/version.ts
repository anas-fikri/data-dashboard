/*
 * Versi renderer (T-066) = versi aplikasi: "version" di package.json akar repo (image renderer menyalin
 * package.json ke /app), commit pendek dari build arg APP_COMMIT. Sengaja tidak mengimpor src/lib/version
 * (renderer tidak membawa src/, ADR-0006); aturan commit disalin dari sana.
 */
import { readFileSync } from "node:fs";

const COMMIT_RE = /^[0-9a-f]{7,40}$/;

/** Versi dari package.json di folder induk renderer/; "unknown" bila tidak terbaca (start tetap jalan). */
export function readAppVersion(url: URL = new URL("../package.json", import.meta.url)): string {
  try {
    const v = (JSON.parse(readFileSync(url, "utf8")) as { version?: unknown }).version;
    return typeof v === "string" && v ? v : "unknown";
  } catch {
    return "unknown";
  }
}

export function rendererVersionInfo(env: Record<string, string | undefined> = process.env): {
  version: string;
  commit: string | null;
} {
  const c = env.APP_COMMIT?.trim().toLowerCase();
  return { version: readAppVersion(), commit: c && COMMIT_RE.test(c) ? c.slice(0, 12) : null };
}
