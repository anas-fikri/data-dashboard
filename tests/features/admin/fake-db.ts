import { vi } from "vitest";

/*
 * Prisma palsu dalam memori untuk service admin: cukup untuk kueri yang dipakai service (bukan
 * Prisma umum). $transaction memulihkan state bila callback melempar → "semua-atau-tidak" teruji.
 */

export interface FakeUser {
  id: string;
  email: string;
  name: string | null;
  isAdmin: boolean;
  isActive: boolean;
  emailVerifiedAt: Date | null;
  sessionVersion: number;
}

export interface FakeDataset {
  id: string;
  ownerId: string;
  name: string;
  nameKey: string;
  createdAt: Date;
}

export interface FakeVersion {
  id: string;
  datasetId: string;
  status: string;
  sourceKey: string | null;
  uploadId: string | null;
  sizeBytes: bigint | null;
  errorMessage?: string | null;
}

/** Share dashboard (T-016); datasetId dashboard-nya disalin agar filter relasi mudah dipalsukan. */
export interface FakeShare {
  dashboardId: string;
  datasetId: string;
  userId: string;
  role: "VIEWER" | "EDITOR";
}

export interface FakeToken {
  userId: string;
  purpose: string;
  tokenHash: string;
  expiresAt: Date;
}

interface State {
  users: Map<string, FakeUser>;
  tokens: FakeToken[];
  datasets: FakeDataset[];
  versions: FakeVersion[];
  shares: FakeShare[];
  audits: Record<string, unknown>[];
}

type IdFilter = string | { in: string[] };
const idsOf = (f: IdFilter) => (typeof f === "string" ? [f] : f.in);

export function fakeDb() {
  const state: State = {
    users: new Map(),
    tokens: [],
    datasets: [],
    versions: [],
    shares: [],
    audits: [],
  };
  const locks: string[] = [];

  const tx = {
    $executeRaw: vi.fn(async (_sql: TemplateStringsArray, ...values: unknown[]) => {
      locks.push(String(values[0]));
      return 1;
    }),
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string; email?: string } }) => {
        const u = where.id
          ? state.users.get(where.id)
          : [...state.users.values()].find((x) => x.email === where.email);
        return u ? { ...u } : null;
      }),
      create: vi.fn(
        async ({
          data,
        }: {
          data: Pick<FakeUser, "email" | "name" | "isAdmin" | "emailVerifiedAt">;
        }) => {
          const id = cuid(`new${state.users.size}`);
          const u: FakeUser = { id, isActive: true, sessionVersion: 1, ...data };
          state.users.set(id, u);
          return { ...u };
        },
      ),
      /** Cascade yang relevan untuk service: token dan share yang diterima ikut hilang. */
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        const u = state.users.get(where.id);
        if (!u) throw new Error("P2025");
        state.users.delete(where.id);
        state.tokens = state.tokens.filter((t) => t.userId !== where.id);
        state.shares = state.shares.filter((s) => s.userId !== where.id);
        return { ...u };
      }),
      count: vi.fn(async ({ where }: { where: { isActive?: boolean; isAdmin?: boolean } }) => {
        return [...state.users.values()].filter(
          (u) =>
            (where.isActive === undefined || u.isActive === where.isActive) &&
            (where.isAdmin === undefined || u.isAdmin === where.isAdmin),
        ).length;
      }),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: { isAdmin?: boolean; isActive?: boolean; sessionVersion?: { increment: number } };
        }) => {
          const u = state.users.get(where.id);
          if (!u) throw new Error("P2025");
          if (data.isAdmin !== undefined) u.isAdmin = data.isAdmin;
          if (data.isActive !== undefined) u.isActive = data.isActive;
          if (data.sessionVersion) u.sessionVersion += data.sessionVersion.increment;
          return { ...u };
        },
      ),
    },
    verificationToken: {
      create: vi.fn(async ({ data }: { data: FakeToken }) => {
        state.tokens.push(data);
        return { id: `tok${state.tokens.length}` };
      }),
    },
    dataset: {
      count: vi.fn(
        async ({ where }: { where: { ownerId: string } }) =>
          state.datasets.filter((d) => d.ownerId === where.ownerId).length,
      ),
      findMany: vi.fn(async ({ where }: { where: { ownerId: string } }) =>
        state.datasets
          .filter((d) => d.ownerId === where.ownerId)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .map((d) => ({ id: d.id, name: d.name, nameKey: d.nameKey })),
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: IdFilter; ownerId: string };
          data: Partial<FakeDataset>;
        }) => {
          const ids = idsOf(where.id);
          let count = 0;
          for (const d of state.datasets) {
            if (ids.includes(d.id) && d.ownerId === where.ownerId) {
              Object.assign(d, data);
              count++;
            }
          }
          return { count };
        },
      ),
    },
    datasetVersion: {
      findMany: vi.fn(
        async ({ where }: { where: { datasetId: { in: string[] }; status: string } }) =>
          state.versions
            .filter((v) => where.datasetId.in.includes(v.datasetId) && v.status === where.status)
            .map((v) => ({ id: v.id, sourceKey: v.sourceKey, uploadId: v.uploadId })),
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: { in: string[] }; status: string };
          data: Partial<FakeVersion>;
        }) => {
          let count = 0;
          for (const v of state.versions) {
            if (where.id.in.includes(v.id) && v.status === where.status) {
              Object.assign(v, data);
              count++;
            }
          }
          return { count };
        },
      ),
      aggregate: vi.fn(async ({ where }: { where: { dataset: { ownerId: string } } }) => {
        const owned = new Set(
          state.datasets.filter((d) => d.ownerId === where.dataset.ownerId).map((d) => d.id),
        );
        let sum = 0n;
        for (const v of state.versions) {
          if (owned.has(v.datasetId) && v.status !== "FAILED") sum += v.sizeBytes ?? 0n;
        }
        return { _sum: { sizeBytes: sum } };
      }),
    },
    dashboardShare: {
      deleteMany: vi.fn(
        async ({
          where,
        }: {
          where: { userId: string; dashboard: { datasetId: { in: string[] } } };
        }) => {
          const hit = (s: FakeShare) =>
            s.userId === where.userId && where.dashboard.datasetId.in.includes(s.datasetId);
          const count = state.shares.filter(hit).length;
          state.shares = state.shares.filter((s) => !hit(s));
          return { count };
        },
      ),
    },
    auditLog: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.audits.push(data);
        return { id: `audit${state.audits.length}` };
      }),
    },
  };

  const transaction = async (fn: (t: typeof tx) => unknown) => {
    const snapshot = structuredClone({
      users: state.users,
      tokens: state.tokens,
      datasets: state.datasets,
      versions: state.versions,
      shares: state.shares,
      audits: state.audits,
    });
    try {
      return await fn(tx);
    } catch (e) {
      Object.assign(state, snapshot);
      throw e;
    }
  };

  const prisma = {
    $transaction: vi.fn(transaction),
    user: { count: vi.fn(), findMany: vi.fn() },
  };

  /** Kembalikan ke keadaan kosong (dipanggil di beforeEach; objek mock tetap sama). */
  function reset() {
    vi.clearAllMocks();
    state.users = new Map();
    state.tokens = [];
    state.datasets = [];
    state.versions = [];
    state.shares = [];
    state.audits = [];
    locks.length = 0;
    prisma.$transaction.mockImplementation(transaction);
  }

  return { state, locks, tx, prisma, reset };
}

/** ID berbentuk cuid (lolos isIdShape). */
export const cuid = (tag: string) => `${tag}${"0".repeat(Math.max(0, 24 - tag.length))}`;

export function user(id: string, over: Partial<FakeUser> = {}): FakeUser {
  return {
    id,
    email: `${id.slice(0, 8)}@pcpexpress.com`,
    name: null,
    isAdmin: false,
    isActive: true,
    emailVerifiedAt: new Date("2026-10-01T00:00:00Z"),
    sessionVersion: 1,
    ...over,
  };
}
