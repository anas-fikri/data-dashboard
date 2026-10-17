import "server-only";
import { Prisma, type GuideArticle, type GuideRole } from "@prisma/client";
import { recordAudit } from "@/features/audit/service";
import { prisma } from "@/lib/db";
import { cuidSchema, guideInputSchema, type GuideInput } from "./validation";
import { removeVideoObjects, scheduleVideoCleanup } from "./videos";

/*
 * Artikel panduan (T-020). Pemanggil perubahan WAJIB sudah lolos requireAdmin("action") (actions.ts);
 * service memvalidasi isi (zod) dan menulis AuditLog {slug, role} (tanpa isi artikel) untuk
 * buat/ubah/terbit/tarik/hapus di transaksi yang sama (T-0vjt: buat/ubah). Urutan = kolom `order`
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

export async function createGuide(
  actorId: string,
  input: unknown,
  ip: string,
): Promise<GuideResult<{ id: string }>> {
  const parsed = guideInputSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { slug, role } = parsed.data;
  try {
    const row = await prisma.$transaction(async (tx) => {
      const last = await tx.guideArticle.aggregate({ _max: { order: true } });
      const created = await tx.guideArticle.create({
        data: { ...parsed.data, order: (last._max.order ?? 0) + 1, status: "DRAFT" },
        select: { id: true },
      });
      await recordAudit(tx, {
        actorId,
        action: "guide.create",
        targetType: "guide",
        targetId: created.id,
        meta: { slug, role },
        ip,
      });
      return created;
    });
    return { ok: true, data: row };
  } catch (e) {
    if (slugTaken(e)) return SLUG_TAKEN;
    throw e;
  }
}

export async function updateGuide(
  actorId: string,
  id: string,
  input: unknown,
  ip: string,
): Promise<GuideResult> {
  if (!cuidSchema.safeParse(id).success) return notFound;
  const parsed = guideInputSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { slug, role } = parsed.data;
  try {
    return await prisma.$transaction(async (tx) => {
      const r = await tx.guideArticle.updateMany({ where: { id }, data: parsed.data });
      if (!r.count) return notFound;
      await recordAudit(tx, {
        actorId,
        action: "guide.update",
        targetType: "guide",
        targetId: id,
        meta: { slug, role },
        ip,
      });
      return { ok: true, data: null } as const;
    });
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
    // Sudah berstatus ini (terbit ulang, klik ganda, tab basi): tanpa perubahan, tanpa audit ganda.
    // Syarat status di UPDATE (bukan cek terpisah): dua permintaan serentak → hanya satu yang mengubah.
    const r = await tx.guideArticle.updateMany({
      where: { id, status: { not: status } },
      data: { status },
    });
    // Dibaca SESUDAH UPDATE: baris terkunci sampai transaksi selesai, jadi slug/peran di audit sama dengan
    // baris yang diubah; baris yang hilang (dihapus bersamaan) → NOT_FOUND, bukan sukses (review T-0vjt).
    const row = await tx.guideArticle.findUnique({
      where: { id },
      select: { slug: true, role: true },
    });
    if (!row) return notFound;
    if (!r.count) return { ok: true, data: null } as const;
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
  let videos: Parameters<typeof removeVideoObjects>[0] = [];
  const result = await prisma.$transaction(async (tx) => {
    const row = await tx.guideArticle.findUnique({
      where: { id },
      select: { slug: true, role: true },
    });
    if (!row) return notFound;
    // Baris video ikut terhapus (cascade); objeknya dihapus setelah transaksi.
    videos = await tx.guideVideo.findMany({
      where: { articleId: id },
      select: { id: true, objectKey: true, uploadId: true, posterKey: true },
    });
    await tx.guideArticle.delete({ where: { id } });
    await scheduleVideoCleanup(tx, videos);
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
  if (result.ok) await removeVideoObjects(videos);
  return result;
}

/** Artikel terbit untuk peran-peran ini (+ ALL), urut tampil. */
export function publishedGuides(roles: readonly GuideRole[]): Promise<GuideArticle[]> {
  return prisma.guideArticle.findMany({
    where: { status: "PUBLISHED", role: { in: [...new Set<GuideRole>([...roles, "ALL"])] } },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
}
