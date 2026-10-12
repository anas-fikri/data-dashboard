/*
 * Cache hasil query (T-009) di memori proses aplikasi, dibatasi byte (LRU) dan TTL 24 jam. Bukan di
 * Redis: Redis bersama (noeviction, ADR-0004) juga memegang antrean dan rate limit, dan satu user bisa
 * memenuhinya dengan hasil 2 MB × kunci berbeda (review T-009 F1). Kunci = SHA-256 dari (dataset,
 * versi, sheet, schemaRevision, spec kanonik): versi atau revisi skema baru otomatis miss.
 */
import { createHash } from "node:crypto";

export const RESULT_TTL_MS = 24 * 60 * 60 * 1000;
/** Entri lebih besar dari ini tidak di-cache (hasil tetap dikirim). */
export const ENTRY_MAX_BYTES = 1024 * 1024;

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
  return createHash("sha256")
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
}

interface Slot<T> {
  value: T;
  bytes: number;
  expires: number;
}

/** LRU berbatas byte dengan TTL per entri (urutan Map = urutan pemakaian terakhir). */
export class ResultCache<T = unknown> {
  private readonly map = new Map<string, Slot<T>>();
  private bytes = 0;

  constructor(
    readonly maxBytes: number,
    private readonly now: () => number = Date.now,
  ) {}

  get totalBytes() {
    return this.bytes;
  }

  get(key: string): T | null {
    const s = this.map.get(key);
    if (!s) return null;
    if (s.expires <= this.now()) {
      this.delete(key, s);
      return null;
    }
    this.map.delete(key);
    this.map.set(key, s);
    return s.value;
  }

  set(key: string, value: T, bytes: number, ttlMs = RESULT_TTL_MS) {
    if (bytes > ENTRY_MAX_BYTES || bytes > this.maxBytes) return;
    const old = this.map.get(key);
    if (old) this.delete(key, old);
    this.map.set(key, { value, bytes, expires: this.now() + ttlMs });
    this.bytes += bytes;
    for (const [k, s] of this.map) {
      if (this.bytes <= this.maxBytes) break;
      this.delete(k, s);
    }
  }

  private delete(key: string, s: Slot<T>) {
    this.map.delete(key);
    this.bytes -= s.bytes;
  }
}
