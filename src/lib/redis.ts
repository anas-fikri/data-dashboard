import Redis from "ioredis";
import { env } from "@/lib/env";

const globalForRedis = globalThis as unknown as { redis?: Redis };

/** Koneksi Redis bersama (cache hasil, rate limit, lock). Antrean BullMQ memakai koneksi sendiri. */
export function redis(): Redis {
  if (!globalForRedis.redis) {
    globalForRedis.redis = new Redis(env().REDIS_URL, {
      maxRetriesPerRequest: 2,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
  }
  return globalForRedis.redis;
}
