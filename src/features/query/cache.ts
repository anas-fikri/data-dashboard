/*
 * Cache hasil query di Redis (T-009). Kunci = SHA-256 dari (dataset, versi, sheet, schemaRevision,
 * spec kanonik): versi atau revisi skema baru otomatis cache miss. TTL 24 jam dan nilai dibatasi
 * (ADR-0004: Redis noeviction); kegagalan Redis/OOM diperlakukan sebagai miss, tidak menggagalkan query.
 */
import { createHash } from "node:crypto";

export const RESULT_TTL_SEC = 24 * 60 * 60;
export const RESULT_MAX_BYTES = 2 * 1024 * 1024;

export interface ResultStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ex: "EX", ttlSec: number): Promise<unknown>;
}

/** JSON dengan urutan key tersortir di setiap tingkat (urutan key dari klien tidak memengaruhi). */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

export function resultKey(parts: {
  datasetId: string;
  versionId: string;
  sheetId: string;
  schemaRevision: number;
  spec: unknown;
}): string {
  const h = createHash("sha256")
    .update(
      canonical([
        parts.datasetId,
        parts.versionId,
        parts.sheetId,
        parts.schemaRevision,
        parts.spec,
      ]),
    )
    .digest("hex");
  return `q:${h}`;
}

export async function cacheGet<T>(store: ResultStore | null, key: string): Promise<T | null> {
  if (!store) return null;
  try {
    const raw = await store.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function cacheSet(store: ResultStore | null, key: string, value: unknown) {
  if (!store) return;
  const raw = JSON.stringify(value);
  if (raw.length > RESULT_MAX_BYTES) return;
  try {
    await store.set(key, raw, "EX", RESULT_TTL_SEC);
  } catch {
    /* Redis penuh/mati: hasil tetap dikirim, hanya tidak di-cache */
  }
}
