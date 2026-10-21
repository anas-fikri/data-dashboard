import { DuckDBInstance } from "@duckdb/node-api";
import type { ColumnSchema } from "@/features/ingest/infer";
import type { FilterSource, QueryRepo } from "@/features/query/service";
import type { DashboardAccessRole } from "@/features/sharing/access";

/*
 * Fixture ekspor (T-017): typed.parquet sungguhan (DuckDB) dengan semua tipe kolom + teks berawalan
 * formula, dan repo query palsu yang meniru otorisasi per dashboard (peran per user) + sumber filter D6.
 */
export const DS = "cmv4klj5r0007oczvgiofocpg";
export const VER = "cmv4kljx40009oczvdmpurrxf";
export const SHEET = "cmv4kljx40009oczvdmpurrxa";
export const DASH = "cmv4kljx40009oczvdmpurrd0";
export const TYPED_KEY = "parquet/ds/v/s/typed-1.parquet";

export const OWNER = "cmv4kljx40009oczvdmpuown0";
export const EDITOR = "cmv4kljx40009oczvdmpuedt0";
export const VIEWER = "cmv4kljx40009oczvdmpuvwr0";
export const STRANGER = "cmv4kljx40009oczvdmpustr0";
export const ROLES: Record<string, DashboardAccessRole> = {
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
  col(3, "Tanggal", "date"),
  col(4, "Waktu", "timestamp"),
  col(5, "Aktif", "boolean"),
  col(6, "Durasi", "duration"),
  col(7, "@Catatan", "text"),
  col(8, "Rahasia", "decimal", true),
];

export const ROWS = 240;
/** Isi teks c7 per i % 12 (null = NULL). */
export const NOTES: (string | null)[] = [
  "=1+1",
  "+62812",
  "-5",
  "@SUM(A1)",
  "\ttab",
  "\rcr",
  "biasa",
  null,
  "",
  "a,b",
  'kutip "x"',
  "baris\nbaru",
];
export const cabangOf = (i: number) => `Cabang ${i % 4}`;
export const omzetOf = (i: number) => (i % 10 === 0 ? 100 : ((i * 37) % 1000) + 0.5);
export const tanggalOf = (i: number) => new Date(Date.UTC(2026, 0, 1 + (i % 90)));
export const waktuOf = (i: number) => new Date(Date.UTC(2026, 0, 1, 8, i));
export const aktifOf = (i: number) => (i % 7 === 0 ? null : i % 3 === 0);
export const durasiOf = (i: number) => (i % 11 === 0 ? null : i * 61);

const sqlText = (s: string | null) =>
  s === null
    ? "NULL"
    : `'${s.replace(/'/g, "''").replace(/\t/g, "' || chr(9) || '").replace(/\r/g, "' || chr(13) || '").replace(/\n/g, "' || chr(10) || '")}'`;

/** Tulis typed.parquet fixture ke `path` (nilai = fungsi *Of di atas). */
export async function writeFixtureParquet(path: string): Promise<void> {
  const db = await DuckDBInstance.create(":memory:");
  const c = await db.connect();
  try {
    await c.run(
      `COPY (SELECT (i + 2)::INTEGER AS _row,
                    'Cabang ' || (i % 4) AS c1,
                    CAST(CASE WHEN i % 10 = 0 THEN 100 ELSE (i * 37) % 1000 + 0.5 END AS DECIMAL(38,6)) AS c2,
                    DATE '2026-01-01' + CAST(i % 90 AS INTEGER) AS c3,
                    TIMESTAMP '2026-01-01 08:00:00' + to_minutes(i) AS c4,
                    CASE WHEN i % 7 = 0 THEN NULL ELSE i % 3 = 0 END AS c5,
                    CASE WHEN i % 11 = 0 THEN NULL ELSE CAST(i * 61 AS BIGINT) END AS c6,
                    (list_value(${NOTES.map(sqlText).join(", ")}))[i % 12 + 1] AS c7,
                    CAST(i AS DECIMAL(38,6)) AS c8
             FROM range(${ROWS}) t(i)) TO '${path.replace(/'/g, "''")}' (FORMAT parquet)`,
    );
  } finally {
    c.closeSync();
    db.closeSync();
  }
}

const fmt = { style: "number", decimals: 0 } as const;
export const WIDGETS: Record<string, { type: string; spec: unknown; title: string }> = {
  table: {
    type: "table",
    title: 'Penjualan / Cabang; "Q1"',
    spec: { sheetId: SHEET, columns: [1, 2, 3, 4, 5, 6, 7], format: fmt },
  },
  kpi: {
    type: "kpi",
    title: "Total omzet",
    spec: { sheetId: SHEET, measure: { agg: "sum", column: 2 }, format: fmt },
  },
  bar: {
    type: "bar",
    title: "Omzet per cabang",
    spec: {
      sheetId: SHEET,
      dimension: { column: 1 },
      measure: { agg: "sum", column: 2 },
      sort: "value_desc",
      topN: 3,
      format: fmt,
    },
  },
  pivot: {
    type: "pivot",
    title: "Omzet per cabang per bulan",
    spec: {
      sheetId: SHEET,
      rows: [{ column: 1 }],
      column: { column: 3, timeGrain: "month" },
      values: [{ agg: "sum", column: 2 }],
      sort: "value_desc",
      format: fmt,
      totals: true,
      subtotals: false,
    },
  },
  // T-067: "Tampilkan nilai sebagai" — pivot % dari total kolom, grafik total berjalan.
  ppct: {
    type: "pivot",
    title: "Porsi omzet per bulan",
    spec: {
      sheetId: SHEET,
      rows: [{ column: 1 }],
      column: { column: 3, timeGrain: "month" },
      values: [{ agg: "sum", column: 2, showAs: "pct_col" }],
      sort: "label_asc",
      format: fmt,
      totals: true,
      subtotals: false,
    },
  },
  bpct: {
    type: "bar",
    title: "Porsi omzet per cabang",
    spec: {
      sheetId: SHEET,
      dimension: { column: 1 },
      measure: { agg: "sum", column: 2, showAs: "pct_grand" },
      sort: "label_asc",
      topN: 3,
      format: fmt,
    },
  },
  hidden: {
    type: "table",
    title: "Rahasia",
    spec: { sheetId: SHEET, columns: [1, 8], format: fmt },
  },
};
export const WID = (name: string) => `cmv4kljx40009oczvdmpu${name.padEnd(4, "x").slice(0, 4)}0`;
export const widgetName = (id: string) => Object.keys(WIDGETS).find((n) => WID(n) === id);

/** Sumber filter dashboard (D6): Cabang dan Tanggal saja. */
export const SOURCES: FilterSource[] = [
  { name: "Cabang", type: "text" },
  { name: "Tanggal", type: "date" },
];

export function fakeQueryRepo(over: { roles?: Record<string, DashboardAccessRole> } = {}) {
  const roles = over.roles ?? ROLES;
  const repo = {
    ownedDataset: async () => null,
    sheet: async (versionId: string, sheetId: string) =>
      versionId === VER && sheetId === SHEET
        ? { typedKey: TYPED_KEY, schemaRevision: 1, schema: SCHEMA }
        : null,
    widget: async (userId: string, widgetId: string) => {
      const name = widgetName(widgetId);
      const role = roles[userId];
      if (!name || !role) return null;
      const { type, spec } = WIDGETS[name]!;
      return {
        type,
        spec,
        updatedAt: new Date("2026-10-15T00:00:00Z"),
        datasetId: DS,
        activeVersionId: VER,
        dashboardId: DASH,
        filterColumns: [],
        role,
      };
    },
    filterSources: async () => SOURCES,
  } satisfies QueryRepo;
  return repo;
}

/** Parser CSV RFC 4180 kecil untuk uji: field tanpa kutip yang kosong → null, "" → "". */
export function parseCsv(text: string): (string | null)[][] {
  const rows: (string | null)[][] = [];
  let row: (string | null)[] = [];
  let i = 0;
  while (i < text.length) {
    let field: string | null;
    if (text[i] === '"') {
      let v = "";
      i++;
      for (;;) {
        if (text[i] === '"' && text[i + 1] === '"') {
          v += '"';
          i += 2;
        } else if (text[i] === '"') {
          i++;
          break;
        } else {
          v += text[i];
          i++;
        }
      }
      field = v;
    } else {
      let v = "";
      while (i < text.length && text[i] !== "," && text[i] !== "\n") v += text[i++];
      field = v === "" ? null : v;
    }
    row.push(field);
    if (text[i] === ",") {
      i++;
    } else {
      rows.push(row);
      row = [];
      i++;
    }
  }
  return rows;
}
