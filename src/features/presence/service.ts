import "server-only";
import { prisma } from "@/lib/db";
import { redisReady } from "@/lib/redis";
import { cleanName } from "@/lib/text";
import { pathLabel, pathRef } from "./labels";
import { readOnline, type PresenceEntry, type PresenceRedis } from "./store";

/*
 * Daftar user online untuk admin (T-h807). Kehadiran dari Redis dicocokkan ke DB: hanya akun aktif yang
 * dihitung/ditampilkan (akun yang baru dinonaktifkan tidak menunggu jendela online habis). Label halaman
 * memakai nama dashboard/dataset saat ini.
 */

export interface OnlineUser {
  id: string;
  name: string | null;
  email: string;
  /** ISO terakhir aktif. */
  lastSeen: string;
  /** Label ramah halaman terakhir, mis. "Dashboard Penjualan". */
  page: string;
}

export interface PresenceDeps {
  redis(): Promise<PresenceRedis>;
  activeUsers(ids: string[]): Promise<{ id: string; name: string | null; email: string }[]>;
  dashboardNames(ids: string[]): Promise<{ id: string; name: string }[]>;
  datasetNames(ids: string[]): Promise<{ id: string; name: string }[]>;
}

const prodDeps: PresenceDeps = {
  redis: redisReady,
  activeUsers: (ids) =>
    prisma.user.findMany({
      where: { id: { in: ids }, isActive: true },
      select: { id: true, name: true, email: true },
    }),
  dashboardNames: (ids) =>
    prisma.dashboard.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
  datasetNames: (ids) =>
    prisma.dataset.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
};

async function activeEntries(
  deps: PresenceDeps,
  now: number,
  paths = true,
): Promise<{
  entries: PresenceEntry[];
  users: Map<string, { name: string | null; email: string }>;
}> {
  const entries = await readOnline(await deps.redis(), now, undefined, { paths });
  const users = new Map(
    entries.length
      ? (await deps.activeUsers(entries.map((e) => e.userId))).map((u) => [u.id, u] as const)
      : [],
  );
  return { entries: entries.filter((e) => users.has(e.userId)), users };
}

/** Jumlah user aktif yang online (kartu Server admin). */
export async function countOnline(
  deps: PresenceDeps = prodDeps,
  now = Date.now(),
): Promise<number> {
  return (await activeEntries(deps, now, false)).entries.length;
}

/**
 * Bagian /api/metrics untuk kartu Server (T-h807): jumlah online HANYA untuk admin; user lain {} (tanpa
 * kunci `online` sama sekali). Gagal dibaca → {} (kartu tetap jalan) dan galat diteruskan ke `onError`.
 */
export async function onlineForMetrics(
  isAdmin: boolean,
  count: () => Promise<number> = () => countOnline(),
  onError: (e: unknown) => void = () => undefined,
): Promise<{ online?: number }> {
  if (!isAdmin) return {};
  try {
    return { online: await count() };
  } catch (e) {
    onError(e);
    return {};
  }
}

/** Daftar user online, terbaru dulu (Admin › Pengguna). */
export async function listOnline(
  deps: PresenceDeps = prodDeps,
  now = Date.now(),
): Promise<OnlineUser[]> {
  const { entries, users } = await activeEntries(deps, now);
  const refs = entries.map((e) => pathRef(e.path));
  const ids = (kind: "dashboard" | "dataset") => [
    ...new Set(refs.flatMap((r) => (r && r.kind === kind ? [r.id] : []))),
  ];
  const [dash, data] = await Promise.all([
    ids("dashboard").length ? deps.dashboardNames(ids("dashboard")) : [],
    ids("dataset").length ? deps.datasetNames(ids("dataset")) : [],
  ]);
  const names = new Map([...dash, ...data].map((x) => [x.id, x.name] as const));
  return entries.map((e, i) => {
    const u = users.get(e.userId)!;
    const ref = refs[i]!;
    return {
      id: e.userId,
      name: cleanName(u.name),
      email: u.email,
      lastSeen: new Date(e.lastSeen).toISOString(),
      page: pathLabel(ref, ref && ref.kind !== "static" ? names.get(ref.id) : null),
    };
  });
}
