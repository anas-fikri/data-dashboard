import { describe, expect, it, vi } from "vitest";

/*
 * T-pvq8: perakitan produksi pemanasan — satu langganan Redis per proses, pesan tidak dipercaya (hanya
 * id berbentuk cuid), versi aktif dan typedKey-nya dibaca dari DB lalu disewa dari cache lokal yang
 * sama dengan query. Redis, Prisma, storage, dan cache dimock.
 */
const handlers: Record<string, (...args: string[]) => void> = {};
const subscribe = vi.fn(async () => 1);
const RedisCtor = vi.fn(function Redis() {
  return {
    on: (event: string, fn: (...args: string[]) => void) => {
      handlers[event] = fn;
    },
    subscribe,
  };
});
vi.mock("ioredis", () => ({ default: RedisCtor }));
vi.mock("@/lib/env", () => ({ env: () => ({ REDIS_URL: "redis://redis:6379" }) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
const findFirst = vi.fn();
vi.mock("@/lib/db", () => ({ prisma: { datasetVersion: { findFirst } } }));
const objectSize = vi.fn(async () => 10);
vi.mock("@/lib/storage/files", () => ({ objectSize, downloadToFile: vi.fn() }));
const acquire = vi.fn(async () => ({ release: () => {} }));
vi.mock("@/features/query/local-parquet", () => ({
  localParquetCache: () => ({ maxBytes: 1_000, acquire }),
}));

const { listenVersionActivated, parquetWarmer } = await import("@/features/query/warm-runtime");

const V1 = "cmv4kljx40009oczvdmpurrva";

describe("listenVersionActivated", () => {
  it("satu langganan per proses; pesan versi aktif → typedKey sheet-nya disewa dari cache lokal", async () => {
    listenVersionActivated();
    listenVersionActivated();
    expect(RedisCtor).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledWith("dataset:version-activated");

    // Bentuk baris Prisma (T-037): manifest segmen berisi file typed yang sama dengan Sheet.typedKey.
    const sheet = (typedKey: string) => ({
      typedKey,
      segments: [{ segmentTyped: { typedKey } }],
    });
    findFirst.mockResolvedValue({
      sheets: [
        sheet("parquet/ds/v1/s1/typed-1.parquet"),
        sheet("parquet/ds/v1/s2/typed-3.parquet"),
      ],
    });
    handlers.message!("dataset:version-activated", "bukan-id ; DROP");
    handlers.message!("dataset:version-activated", V1);
    await parquetWarmer().warm(V1);
    // Baca awal + cek ulang sebelum tiap unduhan; selalu versi itu saja, dan hanya bila READY + aktif.
    expect(findFirst).toHaveBeenCalledTimes(3);
    for (const [arg] of findFirst.mock.calls) {
      expect(arg).toMatchObject({ where: { id: V1, status: "READY", activeFor: { isNot: null } } });
    }
    // HEAD storage memakai signal batas waktu.
    expect(objectSize).toHaveBeenCalledWith(
      "parquet/ds/v1/s1/typed-1.parquet",
      expect.any(AbortSignal),
    );
    expect(acquire.mock.calls.map((c: unknown[]) => c[0])).toEqual([
      "parquet/ds/v1/s1/typed-1.parquet",
      "parquet/ds/v1/s2/typed-3.parquet",
    ]);
  });
});
