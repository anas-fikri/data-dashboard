import "server-only";
import { guideRolesFor, searchGuides, searchQuery, SEARCH_MIN } from "@/features/guides/reader";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { escapeLike } from "@/lib/text";

/*
 * Cari cepat Ctrl+K (T-k6k0): dataset milik user, dashboard yang boleh dilihatnya (milik, dibagikan
 * langsung, atau ke organisasi dari pemilik yang masih aktif — aturan yang sama dengan halaman Dashboard), dan panduan sesuai perannya.
 * Kata kunci kosong → dataset/dashboard terbaru (tanpa panduan). Wildcard LIKE diperlakukan sebagai huruf.
 */

export const QUICK_LIMIT = { datasets: 6, dashboards: 8, guides: 6 } as const;

/** Dashboard yang muncul di cari cepat: sama dengan halaman Dashboard (milik, share langsung, organisasi dari pemilik aktif). */
const searchableDashboards = (userId: string): Prisma.DashboardWhereInput => ({
  OR: [
    { dataset: { ownerId: userId } },
    { shares: { some: { userId } } },
    { orgShared: true, dataset: { owner: { isActive: true } } },
  ],
});

export interface QuickResults {
  datasets: { id: string; name: string }[];
  dashboards: { id: string; name: string; datasetName: string; shared: boolean }[];
  guides: { slug: string; title: string }[];
}

export async function quickSearch(
  user: { id: string; isAdmin: boolean },
  raw: string,
): Promise<QuickResults> {
  const q = searchQuery(raw);
  const name = q ? { name: { contains: escapeLike(q), mode: "insensitive" as const } } : {};
  const [datasets, dashboards, guides] = await Promise.all([
    prisma.dataset.findMany({
      where: { ownerId: user.id, ...name },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take: QUICK_LIMIT.datasets,
      select: { id: true, name: true },
    }),
    prisma.dashboard.findMany({
      // Aturan daftar dashboard (sharedRanked): share organisasi hanya dari pemilik yang masih aktif.
      where: { ...searchableDashboards(user.id), ...name },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take: QUICK_LIMIT.dashboards,
      select: { id: true, name: true, dataset: { select: { name: true, ownerId: true } } },
    }),
    q.length >= SEARCH_MIN
      ? guideRolesFor(user.id, user.isAdmin).then((roles) => searchGuides(roles, q))
      : Promise.resolve([]),
  ]);
  return {
    datasets,
    dashboards: dashboards.map((d) => ({
      id: d.id,
      name: d.name,
      datasetName: d.dataset.name,
      shared: d.dataset.ownerId !== user.id,
    })),
    guides: guides.slice(0, QUICK_LIMIT.guides).map((g) => ({ slug: g.slug, title: g.title })),
  };
}
