import "server-only";
import { Prisma } from "@prisma/client";
import { cache } from "react";
import { recordAudit } from "@/features/audit/service";
import { isIdShape, nameKeyOf } from "@/features/datasets/validation";
import type { ColumnSchema, ColumnType } from "@/features/ingest/infer";
import { widgetPlan } from "@/features/query/widget";
import {
  canEdit,
  canEditWhere,
  canViewWhere,
  dashboardAccess,
  roleOf,
  roleSelect,
  type DashboardAccessRole,
} from "@/features/sharing/access";
import { matchSheet, remapConfig } from "@/features/widgets/remap";
import { CHART_TYPES, parseWidgetConfig, type WidgetConfig } from "@/features/widgets/spec";
import { prisma } from "@/lib/db";
import { cleanName as cleanUserName } from "@/lib/text";
import {
  checkFilterColumns,
  crossFilterColumnsOf,
  filterColumnViews,
  filterSourcesOf,
  overlappingFilterColumns,
  storedFilterColumns,
  type ActiveSheet,
  type FilterColumnView,
  type FilterSourceColumn,
} from "./filter-columns";
import { isTxConflict } from "./tx-conflict";
import {
  DASHBOARD_NAME_MAX,
  DASHBOARDS_PER_DATASET,
  DEFAULT_WIDGET_SIZE,
  WIDGET_TITLE_MAX,
  WIDGETS_PER_DASHBOARD,
  bottomOf,
  cleanName,
  compactLayout,
  fitMinSizes,
  layoutBodySchema,
  parseWidgetVersion,
  positionSchema,
  reconcileLayout,
  type LayoutItem,
} from "./validation";

/*
 * Dashboard dan kanvas (T-010). Akses per dashboard lewat sharing/access (T-016): pemilik dataset =
 * OWNER; share user/organisasi = EDITOR/VIEWER. Tanpa akses → NOT_FOUND; bisa melihat tetapi tidak
 * punya peran yang dibutuhkan → FORBIDDEN (D2). Widget dan tata letak: OWNER/EDITOR, dicek di DALAM
 * where/transaksi lock penulisannya (tanpa TOCTOU). Nama, kolom filter, hapus: pemilik saja. Posisi
 * semua widget disimpan di Dashboard.layout dengan layoutRevision. Tambah, hapus, dan simpan otomatis
 * berjalan di bawah advisory lock per dashboard dan wajib membawa revisi yang dilihat klien: tab yang
 * tertinggal mendapat STALE, tidak pernah menimpa (review T-010 M1/L1).
 */

export type DashboardCode =
  "INVALID" | "NOT_FOUND" | "FORBIDDEN" | "LIMIT_REACHED" | "NAME_TAKEN" | "STALE" | "BUSY";
export type DashboardResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: DashboardCode; message: string; field?: "name" | "datasetId" };

export interface WidgetView {
  id: string;
  type: string;
  title: string;
  /** Spec tersimpan (T-011); klien memvalidasi ulang dengan parseWidgetConfig sebelum dipakai. */
  spec: unknown;
  /**
   * Versi pengaturan (review T-016 DI-1) = Widget.updatedAt (ISO). Klien membandingkannya dengan
   * `widgetVersion` jawaban query, dan mengirimnya saat atur/ganti judul (STALE bila sudah berubah).
   */
  version: string;
  /**
   * Hanya tampilan (remapToActive): sheet spec tersimpan tidak bisa ditentukan dan `spec` diarahkan ke
   * satu-satunya sheet aktif. Spec tersimpan belum berubah — kartu tetap SHEET_UNAVAILABLE sampai panel
   * menyimpannya (R3-CC-2). Tidak pernah ada di widget biasa.
   */
  retargeted?: true;
}

/** Sumber data panel konfigurasi widget: sheet siap di versi aktif + kolom yang tampil. */
export interface SourceSheet {
  id: string;
  name: string;
  columns: { pos: number; name: string; type: ColumnType }[];
}

const WIDGET_SELECT = { id: true, type: true, title: true, spec: true, updatedAt: true } as const;
/** Widget tersimpan + kolom yang hilang saat aktivasi versi (T-013); dipetakan oleh remapToActive. */
const STORED_WIDGET_SELECT = { ...WIDGET_SELECT, missingColumns: true } as const;
type StoredWidget = Omit<WidgetView, "version"> & { updatedAt: Date; missingColumns?: string[] };

export type { FilterColumnView } from "./filter-columns";

export interface DashboardView {
  id: string;
  name: string;
  dataset: { id: string; name: string };
  /** Peran peminta (T-016): menentukan mode edit, pengaturan, dan tautan pemilik di halaman. */
  role: DashboardAccessRole;
  /** Nama tampilan pemilik dataset (sudah dibersihkan); null bila belum diisi. */
  ownerName: string | null;
  /**
   * Email pemilik dataset: identitas yang tidak bisa dipalsukan (nama bebas diisi siapa pun dan tidak
   * unik), ditampilkan di samping nama (review T-016 R3 CC-1).
   */
  ownerEmail: string;
  /**
   * Ringkasan akses dashboard, HANYA untuk pemilik (null untuk editor/viewer): share organisasi + jumlah
   * share per user, mis. untuk peringatan saat menghapus dashboard (review T-016 R3 CC-2).
   */
  access: { orgShared: boolean; shareCount: number } | null;
  layout: LayoutItem[];
  layoutRevision: number;
  widgets: WidgetView[];
  updatedAt: Date;
  /**
   * Kolom filter global (T-012), dicocokkan dengan versi data aktif. Non-pemilik hanya menerima yang
   * tersedia (nama kolom yang kini tersembunyi/hilang tidak dikirim).
   */
  filterColumns: FilterColumnView[];
  /**
   * Nama kolom dimensi grafik yang cross-filter-nya aktif (versi aktif, tidak disembunyikan): bersama
   * kolom filter, hanya kolom ini yang boleh dikirim sebagai filter dashboard (D6).
   */
  crossFilterColumns: string[];
}

export interface DashboardSummary {
  id: string;
  name: string;
  datasetId: string;
  datasetName: string;
  widgetCount: number;
  updatedAt: Date;
  /** Dibagikan ke seluruh organisasi (T-016). */
  orgShared: boolean;
  /** Jumlah share per user (termasuk akun yang kini nonaktif). */
  shareCount: number;
}

/** Dashboard milik orang lain yang dibagikan ke user (share user atau organisasi). */
export interface SharedDashboardSummary {
  id: string;
  name: string;
  datasetName: string;
  ownerName: string | null;
  /** Email pemilik dataset (identitas yang tidak bisa dipalsukan nama, review T-016 R3 CC-1). */
  ownerEmail: string;
  role: "EDITOR" | "VIEWER";
  widgetCount: number;
  updatedAt: Date;
}

/** Batas daftar "Dibagikan ke saya": share organisasi bisa mencakup banyak dashboard. */
export const SHARED_LIST_MAX = 200;
/**
 * Share (langsung + organisasi) per pemilik dataset di "Dibagikan ke saya" bila kandidat melewati
 * SHARED_LIST_MAX: satu orang tidak bisa memenuhi daftar penerima tanpa persetujuannya (review T-016
 * R3 SEC-2, R4 DI-1/DI-2). Selama muat, tidak dibatasi per pemilik.
 */
export const SHARED_PER_OWNER_MAX = 20;

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

/** Dashboard dataset milik user: nama, kolom filter, hapus, dan berbagi tetap pemilik saja (T-016). */
const ownedWhere = (userId: string) =>
  ({ dataset: { ownerId: userId } }) satisfies Prisma.DashboardWhereInput;

const forbidden = <T>(need: "owner" | "edit") =>
  fail<T>(
    "FORBIDDEN",
    need === "owner"
      ? "Hanya pemilik dataset yang bisa melakukan ini."
      : "Anda hanya punya akses lihat ke dashboard ini.",
  );

/**
 * Penulisan tidak mengenai baris: SATU cek akses untuk memilih kode (D2). Tidak bisa melihat →
 * NOT_FOUND; bisa melihat tanpa peran yang dibutuhkan → FORBIDDEN; punya perannya → `gone` (widget
 * atau dashboard hilang bersamaan).
 */
async function denied<T>(
  userId: string,
  dashboardId: string,
  need: "owner" | "edit",
  gone: () => DashboardResult<never> | Promise<DashboardResult<never>> = notFound,
): Promise<DashboardResult<T>> {
  const a = await dashboardAccess(userId, dashboardId);
  if (!a) return notFound();
  const allowed = need === "owner" ? a.role === "OWNER" : canEdit(a.role);
  return allowed ? gone() : forbidden(need);
}

export async function listDashboards(ownerId: string): Promise<DashboardSummary[]> {
  const rows = await prisma.dashboard.findMany({
    where: ownedWhere(ownerId),
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      datasetId: true,
      updatedAt: true,
      orgShared: true,
      dataset: { select: { name: true } },
      _count: { select: { widgets: true, shares: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    datasetId: r.datasetId,
    datasetName: r.dataset.name,
    widgetCount: r._count.widgets,
    updatedAt: r.updatedAt,
    orgShared: r.orgShared,
    shareCount: r._count.shares,
  }));
}

export interface SharedDashboardList {
  items: SharedDashboardSummary[];
  /**
   * Dashboard yang dibagikan (langsung atau organisasi) tetapi tidak ikut terdaftar karena kandidat
   * melewati SHARED_LIST_MAX (batas per pemilik berlaku): ditampilkan sebagai catatan agar pemotongan
   * tidak diam-diam. Aksesnya lewat URL tetap.
   */
  hidden: number;
}

/**
 * "Dibagikan ke saya": dashboard dataset orang lain yang dibagikan ke user, share langsung (peran
 * share) atau share organisasi saja (VIEWER; share organisasi dari pemilik yang sudah dinonaktifkan
 * tidak didaftar, aksesnya lewat URL tetap). Dashboard yang dibagikan dua-duanya muncul sekali sebagai
 * share langsung. Selama kandidat muat dalam SHARED_LIST_MAX semuanya didaftar, share langsung dulu lalu
 * terbaru dulu (review T-016 R4 DI-1). Lebih dari itu (share langsung dan organisasi sama-sama tidak
 * butuh persetujuan penerima): paling banyak SHARED_PER_OWNER_MAX per pemilik dataset untuk kedua jenis
 * bersama (share langsungnya dulu), sisanya dihitung di `hidden`, sehingga satu pemberi share tidak bisa
 * mendorong share orang lain keluar dari daftar atau dari 5 teratas Beranda (review T-016 SEC-3, R3
 * SEC-2, R4 DI-2). Dirender utuh tanpa halaman.
 */
export async function listSharedDashboards(userId: string): Promise<SharedDashboardList> {
  const { ids, hidden } = await sharedRanked(userId);
  // Akses dicek ulang saat baris dibaca: share yang dicabut di antara dua query ikut hilang.
  const rows = ids.length
    ? await prisma.dashboard.findMany({
        where: { id: { in: ids }, dataset: { ownerId: { not: userId } }, ...canViewWhere(userId) },
        select: sharedSelect(userId),
      })
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const items = ids.flatMap((id) => {
    const r = byId.get(id);
    const role = r && roleOf(userId, r);
    if (!r || (role !== "EDITOR" && role !== "VIEWER")) return [];
    return [
      {
        id: r.id,
        name: r.name,
        datasetName: r.dataset.name,
        ownerName: cleanUserName(r.dataset.owner.name),
        ownerEmail: r.dataset.owner.email,
        role,
        widgetCount: r._count.widgets,
        updatedAt: r.updatedAt,
      },
    ];
  });
  return { items, hidden };
}

const sharedSelect = (userId: string) =>
  ({
    ...roleSelect(userId),
    id: true,
    name: true,
    updatedAt: true,
    dataset: {
      select: { ownerId: true, name: true, owner: { select: { name: true, email: true } } },
    },
    _count: { select: { widgets: true } },
  }) satisfies Prisma.DashboardSelect;

/**
 * Urutan + batas "Dibagikan ke saya" dihitung Postgres dalam SATU query berparameter. Kandidat: dashboard
 * dataset orang lain dengan baris share user (langsung) atau share organisasi dari pemilik aktif tanpa
 * baris share user (`org`). n = urutan per pemilik dataset untuk kedua jenis bersama (langsung dulu,
 * lalu terbaru dulu), total = semua kandidat. total <= SHARED_LIST_MAX → semuanya; lebih → hanya
 * n <= SHARED_PER_OWNER_MAX, langsung dulu lalu terbaru dulu, paling banyak SHARED_LIST_MAX.
 * `hidden` = total - yang terdaftar.
 */
async function sharedRanked(userId: string) {
  const ranked = await prisma.$queryRaw<{ id: string; total: number }[]>`
    SELECT id, total FROM (
      SELECT d.id, d."updatedAt", s."userId" IS NULL AS org,
        ROW_NUMBER() OVER (PARTITION BY ds."ownerId" ORDER BY s."userId" IS NULL, d."updatedAt" DESC, d.id DESC) AS n,
        CAST(COUNT(*) OVER () AS int) AS total
      FROM "Dashboard" d
      JOIN "Dataset" ds ON ds.id = d."datasetId"
      JOIN "User" u ON u.id = ds."ownerId"
      LEFT JOIN "DashboardShare" s ON s."dashboardId" = d.id AND s."userId" = ${userId}
      WHERE ds."ownerId" <> ${userId} AND (s."userId" IS NOT NULL OR (d."orgShared" AND u."isActive"))
    ) r
    WHERE total <= ${SHARED_LIST_MAX} OR n <= ${SHARED_PER_OWNER_MAX}
    ORDER BY org, "updatedAt" DESC, id DESC
    LIMIT ${SHARED_LIST_MAX}`;
  const ids = ranked.map((r) => r.id);
  return { ids, hidden: Math.max(0, Number(ranked[0]?.total ?? 0) - ids.length) };
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

/** Ganti nama dashboard: pemilik saja (editor → FORBIDDEN). */
export async function renameDashboard(
  userId: string,
  id: unknown,
  nameRaw: unknown,
): Promise<DashboardResult<{ id: string }>> {
  if (!isIdShape(id)) return notFound();
  const name = cleanName(nameRaw, DASHBOARD_NAME_MAX, "dashboard");
  if (!name.ok) return fail("INVALID", name.message, "name");
  try {
    const r = await prisma.dashboard.updateMany({
      where: { id, ...ownedWhere(userId) },
      data: { name: name.value, nameKey: nameKeyOf(name.value) },
    });
    return r.count === 1 ? { ok: true, data: { id } } : denied(userId, id, "owner");
  } catch (e) {
    if (isUnique(e)) {
      return fail("NAME_TAKEN", "Dataset ini sudah punya dashboard dengan nama itu.", "name");
    }
    throw e;
  }
}

/**
 * Hapus dashboard (share ikut terhapus lewat kaskade): pemilik saja. Akses yang ikut berakhir (jumlah
 * share per user + share organisasi) dicatat AuditLog "dashboard.delete" dalam transaksi yang sama,
 * seperti hapus dataset (review T-016 R3 CC-2). Lock `dashboard:<id>` lebih dulu: perubahan share atau
 * widget yang sedang berjalan selesai dulu sehingga hitungannya tepat; urutannya sama dengan penulis
 * widget (lock advisory → baris Dashboard → Widget), jadi tidak menambah jalur deadlock.
 */
export async function deleteDashboard(
  userId: string,
  id: unknown,
  ip: string,
): Promise<DashboardResult<{ id: string }>> {
  if (!isIdShape(id)) return notFound();
  let deleted: boolean;
  try {
    deleted = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(lockKey("dashboard", id));
      const where = { id, ...ownedWhere(userId) };
      const d = await tx.dashboard.findFirst({
        where,
        select: { name: true, orgShared: true, _count: { select: { shares: true } } },
      });
      if (!d) return false;
      const r = await tx.dashboard.deleteMany({ where });
      if (r.count !== 1) return false;
      await recordAudit(tx, {
        actorId: userId,
        action: "dashboard.delete",
        targetType: "dashboard",
        targetId: id,
        meta: { name: d.name, shares: d._count.shares, orgShared: d.orgShared },
        ip,
      });
      return true;
    });
  } catch (e) {
    // Korban deadlock atau antre lock terlalu lama (dibatalkan utuh, dashboard tetap ada) → coba lagi.
    if (isTxConflict(e) || isLockTimeout(e)) return busy();
    throw e;
  }
  return deleted ? { ok: true, data: { id } } : denied(userId, id, "owner");
}

/**
 * Dashboard untuk halaman, untuk semua peran (null = tanpa akses → 404). Peran dihitung di query yang
 * sama dengan datanya dan tidak pernah di-cache lintas permintaan: cache() React hanya menyatukan
 * generateMetadata dan halaman dalam SATU render.
 */
export const getDashboard = cache(async function getDashboard(
  userId: string,
  id: unknown,
): Promise<DashboardView | null> {
  if (!isIdShape(id)) return null;
  const d = await prisma.dashboard.findFirst({
    where: { id, ...canViewWhere(userId) },
    select: {
      ...roleSelect(userId),
      id: true,
      name: true,
      layout: true,
      layoutRevision: true,
      filterColumns: true,
      updatedAt: true,
      dataset: {
        select: {
          id: true,
          name: true,
          activeVersionId: true,
          ownerId: true,
          owner: { select: { name: true, email: true } },
        },
      },
      widgets: { orderBy: { createdAt: "asc" }, select: STORED_WIDGET_SELECT },
      _count: { select: { shares: true } },
    },
  });
  const role = d && roleOf(userId, d);
  if (!d || !role) return null;
  const { activeVersionId } = d.dataset;
  const widgets = await remapToActive(d.dataset.id, activeVersionId, d.widgets);
  const stored = storedFilterColumns(d.filterColumns);
  // Skema versi aktif hanya dibaca bila ada kolom filter atau grafik (sumber cross-filter).
  const sheets =
    activeVersionId && (stored.length || widgets.some((w) => isChart(w.type)))
      ? await activeSheets(activeVersionId)
      : [];
  const filterColumns = filterColumnViews(stored, sheets);
  return {
    id: d.id,
    name: d.name,
    dataset: { id: d.dataset.id, name: d.dataset.name },
    role,
    ownerName: cleanUserName(d.dataset.owner.name),
    ownerEmail: d.dataset.owner.email,
    // Data share hanya untuk pemilik (editor/viewer tidak melihat siapa/berapa yang diberi akses).
    access: role === "OWNER" ? { orgShared: d.orgShared, shareCount: d._count.shares } : null,
    layoutRevision: d.layoutRevision,
    updatedAt: d.updatedAt,
    widgets,
    layout: reconcileLayout(
      d.layout,
      d.widgets.map((w) => w.id),
      typesOf(d.widgets),
    ),
    // Pemilik tetap melihat kolom filter yang hilang/disembunyikan (untuk diperbaiki di pengaturan);
    // non-pemilik tidak menerima namanya sama sekali (review T-016 / catatan T-011).
    filterColumns: role === "OWNER" ? filterColumns : filterColumns.filter((f) => f.available),
    crossFilterColumns: crossFilterColumnsOf(widgets, sheets),
  };
});

const isChart = (type: string) => (CHART_TYPES as readonly string[]).includes(type);

/** Sheet siap query di versi aktif (nama + skema), opsional hanya id tertentu. */
async function activeSheets(versionId: string, ids?: string[]): Promise<ActiveSheet[]> {
  const rows = await prisma.sheet.findMany({
    where: { versionId, typedKey: { not: null }, ...(ids ? { id: { in: ids } } : {}) },
    orderBy: { index: "asc" },
    select: { id: true, name: true, schema: true },
  });
  return rows.map((s) => ({
    id: s.id,
    name: s.name,
    schema: (s.schema as unknown as ColumnSchema[] | null) ?? null,
  }));
}

/**
 * Sumber filter dashboard untuk query widget (T-012): kolom filter tersimpan + dimensi grafik
 * cross-filter, dengan tipenya di versi aktif (izin kolom D6 + kecocokan tipe antar-sheet). dashboardId
 * berasal dari widget yang kepemilikannya sudah dicek pemanggil (query/runtime.ts); tidak dipakai untuk
 * akses lain.
 */
export async function filterSourcesFor(dashboardId: string): Promise<FilterSourceColumn[]> {
  const d = await prisma.dashboard.findFirst({
    where: { id: dashboardId },
    select: {
      datasetId: true,
      filterColumns: true,
      dataset: { select: { activeVersionId: true } },
      widgets: { where: { type: { in: [...CHART_TYPES] } }, select: STORED_WIDGET_SELECT },
    },
  });
  if (!d) return [];
  const stored = storedFilterColumns(d.filterColumns);
  const versionId = d.dataset.activeVersionId;
  if (!versionId || (!stored.length && !d.widgets.length)) {
    return stored.map((f) => ({ name: f.column, type: null }));
  }
  const widgets = await remapToActive(d.datasetId, versionId, d.widgets);
  // Kolom filter dicocokkan lewat nama sheet → semua sheet aktif; tanpa kolom filter cukup sheet grafik.
  const ids = stored.length
    ? undefined
    : [
        ...new Set(
          widgets.flatMap((w) => {
            const c = parseWidgetConfig(w.type, w.spec);
            return c.ok && c.config.type !== "empty" ? [c.config.spec.sheetId] : [];
          }),
        ),
      ];
  return filterSourcesOf(stored, widgets, await activeSheets(versionId, ids));
}

/**
 * Peringatan dialog share (T-016): kolom filter/cross-filter yang juga menyaring sheet lain yang dipakai
 * widget dashboard ini (lihat overlappingFilterColumns). Seperti filterSourcesFor: TANPA cek akses —
 * hanya dipanggil sharing/service SETELAH peminta dipastikan pemilik.
 */
export async function filterOverlapFor(dashboardId: string): Promise<string[]> {
  const d = await prisma.dashboard.findFirst({
    where: { id: dashboardId },
    select: {
      datasetId: true,
      filterColumns: true,
      dataset: { select: { activeVersionId: true } },
      widgets: { select: STORED_WIDGET_SELECT },
    },
  });
  const versionId = d?.dataset.activeVersionId;
  if (!d || !versionId) return [];
  const widgets = await remapToActive(d.datasetId, versionId, d.widgets);
  return overlappingFilterColumns(
    storedFilterColumns(d.filterColumns),
    widgets,
    await activeSheets(versionId),
  );
}

/**
 * Atur kolom filter dashboard (T-012), pemilik saja (editor → FORBIDDEN): ≤ 8, unik, setiap kolom ada
 * dan tampil di versi data aktif. Hasil: tampilan kolom filter yang baru.
 */
export async function setDashboardFilterColumns(
  userId: string,
  dashboardId: unknown,
  columns: unknown,
): Promise<DashboardResult<{ filterColumns: FilterColumnView[] }>> {
  if (!isIdShape(dashboardId)) return notFound();
  const d = await prisma.dashboard.findFirst({
    where: { id: dashboardId, ...ownedWhere(userId) },
    select: { dataset: { select: { activeVersionId: true } } },
  });
  if (!d) return denied(userId, dashboardId, "owner");
  const versionId = d.dataset.activeVersionId;
  const sheets = versionId ? await activeSheets(versionId) : [];
  const checked = checkFilterColumns(columns, sheets);
  if (!checked.ok) return fail("INVALID", checked.message);
  const r = await prisma.dashboard.updateMany({
    where: { id: dashboardId, ...ownedWhere(userId) },
    data: { filterColumns: checked.columns as unknown as Prisma.InputJsonValue },
  });
  if (r.count !== 1) return denied(userId, dashboardId, "owner");
  return { ok: true, data: { filterColumns: filterColumnViews(checked.columns, sheets) } };
}

const toView = ({ missingColumns: _, updatedAt, ...w }: StoredWidget): WidgetView => ({
  ...w,
  version: updatedAt.toISOString(),
});

/**
 * Semua kolom spec ditandai MISSING_COLUMN, spec menunjuk sheetId (bawaan: sheet lama tetap):
 * remapConfig tanpa skema lama tidak menemukan satu nama pun.
 */
function allMissing(
  config: Exclude<WidgetConfig, { type: "empty" }>,
  sheetId = config.spec.sheetId,
): unknown {
  const none = { id: sheetId, name: "", index: 0, schema: [] };
  return remapConfig(config, none, none).config.spec;
}

/**
 * Spec widget yang menunjuk sheet versi lama (data sudah diganti) dipetakan ke versi aktif untuk
 * ditampilkan dan diedit (lihat features/widgets/remap.ts). Sheet yang tidak bisa ditentukan — sudah
 * dihapus retensi, atau sheet lama tanpa pasangan di versi aktif — dan versi aktif hanya punya satu
 * sheet → spec dipindah ke sheet itu dengan semua kolom ditandai hilang (`retargeted`), agar panel
 * menampilkan kolomnya (dataset satu sheet tidak punya pilihan sheet) dan meminta simpan bila tidak ada
 * kolom yang perlu diganti; query tetap memberi SHEET_UNAVAILABLE atau COLUMN_UNAVAILABLE dari spec
 * tersimpan. Lebih dari satu sheet → pilihan sheet di panel; sheet yang dihapus dengan kolom hilang
 * tercatat (T-013) tetap ditandai semua kolomnya. Tidak menulis ke DB.
 */
async function remapToActive(
  datasetId: string,
  activeVersionId: string | null,
  stored: StoredWidget[],
): Promise<WidgetView[]> {
  const widgets = stored.map(toView);
  if (!activeVersionId) return widgets;
  const parsed = stored.map((w) => ({
    w: toView(w),
    c: parseWidgetConfig(w.type, w.spec),
    m: w.missingColumns,
  }));
  const sheetIds = [
    ...new Set(
      parsed.flatMap(({ c }) => (c.ok && c.config.type !== "empty" ? [c.config.spec.sheetId] : [])),
    ),
  ];
  if (!sheetIds.length) return widgets;
  const select = {
    id: true,
    name: true,
    aliasName: true,
    index: true,
    schema: true,
    versionId: true,
  } as const;
  const sheets = await prisma.sheet.findMany({
    where: { id: { in: sheetIds }, version: { datasetId } },
    select,
  });
  const found = new Set(sheets.map((s) => s.id));
  const stale = sheets.filter((s) => s.versionId !== activeVersionId);
  if (!stale.length && sheetIds.every((id) => found.has(id))) return widgets;
  const info = (s: {
    id: string;
    name: string;
    aliasName: string | null;
    index: number;
    schema: unknown;
  }) => ({
    id: s.id,
    name: s.name,
    aliasName: s.aliasName,
    index: s.index,
    schema: (s.schema as unknown as ColumnSchema[] | null) ?? [],
  });
  // Daftar sheet aktif tanpa skema; skema hanya dibaca untuk sheet yang benar-benar jadi target.
  const active = await prisma.sheet.findMany({
    where: { versionId: activeVersionId, typedKey: { not: null } },
    orderBy: { index: "asc" },
    select: { id: true, name: true, aliasName: true, index: true },
  });
  const byId = new Map(stale.map((s) => [s.id, info(s)]));
  const counts = await prisma.sheet.groupBy({
    by: ["versionId"],
    where: { versionId: { in: [...new Set(stale.map((s) => s.versionId))] } },
    _count: { _all: true },
  });
  const sheetsIn = new Map(counts.map((c) => [c.versionId, c._count._all]));
  const versionOf = new Map(stale.map((s) => [s.id, s.versionId]));
  const targetOf = (sheetId: string) => {
    const old = byId.get(sheetId);
    const count = sheetsIn.get(versionOf.get(sheetId) ?? "") ?? 0;
    return old ? matchSheet(old, active, count) : null;
  };
  const targetIds = [...new Set(stale.flatMap((s) => targetOf(s.id)?.id ?? []))];
  const schemas = new Map(
    (
      await prisma.sheet.findMany({
        where: { id: { in: targetIds }, versionId: activeVersionId },
        select: { id: true, schema: true },
      })
    ).map((s) => [s.id, (s.schema as unknown as ColumnSchema[] | null) ?? []]),
  );
  return parsed.map(({ w, c, m }) => {
    if (!c.ok || c.config.type === "empty") return w;
    const sheetId = c.config.spec.sheetId;
    const old = byId.get(sheetId);
    if (!old && found.has(sheetId)) return w; // sudah di versi aktif
    const target = targetOf(sheetId);
    const schema = target && schemas.get(target.id);
    // Kolom yang hilang tetap ditandai (MISSING_COLUMN): panel meminta kolom pengganti.
    if (old && target) {
      return schema
        ? { ...w, spec: remapConfig(c.config, old, { ...target, schema }).config.spec }
        : w;
    }
    // Sheet tidak bisa ditentukan (dihapus retensi / tanpa pasangan di versi aktif).
    if (active.length === 1) {
      return { ...w, spec: allMissing(c.config, active[0]!.id), retargeted: true as const };
    }
    return !old && m?.length ? { ...w, spec: allMissing(c.config) } : w;
  });
}

/**
 * Sumber panel konfigurasi widget: sheet siap query di versi aktif dataset DASHBOARD ini, dengan kolom
 * yang tidak disembunyikan. OWNER/EDITOR saja (editor sengaja boleh membaca semua kolom tampil dataset,
 * D6 — diperingatkan di dialog share); VIEWER/tanpa akses → []. Akses dan sheet dalam satu query.
 */
export async function getDashboardSources(
  userId: string,
  dashboardId: unknown,
): Promise<SourceSheet[]> {
  if (!isIdShape(dashboardId)) return [];
  const sheets = await prisma.sheet.findMany({
    where: {
      typedKey: { not: null },
      version: {
        activeFor: { dashboards: { some: { id: dashboardId, ...canEditWhere(userId) } } },
      },
    },
    orderBy: { index: "asc" },
    select: { id: true, name: true, schema: true },
  });
  return sheets.map((s) => ({
    id: s.id,
    name: s.name,
    columns: ((s.schema as unknown as ColumnSchema[] | null) ?? [])
      .filter((c) => !c.hidden)
      .map((c) => ({ pos: c.pos, name: c.name, type: c.type })),
  }));
}

/** Pesan umum kolom tersembunyi/hilang saat menyimpan pengaturan widget oleh selain pemilik. */
export const COLUMN_UNAVAILABLE_EDITOR = "Kolom yang dipilih tidak tersedia.";

/**
 * Validasi tipe + spec widget terhadap data aktif dataset: bentuk (zod), sheet ada di versi aktif,
 * kolom ada dan tampil, agregasi cocok dengan tipe kolom (aturan yang sama dengan saat query).
 * `stale`: sheet milik versi lain dataset ini — halaman klien memuat sumber dari versi aktif lama
 * (versi berganti saat panel terbuka; panel tidak pernah mengirim sheet di luar sumbernya).
 * `outside`: sheet bukan milik dataset dashboard ini — "foreign" (ada di dataset lain) atau "gone"
 * (tidak ada lagi di mana pun, mis. dihapus retensi). Tidak ada data dataset lain yang dibaca.
 * `detailed` (pemilik saja): pesan kolom tersembunyi/hilang menyebut nama kolomnya. Selain pemilik
 * mendapat pesan umum — editor bisa mengirim posisi kolom apa pun, jadi nama kolom tersembunyi tidak
 * boleh bisa didaftar lewat jalur tulis ini (review T-016 SEC-1).
 */
async function checkConfig(
  datasetId: string,
  type: unknown,
  spec: unknown,
  detailed = false,
): Promise<
  | { ok: true; config: WidgetConfig }
  | { ok: false; message: string; stale?: true; outside?: "foreign" | "gone" }
> {
  const parsed = parseWidgetConfig(type, spec);
  if (!parsed.ok || parsed.config.type === "empty") return parsed;
  const config = parsed.config;
  const sheet = await prisma.sheet.findFirst({
    where: { id: config.spec.sheetId, version: { activeFor: { id: datasetId } } },
    select: { schema: true },
  });
  const schema = sheet?.schema as unknown as ColumnSchema[] | null | undefined;
  if (!schema) {
    const message = "Sheet tidak ditemukan di data aktif dataset ini.";
    if (sheet) return { ok: false, message };
    const other = await prisma.sheet.findFirst({
      where: { id: config.spec.sheetId },
      select: { version: { select: { datasetId: true } } },
    });
    if (!other) return { ok: false, message, outside: "gone" };
    return other.version.datasetId === datasetId
      ? { ok: false, message, stale: true }
      : { ok: false, message, outside: "foreign" };
  }
  const planned = widgetPlan(config, schema, { page: 0 });
  if (planned.ok) return { ok: true, config };
  return {
    ok: false,
    message:
      planned.code === "COLUMN_UNAVAILABLE" && !detailed
        ? COLUMN_UNAVAILABLE_EDITOR
        : planned.message,
  };
}

/** Sheet di luar dataset dashboard (AC6: tidak boleh diakses = 404, bukan 400). */
const sheetNotFound = <T>() => fail<T>("NOT_FOUND", "Sheet tidak ditemukan.");

type Tx = Prisma.TransactionClient;

/** FK dashboard hilang di tengah transaksi (dashboard dihapus bersamaan) → anggap tidak ada. */
const isGone = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && (e.code === "P2003" || e.code === "P2025");

/**
 * Transaksi ber-lock; lock yang tidak didapat dalam batas waktu, atau dibatalkan Postgres karena
 * deadlock/serialisasi (review T-016 R2 DI-1) → "BUSY"; data hilang → null.
 */
async function locked<T>(fn: (tx: Tx) => Promise<T>): Promise<T | "BUSY" | null> {
  try {
    return await prisma.$transaction(fn);
  } catch (e) {
    if (isLockTimeout(e) || isTxConflict(e)) return "BUSY";
    if (isGone(e)) return null;
    throw e;
  }
}

const typesOf = (widgets: { id: string; type: string }[]) =>
  new Map(widgets.map((w) => [w.id, w.type]));

/**
 * Lock advisory `dashboard:<id>`, lalu baris Dashboard SEBELUM baris Widget mana pun (review T-016 R2
 * DI-1). Hapus dashboard/dataset pemilik tidak memegang lock advisory dan mengunci baris Dashboard
 * dulu, baru Widget lewat kaskade; penulis widget (editor) memakai urutan yang sama sehingga keduanya
 * saling menunggu, bukan deadlock. NO KEY UPDATE: tidak bentrok dengan FOR KEY SHARE dari FK (share
 * atau widget baru). Dashboard terhapus lebih dulu → 0 baris; pembacaan/penulisan berikutnya juga 0
 * baris → NOT_FOUND seperti biasa.
 */
async function lockDashboard(tx: Tx, dashboardId: string) {
  await tx.$executeRaw(lockKey("dashboard", dashboardId));
  await tx.$executeRaw`SELECT 1 FROM "Dashboard" WHERE "id" = ${dashboardId} FOR NO KEY UPDATE`;
}

/**
 * Dashboard yang boleh diubah user (OWNER/EDITOR), dikunci untuk SEMUA perubahan tata letak/widget
 * (tambah, hapus, simpan otomatis) sehingga revisi tidak pernah dibagikan dua kali (review T-010 L1).
 * Akses dibaca SETELAH lock, di transaksi yang sama dengan penulisannya: share yang dicabut sebelum
 * lock didapat tidak bisa lagi menulis (tanpa TOCTOU).
 */
async function lockedDashboard(tx: Tx, userId: string, dashboardId: string) {
  await lockDashboard(tx, dashboardId);
  return tx.dashboard.findFirst({
    where: { id: dashboardId, ...canEditWhere(userId) },
    select: {
      layout: true,
      layoutRevision: true,
      widgets: { select: { id: true, type: true } },
    },
  });
}

/**
 * Spec masih menunjuk sheet versi aktif. Dibaca di bawah lock dashboard yang juga diambil aktivasi
 * versi (T-013): spec yang divalidasi terhadap versi aktif lama tidak tersimpan setelah aktivasi
 * memetakan widget lain (spec itu tidak ikut dipetakan dan sheet-nya bisa langsung dihapus retensi).
 */
async function onActiveVersion(tx: Tx, datasetId: string, config: WidgetConfig): Promise<boolean> {
  if (config.type === "empty") return true;
  const n = await tx.sheet.count({
    where: { id: config.spec.sheetId, version: { activeFor: { id: datasetId } } },
  });
  return n === 1;
}

const staleLayout = <T>() =>
  fail<T>(
    "STALE",
    "Perubahan terakhir Anda belum tersimpan karena dashboard ini baru saja diubah orang lain atau di tab lain. Muat ulang, lalu ulangi perubahan.",
  );
const versionChanged = <T>() =>
  fail<T>(
    "STALE",
    "Data dataset ini baru saja berganti versi. Muat ulang halaman, lalu atur lagi widget ini.",
  );
const widgetNotFound = <T>() => fail<T>("NOT_FOUND", "Widget tidak ditemukan.");
const baseOf = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 ? (v as number) : null);

async function writeLayout(tx: Tx, dashboardId: string, layout: LayoutItem[], revision: number) {
  await tx.dashboard.update({
    where: { id: dashboardId },
    data: { layout: layout as unknown as Prisma.InputJsonValue, layoutRevision: revision },
  });
}

/**
 * Tambah widget kosong di baris terbawah (atau di posisi semula saat "urungkan hapus"). baseRevision
 * wajib: tab yang tertinggal mendapat STALE, bukan revisi baru yang membuatnya bisa menimpa tab lain
 * (review T-010 M1). Hasil: layout lengkap yang sudah dipadatkan (klien memakainya apa adanya).
 */
export async function addWidget(
  userId: string,
  dashboardId: unknown,
  body: unknown,
): Promise<
  DashboardResult<{
    widget: WidgetView;
    layout: LayoutItem[];
    layoutRevision: number;
    /** Isi widget yang dipulihkan tidak lagi valid → dipulihkan kosong. */
    configDropped?: true;
  }>
> {
  if (!isIdShape(dashboardId)) return notFound();
  const input = (body && typeof body === "object" ? body : {}) as {
    baseRevision?: unknown;
    title?: unknown;
    at?: unknown;
    type?: unknown;
    spec?: unknown;
  };
  const base = baseOf(input.baseRevision);
  if (base === null) return fail("INVALID", "Revisi tata letak wajib dikirim.");
  const at = input.at === undefined ? null : positionSchema.safeParse(input.at);
  if (at && !at.success) return fail("INVALID", "Posisi widget tidak valid.");
  let title = "";
  if (input.title !== undefined && input.title !== "") {
    const t = cleanName(input.title, WIDGET_TITLE_MAX, "widget");
    if (!t.ok) return fail("INVALID", t.message, "name");
    title = t.value;
  }
  // Urungkan hapus memulihkan tipe + spec juga (catatan review T-010 L6), divalidasi seperti simpan.
  // Spec yang sudah tidak cocok dengan data (mis. kolomnya disembunyikan sejak dihapus, atau sheet-nya
  // sudah dihapus retensi) tidak menggagalkan pemulihan: widget kembali kosong di posisinya dan klien
  // diberi tahu. Sheet dataset lain → NOT_FOUND (AC6), bukan dipulihkan kosong.
  let config: WidgetConfig = { type: "empty", spec: {} };
  let configDropped = false;
  let datasetId: string | null = null;
  if (input.type !== undefined) {
    const editable = await prisma.dashboard.findFirst({
      where: { id: dashboardId, ...canEditWhere(userId) },
      select: { datasetId: true },
    });
    if (!editable) return denied(userId, dashboardId, "edit");
    datasetId = editable.datasetId;
    const checked = await checkConfig(editable.datasetId, input.type, input.spec);
    if (checked.ok) config = checked.config;
    else if (checked.outside === "foreign") return sheetNotFound();
    else configDropped = true;
  }
  const r = await locked(async (tx) => {
    const d = await lockedDashboard(tx, userId, dashboardId);
    if (!d) return null;
    if (d.layoutRevision !== base) return "STALE" as const;
    if (d.widgets.length >= WIDGETS_PER_DASHBOARD) return "LIMIT_REACHED" as const;
    // Versi aktif berganti sejak validasi: dipulihkan kosong seperti spec yang tidak lagi valid.
    if (datasetId && !(await onActiveVersion(tx, datasetId, config))) {
      config = { type: "empty", spec: {} };
      configDropped = true;
    }
    const current = reconcileLayout(
      d.layout,
      d.widgets.map((w) => w.id),
      typesOf(d.widgets),
    );
    const widget = await tx.widget.create({
      data: {
        dashboardId,
        title,
        type: config.type,
        spec: config.spec as unknown as Prisma.InputJsonValue,
      },
      select: WIDGET_SELECT,
    });
    const item: LayoutItem = at?.success
      ? { i: widget.id, ...at.data }
      : { i: widget.id, x: 0, y: bottomOf(current), ...DEFAULT_WIDGET_SIZE };
    // Dipulihkan ke posisi semula: didahulukan agar widget yang sempat naik mengisi tempatnya
    // (setelah hapus + pemadatan) yang bergeser turun, bukan widget yang dipulihkan.
    // Ukuran minimum per jenis juga untuk widget yang dipulihkan (posisi dari klien).
    const types = typesOf([...d.widgets, { id: widget.id, type: widget.type }]);
    const layout = fitMinSizes(
      compactLayout(at?.success ? [item, ...current] : [...current, item]),
      types,
    );
    const layoutRevision = d.layoutRevision + 1;
    await writeLayout(tx, dashboardId, layout, layoutRevision);
    return {
      widget: toView(widget),
      layout,
      layoutRevision,
      ...(configDropped ? { configDropped: true as const } : {}),
    };
  });
  if (r === "BUSY") return busy();
  if (r === null) return denied(userId, dashboardId, "edit");
  if (r === "STALE") return staleLayout();
  if (r === "LIMIT_REACHED") {
    return fail(
      "LIMIT_REACHED",
      `Batas ${WIDGETS_PER_DASHBOARD} widget per dashboard tercapai. Hapus widget yang tidak dipakai.`,
    );
  }
  return { ok: true, data: r };
}

/** Hapus widget; baseRevision wajib (lihat addWidget). Hasil: layout padat tanpa widget itu. */
export async function deleteWidget(
  userId: string,
  dashboardId: unknown,
  widgetId: unknown,
  baseRevision: unknown,
): Promise<DashboardResult<{ layout: LayoutItem[]; layoutRevision: number }>> {
  if (!isIdShape(dashboardId)) return notFound();
  if (!isIdShape(widgetId)) return widgetNotFound();
  const base = baseOf(baseRevision);
  if (base === null) return fail("INVALID", "Revisi tata letak wajib dikirim.");
  const r = await locked(async (tx) => {
    const d = await lockedDashboard(tx, userId, dashboardId);
    if (!d) return null;
    if (!d.widgets.some((w) => w.id === widgetId)) return "NO_WIDGET" as const;
    if (d.layoutRevision !== base) return "STALE" as const;
    await tx.widget.delete({ where: { id: widgetId } });
    const layout = compactLayout(
      reconcileLayout(
        d.layout,
        d.widgets.map((w) => w.id),
        typesOf(d.widgets),
      ).filter((it) => it.i !== widgetId),
    );
    const layoutRevision = d.layoutRevision + 1;
    await writeLayout(tx, dashboardId, layout, layoutRevision);
    return { layout, layoutRevision };
  });
  if (r === "BUSY") return busy();
  if (r === null) return denied(userId, dashboardId, "edit");
  if (r === "NO_WIDGET") return widgetNotFound();
  if (r === "STALE") return staleLayout();
  return { ok: true, data: r };
}

/** Widget dashboard yang boleh diubah user (OWNER/EDITOR); cek akses = bagian dari where tulisnya. */
const editableWidget = (userId: string, dashboardId: string, widgetId: string) =>
  ({
    id: widgetId,
    dashboardId,
    dashboard: canEditWhere(userId),
  }) satisfies Prisma.WidgetWhereInput;

/*
 * Versi pengaturan widget (review T-016 DI-1) = Widget.updatedAt. Atur isi dan ganti judul menerima
 * `version` yang dilihat klien: tulisan memakai CAS pada versi itu, dan versi yang sudah berganti (tab
 * atau pengguna lain menyimpan lebih dulu, atau aktivasi versi data memetakan spec-nya) → STALE,
 * tidak pernah menimpa diam-diam. Tanpa `version`: tulis tanpa CAS (shortcut: pemanggil API yang
 * belum mengirim versi; klien kanvas selalu mengirim).
 * Versi baru ditulis eksplisit dan dikembalikan agar tab yang menyimpan memperbarui salinannya.
 */
const staleWidget = <T>() =>
  fail<T>(
    "STALE",
    "Widget ini sudah berubah sejak halaman ini dimuat. Muat ulang halaman untuk melihat versi terbaru.",
  );
const invalidVersion = <T>() => fail<T>("INVALID", "Versi widget tidak valid.");
/** Selalu lebih baru dari versi dasar klien (dua simpan di milidetik yang sama tetap berbeda versi). */
const nextVersion = (base: Date | null) =>
  new Date(Math.max(Date.now(), (base?.getTime() ?? 0) + 1));

/**
 * Untuk denied(): tulisan widget 0 baris oleh user yang masih boleh mengubah dashboard (akses sudah
 * dicek lebih dulu — tanpa akses 404, viewer 403 — SEBELUM versi dibandingkan). Widget masih ada dan
 * versi dikirim → versinya sudah berganti (STALE); selain itu widget hilang.
 */
const staleOrGone = (where: Prisma.WidgetWhereInput, base: Date | null) => async () =>
  base && (await prisma.widget.findFirst({ where, select: { id: true } }))
    ? staleWidget<never>()
    : widgetNotFound<never>();

export async function renameWidget(
  userId: string,
  dashboardId: unknown,
  widgetId: unknown,
  titleRaw: unknown,
  versionRaw?: unknown,
): Promise<DashboardResult<{ title: string; version: string }>> {
  if (!isIdShape(dashboardId)) return notFound();
  if (!isIdShape(widgetId)) return widgetNotFound();
  const base = parseWidgetVersion(versionRaw);
  if (!base.ok) return invalidVersion();
  let title = "";
  if (titleRaw !== "") {
    const t = cleanName(titleRaw, WIDGET_TITLE_MAX, "widget");
    if (!t.ok) return fail("INVALID", t.message, "name");
    title = t.value;
  }
  const where = editableWidget(userId, dashboardId, widgetId);
  const version = nextVersion(base.value);
  const r = await prisma.widget.updateMany({
    where: base.value ? { ...where, updatedAt: base.value } : where,
    data: { title, updatedAt: version },
  });
  if (r.count !== 1) return denied(userId, dashboardId, "edit", staleOrGone(where, base.value));
  // "Diperbarui" di daftar dashboard ikut berubah. Pernyataan terpisah (autocommit), bukan satu
  // transaksi: lock baris Widget sudah lepas sebelum baris Dashboard dikunci, jadi tidak ada urutan
  // Widget → Dashboard yang bisa deadlock dengan hapus dashboard/dataset (review T-016 R2 DI-1).
  await prisma.dashboard.updateMany({
    where: { id: dashboardId },
    data: { updatedAt: new Date() },
  });
  return { ok: true, data: { title, version: version.toISOString() } };
}

/** Atur tipe dan isi widget (T-011). Divalidasi terhadap data aktif; tidak menyentuh tata letak. */
export async function configureWidget(
  userId: string,
  dashboardId: unknown,
  widgetId: unknown,
  type: unknown,
  spec: unknown,
  versionRaw?: unknown,
): Promise<DashboardResult<{ type: string; spec: unknown; version: string }>> {
  if (!isIdShape(dashboardId)) return notFound();
  if (!isIdShape(widgetId)) return widgetNotFound();
  const base = parseWidgetVersion(versionRaw);
  if (!base.ok) return invalidVersion();
  const where = editableWidget(userId, dashboardId, widgetId);
  const w = await prisma.widget.findFirst({
    where,
    select: { dashboard: { select: { datasetId: true, ...roleSelect(userId) } } },
  });
  if (!w) return denied(userId, dashboardId, "edit", widgetNotFound);
  // Versi dibandingkan di CAS penulisan (di bawah lock), setelah validasi: sheet versi data lama tetap
  // mendapat pesan "berganti versi" yang lebih jelas (aktivasi T-013 juga mengubah spec + versinya).
  const owner = roleOf(userId, w.dashboard) === "OWNER";
  const checked = await checkConfig(w.dashboard.datasetId, type, spec, owner);
  if (!checked.ok) {
    // Sheet versi lain dataset ini: versi aktif berganti saat panel terbuka → minta muat ulang.
    if (checked.stale) return versionChanged();
    // Sheet di luar dataset dashboard (dataset lain, atau sudah tidak ada) → 404, sama untuk keduanya.
    return checked.outside ? sheetNotFound() : fail("INVALID", checked.message);
  }
  const { config } = checked;
  const version = nextVersion(base.value);
  const r = await locked(async (tx) => {
    await lockDashboard(tx, dashboardId);
    if (!(await onActiveVersion(tx, w.dashboard.datasetId, config))) return "STALE" as const;
    const u = await tx.widget.updateMany({
      // CAS pada versi yang dilihat klien (bila dikirim): simpan bersamaan dari tab lain tidak tertimpa.
      where: base.value ? { ...where, updatedAt: base.value } : where,
      // Pengaturan baru menggantikan catatan kolom hilang dari aktivasi versi (T-013).
      data: {
        type: config.type,
        spec: config.spec as unknown as Prisma.InputJsonValue,
        missingColumns: [],
        updatedAt: version,
      },
    });
    if (u.count !== 1) return null;
    await tx.dashboard.updateMany({
      where: { id: dashboardId },
      data: { updatedAt: new Date() },
    });
    return "ok" as const;
  });
  if (r === "BUSY") return busy();
  // Share dicabut/diturunkan di antara cek awal dan lock, widget dihapus bersamaan, atau versinya
  // berganti sejak cek awal.
  if (r === null) return denied(userId, dashboardId, "edit", staleOrGone(where, base.value));
  if (r === "STALE") return versionChanged();
  return {
    ok: true,
    data: { type: config.type, spec: config.spec, version: version.toISOString() },
  };
}

/**
 * Simpan posisi semua widget (simpan otomatis), di bawah lock yang sama dengan tambah/hapus. CAS pada
 * layoutRevision: perubahan dari tampilan lama ditolak STALE; himpunan id harus sama persis; layout
 * dipadatkan sebelum disimpan.
 */
export async function saveLayout(
  userId: string,
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
  const r = await locked(async (tx) => {
    const d = await lockedDashboard(tx, userId, dashboardId);
    if (!d) return null;
    if (d.layoutRevision !== baseRevision) return "STALE" as const;
    const ids = new Set(d.widgets.map((w) => w.id));
    if (items.length !== ids.size || items.some((it) => !ids.has(it.i))) return "STALE" as const;
    const layoutRevision = baseRevision + 1;
    // Ukuran minimum per jenis (tabel 3×4) juga dijaga di server, bukan hanya di kanvas.
    const fitted = fitMinSizes(compactLayout(items), typesOf(d.widgets));
    await writeLayout(tx, dashboardId, fitted, layoutRevision);
    return { layoutRevision };
  });
  if (r === "BUSY") return busy();
  if (r === null) return denied(userId, dashboardId, "edit");
  if (r === "STALE") return staleLayout();
  return { ok: true, data: r };
}
