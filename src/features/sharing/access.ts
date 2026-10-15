import "server-only";
import type { Prisma } from "@prisma/client";
import { isIdShape } from "@/features/datasets/validation";
import { prisma } from "@/lib/db";

/*
 * Akses dashboard (T-016). Satu sumber kebenaran: OWNER = pemilik dataset dashboard; selain itu peran
 * tertinggi dari share milik user (VIEWER/EDITOR) dan share organisasi (VIEWER saja). Akses per
 * DASHBOARD, tidak pernah lewat dataset. Tidak pernah di-cache lintas permintaan: pencabutan berlaku
 * pada muatan berikutnya. Jalur tulis memakai canEditWhere di dalam transaksi lock-nya (tanpa TOCTOU).
 */

export type DashboardAccessRole = "OWNER" | "EDITOR" | "VIEWER";

/** Dashboard yang boleh dilihat user (pemilik, share user, atau share organisasi). */
export const canViewWhere = (userId: string): Prisma.DashboardWhereInput => ({
  OR: [{ dataset: { ownerId: userId } }, { shares: { some: { userId } } }, { orgShared: true }],
});

/** Dashboard yang boleh diubah widget/layout-nya (pemilik atau share EDITOR). */
export const canEditWhere = (userId: string): Prisma.DashboardWhereInput => ({
  OR: [{ dataset: { ownerId: userId } }, { shares: { some: { userId, role: "EDITOR" } } }],
});

/** Potongan select agar peran dihitung di query yang sama dengan datanya (lihat roleOf). */
export const roleSelect = (userId: string) =>
  ({
    orgShared: true,
    dataset: { select: { ownerId: true } },
    shares: { where: { userId }, select: { role: true }, take: 1 },
  }) satisfies Prisma.DashboardSelect;

export interface RoleRow {
  orgShared: boolean;
  dataset: { ownerId: string };
  shares: { role: "VIEWER" | "EDITOR" }[];
}

export function roleOf(userId: string, row: RoleRow): DashboardAccessRole | null {
  if (row.dataset.ownerId === userId) return "OWNER";
  const own = row.shares[0]?.role;
  if (own === "EDITOR") return "EDITOR";
  return own === "VIEWER" || row.orgShared ? "VIEWER" : null;
}

export const canEdit = (role: DashboardAccessRole | null) => role === "OWNER" || role === "EDITOR";

export interface DashboardAccess {
  role: DashboardAccessRole;
  datasetId: string;
  activeVersionId: string | null;
}

/** Peran user pada dashboard (null = tidak ada akses → 404). Satu query, tanpa cache. */
export async function dashboardAccess(
  userId: string,
  dashboardId: unknown,
): Promise<DashboardAccess | null> {
  if (!isIdShape(dashboardId)) return null;
  const d = await prisma.dashboard.findFirst({
    where: { id: dashboardId, ...canViewWhere(userId) },
    select: {
      ...roleSelect(userId),
      dataset: { select: { id: true, ownerId: true, activeVersionId: true } },
    },
  });
  if (!d) return null;
  const role = roleOf(userId, d);
  return role && { role, datasetId: d.dataset.id, activeVersionId: d.dataset.activeVersionId };
}
