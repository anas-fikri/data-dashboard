import "server-only";
import Redis from "ioredis";
import { isIdShape } from "@/features/datasets/validation";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { objectSize } from "@/lib/storage/files";
import { localParquetCache } from "./local-parquet";
import { createWarmer, VERSION_ACTIVATED_CHANNEL, watchRedis, type Warmer } from "./warm";

/*
 * Perakitan produksi pemanasan cache parquet (T-pvq8): satu warmer + satu langganan Redis per proses
 * app, dipasang dari instrumentation.ts. Isi pesan tidak dipercaya: hanya id berbentuk cuid, dan versi
 * aktif serta kuncinya dibaca dari DB. Tanpa DuckDB (cache dari local-parquet.ts).
 */

const g = globalThis as unknown as { parquetWarmer?: Warmer; parquetWarmListener?: Redis };

async function activeKeys(versionId: string): Promise<string[] | null> {
  const v = await prisma.datasetVersion.findFirst({
    where: { id: versionId, status: "READY", activeFor: { isNot: null } },
    select: {
      sheets: {
        where: { typedKey: { not: null } },
        orderBy: { index: "asc" },
        select: {
          typedKey: true,
          // Semua file typed manifest (T-037): kunci sama dengan sumber query.
          segments: {
            orderBy: { ordinal: "asc" },
            select: { segmentTyped: { select: { typedKey: true } } },
          },
        },
      },
    },
  });
  return (
    v &&
    v.sheets.flatMap((s) =>
      s.segments.length
        ? s.segments.map((m) => m.segmentTyped.typedKey)
        : s.typedKey
          ? [s.typedKey]
          : [],
    )
  );
}

export function parquetWarmer(): Warmer {
  g.parquetWarmer ??= createWarmer({
    activeKeys,
    cache: localParquetCache,
    sizeOf: (key, signal) => objectSize(key, signal),
    log: logger,
  });
  return g.parquetWarmer;
}

/**
 * Dengarkan pengumuman versi aktif (sekali per proses). Redis mati → dicatat tanpa membanjiri log
 * (watchRedis); koneksi pulih sendiri dan langganan dipasang ulang otomatis (pengumuman selama putus
 * hilang: query pertama mengunduh sendiri).
 */
export function listenVersionActivated(): void {
  if (g.parquetWarmListener) return;
  const sub = new Redis(env().REDIS_URL, {
    // Mode langganan: perintah menunggu koneksi pulih; reconnect tanpa batas (jeda ≤ 5 s).
    maxRetriesPerRequest: null,
    retryStrategy: (times) => Math.min(200 * times, 5000),
  });
  watchRedis(sub, logger, "redis pemanasan cache");
  sub.on("message", (_channel: string, versionId: string) => {
    if (isIdShape(versionId)) void parquetWarmer().warm(versionId);
  });
  sub.subscribe(VERSION_ACTIVATED_CHANNEL).catch((e: unknown) => {
    logger.warn(
      { err: e instanceof Error ? e.message : String(e) },
      "langganan pemanasan cache parquet gagal",
    );
  });
  g.parquetWarmListener = sub;
}
