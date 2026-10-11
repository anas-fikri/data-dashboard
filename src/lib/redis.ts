import Redis from "ioredis";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

const globalForRedis = globalThis as unknown as { redis?: Redis };

/** Koneksi Redis bersama (cache hasil, rate limit, lock). Antrean BullMQ memakai koneksi sendiri. */
export function redis(): Redis {
  if (!globalForRedis.redis) {
    const client = new Redis(env().REDIS_URL, {
      maxRetriesPerRequest: 2,
      lazyConnect: true,
      enableOfflineQueue: false,
      // Backoff terbatas: 200 ms … 5 s, lalu berhenti setelah 20 percobaan (tidak reconnect selamanya).
      retryStrategy: (times) => (times > 20 ? null : Math.min(200 * times, 5000)),
    });
    client.on("error", (e: Error) => logger.warn({ err: e.message }, "redis error"));
    globalForRedis.redis = client;
  }
  return globalForRedis.redis;
}

/** Memastikan koneksi siap; aman dipanggil bersamaan dari beberapa permintaan. */
export async function redisReady(): Promise<Redis> {
  const r = redis();
  if (r.status === "ready") return r;
  if (r.status === "wait" || r.status === "end") await r.connect();
  else if (r.status === "connecting" || r.status === "reconnecting") {
    await new Promise<void>((resolve, reject) => {
      r.once("ready", resolve);
      r.once("error", reject);
    });
  }
  return r;
}
