import "server-only";
import { Prisma } from "@prisma/client";
import { cache } from "react";
import { isIdShape, nameKeyOf } from "@/features/datasets/validation";
import type { ColumnSchema, ColumnType } from "@/features/ingest/infer";
import { widgetPlan } from "@/features/query/widget";
import { matchSheet, remapConfig } from "@/features/widgets/remap";
import { CHART_TYPES, parseWidgetConfig, type WidgetConfig } from "@/features/widgets/spec";
import { prisma } from "@/lib/db";
import {
  checkFilterColumns,
  crossFilterColumnsOf,
  filterColumnViews,
  filterSourcesOf,
  storedFilterColumns,
  type ActiveSheet,
  type FilterColumnView,
  type FilterSourceColumn,
} from "./filter-columns";
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
  positionSchema,
  reconcileLayout,
  type LayoutItem,
} from "./validation";

/*
 * Dashboard dan kanvas (T-010). Pemilik dataset saja (berbagi di T-016); dashboard milik orang lain
 * selalu NOT_FOUND. Posisi semua widget disimpan di Dashboard.layout dengan layoutRevision. Tambah,
 * hapus, dan simpan otomatis berjalan di bawah advisory lock per dashboard dan wajib membawa revisi yang
 * dilihat klien: tab yang tertinggal mendapat STALE, tidak pernah menimpa (review T-010 M1/L1).
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
  /** Spec tersimpan (T-011); klien memvalidasi ulang dengan parseWidgetConfig sebelum dipakai. */
  spec: unknown;
}

/** Sumber data panel konfigurasi widget: sheet siap di versi aktif + kolom yang tampil. */
export interface SourceSheet {
  id: string;
  name: string;
  columns: { pos: number; name: string; type: ColumnType }[];
}

const WIDGET_SELECT = { id: true, type: true, title: true, spec: true } as const;
/** Widget tersimpan + kolom yang hilang saat aktivasi versi (T-013); dipetakan oleh remapToActive. */
const STORED_WIDGET_SELECT = { ...WIDGET_SELECT, missingColumns: true } as const;
type StoredWidget = WidgetView & { missingColumns?: string[] };

export type { FilterColumnView } from "./filter-columns";

export interface DashboardView {
  id: string;
  name: string;
  dataset: { id: string; name: string };
  layout: LayoutItem[];
  layoutRevision: number;
  widgets: WidgetView[];
  updatedAt: Date;
  /** Kolom filter global (T-012), dicocokkan dengan versi data aktif. */
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

/** Satu query per render: generateMetadata dan halaman memakai hasil yang sama. */
export const getDashboard = cache(async function getDashboard(
  ownerId: string,
  id: unknown,
): Promise<DashboardView | null> {
  if (!isIdShape(id)) return null;
  const d = await prisma.dashboard.findFirst({
    where: { id, dataset: { ownerId } },
    select: {
      id: true,
      name: true,
      layout: true,
      layoutRevision: true,
      filterColumns: true,
      updatedAt: true,
      dataset: { select: { id: true, name: true, activeVersionId: true } },
      widgets: { orderBy: { createdAt: "asc" }, select: STORED_WIDGET_SELECT },
    },
  });
  if (!d) return null;
  const { activeVersionId, ...dataset } = d.dataset;
  const widgets = await remapToActive(d.dataset.id, activeVersionId, d.widgets);
  const stored = storedFilterColumns(d.filterColumns);
  // Skema versi aktif hanya dibaca bila ada kolom filter atau grafik (sumber cross-filter).
  const sheets =
    activeVersionId && (stored.length || widgets.some((w) => isChart(w.type)))
      ? await activeSheets(activeVersionId)
      : [];
  return {
    ...d,
    dataset,
    widgets,
    layout: reconcileLayout(
      d.layout,
      d.widgets.map((w) => w.id),
      typesOf(d.widgets),
    ),
    filterColumns: filterColumnViews(stored, sheets),
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
 * Atur kolom filter dashboard (T-012), pemilik saja: ≤ 8, unik, setiap kolom ada dan tampil di versi
 * data aktif. Hasil: tampilan kolom filter yang baru.
 */
export async function setDashboardFilterColumns(
  ownerId: string,
  dashboardId: unknown,
  columns: unknown,
): Promise<DashboardResult<{ filterColumns: FilterColumnView[] }>> {
  if (!isIdShape(dashboardId)) return notFound();
  const d = await prisma.dashboard.findFirst({
    where: { id: dashboardId, dataset: { ownerId } },
    select: { dataset: { select: { activeVersionId: true } } },
  });
  if (!d) return notFound();
  const versionId = d.dataset.activeVersionId;
  const sheets = versionId ? await activeSheets(versionId) : [];
  const checked = checkFilterColumns(columns, sheets);
  if (!checked.ok) return fail("INVALID", checked.message);
  const r = await prisma.dashboard.updateMany({
    where: { id: dashboardId, dataset: { ownerId } },
    data: { filterColumns: checked.columns as unknown as Prisma.InputJsonValue },
  });
  if (r.count !== 1) return notFound();
  return { ok: true, data: { filterColumns: filterColumnViews(checked.columns, sheets) } };
}

const toView = ({ missingColumns: _, ...w }: StoredWidget): WidgetView => w;

/**
 * Semua kolom spec ditandai MISSING_COLUMN (sheetId tetap): remapConfig tanpa skema lama tidak
 * menemukan satu nama pun.
 */
function allMissing(config: Exclude<WidgetConfig, { type: "empty" }>): unknown {
  const none = { id: config.spec.sheetId, name: "", index: 0, schema: [] };
  return remapConfig(config, none, none).config.spec;
}

/**
 * Spec widget yang menunjuk sheet versi lama (data sudah diganti) dipetakan ke versi aktif untuk
 * ditampilkan dan diedit (lihat features/widgets/remap.ts). Sheet lama yang sudah dihapus retensi
 * dengan kolom hilang tercatat saat aktivasi (T-013) → semua kolomnya ditandai hilang, sehingga panel
 * meminta kolom pengganti dan query memberi COLUMN_UNAVAILABLE. Tidak menulis ke DB.
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
  const select = { id: true, name: true, index: true, schema: true, versionId: true } as const;
  const sheets = await prisma.sheet.findMany({
    where: { id: { in: sheetIds }, version: { datasetId } },
    select,
  });
  const found = new Set(sheets.map((s) => s.id));
  const lost = (c: (typeof parsed)[number]["c"], missing: string[] = []) =>
    c.ok && c.config.type !== "empty" && !found.has(c.config.spec.sheetId) && missing.length > 0;
  const stale = sheets.filter((s) => s.versionId !== activeVersionId);
  if (!stale.length && !parsed.some(({ c, m }) => lost(c, m))) return widgets;
  const info = (s: { id: string; name: string; index: number; schema: unknown }) => ({
    id: s.id,
    name: s.name,
    index: s.index,
    schema: (s.schema as unknown as ColumnSchema[] | null) ?? [],
  });
  // Daftar sheet aktif tanpa skema; skema hanya dibaca untuk sheet yang benar-benar jadi target.
  const active = await prisma.sheet.findMany({
    where: { versionId: activeVersionId, typedKey: { not: null } },
    orderBy: { index: "asc" },
    select: { id: true, name: true, index: true },
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
    if (lost(c, m)) return { ...w, spec: allMissing(c.config) };
    const old = byId.get(c.config.spec.sheetId);
    const target = targetOf(c.config.spec.sheetId);
    const schema = target && schemas.get(target.id);
    // Kolom yang hilang tetap ditandai (MISSING_COLUMN): panel meminta kolom pengganti.
    return old && target && schema
      ? { ...w, spec: remapConfig(c.config, old, { ...target, schema }).config.spec }
      : w;
  });
}

/** Sheet siap query di versi aktif dataset milik user, dengan kolom yang tidak disembunyikan. */
export async function getDashboardSources(
  ownerId: string,
  datasetId: string,
): Promise<SourceSheet[]> {
  const sheets = await prisma.sheet.findMany({
    where: {
      typedKey: { not: null },
      version: { activeFor: { id: datasetId, ownerId } },
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

/**
 * Validasi tipe + spec widget terhadap data aktif dataset: bentuk (zod), sheet ada di versi aktif,
 * kolom ada dan tampil, agregasi cocok dengan tipe kolom (aturan yang sama dengan saat query).
 */
async function checkConfig(
  datasetId: string,
  type: unknown,
  spec: unknown,
): Promise<{ ok: true; config: WidgetConfig } | { ok: false; message: string }> {
  const parsed = parseWidgetConfig(type, spec);
  if (!parsed.ok || parsed.config.type === "empty") return parsed;
  const config = parsed.config;
  const sheet = await prisma.sheet.findFirst({
    where: { id: config.spec.sheetId, version: { activeFor: { id: datasetId } } },
    select: { schema: true },
  });
  const schema = sheet?.schema as unknown as ColumnSchema[] | null | undefined;
  if (!schema) return { ok: false, message: "Sheet tidak ditemukan di data aktif dataset ini." };
  const planned = widgetPlan(config, schema, { page: 0 });
  return planned.ok ? { ok: true, config } : { ok: false, message: planned.message };
}

type Tx = Prisma.TransactionClient;

/** FK dashboard hilang di tengah transaksi (dashboard dihapus bersamaan) → anggap tidak ada. */
const isGone = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && (e.code === "P2003" || e.code === "P2025");

/** Transaksi ber-lock; lock yang tidak didapat dalam batas waktu → "BUSY", data hilang → null. */
async function locked<T>(fn: (tx: Tx) => Promise<T>): Promise<T | "BUSY" | null> {
  try {
    return await prisma.$transaction(fn);
  } catch (e) {
    if (isLockTimeout(e)) return "BUSY";
    if (isGone(e)) return null;
    throw e;
  }
}

/**
 * Dashboard milik user, dikunci untuk SEMUA perubahan tata letak/widget (tambah, hapus, simpan
 * otomatis) sehingga revisi tidak pernah dibagikan dua kali (review T-010 L1).
 */
const typesOf = (widgets: { id: string; type: string }[]) =>
  new Map(widgets.map((w) => [w.id, w.type]));

async function lockedDashboard(tx: Tx, ownerId: string, dashboardId: string) {
  await tx.$executeRaw(lockKey("dashboard", dashboardId));
  return tx.dashboard.findFirst({
    where: { id: dashboardId, dataset: { ownerId } },
    select: {
      layout: true,
      layoutRevision: true,
      widgets: { select: { id: true, type: true } },
    },
  });
}

const staleLayout = <T>() =>
  fail<T>(
    "STALE",
    "Perubahan terakhir Anda belum tersimpan karena dashboard ini diubah di tab atau perangkat lain. Muat ulang, lalu ulangi perubahan.",
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
  ownerId: string,
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
  // Spec yang sudah tidak cocok dengan data (mis. kolomnya disembunyikan sejak dihapus) tidak
  // menggagalkan pemulihan: widget kembali kosong di posisinya dan klien diberi tahu.
  let config: WidgetConfig = { type: "empty", spec: {} };
  let configDropped = false;
  if (input.type !== undefined) {
    const owner = await prisma.dashboard.findFirst({
      where: { id: dashboardId, dataset: { ownerId } },
      select: { datasetId: true },
    });
    if (!owner) return notFound();
    const checked = await checkConfig(owner.datasetId, input.type, input.spec);
    if (checked.ok) config = checked.config;
    else configDropped = true;
  }
  const r = await locked(async (tx) => {
    const d = await lockedDashboard(tx, ownerId, dashboardId);
    if (!d) return null;
    if (d.layoutRevision !== base) return "STALE" as const;
    if (d.widgets.length >= WIDGETS_PER_DASHBOARD) return "LIMIT_REACHED" as const;
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
      widget,
      layout,
      layoutRevision,
      ...(configDropped ? { configDropped: true as const } : {}),
    };
  });
  if (r === "BUSY") return busy();
  if (r === null) return notFound();
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
  ownerId: string,
  dashboardId: unknown,
  widgetId: unknown,
  baseRevision: unknown,
): Promise<DashboardResult<{ layout: LayoutItem[]; layoutRevision: number }>> {
  if (!isIdShape(dashboardId)) return notFound();
  if (!isIdShape(widgetId)) return widgetNotFound();
  const base = baseOf(baseRevision);
  if (base === null) return fail("INVALID", "Revisi tata letak wajib dikirim.");
  const r = await locked(async (tx) => {
    const d = await lockedDashboard(tx, ownerId, dashboardId);
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
  if (r === null) return notFound();
  if (r === "NO_WIDGET") return widgetNotFound();
  if (r === "STALE") return staleLayout();
  return { ok: true, data: r };
}

export async function renameWidget(
  ownerId: string,
  dashboardId: unknown,
  widgetId: unknown,
  titleRaw: unknown,
): Promise<DashboardResult<{ title: string }>> {
  if (!isIdShape(dashboardId)) return notFound();
  if (!isIdShape(widgetId)) return widgetNotFound();
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
  if (r.count !== 1) return widgetNotFound();
  // "Diperbarui" di daftar dashboard ikut berubah.
  await prisma.dashboard.updateMany({
    where: { id: dashboardId },
    data: { updatedAt: new Date() },
  });
  return { ok: true, data: { title } };
}

/** Atur tipe dan isi widget (T-011). Divalidasi terhadap data aktif; tidak menyentuh tata letak. */
export async function configureWidget(
  ownerId: string,
  dashboardId: unknown,
  widgetId: unknown,
  type: unknown,
  spec: unknown,
): Promise<DashboardResult<{ type: string; spec: unknown }>> {
  if (!isIdShape(dashboardId)) return notFound();
  if (!isIdShape(widgetId)) return widgetNotFound();
  const where = { id: widgetId, dashboardId, dashboard: { dataset: { ownerId } } };
  const w = await prisma.widget.findFirst({
    where,
    select: { dashboard: { select: { datasetId: true } } },
  });
  if (!w) return widgetNotFound();
  const checked = await checkConfig(w.dashboard.datasetId, type, spec);
  if (!checked.ok) return fail("INVALID", checked.message);
  const { config } = checked;
  const r = await prisma.widget.updateMany({
    where,
    // Pengaturan baru menggantikan catatan kolom hilang dari aktivasi versi (T-013).
    data: {
      type: config.type,
      spec: config.spec as unknown as Prisma.InputJsonValue,
      missingColumns: [],
    },
  });
  if (r.count !== 1) return widgetNotFound();
  await prisma.dashboard.updateMany({
    where: { id: dashboardId },
    data: { updatedAt: new Date() },
  });
  return { ok: true, data: { type: config.type, spec: config.spec } };
}

/**
 * Simpan posisi semua widget (simpan otomatis), di bawah lock yang sama dengan tambah/hapus. CAS pada
 * layoutRevision: perubahan dari tampilan lama ditolak STALE; himpunan id harus sama persis; layout
 * dipadatkan sebelum disimpan.
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
  const r = await locked(async (tx) => {
    const d = await lockedDashboard(tx, ownerId, dashboardId);
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
  if (r === null) return notFound();
  if (r === "STALE") return staleLayout();
  return { ok: true, data: r };
}
