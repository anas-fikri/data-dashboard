import "server-only";
import { env } from "@/lib/env";

/** Origin yang boleh untuk gambar panduan dan bukan "tautan eksternal": app + storage publik (T-020). */
export function guideOrigins(): string[] {
  const e = env();
  return [...new Set([new URL(e.APP_URL).origin, new URL(e.S3_PUBLIC_ENDPOINT).origin])];
}
