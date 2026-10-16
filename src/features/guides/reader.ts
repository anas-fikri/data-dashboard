import "server-only";
import type { GuideArticle, GuideContext, GuideRole, Prisma } from "@prisma/client";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { cuidSchema } from "./validation";

/*
 * Sisi pembaca panduan (T-022). Peran diturunkan dari data user, bukan dipilih user:
 *   ADMIN  = isAdmin;
 *   OWNER  = punya dataset, atau user baru (belum punya dataset dan belum menerima share);
 *   EDITOR / VIEWER = menerima share dashboard dengan peran itu (share eksplisit).
 * Artikel role ALL selalu terlihat. Artikel di luar peran user tidak pernah dikembalikan (slug → 404).
 */

export const SEARCH_MIN = 2;
export const SEARCH_MAX = 100;

export const guideRolesFor = cache(
  async (userId: string, isAdmin: boolean): Promise<GuideRole[]> => {
    const [dataset, shares] = await Promise.all([
      prisma.dataset.findFirst({ where: { ownerId: userId }, select: { id: true } }),
      prisma.dashboardShare.findMany({
        where: { userId },
        select: { role: true },
        distinct: ["role"],
      }),
    ]);
    const roles: GuideRole[] = [];
    if (dataset || !shares.length) roles.push("OWNER");
    if (shares.some((s) => s.role === "EDITOR")) roles.push("EDITOR");
    if (shares.some((s) => s.role === "VIEWER")) roles.push("VIEWER");
    if (isAdmin) roles.push("ADMIN");
    return roles;
  },
);

const visible = (roles: readonly GuideRole[]): Prisma.GuideArticleWhereInput => ({
  status: "PUBLISHED",
  role: { in: [...new Set<GuideRole>([...roles, "ALL"])] },
});
const ORDER = [
  { order: "asc" },
  { createdAt: "asc" },
] satisfies Prisma.GuideArticleOrderByWithRelationInput[];

export interface GuideSummary {
  id: string;
  slug: string;
  title: string;
  role: GuideRole;
  bodyMarkdown: string;
  videoCount: number;
}

const SUMMARY = {
  id: true,
  slug: true,
  title: true,
  role: true,
  bodyMarkdown: true,
  _count: { select: { videos: { where: { status: "READY" } } } },
} as const;

type SummaryRow = Pick<GuideArticle, "id" | "slug" | "title" | "role" | "bodyMarkdown"> & {
  _count: { videos: number };
};
const summary = ({ _count, ...g }: SummaryRow): GuideSummary => ({
  ...g,
  videoCount: _count.videos,
});

/** Artikel satu tab peran (harus salah satu peran user atau ALL). */
export async function guidesForTab(
  roles: readonly GuideRole[],
  tab: GuideRole,
): Promise<GuideSummary[]> {
  if (tab !== "ALL" && !roles.includes(tab)) return [];
  const rows = await prisma.guideArticle.findMany({
    where: { status: "PUBLISHED", role: tab },
    orderBy: ORDER,
    select: SUMMARY,
  });
  return rows.map(summary);
}

/** Wildcard LIKE di kata kunci diperlakukan sebagai huruf biasa. */
const likeSafe = (q: string) => q.replace(/[\\%_]/g, "\\$&");

/** Cari judul/isi (tanpa beda huruf besar-kecil) di artikel yang boleh dilihat user. */
export async function searchGuides(
  roles: readonly GuideRole[],
  rawQuery: string,
): Promise<GuideSummary[]> {
  const q = rawQuery.trim().slice(0, SEARCH_MAX);
  if (q.length < SEARCH_MIN) return [];
  const term = likeSafe(q);
  const rows = await prisma.guideArticle.findMany({
    where: {
      ...visible(roles),
      OR: [
        { title: { contains: term, mode: "insensitive" } },
        { bodyMarkdown: { contains: term, mode: "insensitive" } },
      ],
    },
    orderBy: ORDER,
    take: 50,
    select: SUMMARY,
  });
  return rows.map(summary);
}

export function guideBySlug(roles: readonly GuideRole[], slug: string) {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return Promise.resolve(null);
  return prisma.guideArticle.findFirst({ where: { ...visible(roles), slug } });
}

/** Artikel bantuan untuk satu halaman (konteks), sesuai peran user. */
export function contextGuides(roles: readonly GuideRole[], context: GuideContext) {
  return prisma.guideArticle.findMany({
    where: { ...visible(roles), contextKey: context },
    orderBy: ORDER,
    take: 5,
  });
}

/** Artikel pertama yang disarankan untuk user (urutan admin) — tujuan kartu "Mulai di sini". */
export function firstGuide(roles: readonly GuideRole[]) {
  return prisma.guideArticle.findFirst({
    where: visible(roles),
    orderBy: ORDER,
    select: { slug: true, title: true },
  });
}

export async function readArticleIds(userId: string, articleIds: string[]): Promise<Set<string>> {
  if (!articleIds.length) return new Set();
  const rows = await prisma.guideRead.findMany({
    where: { userId, articleId: { in: articleIds } },
    select: { articleId: true },
  });
  return new Set(rows.map((r) => r.articleId));
}

export async function hasReadAny(userId: string): Promise<boolean> {
  return !!(await prisma.guideRead.findFirst({ where: { userId }, select: { id: true } }));
}

/** Tandai dibaca; artikel di luar peran user / belum terbit → false (NOT_FOUND). */
export async function markRead(
  userId: string,
  roles: readonly GuideRole[],
  articleId: unknown,
): Promise<boolean> {
  if (!cuidSchema.safeParse(articleId).success) return false;
  const article = await prisma.guideArticle.findFirst({
    where: { ...visible(roles), id: articleId as string },
    select: { id: true },
  });
  if (!article) return false;
  await prisma.guideRead.upsert({
    where: { userId_articleId: { userId, articleId: article.id } },
    create: { userId, articleId: article.id },
    update: {},
  });
  return true;
}

/** Cuplikan teks polos dari markdown untuk daftar (tanpa sintaks, ≤ 160 karakter). */
export function excerptOf(md: string, max = 160): string {
  const text = md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~|]+/g, " ")
    .replace(/(^|\s)-+(?=\s)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
