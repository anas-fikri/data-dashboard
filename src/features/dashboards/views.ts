import "server-only";
import { Prisma } from "@prisma/client";
import { parseFilterState, type FilterState } from "@/components/dashboards/filters/filter-model";
import { isIdShape, nameKeyOf } from "@/features/datasets/validation";
import { canEdit, dashboardAccess } from "@/features/sharing/access";
import { prisma } from "@/lib/db";
import type { DashboardCode } from "./service";
import { cleanName } from "./validation";

/*
 * Tampilan tersimpan (T-tf88): kombinasi filter dashboard bernama. Siapa pun yang bisa melihat dashboard
 * boleh membuat tampilan PRIBADI; tampilan BERSAMA (terlihat semua yang punya akses) hanya pemilik/editor.
 * Mengubah/menghapus: pembuatnya; tampilan bersama juga pemilik/editor dashboard. Akses dicek per
 * permintaan (dashboardAccess, tanpa cache) — akses dicabut → tampilan pribadinya ikut tidak terbaca.
 */

export const VIEW_NAME_MAX = 60;
/** Per pembuat per dashboard (pribadi + bersama buatannya). */
export const VIEWS_PER_USER = 20;
/** Tampilan bersama per dashboard (semua pembuat). */
export const SHARED_VIEWS_PER_DASHBOARD = 20;

export type ViewField = "name" | "state";
export type ViewResult<T> =
  { ok: true; data: T } | { ok: false; code: DashboardCode; message: string; field?: ViewField };

export interface SavedView {
  id: string;
  name: string;
  shared: boolean;
  state: FilterState;
  /** Dibuat user ini. */
  mine: boolean;
  /** Boleh mengelola (hapus; tampilan pribadi: juga ganti nama/filter). */
  canManage: boolean;
  /**
   * Boleh mengganti nama/filter. Tampilan bersama hanya pemilik/editor (pembuat yang tidak lagi editor hanya
   * bisa menjadikannya pribadi atau menghapusnya — review v1.14 #3).
   */
  canEditContent: boolean;
}

const fail = <T>(code: DashboardCode, message: string, field?: ViewField): ViewResult<T> => ({
  ok: false,
  code,
  message,
  ...(field ? { field } : {}),
});
const notFound = <T>() => fail<T>("NOT_FOUND", "Dashboard tidak ditemukan.");
const viewGone = <T>() => fail<T>("NOT_FOUND", "Tampilan tidak ditemukan. Muat ulang halaman.");
const isUnique = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
const isLockTimeout = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2028";
const busy = <T>() => fail<T>("BUSY", "Sedang memproses perubahan lain. Coba lagi.");
const nameTaken = <T>() =>
  fail<T>("NAME_TAKEN", "Anda sudah punya tampilan dengan nama itu di dashboard ini.", "name");

const SELECT = { id: true, name: true, shared: true, state: true, userId: true } as const;

function toView(
  row: { id: string; name: string; shared: boolean; state: unknown; userId: string },
  userId: string,
  editor: boolean,
): SavedView | null {
  // Status tersimpan divalidasi ulang saat dibaca (skema filter bisa berubah antar versi): rusak → dilewati.
  const state = parseFilterState(row.state);
  if (!state) return null;
  const mine = row.userId === userId;
  return {
    id: row.id,
    name: row.name,
    shared: row.shared,
    state,
    mine,
    canManage: mine || (row.shared && editor),
    canEditContent: row.shared ? editor : mine,
  };
}

/**
 * Syarat baris yang boleh ditulis, ikut di WHERE penulisan (bukan hanya dicek sebelumnya): status bersama/
 * pribadi yang berubah di antara cek dan tulis tidak membuat editor menimpa tampilan pribadi orang lain
 * (review v1.14 #4). Pemilik/editor: miliknya atau yang bersama; selain itu hanya miliknya.
 */
const writableWhere = (
  id: string,
  userId: string,
  editor: boolean,
): Prisma.DashboardViewWhereInput =>
  editor ? { id, OR: [{ userId }, { shared: true }] } : { id, userId };

/** Tampilan pribadi user + tampilan bersama dashboard; bersama dulu, lalu nama. */
export async function listViews(
  userId: string,
  dashboardId: unknown,
): Promise<ViewResult<SavedView[]>> {
  const access = await dashboardAccess(userId, dashboardId);
  if (!access) return notFound();
  const rows = await prisma.dashboardView.findMany({
    where: { dashboardId: dashboardId as string, OR: [{ userId }, { shared: true }] },
    orderBy: [{ shared: "desc" }, { nameKey: "asc" }],
    select: SELECT,
  });
  const editor = canEdit(access.role);
  return {
    ok: true,
    data: rows.flatMap((r) => toView(r, userId, editor) ?? []),
  };
}

function parseInput(
  raw: unknown,
  partial: boolean,
):
  | { ok: true; name?: string; state?: FilterState; shared?: boolean }
  | { ok: false; field: ViewField; message: string } {
  const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: { name?: string; state?: FilterState; shared?: boolean } = {};
  if (!partial || body.name !== undefined) {
    const n = cleanName(body.name, VIEW_NAME_MAX, "tampilan");
    if (!n.ok) return { ok: false, field: "name", message: n.message };
    out.name = n.value;
  }
  if (!partial || body.state !== undefined) {
    const s = parseFilterState(body.state);
    if (!s) {
      return {
        ok: false,
        field: "state",
        message: "Filter tidak bisa disimpan (terlalu banyak atau tidak valid).",
      };
    }
    out.state = s;
  }
  if (body.shared !== undefined) out.shared = body.shared === true;
  return { ok: true, ...out };
}

export async function createView(
  userId: string,
  dashboardId: unknown,
  raw: unknown,
): Promise<ViewResult<SavedView>> {
  const access = await dashboardAccess(userId, dashboardId);
  if (!access) return notFound();
  const id = dashboardId as string;
  const input = parseInput(raw, false);
  if (!input.ok) return fail("INVALID", input.message, input.field);
  const editor = canEdit(access.role);
  const shared = input.shared === true;
  if (shared && !editor) {
    return fail("FORBIDDEN", "Hanya pemilik atau editor yang bisa membuat tampilan bersama.");
  }
  try {
    const row = await prisma.$transaction(async (tx) => {
      // Hitung + buat di bawah lock per dashboard: permintaan paralel tidak menembus batas.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`views:${id}`}))`;
      const [mineCount, sharedCount] = await Promise.all([
        tx.dashboardView.count({ where: { dashboardId: id, userId } }),
        shared ? tx.dashboardView.count({ where: { dashboardId: id, shared: true } }) : 0,
      ]);
      if (mineCount >= VIEWS_PER_USER) return "LIMIT_MINE" as const;
      if (sharedCount >= SHARED_VIEWS_PER_DASHBOARD) return "LIMIT_SHARED" as const;
      return tx.dashboardView.create({
        data: {
          dashboardId: id,
          userId,
          name: input.name!,
          nameKey: nameKeyOf(input.name!),
          shared,
          state: input.state as unknown as Prisma.InputJsonValue,
        },
        select: SELECT,
      });
    });
    if (row === "LIMIT_MINE") {
      return fail(
        "LIMIT_REACHED",
        `Batas ${VIEWS_PER_USER} tampilan per dashboard tercapai. Hapus tampilan yang tidak dipakai.`,
      );
    }
    if (row === "LIMIT_SHARED") {
      return fail(
        "LIMIT_REACHED",
        `Batas ${SHARED_VIEWS_PER_DASHBOARD} tampilan bersama di dashboard ini tercapai.`,
      );
    }
    return { ok: true, data: toView(row, userId, editor)! };
  } catch (e) {
    if (isUnique(e)) return nameTaken();
    if (isLockTimeout(e)) return busy();
    throw e;
  }
}

/** Baris tampilan yang boleh diubah user (null + kode bila tidak). */
async function manageable(
  userId: string,
  dashboardId: unknown,
  viewId: unknown,
): Promise<
  | { ok: false; error: ViewResult<never> }
  | {
      ok: true;
      row: { id: string; name: string; shared: boolean; state: unknown; userId: string };
      editor: boolean;
    }
> {
  const access = await dashboardAccess(userId, dashboardId);
  if (!access) return { ok: false, error: notFound<never>() };
  if (!isIdShape(viewId)) return { ok: false, error: viewGone<never>() };
  const row = await prisma.dashboardView.findFirst({
    where: { id: viewId, dashboardId: dashboardId as string, OR: [{ userId }, { shared: true }] },
    select: SELECT,
  });
  if (!row) return { ok: false, error: viewGone<never>() };
  const editor = canEdit(access.role);
  if (row.userId !== userId && !(row.shared && editor)) {
    return {
      ok: false,
      error: fail<never>(
        "FORBIDDEN",
        "Hanya pembuatnya, pemilik, atau editor yang bisa mengubahnya.",
      ),
    };
  }
  return { ok: true, row, editor };
}

/** Ganti nama, perbarui filter, atau ubah bersama/pribadi (pembuat; bersama: pemilik/editor). */
export async function updateView(
  userId: string,
  dashboardId: unknown,
  viewId: unknown,
  raw: unknown,
): Promise<ViewResult<SavedView>> {
  const m = await manageable(userId, dashboardId, viewId);
  if (!m.ok) return m.error;
  const input = parseInput(raw, true);
  if (!input.ok) return fail("INVALID", input.message, input.field);
  if (input.shared === true && !m.editor) {
    return fail("FORBIDDEN", "Hanya pemilik atau editor yang bisa membagikan tampilan.");
  }
  if (m.row.shared && !m.editor && (input.name !== undefined || input.state !== undefined)) {
    return fail(
      "FORBIDDEN",
      "Tampilan bersama hanya bisa diubah pemilik atau editor. Anda bisa menjadikannya pribadi atau menghapusnya.",
    );
  }
  const id = dashboardId as string;
  const where = writableWhere(m.row.id, userId, m.editor);
  const data = {
    ...(input.name ? { name: input.name, nameKey: nameKeyOf(input.name) } : {}),
    ...(input.state ? { state: input.state as unknown as Prisma.InputJsonValue } : {}),
    ...(input.shared !== undefined ? { shared: input.shared } : {}),
  };
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Pribadi → bersama: batas tampilan bersama dihitung di bawah lock yang sama dengan buat tampilan
      // (review v1.14 #1 — tanpa ini 20 tampilan pribadi bisa dijadikan bersama melewati batas).
      if (input.shared === true && !m.row.shared) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`views:${id}`}))`;
        const shared = await tx.dashboardView.count({ where: { dashboardId: id, shared: true } });
        if (shared >= SHARED_VIEWS_PER_DASHBOARD) return "LIMIT_SHARED" as const;
      }
      const n = await tx.dashboardView.updateMany({ where, data });
      if (n.count === 0) return null;
      return tx.dashboardView.findFirst({ where: { id: m.row.id }, select: SELECT });
    });
    if (result === "LIMIT_SHARED") {
      return fail(
        "LIMIT_REACHED",
        `Batas ${SHARED_VIEWS_PER_DASHBOARD} tampilan bersama di dashboard ini tercapai.`,
      );
    }
    if (!result) return viewGone();
    return { ok: true, data: toView(result, userId, m.editor)! };
  } catch (e) {
    if (isUnique(e)) return nameTaken();
    if (isLockTimeout(e)) return busy();
    throw e;
  }
}

export async function deleteView(
  userId: string,
  dashboardId: unknown,
  viewId: unknown,
): Promise<ViewResult<null>> {
  const m = await manageable(userId, dashboardId, viewId);
  if (!m.ok) return m.error;
  const n = await prisma.dashboardView.deleteMany({
    where: writableWhere(m.row.id, userId, m.editor),
  });
  return n.count === 0 ? viewGone() : { ok: true, data: null };
}
