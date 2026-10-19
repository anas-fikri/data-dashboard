import "server-only";
import { appOrigins, env } from "@/lib/env";

/**
 * Origin yang boleh untuk gambar panduan dan bukan "tautan eksternal": app (domain + akses LAN, T-9t9b) +
 * storage publik (T-020).
 */
export function guideOrigins(): string[] {
  return [...new Set([...appOrigins(), new URL(env().S3_PUBLIC_ENDPOINT).origin])];
}
