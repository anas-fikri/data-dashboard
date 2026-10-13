import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Review keamanan T-019 putaran 2: log penolakan akses admin dibatasi per pengguna (atau "anon") +
 * aksi per menit — 5 warn pertama, lalu satu ringkasan "<n> penolakan ditekan" per jendela.
 * Redis mati → setiap penolakan tetap dicatat (fail-open).
 */
const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
const counters = new Map<string, number>();
const store = {
  eval: vi.fn(async (_script: string, _keys: number, key: string, _ttl: string) => {
    const n = (counters.get(key) ?? 0) + 1;
    counters.set(key, n);
    return n;
  }),
  get: vi.fn(async (key: string) => (counters.has(key) ? String(counters.get(key)) : null)),
};
const redisReady = vi.fn(async () => store);

vi.mock("@/lib/logger", () => ({ logger }));
vi.mock("@/lib/redis", () => ({ redisReady }));

const { logAccessDenied } = await import("@/features/auth/denial-log");

const MSG = "aksi admin ditolak";
const fields = (userId?: string) => ({
  ...(userId ? { userId } : {}),
  code: "NOT_FOUND",
  action: "searchTransferTargets",
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-13T10:00:10Z"));
  counters.clear();
  vi.clearAllMocks();
  redisReady.mockResolvedValue(store);
});
afterEach(() => vi.useRealTimers());

describe("logAccessDenied", () => {
  it("5 penolakan pertama per pengguna + aksi dicatat warn, sisanya diringkas sekali setelah jendela", async () => {
    for (let i = 0; i < 40; i++) await logAccessDenied("searchTransferTargets", fields("u1"), MSG);
    expect(logger.warn).toHaveBeenCalledTimes(5);
    expect(logger.warn).toHaveBeenLastCalledWith(fields("u1"), MSG);
    expect(store.eval.mock.calls[0]![3]).toBe("120"); // TTL dua jendela

    await vi.advanceTimersByTimeAsync(51_000); // jendela 10:00 berakhir (+1 s)
    expect(logger.warn).toHaveBeenCalledTimes(6);
    expect(logger.warn).toHaveBeenLastCalledWith(
      { userId: "u1", action: "searchTransferTargets", suppressed: 35, windowSec: 60 },
      "aksi admin ditolak: 35 penolakan ditekan",
    );

    // Jendela berikutnya: jatah 5 warn lagi; tanpa penekanan → tanpa ringkasan.
    for (let i = 0; i < 5; i++) await logAccessDenied("searchTransferTargets", fields("u1"), MSG);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(logger.warn).toHaveBeenCalledTimes(11);
  });

  it("jatah terpisah per pengguna, per aksi, dan untuk anonim", async () => {
    for (let i = 0; i < 7; i++) {
      await logAccessDenied("searchTransferTargets", fields("u1"), MSG);
      await logAccessDenied("searchTransferTargets", fields("u2"), MSG);
      await logAccessDenied("transferDatasets", fields("u1"), MSG);
      await logAccessDenied("searchTransferTargets", fields(), MSG);
    }
    expect(logger.warn).toHaveBeenCalledTimes(20);
    expect(new Set(store.eval.mock.calls.map((c) => c[2]))).toEqual(
      new Set([
        "deny-log:u1:searchTransferTargets:29864760",
        "deny-log:u2:searchTransferTargets:29864760",
        "deny-log:u1:transferDatasets:29864760",
        "deny-log:anon:searchTransferTargets:29864760",
      ]),
    );
    await vi.advanceTimersByTimeAsync(51_000);
    expect(logger.warn).toHaveBeenCalledTimes(24); // satu ringkasan per bucket
    expect(logger.warn).toHaveBeenLastCalledWith(
      { action: "searchTransferTargets", suppressed: 2, windowSec: 60 },
      "aksi admin ditolak: 2 penolakan ditekan",
    );
  });

  it("Redis mati (fail-open): setiap penolakan tetap dicatat warn, tanpa melempar", async () => {
    redisReady.mockRejectedValue(new Error("ECONNREFUSED"));
    for (let i = 0; i < 8; i++) await logAccessDenied("page", fields("u1"), MSG);
    store.eval.mockRejectedValueOnce(new Error("NOSCRIPT"));
    redisReady.mockResolvedValue(store);
    await logAccessDenied("page", fields("u1"), MSG);
    expect(logger.warn).toHaveBeenCalledTimes(9);
  });

  it("Redis putus sebelum ringkasan: ringkasan tetap ditulis tanpa jumlah", async () => {
    for (let i = 0; i < 6; i++) await logAccessDenied("page", fields("u1"), MSG);
    store.get.mockRejectedValueOnce(new Error("ECONNRESET"));
    await vi.advanceTimersByTimeAsync(51_000);
    expect(logger.warn).toHaveBeenLastCalledWith(
      { userId: "u1", action: "page", suppressed: null, windowSec: 60 },
      "aksi admin ditolak: ≥ 1 penolakan ditekan",
    );
  });
});
