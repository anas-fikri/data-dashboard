import { describe, expect, it } from "vitest";
import { clientIp, hit, reset, RULES, type RateLimitStore } from "@/features/auth/rate-limit";

/** Redis palsu: counter + TTL dalam memori. */
function fakeStore() {
  const counts = new Map<string, number>();
  const ttls = new Map<string, number>();
  const store: RateLimitStore = {
    incr: async (key: string) => {
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      return n;
    },
    expire: async (key: string, sec: number) => {
      ttls.set(key, sec);
      return 1;
    },
    ttl: async (key: string) => ttls.get(key) ?? -1,
    del: async (key: string) => {
      counts.delete(key);
      ttls.delete(key);
      return 1;
    },
  } as unknown as RateLimitStore;
  return { store, counts, ttls };
}

describe("rate limit jendela tetap", () => {
  it("login per IP: 10 boleh, ke-11 ditolak dengan retryAfter", async () => {
    const { store, ttls } = fakeStore();
    let last;
    for (let i = 0; i < 10; i++) last = await hit(store, RULES.loginIp, "1.2.3.4");
    expect(last?.allowed).toBe(true);
    expect(last?.remaining).toBe(0);
    const eleventh = await hit(store, RULES.loginIp, "1.2.3.4");
    expect(eleventh.allowed).toBe(false);
    expect(eleventh.retryAfterSec).toBe(600);
    expect(ttls.get("rl:login:ip:1.2.3.4")).toBe(600);
  });

  it("subjek berbeda tidak saling memengaruhi; reset menghapus counter", async () => {
    const { store } = fakeStore();
    for (let i = 0; i < 5; i++) await hit(store, RULES.loginAccount, "a@x.id");
    expect((await hit(store, RULES.loginAccount, "a@x.id")).allowed).toBe(false);
    expect((await hit(store, RULES.loginAccount, "b@x.id")).allowed).toBe(true);
    await reset(store, RULES.loginAccount, "a@x.id");
    expect((await hit(store, RULES.loginAccount, "a@x.id")).allowed).toBe(true);
  });
});

describe("clientIp", () => {
  it("tanpa proxy tepercaya → 'local' (header klien diabaikan)", () => {
    const h = new Headers({ "x-real-ip": "9.9.9.9", "x-forwarded-for": "8.8.8.8" });
    expect(clientIp(h, false)).toBe("local");
  });

  it("dengan proxy: X-Real-IP diutamakan, lalu entri terakhir X-Forwarded-For", () => {
    expect(clientIp(new Headers({ "x-real-ip": "10.0.0.5" }), true)).toBe("10.0.0.5");
    expect(clientIp(new Headers({ "x-forwarded-for": "1.1.1.1, 10.0.0.7" }), true)).toBe(
      "10.0.0.7",
    );
    expect(clientIp(new Headers({ "x-real-ip": "<script>" }), true)).toBe("unknown");
    expect(clientIp(new Headers(), true)).toBe("unknown");
  });
});
