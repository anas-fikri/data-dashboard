import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/*
 * T-zjwh: pemetaan job aktif → pemilik (review T-qed9 L4) dan cache storage per akun (TTL 5 menit sukses,
 * 60 dtk gagal; review T-qed9 Low-1/Low-2).
 */
const jobs = vi.hoisted(() => ({
  ingest: [] as unknown[],
  recast: [] as unknown[],
  export: [] as unknown[],
  pdf: [] as unknown[],
}));
const usage = vi.hoisted(() => vi.fn());
const q = (k: keyof typeof jobs) => ({ getJobs: async () => jobs[k] });

vi.mock("@/lib/queue/connection", () => ({
  ingestQueue: () => q("ingest"),
  recastQueue: () => q("recast"),
  exportQueue: () => q("export"),
  pdfQueue: () => q("pdf"),
  MAP_VERSION_JOB: "map-version",
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
        where.id.in.map((id) => ({ userId: `exporter-of-${id}` })),
    },
    user: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.map((id) => ({ id, email: `${id}@x`, name: null })),
    },
  },
}));
vi.mock("@/features/uploads/quota", () => ({ userUsage: usage }));
vi.mock("@/lib/env", () => ({ env: () => ({ USER_STORAGE_QUOTA_BYTES: 100 }) }));
vi.mock("@/lib/metrics/store", () => ({ readAccountActivity: async () => new Map() }));

import { accountRows, jobsByUser } from "@/features/metrics/accounts";

beforeEach(() => {
  for (const k of Object.keys(jobs) as (keyof typeof jobs)[]) jobs[k] = [];
  usage.mockReset();
  (globalThis as { metricsUsage?: unknown }).metricsUsage = undefined;
});

describe("jobsByUser", () => {
  it("ingest/atur periode → pemilik dataset, recast userId vs map-version actorId, ekspor+PDF → pemilik ekspor", async () => {
    jobs.ingest = [
      { name: "ingest", data: { versionId: "v1" } },
      { name: "period-setup", data: { versionId: "v2" } },
    ];
    jobs.recast = [
      { name: "recast", data: { userId: "u1" } },
      { name: "map-version", data: { actorId: "u2", userId: "abaikan" } },
      { name: "recast", data: {} }, // job lama tanpa pemilik
    ];
    jobs.export = [{ name: "export", data: { exportId: "e1" } }];
    jobs.pdf = [{ name: "pdf", data: { exportId: "e2" } }];
    const out = await jobsByUser();
    expect(Object.fromEntries(out)).toEqual({
      "owner-of-v1": { upload: 1, recast: 0, export: 0 },
      "owner-of-v2": { upload: 1, recast: 0, export: 0 },
      u1: { upload: 0, recast: 1, export: 0 },
      u2: { upload: 0, recast: 1, export: 0 },
      "exporter-of-e1": { upload: 0, recast: 0, export: 1 },
      "exporter-of-e2": { upload: 0, recast: 0, export: 1 },
    });
  });
});

describe("storage per akun", () => {
  it("sukses di-cache ≥ 5 menit (± 4 menit tanpa hitung ulang); gagal di-cache 60 dtk", async () => {
    jobs.recast = [
      { name: "recast", data: { userId: "ok" } },
      { name: "recast", data: { userId: "slow" } },
    ];
    usage.mockImplementation(async (_: unknown, id: string) => {
      if (id === "slow") throw new Error("timeout");
      return { bytes: 42 };
    });
    const t0 = 1_000_000;
    const first = await accountRows({} as never, t0);
    const by = (rows: typeof first.rows) =>
      Object.fromEntries(rows.map((r) => [r.id, r.storageBytes]));
    expect(by(first.rows)).toEqual({ ok: 42, slow: null });
    expect(usage).toHaveBeenCalledTimes(2);
    await accountRows({} as never, t0 + 30_000);
    expect(usage).toHaveBeenCalledTimes(2); // gagal masih di-cache
    await accountRows({} as never, t0 + 61_000);
    expect(usage).toHaveBeenCalledTimes(3); // hanya akun gagal yang dicoba lagi
    await accountRows({} as never, t0 + 4 * 60_000);
    expect(usage.mock.calls.filter(([, id]) => id === "ok")).toHaveLength(1);
  });
});
