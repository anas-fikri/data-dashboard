import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * T-qed9 accountRows (review verifikasi M1/L5): job aktif → pemilik (unggah/atur periode lewat versi, olah ulang
 * userId vs pemetaan actorId, ekspor/PDF lewat Export), baris "Sistem" cache urutan Lihat data tanpa storage,
 * storage di-cache sampai kedaluwarsa, paling banyak 3 hitungan bersamaan, dan satu akun gagal → hanya kolomnya "–".
 */
const jobs: Record<string, { name: string; data: Record<string, unknown> }[]> = {};
const queue = (name: string) => ({ getJobs: async () => jobs[name] ?? [] });
let inFlight = 0;
let maxInFlight = 0;
const usageCalls: string[] = [];
const failUsage = new Set<string>();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ env: () => ({ USER_STORAGE_QUOTA_BYTES: 1000 }) }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/queue/connection", () => ({
  MAP_VERSION_JOB: "map-version",
  ingestQueue: () => queue("ingest"),
  recastQueue: () => queue("recast"),
  exportQueue: () => queue("export"),
  pdfQueue: () => queue("pdf"),
  withQueueTimeout: <T>(p: Promise<T>) => p,
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    datasetVersion: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.map((id) => ({ dataset: { ownerId: `owner-of-${id}` } })),
    },
    export: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.map((id) => ({ userId: `req-of-${id}` })),
    },
    user: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in
          .filter((id) => id !== "grid-order-cache")
          .map((id) => ({ id, email: `${id}@x.id`, name: null })),
    },
  },
}));
vi.mock("@/features/uploads/quota", () => ({
  userUsage: async (_db: unknown, id: string) => {
    usageCalls.push(id);
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    if (failUsage.has(id)) throw new Error("timeout");
    return { bytes: 100 + usageCalls.length };
  },
}));

const { accountRows } = await import("@/features/metrics/accounts");
const { KEY } = await import("@/lib/metrics/store");

/** Redis palsu: hash proses query berjalan + ember menit. */
function redisWith(running: Record<string, number>, seconds: Record<string, number>, now: number) {
  const hashes: Record<string, Record<string, string>> = {
    [KEY.acctRun]: { "app:a": JSON.stringify({ t: now, running }) },
    [KEY.acctSec + Math.floor(now / 60_000)]: Object.fromEntries(
      Object.entries(seconds).map(([k, v]) => [k, String(v)]),
    ),
  };
  return {
    hgetall: async (k: string) => hashes[k] ?? {},
    hdel: async () => 0,
  } as never;
}

beforeEach(() => {
  for (const k of Object.keys(jobs)) delete jobs[k];
  usageCalls.length = 0;
  inFlight = 0;
  maxInFlight = 0;
  failUsage.clear();
  (globalThis as { metricsUsage?: unknown }).metricsUsage = undefined;
});

describe("accountRows", () => {
  it("job aktif dipetakan ke pemilik; baris Sistem tanpa storage; job tanpa pemilik dilewati", async () => {
    const now = 50 * 60_000;
    jobs.ingest = [
      { name: "ingest", data: { versionId: "v1" } },
      { name: "sweep", data: {} },
    ];
    jobs.recast = [
      { name: "recast", data: { userId: "u-recast" } },
      { name: "map-version", data: { actorId: "u-map", userId: "bukan-ini" } },
    ];
    jobs.export = [{ name: "export", data: { exportId: "e1" } }];
    jobs.pdf = [{ name: "pdf", data: { exportId: "p1" } }];
    const r = await accountRows(redisWith({ "grid-order-cache": 1 }, { u1: 30 }, now), now);
    const by = Object.fromEntries(r.rows.map((x) => [x.id, x]));
    expect(by["owner-of-v1"]!.jobs).toEqual({ upload: 1, recast: 0, export: 0 });
    expect(by["u-recast"]!.jobs.recast).toBe(1);
    expect(by["u-map"]!.jobs.recast).toBe(1);
    expect(by["bukan-ini"]).toBeUndefined();
    expect(by["req-of-e1"]!.jobs.export).toBe(1);
    expect(by["req-of-p1"]!.jobs.export).toBe(1);
    expect(r.rows[0]!.id).toBe("u1"); // detik query terbanyak di atas
    const sys = by["grid-order-cache"]!;
    expect(sys).toMatchObject({ email: "", running: 1, storageBytes: null });
    expect(usageCalls).not.toContain("grid-order-cache");
    expect(r.quotaBytes).toBe(1000);
  });

  it("storage: paling banyak 3 bersamaan, di-cache sampai kedaluwarsa, gagal per akun → null", async () => {
    const now = 100 * 60_000;
    const seconds = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`u${i}`, 10 + i]));
    failUsage.add("u3");
    const first = await accountRows(redisWith({}, seconds, now), now);
    expect(first.rows).toHaveLength(7);
    expect(maxInFlight).toBeLessThanOrEqual(3);
    expect(first.rows.find((x) => x.id === "u3")!.storageBytes).toBeNull();
    expect(first.rows.filter((x) => x.storageBytes !== null)).toHaveLength(6);

    usageCalls.length = 0;
    await accountRows(redisWith({}, seconds, now + 60_000), now + 60_000);
    expect(usageCalls).toEqual(["u3"]); // hanya yang gagal (tidak di-cache) dihitung ulang

    usageCalls.length = 0;
    await accountRows(redisWith({}, seconds, now + 7 * 60_000), now + 7 * 60_000);
    expect(usageCalls.sort()).toEqual(["u0", "u1", "u2", "u3", "u4", "u5", "u6"]); // > 5 + 1 menit
  });
});
