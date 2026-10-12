/*
 * Lock Redis sederhana (T-007, recast per sheet): SET NX PX agar worker yang mati tidak mengunci
 * selamanya, dan lepas dengan compare-and-delete (Lua) agar lock yang sudah kedaluwarsa lalu diambil
 * proses lain tidak ikut terhapus.
 */
import { randomBytes } from "node:crypto";
import type Redis from "ioredis";

export interface LockStore {
  /** SET key value PX ttl NX → "OK" bila berhasil, null bila key sudah ada. */
  setNx(key: string, value: string, ttlMs: number): Promise<"OK" | null>;
  /** Hapus key hanya bila nilainya masih `value`; 1 = terhapus. */
  delIfEquals(key: string, value: string): Promise<number>;
}

const RELEASE = `if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end`;

export function redisLockStore(r: Redis): LockStore {
  return {
    setNx: async (key, value, ttlMs) => (await r.set(key, value, "PX", ttlMs, "NX")) as "OK" | null,
    delIfEquals: async (key, value) => Number(await r.eval(RELEASE, 1, key, value)),
  };
}

/** Token lock bila berhasil diambil, null bila sedang dipegang proses lain. */
export async function acquireLock(
  store: LockStore,
  key: string,
  ttlMs: number,
): Promise<string | null> {
  const token = randomBytes(16).toString("hex");
  return (await store.setNx(key, token, ttlMs)) === "OK" ? token : null;
}

export async function releaseLock(store: LockStore, key: string, token: string): Promise<boolean> {
  return (await store.delIfEquals(key, token)) === 1;
}
