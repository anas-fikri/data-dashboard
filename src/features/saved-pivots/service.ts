import "server-only";
import { Prisma } from "@prisma/client";
import { recordAudit } from "@/features/audit/service";
import { logAccessDenied } from "@/features/auth/denial-log";
import { checkConfig } from "@/features/dashboards/service";
import { isTxConflict } from "@/features/dashboards/tx-conflict";
import { cleanName } from "@/features/dashboards/validation";
import { isIdShape, nameKeyOf } from "@/features/datasets/validation";
import type { PivotSpec } from "@/features/widgets/spec";
import { prisma } from "@/lib/db";

/*
 * Pivot tersimpan (T-072, ADR-0009, rencana G-7 §4.2/§5): definisi pivot tingkat dataset yang nanti
 * menjadi sumber widget (T-073). Akses:
 *  - tulis (buat, ubah/ganti nama, hapus): pemilik dataset saja;
 *  - baca: pemilik dataset + editor (share EDITOR) dashboard pada dataset itu (keputusan pemilik Q2);
 *  - selain itu (viewer, orang lain, id rusak) → NOT_FOUND, tidak pernah FORBIDDEN (D2).
 * Spec = spec widget pivot (pivotSpecSchema) yang divalidasi terhadap sheet versi AKTIF dengan aturan
 * yang sama dengan simpan widget (checkConfig → widgetPlan). Setiap tulis mengunci baris Dataset
 * (FOR UPDATE, urutan yang sama dengan aktivasi versi dan hapus dataset): remap aktivasi tidak bisa
 * ditimpa spec yang divalidasi terhadap versi aktif lama. `revision` naik tiap simpan; simpan dengan
 * revisi basi → CONFLICT (tidak menimpa). Hapus ditolak IN_USE selama ada widget yang merujuknya
 * (Widget.savedPivotId, FK NO ACTION sebagai penjaga kedua). AuditLog savedPivot.create/update/delete
 * ditulis di transaksi perubahannya.
 */

export const SAVED_PIVOTS_PER_DATASET = 50;
export const SAVED_PIVOT_NAME_MAX = 80;

export type SavedPivotCode =
  | "INVALID"
  | "NOT_FOUND"
  | "LIMIT_REACHED"
  | "NAME_TAKEN"
  | "CONFLICT"
  | "IN_USE"
  | "STALE"
  | "BUSY"
  | "RATE_LIMITED";

export interface InUseDashboard {
  id: string;
  name: string;
}

export type SavedPivotResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      code: SavedPivotCode;
      message: string;
      field?: "name" | "spec";
      /** IN_USE: dashboard yang masih memakai pivot tersimpan ini (urut nama). */
      dashboards?: InUseDashboard[];
    };

export interface SavedPivotView {
  id: string;
  datasetId: string;
  name: string;
  spec: PivotSpec;
  missingColumns: string[];
  revision: number;
  /** Pemilik dataset (boleh mengubah); editor dashboard hanya membaca. */
  canEdit: boolean;
  /** Pemakaian (pemilik saja; null untuk editor): widget dan dashboard yang merujuknya. */
  usage: { widgets: number; dashboards: number } | null;
  createdAt: string;
  updatedAt: string;
}

type Tx = Prisma.TransactionClient;

const fail = <T>(
  code: SavedPivotCode,
  message: string,
  extra: { field?: "name" | "spec"; dashboards?: InUseDashboard[] } = {},
): SavedPivotResult<T> => ({ ok: false, code, message, ...extra });

const notFound = <T>() => fail<T>("NOT_FOUND", "Pivot tersimpan tidak ditemukan.");
const busy = <T>() => fail<T>("BUSY", "Sedang memproses perubahan lain. Coba lagi.");
const stale = <T>() =>
  fail<T>(
    "STALE",
    "Data dataset ini baru saja berganti versi. Muat ulang halaman, lalu atur lagi pivot ini.",
    { field: "spec" },
  );
const conflict = <T>() =>
  fail<T>(
    "CONFLICT",
    "Pivot tersimpan ini baru saja diubah di tab lain atau oleh versi data baru. Muat ulang untuk melihat versi terbaru, lalu ulangi perubahan Anda.",
  );
const nameTaken = <T>() =>
  fail<T>("NAME_TAKEN", "Dataset ini sudah punya pivot tersimpan dengan nama itu.", {
    field: "name",
  });

const isUnique = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
/** FK Widget.savedPivotId menolak hapus (widget diikat bersamaan, T-073). */
const isFkViolation = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003";
const isLockTimeout = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2028";

/** Batas waktu sama dengan transaksi lain yang mengunci baris Dataset (aktivasi, hapus dataset). */
const TX_OPTS = { maxWait: 5_000, timeout: 30_000 };

/** Dataset yang pivot tersimpannya boleh dibaca user: miliknya, atau editor salah satu dashboard-nya. */
const readableDatasetWhere = (userId: string): Prisma.DatasetWhereInput => ({
  OR: [
    { ownerId: userId },
    { dashboards: { some: { shares: { some: { userId, role: "EDITOR" } } } } },
  ],
});
const readableWhere = (userId: string): Prisma.SavedPivotWhereInput => ({
  dataset: readableDatasetWhere(userId),
});

/** Penolakan tulis dicatat (ASVS V7, dibatasi volume) lalu dibalas NOT_FOUND (D2). */
async function denied<T>(
  userId: string,
  action: "create" | "update" | "delete",
  ids: { datasetId?: unknown; savedPivotId?: unknown },
): Promise<SavedPivotResult<T>> {
  await logAccessDenied(
    `savedPivot:${action}`,
    {
      userId,
      action,
      ...(isIdShape(ids.datasetId) ? { datasetId: ids.datasetId } : {}),
      ...(isIdShape(ids.savedPivotId) ? { savedPivotId: ids.savedPivotId } : {}),
    },
    "aksi pivot tersimpan ditolak",
  );
  return action === "create" ? fail("NOT_FOUND", "Dataset tidak ditemukan.") : notFound();
}

/**
 * Lock baris Dataset milik user (FOR UPDATE; urutan sama dengan aktivasi versi/hapus dataset) →
 * id versi aktif, atau undefined bila bukan milik user / tidak ada.
 */
async function lockOwnedDataset(
  tx: Tx,
  userId: string,
  datasetId: string,
): Promise<{ activeVersionId: string | null } | undefined> {
  const rows = await tx.$queryRaw<{ activeVersionId: string | null }[]>`
    SELECT "activeVersionId" FROM "Dataset" WHERE id = ${datasetId} AND "ownerId" = ${userId} FOR UPDATE`;
  return rows[0];
}

/** Sheet spec masih milik versi aktif (dibaca di bawah lock Dataset — tidak bisa berganti lagi). */
async function onActiveVersion(tx: Tx, activeVersionId: string | null, sheetId: string) {
  if (!activeVersionId) return false;
  return (await tx.sheet.count({ where: { id: sheetId, versionId: activeVersionId } })) === 1;
}

/** Validasi spec pivot terhadap data aktif dataset (pemilik → pesan kolom menyebut nama kolomnya). */
async function checkSpec(
  datasetId: string,
  spec: unknown,
): Promise<{ ok: true; spec: PivotSpec } | { ok: false; result: SavedPivotResult<never> }> {
  const checked = await checkConfig(datasetId, "pivot", spec, true);
  if (checked.ok && checked.config.type === "pivot") return { ok: true, spec: checked.config.spec };
  if (!checked.ok && checked.outside) {
    return { ok: false, result: fail("NOT_FOUND", "Sheet tidak ditemukan.", { field: "spec" }) };
  }
  if (!checked.ok && checked.stale) return { ok: false, result: stale() };
  const message = checked.ok ? "Pengaturan pivot tidak valid." : checked.message;
  return { ok: false, result: fail("INVALID", message, { field: "spec" }) };
}

const cleanPivotName = (raw: unknown) => cleanName(raw, SAVED_PIVOT_NAME_MAX, "pivot tersimpan");

const VIEW_SELECT = {
  id: true,
  datasetId: true,
  name: true,
  spec: true,
  missingColumns: true,
  revision: true,
  createdAt: true,
  updatedAt: true,
  dataset: { select: { ownerId: true } },
  widgets: { select: { dashboardId: true } },
} satisfies Prisma.SavedPivotSelect;

function toView(userId: string, row: Prisma.SavedPivotGetPayload<{ select: typeof VIEW_SELECT }>) {
  const owner = row.dataset.ownerId === userId;
  return {
    id: row.id,
    datasetId: row.datasetId,
    name: row.name,
    spec: row.spec as unknown as PivotSpec,
    missingColumns: row.missingColumns,
    revision: row.revision,
    canEdit: owner,
    usage: owner
      ? {
          widgets: row.widgets.length,
          dashboards: new Set(row.widgets.map((w) => w.dashboardId)).size,
        }
      : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  } satisfies SavedPivotView;
}

/** Daftar pivot tersimpan dataset (pemilik/editor; selain itu NOT_FOUND), urut nama. */
export async function listSavedPivots(
  userId: string,
  datasetId: unknown,
): Promise<SavedPivotResult<SavedPivotView[]>> {
  if (!isIdShape(datasetId)) return fail("NOT_FOUND", "Dataset tidak ditemukan.");
  const readable = await prisma.dataset.count({
    where: { id: datasetId, ...readableDatasetWhere(userId) },
  });
  if (!readable) return fail("NOT_FOUND", "Dataset tidak ditemukan.");
  const rows = await prisma.savedPivot.findMany({
    where: { datasetId, ...readableWhere(userId) },
    orderBy: [{ nameKey: "asc" }, { id: "asc" }],
    select: VIEW_SELECT,
  });
  return { ok: true, data: rows.map((r) => toView(userId, r)) };
}

/** Satu pivot tersimpan (pemilik/editor; selain itu NOT_FOUND). */
export async function getSavedPivot(
  userId: string,
  id: unknown,
): Promise<SavedPivotResult<SavedPivotView>> {
  if (!isIdShape(id)) return notFound();
  const row = await prisma.savedPivot.findFirst({
    where: { id, ...readableWhere(userId) },
    select: VIEW_SELECT,
  });
  return row ? { ok: true, data: toView(userId, row) } : notFound();
}

export interface SavedPivotInput {
  name?: unknown;
  spec?: unknown;
}

/** Buat pivot tersimpan (pemilik dataset). Maks SAVED_PIVOTS_PER_DATASET per dataset. */
export async function createSavedPivot(
  userId: string,
  datasetId: unknown,
  input: SavedPivotInput,
  ip: string,
): Promise<SavedPivotResult<{ id: string; revision: number }>> {
  if (!isIdShape(datasetId)) return denied(userId, "create", { datasetId });
  const owned = await prisma.dataset.count({ where: { id: datasetId, ownerId: userId } });
  // Kepemilikan dulu: validasi spec (pesan sheet/kolom) tidak boleh menjadi oracle untuk non-pemilik.
  if (!owned) return denied(userId, "create", { datasetId });
  const name = cleanPivotName(input.name);
  if (!name.ok) return fail("INVALID", name.message, { field: "name" });
  const spec = await checkSpec(datasetId, input.spec);
  if (!spec.ok) return spec.result;
  try {
    const r = await prisma.$transaction(async (tx) => {
      const ds = await lockOwnedDataset(tx, userId, datasetId);
      if (!ds) return "NOT_FOUND" as const;
      if (!(await onActiveVersion(tx, ds.activeVersionId, spec.spec.sheetId))) {
        return "STALE" as const;
      }
      const n = await tx.savedPivot.count({ where: { datasetId } });
      if (n >= SAVED_PIVOTS_PER_DATASET) return "LIMIT_REACHED" as const;
      const row = await tx.savedPivot.create({
        data: {
          datasetId,
          name: name.value,
          nameKey: nameKeyOf(name.value),
          spec: spec.spec as unknown as Prisma.InputJsonValue,
          createdById: userId,
        },
        select: { id: true, revision: true },
      });
      await recordAudit(tx, {
        actorId: userId,
        action: "savedPivot.create",
        targetType: "savedPivot",
        targetId: row.id,
        meta: { datasetId, name: name.value, revision: row.revision },
        ip,
      });
      return row;
    }, TX_OPTS);
    if (r === "NOT_FOUND") return denied(userId, "create", { datasetId });
    if (r === "STALE") return stale();
    if (r === "LIMIT_REACHED") {
      return fail(
        "LIMIT_REACHED",
        `Batas ${SAVED_PIVOTS_PER_DATASET} pivot tersimpan per dataset tercapai. Hapus pivot tersimpan yang tidak dipakai.`,
      );
    }
    return { ok: true, data: r };
  } catch (e) {
    if (isUnique(e)) return nameTaken();
    if (isLockTimeout(e) || isTxConflict(e)) return busy();
    throw e;
  }
}

export interface SavedPivotUpdate extends SavedPivotInput {
  /** Revisi yang dilihat klien (CAS); wajib. */
  baseRevision?: unknown;
}

/**
 * Ubah spec dan/atau ganti nama (pemilik dataset). CAS: `baseRevision` ≠ revisi sekarang → CONFLICT
 * tanpa menulis. Revisi naik tiap simpan; spec baru mengosongkan missingColumns (seperti simpan widget).
 */
export async function updateSavedPivot(
  userId: string,
  id: unknown,
  input: SavedPivotUpdate,
  ip: string,
): Promise<SavedPivotResult<{ id: string; revision: number }>> {
  if (!isIdShape(id)) return denied(userId, "update", { savedPivotId: id });
  const current = await prisma.savedPivot.findFirst({
    where: { id, dataset: { ownerId: userId } },
    select: { datasetId: true },
  });
  if (!current) return denied(userId, "update", { savedPivotId: id });
  const base = input.baseRevision;
  if (!Number.isInteger(base) || (base as number) < 1) {
    return fail("INVALID", "Revisi pivot tersimpan wajib dikirim.");
  }
  if (input.name === undefined && input.spec === undefined) {
    return fail("INVALID", "Tidak ada perubahan untuk disimpan.");
  }
  const name = input.name === undefined ? null : cleanPivotName(input.name);
  if (name && !name.ok) return fail("INVALID", name.message, { field: "name" });
  const spec = input.spec === undefined ? null : await checkSpec(current.datasetId, input.spec);
  if (spec && !spec.ok) return spec.result;
  const datasetId = current.datasetId;
  try {
    const r = await prisma.$transaction(async (tx) => {
      const ds = await lockOwnedDataset(tx, userId, datasetId);
      if (!ds) return "NOT_FOUND" as const;
      const row = await tx.savedPivot.findFirst({
        where: { id, datasetId },
        select: { name: true, revision: true },
      });
      if (!row) return "NOT_FOUND" as const;
      if (row.revision !== base) return "CONFLICT" as const;
      if (spec && !(await onActiveVersion(tx, ds.activeVersionId, spec.spec.sheetId))) {
        return "STALE" as const;
      }
      const revision = row.revision + 1;
      const w = await tx.savedPivot.updateMany({
        where: { id, datasetId, revision: row.revision },
        data: {
          revision,
          ...(name?.ok ? { name: name.value, nameKey: nameKeyOf(name.value) } : {}),
          ...(spec?.ok
            ? { spec: spec.spec as unknown as Prisma.InputJsonValue, missingColumns: [] }
            : {}),
        },
      });
      if (w.count !== 1) return "CONFLICT" as const;
      await recordAudit(tx, {
        actorId: userId,
        action: "savedPivot.update",
        targetType: "savedPivot",
        targetId: id,
        meta: {
          datasetId,
          name: name?.ok ? name.value : row.name,
          ...(name?.ok && name.value !== row.name ? { renamedFrom: row.name } : {}),
          specChanged: Boolean(spec),
          revision,
        },
        ip,
      });
      return { id, revision };
    }, TX_OPTS);
    if (r === "NOT_FOUND") return denied(userId, "update", { savedPivotId: id });
    if (r === "CONFLICT") return conflict();
    if (r === "STALE") return stale();
    return { ok: true, data: r };
  } catch (e) {
    if (isUnique(e)) return nameTaken();
    if (isLockTimeout(e) || isTxConflict(e)) return busy();
    throw e;
  }
}

const inUse = <T>(dashboards: InUseDashboard[], widgets: number) =>
  fail<T>(
    "IN_USE",
    dashboards.length
      ? `Pivot tersimpan ini masih dipakai ${widgets} widget di dashboard ${dashboards.map((d) => `"${d.name}"`).join(", ")}. Lepaskan atau hapus widget itu dulu.`
      : "Pivot tersimpan ini masih dipakai widget. Muat ulang, lalu lepaskan widget itu dulu.",
    { dashboards },
  );

/**
 * Hapus pivot tersimpan (pemilik dataset). Masih dirujuk widget → IN_USE + daftar dashboard (pemilik
 * dataset = pemilik semua dashboard-nya, jadi namanya boleh disebut). `baseRevision` opsional (CAS).
 */
export async function deleteSavedPivot(
  userId: string,
  id: unknown,
  ip: string,
  baseRevision?: unknown,
): Promise<SavedPivotResult<{ id: string }>> {
  if (!isIdShape(id)) return denied(userId, "delete", { savedPivotId: id });
  if (
    baseRevision !== undefined &&
    (!Number.isInteger(baseRevision) || (baseRevision as number) < 1)
  ) {
    return fail("INVALID", "Revisi pivot tersimpan tidak valid.");
  }
  const current = await prisma.savedPivot.findFirst({
    where: { id, dataset: { ownerId: userId } },
    select: { datasetId: true },
  });
  if (!current) return denied(userId, "delete", { savedPivotId: id });
  const datasetId = current.datasetId;
  try {
    const r = await prisma.$transaction(async (tx) => {
      if (!(await lockOwnedDataset(tx, userId, datasetId))) return "NOT_FOUND" as const;
      const row = await tx.savedPivot.findFirst({
        where: { id, datasetId },
        select: { name: true, revision: true },
      });
      if (!row) return "NOT_FOUND" as const;
      if (baseRevision !== undefined && row.revision !== baseRevision) return "CONFLICT" as const;
      const users = await tx.widget.findMany({
        where: { savedPivotId: id },
        select: { dashboard: { select: { id: true, name: true } } },
      });
      if (users.length) {
        const byId = new Map(users.map((w) => [w.dashboard.id, w.dashboard]));
        const dashboards = [...byId.values()].sort(
          (a, b) => a.name.localeCompare(b.name, "id") || a.id.localeCompare(b.id),
        );
        return { inUse: dashboards, widgets: users.length };
      }
      const d = await tx.savedPivot.deleteMany({ where: { id, datasetId } });
      if (d.count !== 1) return "NOT_FOUND" as const;
      await recordAudit(tx, {
        actorId: userId,
        action: "savedPivot.delete",
        targetType: "savedPivot",
        targetId: id,
        meta: { datasetId, name: row.name, revision: row.revision },
        ip,
      });
      return "DELETED" as const;
    }, TX_OPTS);
    if (r === "NOT_FOUND") return denied(userId, "delete", { savedPivotId: id });
    if (r === "CONFLICT") return conflict();
    if (r !== "DELETED") return inUse(r.inUse, r.widgets);
    return { ok: true, data: { id } };
  } catch (e) {
    // Widget diikat di antara hitungan dan hapus: FK NO ACTION menolak → tetap IN_USE.
    if (isFkViolation(e)) return inUse([], 0);
    if (isLockTimeout(e) || isTxConflict(e)) return busy();
    throw e;
  }
}
