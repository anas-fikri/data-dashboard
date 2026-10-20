import { describe, expect, it, vi } from "vitest";
import type { AuditEntry } from "@/features/audit/service";
import {
  createSheetExport,
  downloadExport,
  EXPORT_STATUS,
  exportStatus,
  SHEET_FORBIDDEN_MESSAGE,
  type ExportRepo,
  type ExportRow,
  type NewExport,
  type SheetExportDeps,
} from "@/features/exports/service";
import type { ColumnSchema } from "@/features/ingest/infer";
import type { GridSheet } from "@/features/query/grid-service";

/*
 * T-046: POST /api/exports "Unduh tampilan" (buat), status, dan unduh untuk ekspor tampilan Lihat data.
 * AC3: viewer → FORBIDDEN (403); tampilan dicocokkan dengan skema saat buat; unduh dicatat di AuditLog
 * (dataset.sheet.export) dengan presigned ≤ 5 menit dan ≤ sisa umur 60 menit.
 */

const SHEET = "cmv4kljx40009oczvdsheetx1";
const VER = "cmv4kljx40009oczvdsheetv1";
const DATASET = "cmv4kljx40009oczvdsheetd1";
const OWNER = "cmv4kljx40009oczvdsheetow";
const EDITOR = "cmv4kljx40009oczvdsheeted";
const VIEWER = "cmv4kljx40009oczvdsheetvw";
const EXPORT_ID = "cmv4kljx40009oczvdsheete1";
const NOW = new Date("2026-03-15T03:00:00.000Z");

const col = (pos: number, name: string, type: ColumnSchema["type"], hidden = false) =>
  ({ pos, name, original: name, type, hidden, nullPct: 0 }) as ColumnSchema;
const SCHEMA = [col(1, "Nama", "text"), col(2, "Jumlah", "integer"), col(3, "Gaji", "text", true)];

function sheet(role: GridSheet["role"]): GridSheet {
  return {
    versionId: VER,
    versionStatus: "READY",
    activeVersionId: VER,
    role,
    datasetId: DATASET,
    title: "Penjualan - Maret",
    typedKey: "typed.parquet",
    rawKey: "raw.parquet",
    fileName: "maret.xlsx",
    schemaRevision: 1,
    schema: SCHEMA,
    segments: [],
  };
}
const ROLE: Record<string, GridSheet["role"]> = {
  [OWNER]: "OWNER",
  [EDITOR]: "EDITOR",
  [VIEWER]: null,
};

function setup() {
  const created: NewExport[] = [];
  const deps: SheetExportDeps = {
    repo: {
      createIfRoom: vi.fn(async (input: NewExport) => {
        created.push(input);
        return { id: EXPORT_ID };
      }),
      fail: vi.fn(async () => {}),
    },
    grid: { sheet: async (u, s) => (s === SHEET && u in ROLE ? sheet(ROLE[u]!) : null) },
    enqueue: vi.fn(async () => {}),
    rateLimit: vi.fn(async () => ({ allowed: true, remaining: 29, retryAfterSec: 600 })),
    now: () => NOW,
  };
  return { deps, created };
}

const body = (over: Record<string, unknown> = {}) => ({
  sheetId: SHEET,
  versionId: VER,
  format: "csv",
  cols: [2, 1],
  sort: [{ pos: 2, dir: "desc" }],
  filters: [{ pos: 1, op: "in", values: ["Cabang 1"] }],
  search: { text: "cab", cols: [1] },
  ...over,
});

describe("createSheetExport", () => {
  it("pemilik: baris Export menunjuk sheet + tampilan utuh di params, job diantrekan", async () => {
    const t = setup();
    expect(await createSheetExport(OWNER, body({ format: "xlsx" }), t.deps)).toEqual({
      ok: true,
      exportId: EXPORT_ID,
    });
    expect(t.created).toEqual([
      {
        userId: OWNER,
        dashboardId: null,
        widgetId: null,
        sheetId: SHEET,
        format: "XLSX",
        params: {
          versionId: VER,
          cols: [2, 1],
          sort: [{ pos: 2, dir: "desc" }],
          filters: [{ pos: 1, op: "in", values: ["Cabang 1"] }],
          search: { text: "cab", cols: [1] },
          requestedAt: NOW.toISOString(),
        },
        fileName: expect.stringMatching(/^Penjualan - Maret-\d{8}-\d{4}\.xlsx$/),
      },
    ]);
    expect(t.deps.enqueue).toHaveBeenCalledWith(EXPORT_ID);
  });

  it("editor boleh", async () => {
    expect(await createSheetExport(EDITOR, body(), setup().deps)).toMatchObject({ ok: true });
  });

  it("AC3: viewer → FORBIDDEN (403), pengguna asing sama, tanpa baris Export", async () => {
    for (const user of [VIEWER, "cmv4kljx40009oczvdsheetas"]) {
      const t = setup();
      const r = await createSheetExport(user, body(), t.deps);
      expect(r).toEqual({ ok: false, code: "FORBIDDEN", message: SHEET_FORBIDDEN_MESSAGE });
      expect(EXPORT_STATUS.FORBIDDEN).toBe(403);
      expect(t.created).toEqual([]);
      expect(t.deps.enqueue).not.toHaveBeenCalled();
    }
  });

  it("versi lama → VERSION_CHANGED (409)", async () => {
    const r = await createSheetExport(
      OWNER,
      body({ versionId: "cmv4kljx40009oczvdsheetv0" }),
      setup().deps,
    );
    expect(r).toMatchObject({ ok: false, code: "VERSION_CHANGED" });
    expect(EXPORT_STATUS.VERSION_CHANGED).toBe(409);
  });

  it("kolom tersembunyi skema, field asing, atau saringan rusak → INVALID tanpa nama kolom", async () => {
    for (const b of [
      body({ cols: [1, 3] }),
      body({ widgetId: "x" }),
      body({ filters: [{ pos: 2, op: "in", values: ["bukan angka"] }] }),
      body({ cols: [] }),
    ]) {
      const t = setup();
      const r = await createSheetExport(OWNER, b, t.deps);
      expect(r).toMatchObject({ ok: false, code: "INVALID" });
      expect(JSON.stringify(r)).not.toContain("Gaji");
      expect(t.created).toEqual([]);
    }
  });

  it("rate limit → RATE_LIMITED sebelum membaca sheet", async () => {
    const t = setup();
    t.deps.rateLimit = async () => ({ allowed: false, remaining: 0, retryAfterSec: 42 });
    const grid = vi.spyOn(t.deps.grid, "sheet");
    expect(await createSheetExport(OWNER, body(), t.deps)).toMatchObject({
      code: "RATE_LIMITED",
      retryAfterSec: 42,
    });
    expect(grid).not.toHaveBeenCalled();
  });
});

describe("status + unduh ekspor tampilan", () => {
  const row: ExportRow = {
    id: EXPORT_ID,
    userId: OWNER,
    dashboardId: null,
    widgetId: null,
    sheetId: SHEET,
    format: "CSV",
    status: "DONE",
    errorCode: null,
    errorMessage: null,
    key: `exports/${OWNER}/${EXPORT_ID}.csv`,
    fileName: "Penjualan - Maret-20260315-1000.csv",
    rows: 1000,
    finishedAt: NOW,
    expiresAt: new Date(NOW.getTime() + 60 * 60 * 1000),
    deletedAt: null,
  };
  function repo(access: { role: "OWNER" | "EDITOR"; datasetId: string } | null) {
    const audits: AuditEntry[] = [];
    const r = {
      createIfRoom: vi.fn(),
      findOwned: vi.fn(async (u: string, id: string) =>
        u === row.userId && id === row.id ? row : null,
      ),
      fail: vi.fn(),
      widgetTitle: vi.fn(),
      dashboardRole: vi.fn(async () => "OWNER" as const),
      sheetAccess: vi.fn(async () => access),
      audit: vi.fn(async (e: AuditEntry) => {
        audits.push(e);
      }),
    } satisfies ExportRepo;
    return { r, audits };
  }
  const later = () => new Date(NOW.getTime() + 10 * 60 * 1000);

  it("unduh: presigned ≤ 5 menit + AuditLog dataset.sheet.export tanpa nilai saringan", async () => {
    const { r, audits } = repo({ role: "OWNER", datasetId: DATASET });
    const presign = vi.fn(async (key: string, _o: { expiresIn: number }) => `http://s3/${key}`);
    const out = await downloadExport(OWNER, EXPORT_ID, "10.0.0.1", {
      repo: r,
      presign,
      downloadRateLimit: async () => ({ allowed: true, remaining: 59, retryAfterSec: 600 }),
      now: later,
    });
    expect(out).toEqual({ ok: true, url: `http://s3/${row.key}` });
    expect(presign.mock.calls[0]![1]).toMatchObject({ expiresIn: 300 });
    expect(r.dashboardRole).not.toHaveBeenCalled();
    expect(audits).toEqual([
      {
        actorId: OWNER,
        action: "dataset.sheet.export",
        targetType: "dataset",
        targetId: DATASET,
        meta: { sheetId: SHEET, exportId: EXPORT_ID, format: "csv", rows: 1000, role: "OWNER" },
        ip: "10.0.0.1",
      },
    ]);
  });

  it("akses dicabut (bukan lagi pemilik/editor) → status dan unduh 404 tanpa audit", async () => {
    const { r, audits } = repo(null);
    expect(await exportStatus(OWNER, EXPORT_ID, { repo: r, now: later })).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });
    const presign = vi.fn();
    expect(
      await downloadExport(OWNER, EXPORT_ID, "ip", {
        repo: r,
        presign,
        downloadRateLimit: async () => ({ allowed: true, remaining: 1, retryAfterSec: 1 }),
        now: later,
      }),
    ).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(presign).not.toHaveBeenCalled();
    expect(audits).toEqual([]);
  });

  it("status pemilik dengan akses: selesai + jumlah baris + kedaluwarsa 60 menit", async () => {
    const { r } = repo({ role: "EDITOR", datasetId: DATASET });
    expect(await exportStatus(OWNER, EXPORT_ID, { repo: r, now: later })).toEqual({
      ok: true,
      state: "done",
      rows: 1000,
      expiresAt: "2026-03-15T04:00:00.000Z",
      fileName: row.fileName,
    });
  });
});
