import { describe, expect, it, vi } from "vitest";
import { pathLabel, pathRef } from "@/features/presence/labels";
import {
  cleanPath,
  ONLINE_WINDOW_MS,
  readOnline,
  RETENTION_MS,
  touchPresence,
  type PresenceRedis,
} from "@/features/presence/store";

vi.mock("server-only", () => ({}));
const { countOnline, listOnline } = await import("@/features/presence/service");

/* T-h807: kehadiran user (admin) — penyaring path, store Redis, label halaman, daftar akun aktif. */

/** Redis palsu secukupnya: ZSET + string ber-TTL (TTL dicatat, tidak dijalankan). */
function fakeRedis() {
  const z = new Map<string, number>();
  const kv = new Map<string, string>();
  const ttl = new Map<string, number>();
  const r = {
    multi() {
      const ops: (() => void)[] = [];
      const m = {
        zadd(_k: string, score: number, member: string) {
          ops.push(() => z.set(member, score));
          return m;
        },
        zremrangebyscore(_k: string, _min: string, max: number) {
          ops.push(() => {
            for (const [k, v] of z) if (v <= max) z.delete(k);
          });
          return m;
        },
        expire(k: string, sec: number) {
          ops.push(() => ttl.set(k, sec));
          return m;
        },
        set(k: string, v: string, _ex: string, sec: number) {
          ops.push(() => {
            kv.set(k, v);
            ttl.set(k, sec);
          });
          return m;
        },
        async exec() {
          ops.forEach((o) => o());
          return [];
        },
      };
      return m;
    },
    async zrangebyscore(_k: string, min: number) {
      return [...z].filter(([, v]) => v >= min).flatMap(([k, v]) => [k, String(v)]);
    },
    async mget(...keys: string[]) {
      return keys.map((k) => kv.get(k) ?? null);
    },
  };
  return { r: r as unknown as PresenceRedis, z, kv, ttl };
}

describe("cleanPath", () => {
  it("hanya pathname aplikasi: query/hash dibuang, /api dan /render ditolak", () => {
    expect(cleanPath("/dashboards/abc?f=%7B%22filters%22%7D#x")).toBe("/dashboards/abc");
    expect(cleanPath("/")).toBe("/");
    expect(cleanPath("/api/presence")).toBeNull();
    expect(cleanPath("/render")).toBeNull();
    expect(cleanPath("//evil.example/x")).toBeNull();
    expect(cleanPath("https://evil.example/")).toBeNull();
    expect(cleanPath("/a b")).toBeNull();
    expect(cleanPath("/" + "a".repeat(250))).toBeNull();
    expect(cleanPath(42)).toBeNull();
  });
});

describe("touchPresence / readOnline", () => {
  it("online = aktif dalam 5 menit; terbaru dulu; data > 24 jam terbuang; kunci ber-TTL", async () => {
    const { r, z, ttl } = fakeRedis();
    const now = 10 * RETENTION_MS;
    await touchPresence(r, "lama", "/", now - RETENTION_MS - 1);
    await touchPresence(r, "u1", "/dashboards/x", now - ONLINE_WINDOW_MS - 1000);
    await touchPresence(r, "u2", "/datasets", now - 60_000);
    await touchPresence(r, "u3", null, now);
    expect(z.has("lama")).toBe(false);
    expect(ttl.get("presence:z")).toBe(RETENTION_MS / 1000);
    expect(ttl.get("presence:p:u2")).toBe(RETENTION_MS / 1000);
    const online = await readOnline(r, now);
    expect(online).toEqual([
      { userId: "u3", lastSeen: now, path: null },
      { userId: "u2", lastSeen: now - 60_000, path: "/datasets" },
    ]);
  });
});

describe("label halaman", () => {
  it("dashboard/dataset lewat id, halaman statis, lainnya", () => {
    const id = "cmv4kljx40009oczvdmpurrd0";
    expect(pathRef(`/dashboards/${id}`)).toEqual({ kind: "dashboard", id });
    expect(pathRef(`/datasets/${id}/skema`)).toEqual({ kind: "dataset", id });
    expect(pathLabel(pathRef(`/dashboards/${id}`), "Penjualan")).toBe("Dashboard Penjualan");
    expect(pathLabel(pathRef(`/datasets/${id}`), null)).toBe("Dataset");
    expect(pathLabel(pathRef("/admin/pengguna"))).toBe("Admin");
    expect(pathLabel(pathRef("/dashboards/baru"))).toBe("Buat dashboard");
    expect(pathLabel(pathRef("/"))).toBe("Beranda");
    expect(pathLabel(pathRef("/entah"))).toBe("Halaman lain");
    expect(pathLabel(null)).toBe("Halaman lain");
  });
});

describe("listOnline / countOnline", () => {
  it("hanya akun aktif; label memakai nama dashboard saat ini", async () => {
    const { r } = fakeRedis();
    const now = 5 * RETENTION_MS;
    const D = "cmv4kljx40009oczvdmpurrd0";
    await touchPresence(r, "aktif", `/dashboards/${D}`, now - 30_000);
    await touchPresence(r, "nonaktif", "/", now - 10_000);
    const deps = {
      redis: async () => r,
      activeUsers: vi.fn(async (ids: string[]) =>
        ids.includes("aktif") ? [{ id: "aktif", name: "  Budi  ", email: "budi@contoh.id" }] : [],
      ),
      dashboardNames: vi.fn(async () => [{ id: D, name: "Penjualan" }]),
      datasetNames: vi.fn(async () => []),
    };
    expect(await listOnline(deps, now)).toEqual([
      {
        id: "aktif",
        name: "Budi",
        email: "budi@contoh.id",
        lastSeen: new Date(now - 30_000).toISOString(),
        page: "Dashboard Penjualan",
      },
    ]);
    expect(deps.datasetNames).not.toHaveBeenCalled();
    expect(await countOnline(deps, now)).toBe(1);
  });
});
