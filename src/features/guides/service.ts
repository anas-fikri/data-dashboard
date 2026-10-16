import "server-only";
import { Prisma, type GuideArticle, type GuideRole } from "@prisma/client";
import { recordAudit } from "@/features/audit/service";
import { prisma } from "@/lib/db";
import { cuidSchema, guideInputSchema, type GuideInput } from "./validation";

/*
 * Artikel panduan (T-020). Pemanggil perubahan WAJIB sudah lolos requireAdmin("action") (actions.ts);
 * service memvalidasi isi (zod) dan menulis AuditLog untuk terbit/tarik/hapus. Urutan = kolom `order`
 * global (naik); tukar urutan = tukar nilai dengan tetangga dalam satu transaksi. Pembaca (/panduan)
 * hanya mendapat artikel PUBLISHED untuk perannya + ALL.
 */

export type GuideCode = "NOT_FOUND" | "INVALID" | "SLUG_TAKEN" | "EDGE";
export type GuideResult<T = null> =
  | { ok: true; data: T }
  | {
      ok: false;
      code: GuideCode;
      message: string;
      fields?: Partial<Record<keyof GuideInput, string>>;
    };

const notFound = { ok: false, code: "NOT_FOUND", message: "Artikel tidak ditemukan." } as const;

function invalid(error: {
  issues: { path: PropertyKey[]; message: string }[];
}): GuideResult<never> {
  const fields: Partial<Record<keyof GuideInput, string>> = {};
  for (const i of error.issues) {
    const key = i.path[0] as keyof GuideInput | undefined;
    if (key && !fields[key]) fields[key] = i.message;
  }
  return { ok: false, code: "INVALID", message: "Periksa isian yang ditandai.", fields };
}

const slugTaken = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
const SLUG_TAKEN: GuideResult<never> = {
  ok: false,
  code: "SLUG_TAKEN",
  message: "Slug sudah dipakai artikel lain.",
  fields: { slug: "Slug sudah dipakai artikel lain." },
};

export function listGuidesForAdmin(): Promise<GuideArticle[]> {
  return prisma.guideArticle.findMany({ orderBy: [{ order: "asc" }, { createdAt: "asc" }] });
}

export async function getGuide(id: string): Promise<GuideArticle | null> {
  if (!cuidSchema.safeParse(id).success) return null;
  return prisma.guideArticle.findUnique({ where: { id } });
}

export async function createGuide(input: unknown): Promise<GuideResult<{ id: string }>> {
  const parsed = guideInputSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  try {
    const row = await prisma.$transaction(async (tx) => {
      const last = await tx.guideArticle.aggregate({ _max: { order: true } });
      return tx.guideArticle.create({
        data: { ...parsed.data, order: (last._max.order ?? 0) + 1, status: "DRAFT" },
        select: { id: true },
      });
    });
    return { ok: true, data: row };
  } catch (e) {
    if (slugTaken(e)) return SLUG_TAKEN;
    throw e;
  }
}

export async function updateGuide(id: string, input: unknown): Promise<GuideResult> {
  if (!cuidSchema.safeParse(id).success) return notFound;
  const parsed = guideInputSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  try {
    const r = await prisma.guideArticle.updateMany({ where: { id }, data: parsed.data });
    return r.count ? { ok: true, data: null } : notFound;
  } catch (e) {
    if (slugTaken(e)) return SLUG_TAKEN;
    throw e;
  }
}

export async function setGuideStatus(
  actorId: string,
  id: string,
  status: "DRAFT" | "PUBLISHED",
  ip: string,
): Promise<GuideResult> {
  if (!cuidSchema.safeParse(id).success) return notFound;
  return prisma.$transaction(async (tx) => {
    const row = await tx.guideArticle.findUnique({
      where: { id },
      select: { slug: true, role: true },
    });
    if (!row) return notFound;
    await tx.guideArticle.update({ where: { id }, data: { status } });
    await recordAudit(tx, {
      actorId,
      action: status === "PUBLISHED" ? "guide.publish" : "guide.unpublish",
      targetType: "guide",
      targetId: id,
      meta: { slug: row.slug, role: row.role },
      ip,
    });
    return { ok: true, data: null } as const;
  });
}

/** Tukar urutan dengan artikel sebelum/sesudahnya (urutan global). EDGE bila sudah paling ujung. */
export async function moveGuide(id: string, dir: "up" | "down"): Promise<GuideResult> {
  if (!cuidSchema.safeParse(id).success) return notFound;
  return prisma.$transaction(async (tx) => {
    const all = await tx.guideArticle.findMany({
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: { id: true, order: true },
    });
    const at = all.findIndex((g) => g.id === id);
    if (at < 0) return notFound;
    const other = all[dir === "up" ? at - 1 : at + 1];
    if (!other) {
      return {
        ok: false,
        code: "EDGE",
        message: dir === "up" ? "Sudah paling atas." : "Sudah paling bawah.",
      } as const;
    }
    // Urutan duplikat (data lama): nilai baru dari posisi agar penukaran selalu terlihat.
    const [a, b] = [all[at]!.order, other.order];
    const [na, nb] = a === b ? (dir === "up" ? [b, a + 1] : [b + 1, a]) : [b, a];
    await tx.guideArticle.update({ where: { id }, data: { order: na } });
    await tx.guideArticle.update({ where: { id: other.id }, data: { order: nb } });
    return { ok: true, data: null } as const;
  });
}

export async function deleteGuide(actorId: string, id: string, ip: string): Promise<GuideResult> {
  if (!cuidSchema.safeParse(id).success) return notFound;
  return prisma.$transaction(async (tx) => {
    const row = await tx.guideArticle.findUnique({
      where: { id },
      select: { slug: true, role: true },
    });
    if (!row) return notFound;
    await tx.guideArticle.delete({ where: { id } });
    await recordAudit(tx, {
      actorId,
      action: "guide.delete",
      targetType: "guide",
      targetId: id,
      meta: { slug: row.slug, role: row.role },
      ip,
    });
    return { ok: true, data: null } as const;
  });
}

/** Artikel terbit untuk peran-peran ini (+ ALL), urut tampil. */
export function publishedGuides(roles: readonly GuideRole[]): Promise<GuideArticle[]> {
  return prisma.guideArticle.findMany({
    where: { status: "PUBLISHED", role: { in: [...new Set<GuideRole>([...roles, "ALL"])] } },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
}
