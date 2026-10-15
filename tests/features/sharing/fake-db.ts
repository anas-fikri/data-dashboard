import { vi } from "vitest";
import type { ColumnSchema } from "@/features/ingest/infer";

/*
 * Prisma palsu dalam memori untuk berbagi dashboard (T-016): MENGEVALUASI where yang dipakai service
 * (pemilik / share user / share organisasi, relasi dashboard→dataset→owner) alih-alih mencocokkan
 * bentuknya, sehingga predikat akses yang salah membuat test gagal. Bentuk where yang tidak dikenal
 * melempar (tidak diam-diam cocok). Satu objek berperan sebagai prisma dan tx; $transaction memulihkan
 * state bila callback melempar (semua-atau-tidak).
 */

export interface FUser {
  id: string;
  email: string;
  name: string | null;
  isActive: boolean;
  emailVerifiedAt: Date | null;
}
export interface FDataset {
  id: string;
  ownerId: string;
  name: string;
  activeVersionId: string | null;
}
export interface FDashboard {
  id: string;
  datasetId: string;
  name: string;
  orgShared: boolean;
  layout: unknown;
  layoutRevision: number;
  filterColumns: unknown;
  updatedAt: Date;
}
export interface FShare {
  dashboardId: string;
  userId: string;
  role: "VIEWER" | "EDITOR";
  createdById: string | null;
  createdAt: Date;
}
export interface FWidget {
  id: string;
  dashboardId: string;
  type: string;
  title: string;
  spec: unknown;
  missingColumns: string[];
  /** Versi pengaturan (review T-016 DI-1); kosong di seed → SEED_WIDGET_AT. */
  updatedAt?: Date;
}
export interface FSheet {
  id: string;
  versionId: string;
  datasetId: string;
  name: string;
  index: number;
  typedKey: string | null;
  schema: ColumnSchema[] | null;
}

interface State {
  users: FUser[];
  datasets: FDataset[];
  dashboards: FDashboard[];
  shares: FShare[];
  widgets: FWidget[];
  sheets: FSheet[];
  audits: Record<string, unknown>[];
}

type Where = Record<string, unknown>;

const fresh = (): State => ({
  users: [],
  datasets: [],
  dashboards: [],
  shares: [],
  widgets: [],
  sheets: [],
  audits: [],
});

/** Widget.updatedAt bawaan untuk widget seed tanpa updatedAt. */
export const SEED_WIDGET_AT = new Date("2026-10-01T00:00:00.000Z");
const widgetAt = (w: FWidget) => w.updatedAt ?? SEED_WIDGET_AT;
/** Seperti @updatedAt Prisma: diisi waktu sekarang kecuali `data` menyetelnya sendiri. */
const touch = <T extends object>(row: T, data: Partial<T>) =>
  Object.assign(row, { updatedAt: new Date() }, data);

function unknownKey(model: string, key: string): never {
  throw new Error(`fake-db: kunci where ${model}.${key} tidak didukung`);
}

/** Literal LIKE dari escapeLike (\%, \_, \\) kembali ke teks biasa. */
const unescapeLike = (s: string) => s.replace(/\\([\\%_])/g, "$1");

function strMatch(v: string | null, f: unknown): boolean {
  if (typeof f === "string") return v === f;
  const o = f as { not?: unknown; in?: string[]; startsWith?: string; mode?: string };
  if ("not" in o) return v !== o.not;
  if (o.in) return v !== null && o.in.includes(v);
  if (o.startsWith !== undefined) {
    const p = unescapeLike(o.startsWith);
    if (v === null) return false;
    return o.mode === "insensitive" ? v.toLowerCase().startsWith(p.toLowerCase()) : v.startsWith(p);
  }
  throw new Error(`fake-db: filter teks ${JSON.stringify(f)} tidak didukung`);
}

export function fakeShareDb() {
  let state = fresh();
  const locks: string[] = [];

  const datasetOf = (id: string) => state.datasets.find((d) => d.id === id)!;
  const userOf = (id: string) => state.users.find((u) => u.id === id);

  function matchDataset(w: Where, d: FDataset): boolean {
    return Object.entries(w).every(([k, v]) => {
      if (k === "ownerId") return strMatch(d.ownerId, v);
      if (k === "id") return strMatch(d.id, v);
      if (k === "owner") {
        const owner = userOf(d.ownerId);
        return !!owner && matchUser(v as Where, owner);
      }
      return unknownKey("dataset", k);
    });
  }

  function matchDashboard(w: Where, d: FDashboard): boolean {
    return Object.entries(w).every(([k, v]) => {
      if (k === "id") return strMatch(d.id, v);
      if (k === "datasetId") return strMatch(d.datasetId, v);
      if (k === "orgShared") return d.orgShared === v;
      if (k === "OR") return (v as Where[]).some((x) => matchDashboard(x, d));
      if (k === "dataset") return matchDataset(v as Where, datasetOf(d.datasetId));
      if (k === "shares") {
        type ShareWhere = { userId?: string; role?: string };
        const { some, none } = v as { some?: ShareWhere; none?: ShareWhere };
        const f = some ?? none;
        if (!f) return unknownKey("dashboard.shares", Object.keys(v as object).join(","));
        const hit = state.shares.some(
          (s) =>
            s.dashboardId === d.id &&
            (f.userId === undefined || s.userId === f.userId) &&
            (f.role === undefined || s.role === f.role),
        );
        return some ? hit : !hit;
      }
      return unknownKey("dashboard", k);
    });
  }

  function matchWidget(w: Where, x: FWidget): boolean {
    return Object.entries(w).every(([k, v]) => {
      if (k === "id") return x.id === v;
      if (k === "dashboardId") return x.dashboardId === v;
      if (k === "updatedAt") return widgetAt(x).getTime() === (v as Date).getTime();
      if (k === "type") return (v as { in: string[] }).in.includes(x.type);
      if (k === "dashboard") {
        return matchDashboard(
          v as Where,
          state.dashboards.find((d) => d.id === x.dashboardId)!,
        );
      }
      return unknownKey("widget", k);
    });
  }

  function matchSheet(w: Where, s: FSheet): boolean {
    return Object.entries(w).every(([k, v]) => {
      if (k === "id") return strMatch(s.id, v);
      if (k === "versionId") return strMatch(s.versionId, v);
      if (k === "typedKey") return s.typedKey !== null;
      if (k === "version") {
        const vw = v as { datasetId?: string; activeFor?: Where };
        if (vw.datasetId !== undefined) return s.datasetId === vw.datasetId;
        const af = vw.activeFor!;
        const owner = state.datasets.find((d) => d.activeVersionId === s.versionId);
        if (!owner) return false;
        return Object.entries(af).every(([ak, av]) => {
          if (ak === "id") return owner.id === av;
          if (ak === "dashboards") {
            const some = (av as { some: Where }).some;
            return state.dashboards.some(
              (d) => d.datasetId === owner.id && matchDashboard(some, d),
            );
          }
          return unknownKey("sheet.version.activeFor", ak);
        });
      }
      return unknownKey("sheet", k);
    });
  }

  function matchUser(w: Where, u: FUser): boolean {
    return Object.entries(w).every(([k, v]) => {
      if (k === "id") return strMatch(u.id, v);
      if (k === "email") return strMatch(u.email, v);
      if (k === "name") return strMatch(u.name, v);
      if (k === "isActive") return u.isActive === v;
      if (k === "emailVerifiedAt") {
        if (JSON.stringify(v) !== JSON.stringify({ not: null })) unknownKey("user", k);
        return u.emailVerifiedAt !== null;
      }
      if (k === "OR") return (v as Where[]).some((x) => matchUser(x, u));
      if (k === "NOT") return !matchUser(v as Where, u);
      return unknownKey("user", k);
    });
  }

  type Sel = Record<string, unknown> | undefined;
  function dashRow(d: FDashboard, select: Sel) {
    const ds = datasetOf(d.datasetId);
    const sharesSel = select?.shares as { where?: { userId?: string }; take?: number } | undefined;
    let shares = state.shares
      .filter((s) => s.dashboardId === d.id)
      .filter((s) => !sharesSel?.where?.userId || s.userId === sharesSel.where.userId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    if (sharesSel?.take) shares = shares.slice(0, sharesSel.take);
    const widgetSel = select?.widgets as { where?: Where } | undefined;
    const widgets = state.widgets.filter(
      (w) => w.dashboardId === d.id && (!widgetSel?.where || matchWidget(widgetSel.where, w)),
    );
    return {
      ...d,
      dataset: { ...ds, owner: { name: userOf(ds.ownerId)?.name ?? null } },
      shares: shares.map((s) => ({ ...s, user: { ...userOf(s.userId)! } })),
      widgets: widgets.map((w) => ({ ...w, updatedAt: widgetAt(w) })),
      _count: {
        widgets: state.widgets.filter((w) => w.dashboardId === d.id).length,
        shares: state.shares.filter((s) => s.dashboardId === d.id).length,
      },
    };
  }

  const shareKey = (w: { dashboardId_userId: { dashboardId: string; userId: string } }) =>
    w.dashboardId_userId;
  const findShare = (w: { dashboardId_userId: { dashboardId: string; userId: string } }) => {
    const k = shareKey(w);
    return state.shares.find((s) => s.dashboardId === k.dashboardId && s.userId === k.userId);
  };

  let seq = 0;
  const db = {
    $executeRaw: vi.fn(async (sql: unknown, ...values: unknown[]) => {
      // Prisma.sql (dashboards/service) atau template tag (sharing/service).
      const v = (sql as { values?: unknown[] }).values?.[0] ?? values[0];
      locks.push(String(v));
      return 1;
    }),
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => {
      const snapshot = structuredClone(state);
      try {
        return await fn(db);
      } catch (e) {
        state = snapshot;
        throw e;
      }
    }),
    dashboard: {
      findFirst: vi.fn(async ({ where, select }: { where: Where; select?: Sel }) => {
        const d = state.dashboards.find((x) => matchDashboard(where, x));
        return d ? dashRow(d, select) : null;
      }),
      findMany: vi.fn(
        async ({ where, select, take }: { where: Where; select?: Sel; take?: number }) =>
          state.dashboards
            .filter((x) => matchDashboard(where, x))
            .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
            .slice(0, take ?? Infinity)
            .map((d) => dashRow(d, select)),
      ),
      updateMany: vi.fn(async ({ where, data }: { where: Where; data: Partial<FDashboard> }) => {
        const hit = state.dashboards.filter((x) => matchDashboard(where, x));
        for (const d of hit) touch(d, data);
        return { count: hit.length };
      }),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Partial<FDashboard> }) => {
          const d = state.dashboards.find((x) => x.id === where.id);
          if (!d) throw new Error("P2025");
          touch(d, data);
          return { id: d.id };
        },
      ),
      deleteMany: vi.fn(async ({ where }: { where: Where }) => {
        const hit = new Set(
          state.dashboards.filter((x) => matchDashboard(where, x)).map((d) => d.id),
        );
        state.dashboards = state.dashboards.filter((d) => !hit.has(d.id));
        state.shares = state.shares.filter((s) => !hit.has(s.dashboardId));
        state.widgets = state.widgets.filter((w) => !hit.has(w.dashboardId));
        return { count: hit.size };
      }),
    },
    widget: {
      findFirst: vi.fn(async ({ where, select }: { where: Where; select?: Sel }) => {
        const w = state.widgets.find((x) => matchWidget(where, x));
        if (!w) return null;
        const d = state.dashboards.find((x) => x.id === w.dashboardId)!;
        // Kolom peran (roleSelect) dashboard bila diminta, mis. configureWidget (review T-016 SEC-1).
        const dashSel = (select?.dashboard as { select?: Sel } | undefined)?.select;
        return { ...w, updatedAt: widgetAt(w), dashboard: dashRow(d, dashSel) };
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Where; data: Partial<FWidget> }) => {
        const hit = state.widgets.filter((x) => matchWidget(where, x));
        for (const w of hit) touch(w, data);
        return { count: hit.length };
      }),
      create: vi.fn(async ({ data }: { data: Omit<FWidget, "id" | "missingColumns"> }) => {
        const w = {
          id: `cmv4kljx40009oczvdmpunw${String(++seq).padStart(2, "0")}`,
          missingColumns: [],
          updatedAt: new Date(),
          ...data,
        };
        state.widgets.push(w);
        return { id: w.id, type: w.type, title: w.title, spec: w.spec, updatedAt: w.updatedAt };
      }),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        state.widgets = state.widgets.filter((w) => w.id !== where.id);
        return {};
      }),
    },
    sheet: {
      findFirst: vi.fn(async ({ where }: { where: Where }) => {
        const s = state.sheets.find((x) => matchSheet(where, x));
        return s ? { ...s, version: { datasetId: s.datasetId } } : null;
      }),
      findMany: vi.fn(async ({ where }: { where: Where }) =>
        state.sheets.filter((x) => matchSheet(where, x)).sort((a, b) => a.index - b.index),
      ),
      count: vi.fn(
        async ({ where }: { where: Where }) =>
          state.sheets.filter((x) => matchSheet(where, x)).length,
      ),
      groupBy: vi.fn(async () => []),
    },
    dashboardShare: {
      findUnique: vi.fn(async ({ where }: { where: Parameters<typeof findShare>[0] }) => {
        const s = findShare(where);
        return s ? { role: s.role } : null;
      }),
      count: vi.fn(
        async ({ where }: { where: { dashboardId: string } }) =>
          state.shares.filter((s) => s.dashboardId === where.dashboardId).length,
      ),
      create: vi.fn(async ({ data }: { data: Omit<FShare, "createdAt"> }) => {
        state.shares.push({ ...data, createdAt: new Date(Date.now() + ++seq) });
        return { id: `share${seq}` };
      }),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: Parameters<typeof findShare>[0];
          data: Partial<FShare>;
        }) => {
          const s = findShare(where);
          if (!s) throw new Error("P2025");
          Object.assign(s, data);
          return { id: "share" };
        },
      ),
      delete: vi.fn(async ({ where }: { where: Parameters<typeof findShare>[0] }) => {
        const s = findShare(where);
        if (!s) throw new Error("P2025");
        state.shares = state.shares.filter((x) => x !== s);
        return { id: "share" };
      }),
    },
    user: {
      findFirst: vi.fn(async ({ where }: { where: Where }) => {
        const u = state.users.find((x) => matchUser(where, x));
        return u ? { id: u.id, email: u.email, name: u.name } : null;
      }),
      findMany: vi.fn(async ({ where, take }: { where: Where; take?: number }) =>
        state.users
          .filter((x) => matchUser(where, x))
          .sort((a, b) => a.email.localeCompare(b.email))
          .slice(0, take ?? Infinity)
          .map((u) => ({ id: u.id, email: u.email, name: u.name })),
      ),
    },
    auditLog: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.audits.push(data);
        return { id: `audit${state.audits.length}` };
      }),
    },
  };

  return {
    db,
    locks,
    get state() {
      return state;
    },
    reset() {
      vi.clearAllMocks();
      state = fresh();
      locks.length = 0;
    },
  };
}

/** ID berbentuk cuid (lolos isIdShape). */
export const cuid = (tag: string) => `c${tag}${"0".repeat(Math.max(0, 24 - tag.length))}`;

export const col = (pos: number, name: string, type: ColumnSchema["type"], hidden = false) =>
  ({
    pos,
    name,
    original: name,
    type,
    hidden,
    nullPct: 0,
    distinctCount: 0,
    castFailCount: 0,
  }) as ColumnSchema;

export function userRow(id: string, over: Partial<FUser> = {}): FUser {
  return {
    id,
    email: `${id.slice(1, 9)}@pcpexpress.com`,
    name: null,
    isActive: true,
    emailVerifiedAt: new Date("2026-10-01T00:00:00Z"),
    ...over,
  };
}
