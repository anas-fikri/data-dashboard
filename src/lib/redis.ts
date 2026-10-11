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

/** Menunggu event `ready` atau `error`, apa pun yang datang lebih dulu, tanpa membocorkan listener. */
function waitUntilReady(r: Redis): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onReady = () => {
      r.off("error", onError);
      resolve();
    };
    const onError = (e: Error) => {
      r.off("ready", onReady);
      reject(e);
    };
    r.once("ready", onReady);
    r.once("error", onError);
  });
}

/** Memastikan koneksi siap; aman dipanggil bersamaan dari beberapa permintaan. */
export async function redisReady(): Promise<Redis> {
  const r = redis();
  switch (r.status) {
    case "ready":
      return r;
    case "wait":
    case "end":
      await r.connect();
      return r;
    default:
      // connecting | connect (TCP up, belum siap) | reconnecting | close (jeda antar reconnect)
      await waitUntilReady(r);
      return r;
  }
}
