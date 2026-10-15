import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  consumeRenderSessionClaims,
  exchangeRenderToken,
  mintRenderToken,
  redisRenderStore,
  RENDER_COOKIE,
  RENDER_TOKEN_TTL_MS,
  renderCookie,
  type RenderClaims,
  type RenderTokenStore,
} from "@/features/exports/render-token";

/*
 * T-018 D4/AC2: token render acak 43 karakter, hanya hash-nya di Redis, sekali pakai (GETDEL), 60 detik;
 * ditukar dengan sesi render yang mewarisi sisa umur token dan juga sekali pakai; atribut cookie.
 */

/** Redis palsu: SET PX NX + GETDEL dengan jam yang bisa dimajukan. */
function fakeStore(clock: { now: number }) {
  const data = new Map<string, { value: string; until: number }>();
  const store: RenderTokenStore & { data: typeof data } = {
    data,
    setNx: vi.fn(async (key: string, value: string, ttlMs: number) => {
      const cur = data.get(key);
      if (cur && cur.until > clock.now) return false;
      data.set(key, { value, until: clock.now + ttlMs });
      return true;
    }),
    getDel: vi.fn(async (key: string) => {
      const cur = data.get(key);
      data.delete(key);
      return cur && cur.until > clock.now ? cur.value : null;
    }),
  };
  return store;
}

const CLAIMS: RenderClaims = {
  exportId: "cmv4kljx40009oczvdmpuexp0",
  userId: "cmv4kljx40009oczvdmpuvwr0",
  dashboardId: "cmv4kljx40009oczvdmpurrd0",
  f: '{"filters":[{"column":"Cabang","op":"in","values":["Cabang 1"]}]}',
  requestedAt: "2026-10-16T01:00:00.000Z",
};
const T0 = Date.parse("2026-10-16T01:00:05.000Z");
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

describe("mintRenderToken", () => {
  it("token base64url 43 karakter; Redis hanya menyimpan hash-nya dengan TTL 60 detik (NX)", async () => {
    const clock = { now: T0 };
    const store = fakeStore(clock);
    const token = await mintRenderToken(store, CLAIMS, clock.now);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(store.setNx).toHaveBeenCalledWith(
      `render:tok:${sha(token)}`,
      expect.any(String),
      RENDER_TOKEN_TTL_MS,
    );
    expect(RENDER_TOKEN_TTL_MS).toBe(60_000);
    // Token mentah tidak pernah tersimpan (baik sebagai kunci maupun nilai).
    for (const [k, v] of store.data) {
      expect(k).not.toContain(token);
      expect(v.value).not.toContain(token);
      expect(JSON.parse(v.value)).toEqual({ ...CLAIMS, exp: T0 + 60_000 });
    }
    expect(await mintRenderToken(store, CLAIMS, clock.now)).not.toBe(token);
  });

  it("tanpa filter → klaim tanpa f; SET gagal → melempar (tidak pernah menimpa)", async () => {
    const clock = { now: T0 };
    const store = fakeStore(clock);
    const { f: _f, ...noFilter } = CLAIMS;
    await mintRenderToken(store, noFilter, clock.now);
    expect(JSON.parse([...store.data.values()][0]!.value)).not.toHaveProperty("f");
    const full: RenderTokenStore = { setNx: async () => false, getDel: async () => null };
    await expect(mintRenderToken(full, CLAIMS)).rejects.toThrow();
  });
});

describe("exchangeRenderToken + consumeRenderSessionClaims (sekali pakai, 60 detik)", () => {
  it("token sah → sesi baru (sisa umur), token tidak bisa dipakai lagi", async () => {
    const clock = { now: T0 };
    const store = fakeStore(clock);
    const token = await mintRenderToken(store, CLAIMS, clock.now);
    clock.now += 20_000;
    const s = await exchangeRenderToken(store, token, clock.now);
    expect(s).not.toBeNull();
    expect(s!.sessionId).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(s!.sessionId).not.toBe(token);
    expect(s!.maxAgeSec).toBe(40);
    expect(store.setNx).toHaveBeenLastCalledWith(
      `render:sess:${sha(s!.sessionId)}`,
      expect.any(String),
      40_000,
    );
    // Dipakai ulang → null (AC2).
    expect(await exchangeRenderToken(store, token, clock.now)).toBeNull();
    // Sesi: sekali pakai juga.
    expect(await consumeRenderSessionClaims(store, s!.sessionId, clock.now)).toEqual(CLAIMS);
    expect(await consumeRenderSessionClaims(store, s!.sessionId, clock.now)).toBeNull();
  });

  it("> 60 detik → null, walau entri Redis masih ada (exp di klaim dicek)", async () => {
    const clock = { now: T0 };
    const store = fakeStore(clock);
    const token = await mintRenderToken(store, CLAIMS, clock.now);
    // Entri dipaksa tetap hidup: hanya exp di klaim yang menolak.
    for (const v of store.data.values()) v.until = Number.MAX_SAFE_INTEGER;
    expect(await exchangeRenderToken(store, token, T0 + 60_000)).toBeNull();
    const t2 = await mintRenderToken(store, CLAIMS, clock.now);
    expect(await exchangeRenderToken(store, t2, T0 + 60_001)).toBeNull();
    // Redis membuang kunci setelah PX 60 detik.
    const t3 = await mintRenderToken(store, CLAIMS, clock.now);
    clock.now = T0 + 61_000;
    expect(await exchangeRenderToken(store, t3, clock.now)).toBeNull();
  });

  it("sesi mewarisi sisa umur token: lewat → null", async () => {
    const clock = { now: T0 };
    const store = fakeStore(clock);
    const token = await mintRenderToken(store, CLAIMS, clock.now);
    clock.now += 59_500;
    const s = await exchangeRenderToken(store, token, clock.now);
    expect(s!.maxAgeSec).toBe(1);
    clock.now += 600;
    expect(await consumeRenderSessionClaims(store, s!.sessionId, clock.now)).toBeNull();
  });

  it("bentuk salah / tidak dikenal / rusak → null tanpa menyentuh Redis untuk bentuk salah", async () => {
    const clock = { now: T0 };
    const store = fakeStore(clock);
    for (const bad of [undefined, null, 42, "", "abc", "a".repeat(44), `${"a".repeat(42)}/`]) {
      expect(await exchangeRenderToken(store, bad, clock.now)).toBeNull();
      expect(await consumeRenderSessionClaims(store, bad, clock.now)).toBeNull();
    }
    expect(store.getDel).not.toHaveBeenCalled();
    expect(await exchangeRenderToken(store, "a".repeat(43), clock.now)).toBeNull();
    // Nilai rusak / skema lain (mis. ditulis proses lain) → null.
    for (const raw of ["{", JSON.stringify({ ...CLAIMS, exp: T0 + 1000, url: "http://x" })]) {
      const token = "b".repeat(43);
      store.data.set(`render:tok:${sha(token)}`, { value: raw, until: T0 + 60_000 });
      expect(await exchangeRenderToken(store, token, clock.now)).toBeNull();
    }
  });
});

describe("renderCookie", () => {
  it("dd.render: HttpOnly, SameSite=Strict, Path=/render, Max-Age ≤ 60, Secure hanya untuk https", () => {
    const http = renderCookie("sid", 40, "http://web:3000");
    expect(http).toEqual({
      name: RENDER_COOKIE,
      value: "sid",
      options: { httpOnly: true, sameSite: "strict", secure: false, path: "/render", maxAge: 40 },
    });
    expect(RENDER_COOKIE).toBe("dd.render");
    expect(renderCookie("sid", 40, "https://web.internal").options.secure).toBe(true);
    expect(renderCookie("sid", 40).options.secure).toBe(false);
    expect(renderCookie("sid", 600).options.maxAge).toBe(60);
    expect(renderCookie("sid", 0).options.maxAge).toBe(1);
    // Tidak pernah awalan __Secure- (bukan cookie sesi user).
    expect(renderCookie("sid", 40, "https://web.internal").name).toBe("dd.render");
  });
});

describe("redisRenderStore", () => {
  it("SET key value PX ttl NX dan GETDEL", async () => {
    const set = vi.fn(async () => "OK" as const);
    const getdel = vi.fn(async () => "v");
    const store = redisRenderStore({ set, getdel } as never);
    expect(await store.setNx("k", "v", 1500.7)).toBe(true);
    expect(set).toHaveBeenCalledWith("k", "v", "PX", 1500, "NX");
    expect(await store.getDel("k")).toBe("v");
    set.mockResolvedValueOnce(null as never);
    expect(await store.setNx("k", "v", 10)).toBe(false);
  });
});
