import "server-only";
import { Prisma } from "@prisma/client";
import { isIdShape, nameKeyOf } from "@/features/datasets/validation";
import { prisma } from "@/lib/db";
import {
  DASHBOARD_NAME_MAX,
  DASHBOARDS_PER_DATASET,
  DEFAULT_WIDGET_SIZE,
  WIDGET_TITLE_MAX,
  WIDGETS_PER_DASHBOARD,
  bottomOf,
  cleanName,
  layoutBodySchema,
  positionSchema,
  reconcileLayout,
  type LayoutItem,
} from "./validation";

/*
 * Dashboard dan kanvas (T-010). Pemilik dataset saja (berbagi di T-016); dashboard milik orang lain
 * selalu NOT_FOUND. Posisi semua widget disimpan di Dashboard.layout dengan layoutRevision: simpan
 * otomatis memakai CAS (tab lama → STALE, tidak menimpa), tambah/hapus widget menaikkan revisi di bawah
 * advisory lock per dashboard.
 */

export type DashboardCode =
  "INVALID" | "NOT_FOUND" | "LIMIT_REACHED" | "NAME_TAKEN" | "STALE" | "BUSY";
export type DashboardResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: DashboardCode; message: string; field?: "name" | "datasetId" };

export interface WidgetView {
  id: string;
  type: string;
  title: string;
}

export interface DashboardView {
  id: string;
  name: string;
  dataset: { id: string; name: string };
  layout: LayoutItem[];
  layoutRevision: number;
  widgets: WidgetView[];
  updatedAt: Date;
}

export interface DashboardSummary {
  id: string;
  name: string;
  datasetId: string;
  datasetName: string;
  widgetCount: number;
  updatedAt: Date;
}

const fail = <T>(
  code: DashboardCode,
  message: string,
  field?: "name" | "datasetId",
): DashboardResult<T> => ({ ok: false, code, message, ...(field ? { field } : {}) });
const notFound = <T>() => fail<T>("NOT_FOUND", "Dashboard tidak ditemukan.");

const isUnique = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
/** Antrean lock melewati batas waktu transaksi (banyak permintaan sekaligus) → coba lagi, bukan 500. */
const isLockTimeout = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2028";
const busy = <T>() => fail<T>("BUSY", "Sedang memproses perubahan lain. Coba lagi.");
const lockKey = (prefix: string, id: string) =>
  Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`${prefix}:${id}`}))`;

export async function listDashboards(ownerId: string): Promise<DashboardSummary[]> {
  const rows = await prisma.dashboard.findMany({
    where: { dataset: { ownerId } },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      datasetId: true,
      updatedAt: true,
      dataset: { select: { name: true } },
      _count: { select: { widgets: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    datasetId: r.datasetId,
    datasetName: r.dataset.name,
    widgetCount: r._count.widgets,
    updatedAt: r.updatedAt,
  }));
}

export async function createDashboard(
  ownerId: string,
  datasetId: unknown,
  nameRaw: unknown,
): Promise<DashboardResult<{ id: string }>> {
  if (!isIdShape(datasetId)) return fail("INVALID", "Pilih dataset.", "datasetId");
  const name = cleanName(nameRaw, DASHBOARD_NAME_MAX, "dashboard");
  if (!name.ok) return fail("INVALID", name.message, "name");
  try {
    // Hitung + buat di bawah lock per dataset: permintaan paralel tidak bisa menembus batas.
    const row = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(lockKey("dashboards", datasetId));
      const ds = await tx.dataset.findFirst({
        where: { id: datasetId, ownerId },
        select: { _count: { select: { dashboards: true } } },
      });
      if (!ds) return "NOT_FOUND" as const;
      if (ds._count.dashboards >= DASHBOARDS_PER_DATASET) return "LIMIT_REACHED" as const;
      return tx.dashboard.create({
        data: { datasetId, name: name.value, nameKey: nameKeyOf(name.value) },
        select: { id: true },
      });
    });
    if (row === "NOT_FOUND") return fail("NOT_FOUND", "Dataset tidak ditemukan.", "datasetId");
    if (row === "LIMIT_REACHED") {
      return fail(
        "LIMIT_REACHED",
        `Batas ${DASHBOARDS_PER_DATASET} dashboard per dataset tercapai. Hapus dashboard yang tidak dipakai.`,
        "datasetId",
      );
    }
    return { ok: true, data: row };
  } catch (e) {
    if (isUnique(e)) {
      return fail("NAME_TAKEN", "Dataset ini sudah punya dashboard dengan nama itu.", "name");
    }
    if (isLockTimeout(e)) return busy();
    throw e;
  }
}

export async function renameDashboard(
  ownerId: string,
  id: unknown,
  nameRaw: unknown,
): Promise<DashboardResult<{ id: string }>> {
  if (!isIdShape(id)) return notFound();
  const name = cleanName(nameRaw, DASHBOARD_NAME_MAX, "dashboard");
  if (!name.ok) return fail("INVALID", name.message, "name");
  try {
    const r = await prisma.dashboard.updateMany({
      where: { id, dataset: { ownerId } },
      data: { name: name.value, nameKey: nameKeyOf(name.value) },
    });
    return r.count === 1 ? { ok: true, data: { id } } : notFound();
  } catch (e) {
    if (isUnique(e)) {
      return fail("NAME_TAKEN", "Dataset ini sudah punya dashboard dengan nama itu.", "name");
    }
    throw e;
  }
}

export async function deleteDashboard(
  ownerId: string,
  id: unknown,
): Promise<DashboardResult<{ id: string }>> {
  if (!isIdShape(id)) return notFound();
  const r = await prisma.dashboard.deleteMany({ where: { id, dataset: { ownerId } } });
  return r.count === 1 ? { ok: true, data: { id } } : notFound();
}

export async function getDashboard(ownerId: string, id: unknown): Promise<DashboardView | null> {
  if (!isIdShape(id)) return null;
  const d = await prisma.dashboard.findFirst({
    where: { id, dataset: { ownerId } },
    select: {
      id: true,
      name: true,
      layout: true,
      layoutRevision: true,
      updatedAt: true,
      dataset: { select: { id: true, name: true } },
      widgets: { orderBy: { createdAt: "asc" }, select: { id: true, type: true, title: true } },
    },
  });
  if (!d) return null;
  return {
    ...d,
    layout: reconcileLayout(
      d.layout,
      d.widgets.map((w) => w.id),
    ),
  };
}

type Tx = Prisma.TransactionClient;

/** Transaksi ber-lock; lock yang tidak didapat dalam batas waktu → "BUSY". */
async function locked<T>(fn: (tx: Tx) => Promise<T>): Promise<T | "BUSY"> {
  try {
    return await prisma.$transaction(fn);
  } catch (e) {
    if (isLockTimeout(e)) return "BUSY";
    throw e;
  }
}

/** Dashboard milik user, dikunci untuk perubahan widget (null = tidak ada/bukan pemilik). */
async function lockedDashboard(tx: Tx, ownerId: string, dashboardId: string) {
  await tx.$executeRaw(lockKey("dashboard", dashboardId));
  return tx.dashboard.findFirst({
    where: { id: dashboardId, dataset: { ownerId } },
    select: { layout: true, layoutRevision: true, widgets: { select: { id: true } } },
  });
}

export async function addWidget(
  ownerId: string,
  dashboardId: unknown,
  body: unknown,
): Promise<DashboardResult<{ widget: WidgetView; item: LayoutItem; layoutRevision: number }>> {
  if (!isIdShape(dashboardId)) return notFound();
  // Opsional: judul dan posisi (dipakai "urungkan" setelah menghapus widget).
  const input = (body && typeof body === "object" ? body : {}) as { title?: unknown; at?: unknown };
  const at = input.at === undefined ? null : positionSchema.safeParse(input.at);
  if (at && !at.success) return fail("INVALID", "Posisi widget tidak valid.");
  let title = "";
  if (input.title !== undefined && input.title !== "") {
    const t = cleanName(input.title, WIDGET_TITLE_MAX, "widget");
    if (!t.ok) return fail("INVALID", t.message, "name");
    title = t.value;
  }
  const r = await locked(async (tx) => {
    const d = await lockedDashboard(tx, ownerId, dashboardId);
    if (!d) return null;
    if (d.widgets.length >= WIDGETS_PER_DASHBOARD) return "LIMIT_REACHED" as const;
    const layout = reconcileLayout(
      d.layout,
      d.widgets.map((w) => w.id),
    );
    const widget = await tx.widget.create({
      data: { dashboardId, title },
      select: { id: true, type: true, title: true },
    });
    const item: LayoutItem = at?.success
      ? { i: widget.id, ...at.data }
      : { i: widget.id, x: 0, y: bottomOf(layout), ...DEFAULT_WIDGET_SIZE };
    const layoutRevision = d.layoutRevision + 1;
    await tx.dashboard.update({
      where: { id: dashboardId },
      data: { layout: [...layout, item] as unknown as Prisma.InputJsonValue, layoutRevision },
    });
    return { widget, item, layoutRevision };
  });
  if (r === "BUSY") return busy();
  if (r === null) return notFound();
  if (r === "LIMIT_REACHED") {
    return fail(
      "LIMIT_REACHED",
      `Batas ${WIDGETS_PER_DASHBOARD} widget per dashboard tercapai. Hapus widget yang tidak dipakai.`,
    );
  }
  return { ok: true, data: r };
}

export async function deleteWidget(
  ownerId: string,
  dashboardId: unknown,
  widgetId: unknown,
): Promise<DashboardResult<{ layoutRevision: number }>> {
  if (!isIdShape(dashboardId) || !isIdShape(widgetId)) return notFound();
  const r = await locked(async (tx) => {
    const d = await lockedDashboard(tx, ownerId, dashboardId);
    if (!d || !d.widgets.some((w) => w.id === widgetId)) return null;
    await tx.widget.delete({ where: { id: widgetId } });
    const layout = reconcileLayout(
      d.layout,
      d.widgets.map((w) => w.id),
    ).filter((it) => it.i !== widgetId);
    const layoutRevision = d.layoutRevision + 1;
    await tx.dashboard.update({
      where: { id: dashboardId },
      data: { layout: layout as unknown as Prisma.InputJsonValue, layoutRevision },
    });
    return { layoutRevision };
  });
  if (r === "BUSY") return busy();
  return r ? { ok: true, data: r } : notFound();
}

export async function renameWidget(
  ownerId: string,
  dashboardId: unknown,
  widgetId: unknown,
  titleRaw: unknown,
): Promise<DashboardResult<{ title: string }>> {
  if (!isIdShape(dashboardId) || !isIdShape(widgetId)) return notFound();
  let title = "";
  if (titleRaw !== "") {
    const t = cleanName(titleRaw, WIDGET_TITLE_MAX, "widget");
    if (!t.ok) return fail("INVALID", t.message, "name");
    title = t.value;
  }
  const r = await prisma.widget.updateMany({
    where: { id: widgetId, dashboardId, dashboard: { dataset: { ownerId } } },
    data: { title },
  });
  return r.count === 1 ? { ok: true, data: { title } } : notFound();
}

/**
 * Simpan posisi semua widget (simpan otomatis). CAS pada layoutRevision: perubahan dari tampilan lama
 * ditolak STALE. Himpunan id harus sama persis dengan widget yang ada.
 */
export async function saveLayout(
  ownerId: string,
  dashboardId: unknown,
  body: unknown,
): Promise<DashboardResult<{ layoutRevision: number }>> {
  if (!isIdShape(dashboardId)) return notFound();
  const parsed = layoutBodySchema.safeParse(body);
  if (!parsed.success) {
    return fail(
      "INVALID",
      `Tata letak tidak valid: ${parsed.error.issues[0]?.message ?? "format"}.`,
    );
  }
  const { baseRevision, items } = parsed.data;
  const d = await prisma.dashboard.findFirst({
    where: { id: dashboardId, dataset: { ownerId } },
    select: { layoutRevision: true, widgets: { select: { id: true } } },
  });
  if (!d) return notFound();
  const stale = () =>
    fail<{ layoutRevision: number }>(
      "STALE",
      "Dashboard ini sudah diubah di tempat lain. Muat ulang untuk melihat versi terbaru.",
    );
  if (d.layoutRevision !== baseRevision) return stale();
  const ids = new Set(d.widgets.map((w) => w.id));
  if (items.length !== ids.size || items.some((it) => !ids.has(it.i))) return stale();
  const r = await prisma.dashboard.updateMany({
    where: { id: dashboardId, layoutRevision: baseRevision },
    data: {
      layout: items as unknown as Prisma.InputJsonValue,
      layoutRevision: { increment: 1 },
    },
  });
  return r.count === 1 ? { ok: true, data: { layoutRevision: baseRevision + 1 } } : stale();
}
