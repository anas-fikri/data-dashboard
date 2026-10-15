import { vi } from "vitest";
import type { ColumnSchema } from "@/features/ingest/infer";
import { ResultCache } from "@/features/query/cache";
import type { CachedQuery, QueryDeps, QueryRepo } from "@/features/query/service";
import type { DashboardAccess, DashboardAccessRole } from "@/features/sharing/access";
import { MISSING_COLUMN } from "@/features/widgets/remap";

/*
 * Fixture berbagi (T-016) untuk uji query: satu dashboard DASH (dataset DS, versi aktif VER) dengan
 * peran per user, repo palsu yang meniru otorisasi per dashboard, dan mesin DuckDB palsu yang
 * menghitung panggilan (otorisasi harus terjadi sebelum cache/DuckDB).
 */
export const DS = "cmv4klj5r0007oczvgiofocpg";
export const VER = "cmv4kljx40009oczvdmpurrxf";
export const SHEET = "cmv4kljx40009oczvdmpurrxa";
/** Sheet milik dataset lain (Y): tidak ada di versi aktif dataset dashboard. */
export const FOREIGN_SHEET = "cmv4kljx40009oczvdmpurryy";
/** Sheet versi lama yang sudah dihapus retensi. */
export const RETIRED_SHEET = "cmv4kljx40009oczvdmpurrol";
/** Sheet versi lama yang masih ada (dipetakan lewat nama ke versi aktif). */
export const RENAMED_SHEET = "cmv4kljx40009oczvdmpurrrn";
export const DASH = "cmv4kljx40009oczvdmpurrd0";

export const OWNER = "u-pemilik";
export const EDITOR = "u-editor";
export const VIEWER = "u-viewer";
export const STRANGER = "u-asing";
const ROLES: Record<string, DashboardAccessRole> = {
  [OWNER]: "OWNER",
  [EDITOR]: "EDITOR",
  [VIEWER]: "VIEWER",
};

const col = (pos: number, name: string, type: ColumnSchema["type"], hidden = false) =>
  ({
    pos,
    name,
    original: name,
    type,
    hidden,
    nullPct: 0,
    distinctCount: 0,
    castFailCount: 0,
  }) as ColumnSchema;
export const SCHEMA: ColumnSchema[] = [
  col(1, "Cabang", "text"),
  col(2, "Omzet", "decimal"),
  col(3, "Rahasia", "decimal", true),
];

const fmt = { style: "number", decimals: 0 } as const;
/** Kolom filter dashboard (D6): hanya Cabang. */
export const FILTER_COLUMNS = [{ sheet: "Data", column: "Cabang" }];

/**
 * Widget dashboard. Lima varian COLUMN_UNAVAILABLE: kolom tersembunyi (query/widget.ts), kolom tidak
 * ada (widget.ts), penanda MISSING_COLUMN + nama tersimpan, sheet lama dihapus retensi + nama
 * tersimpan, dan kolom hilang saat dipetakan ke versi aktif (query/service.ts missingMessage).
 */
export const WIDGETS: Record<string, { type: string; spec: unknown; missingColumns?: string[] }> = {
  kpi: { type: "kpi", spec: { sheetId: SHEET, measure: { agg: "count" }, format: fmt } },
  hidden: {
    type: "kpi",
    spec: { sheetId: SHEET, measure: { agg: "sum", column: 3 }, format: fmt },
  },
  gone: { type: "table", spec: { sheetId: SHEET, columns: [1, 99], format: fmt } },
  marked: {
    type: "bar",
    spec: {
      sheetId: SHEET,
      dimension: { column: 1 },
      measure: { agg: "sum", column: MISSING_COLUMN },
      sort: "value_desc",
      topN: 12,
      format: fmt,
    },
    missingColumns: ["Diskon"],
  },
  retired: {
    type: "kpi",
    spec: { sheetId: RETIRED_SHEET, measure: { agg: "sum", column: 2 }, format: fmt },
    missingColumns: ["Omzet Lama"],
  },
  remapped: {
    type: "kpi",
    spec: { sheetId: RENAMED_SHEET, measure: { agg: "sum", column: 2 }, format: fmt },
  },
};
export const WID = (name: string) => `cmv4kljx40009oczvdmpu${name.padEnd(4, "x").slice(0, 4)}0`;
/** Widget.updatedAt semua widget fixture = versi pengaturan (review T-016 DI-1). */
export const WIDGET_UPDATED_AT = new Date("2026-10-15T03:04:05.678Z");

/** Spec bebas yang sah atas sheet aktif. */
export const SPEC = { sheetId: SHEET, measures: [{ agg: "count" }] };

export function makeDeps() {
  const exec = vi.fn(async () => ({ columns: ["m0"], rows: [[42]] as unknown[][] }));
  const repo = {
    ownedDataset: vi.fn(async (userId: string, datasetId: string) =>
      userId === OWNER && datasetId === DS ? { activeVersionId: VER } : null,
    ),
    sheet: vi.fn(async (versionId: string, sheetId: string) =>
      versionId === VER && sheetId === SHEET
        ? { typedKey: "parquet/ds/v/s/typed-1.parquet", schemaRevision: 1, schema: SCHEMA }
        : null,
    ),
    sheetHistory: async (_datasetId: string, _versionId: string, sheetId: string) =>
      sheetId === RENAMED_SHEET
        ? {
            old: {
              id: RENAMED_SHEET,
              name: "Data",
              index: 0,
              schema: [col(1, "Cabang", "text"), col(2, "Omzet Lama", "decimal")],
            },
            oldSheetCount: 1,
            active: [{ id: SHEET, name: "Data", index: 0 }],
          }
        : null,
    // Akses per dashboard: hanya user yang punya peran di DASH; lainnya null (404).
    widget: vi.fn(async (userId: string, widgetId: string) => {
      const name = Object.keys(WIDGETS).find((n) => WID(n) === widgetId);
      const role = ROLES[userId];
      if (!name || !role) return null;
      return {
        ...WIDGETS[name]!,
        updatedAt: WIDGET_UPDATED_AT,
        datasetId: DS,
        activeVersionId: VER,
        dashboardId: DASH,
        filterColumns: FILTER_COLUMNS,
        role,
      };
    }),
    filterSource: vi.fn(async (userId: string, dashboardId: string) => {
      const role = ROLES[userId];
      return dashboardId === DASH && role
        ? {
            datasetId: DS,
            activeVersionId: VER,
            filterColumns: FILTER_COLUMNS,
            sheets: [{ id: SHEET, name: "Data" }],
            role,
          }
        : null;
    }),
    dashboardAccess: vi.fn(
      async (userId: string, dashboardId: string): Promise<DashboardAccess | null> => {
        const role = ROLES[userId];
        return dashboardId === DASH && role ? { role, datasetId: DS, activeVersionId: VER } : null;
      },
    ),
  } satisfies QueryRepo;
  const cache = new ResultCache<CachedQuery>(1 << 20);
  const deps: QueryDeps = {
    repo,
    parquet: { acquire: async () => ({ path: "/tmp/t016-sharing.parquet", release: () => {} }) },
    engine: { withSlot: (_u, fn) => fn(), exec },
    cache,
    timeoutMs: 5_000,
  };
  return { deps, repo, exec, cache };
}
