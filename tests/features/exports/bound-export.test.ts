import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SOURCE_CHANGED, runExportJob, type ExportJobDeps } from "@/features/exports/job";
import { createExport, type ExportDeps } from "@/features/exports/service";
import type { QueryRepo } from "@/features/query/service";
import {
  DASH,
  DS,
  OWNER,
  ROWS,
  SHEET,
  TYPED_KEY,
  VIEWER,
  cabangOf,
  fakeQueryRepo,
  omzetOf,
  parseCsv,
  writeFixtureParquet,
} from "./fixtures";

/*
 * T-073: ekspor CSV/XLSX widget terikat pivot tersimpan memakai spec efektif yang sama dengan layar,
 * dikunci ke revisi pivot tersimpan saat ekspor diminta (Export.params.sourceRevision); sumber berubah
 * sebelum job berjalan → VERSION_CHANGED, bukan file dari definisi lain.
 */
const SP = "cmv4kljx40009oczvdmpusp01";
const EXPORT_ID = "cmv4kljx40009oczvdmpuexp7";
const fmt = { style: "number", decimals: 0 } as const;
const SAVED = {
  sheetId: SHEET,
  rows: [{ column: 1 }],
  values: [{ agg: "sum", column: 2 }, { agg: "count" }],
  sort: "label_asc",
  format: fmt,
  totals: true,
  subtotals: false,
  filters: [{ column: 1, op: "in", values: ["Cabang 1", "Cabang 2"] }],
};
const BOUND: Record<string, { type: string; spec: unknown }> = {
  [`${SP.slice(0, -2)}b1`]: {
    type: "bar",
    spec: { dimension: "row", value: 0, sort: "label_asc", topN: 10 },
  },
  [`${SP.slice(0, -2)}t1`]: { type: "table", spec: { sort: "label_asc", totals: true } },
};
const BAR = `${SP.slice(0, -2)}b1`;
const TABLE = `${SP.slice(0, -2)}t1`;

function boundRepo(state: { revision: number; datasetId?: string }): QueryRepo {
  const base = fakeQueryRepo();
  return {
    ...base,
    widget: async (userId, widgetId) => {
      const b = BOUND[widgetId];
      if (!b) return base.widget(userId, widgetId);
      const owner = await base.widget(userId, "cmv4kljx40009oczvdmpukpix0");
      if (!owner) return null;
      return {
        ...owner,
        ...b,
        savedPivotId: SP,
        savedPivot: {
          id: SP,
          datasetId: state.datasetId ?? DS,
          spec: SAVED,
          revision: state.revision,
          missingColumns: [],
        },
      };
    },
  };
}

let root: string;
let fixture: string;
beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "dd-bound-export-"));
  fixture = join(root, "fixture.parquet");
  await writeFixtureParquet(fixture);
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

function job(widgetId: string, params: Record<string, unknown>, state: { revision: number }) {
  const stored = mkdtempSync(join(root, "s3-"));
  const status = { value: "QUEUED", failed: null as null | { code: string; message: string } };
  const objects = new Map<string, string>();
  const deps: ExportJobDeps = {
    repo: {
      load: async () => ({
        id: EXPORT_ID,
        userId: OWNER,
        dashboardId: DASH,
        widgetId,
        format: "CSV",
        status: status.value as "QUEUED",
        params: { requestedAt: "2026-03-15T05:00:00.000Z", ...params },
        fileName: "x.csv",
        key: null,
        title: "Terikat",
      }),
      start: async () => {
        status.value = "RUNNING";
        return true;
      },
      finish: async () => {
        status.value = "DONE";
        return true;
      },
      fail: async (_id, code, message) => {
        status.value = "FAILED";
        status.failed = { code, message };
      },
      exists: async () => true,
    },
    query: { repo: boundRepo(state) },
    storage: {
      download: async (key, dest) => {
        expect(key).toBe(TYPED_KEY);
        copyFileSync(fixture, dest);
      },
      upload: async (key, path) => {
        const to = join(stored, key.replace(/\//g, "_"));
        copyFileSync(path, to);
        objects.set(key, to);
      },
      remove: async () => {},
    },
    scheduleDelete: async () => {},
    tmpRoot: mkdtempSync(join(root, "tmp-")),
    maxRows: 1_000_000,
    ttlMs: 60 * 60 * 1000,
    deadlineMs: 60_000,
    now: () => new Date("2026-03-15T05:01:00.000Z"),
  };
  return { deps, status, objects };
}

const expected = (() => {
  const m = new Map<string, number>();
  for (let i = 0; i < ROWS; i++) {
    const c = cabangOf(i);
    if (c === "Cabang 1" || c === "Cabang 2") m.set(c, (m.get(c) ?? 0) + omzetOf(i));
  }
  return m;
})();

describe("AC5: ekspor widget terikat = spec efektif revisi saat diminta", () => {
  it("createExport menyimpan revisi pivot tersimpan di params; viewer juga (tanpa definisi di body)", async () => {
    for (const user of [OWNER, VIEWER]) {
      const created: { params: unknown }[] = [];
      const deps = {
        repo: {
          createIfRoom: vi.fn(async (input: { params: unknown }) => {
            created.push(input);
            return { id: EXPORT_ID };
          }),
          findOwned: vi.fn(),
          fail: vi.fn(),
          widgetTitle: vi.fn(async () => "Terikat"),
          dashboardRole: vi.fn(),
          sheetAccess: vi.fn(),
          audit: vi.fn(),
        },
        query: { repo: boundRepo({ revision: 4 }) },
        enqueue: vi.fn(async () => {}),
        rateLimit: async () => ({ allowed: true, remaining: 1, retryAfterSec: 1 }),
        downloadRateLimit: async () => ({ allowed: true, remaining: 1, retryAfterSec: 1 }),
        presign: async () => "",
        now: () => new Date("2026-03-15T05:00:00.000Z"),
      } as unknown as ExportDeps;
      expect(await createExport(user, { widgetId: BAR, format: "csv" }, deps)).toMatchObject({
        ok: true,
      });
      expect(created[0]!.params).toEqual({
        requestedAt: "2026-03-15T05:00:00.000Z",
        sourceId: SP,
        sourceRevision: 4,
      });
      expect(
        await createExport(user, { widgetId: BAR, format: "csv", savedPivotId: SP }, deps),
      ).toMatchObject({ ok: false, code: "INVALID" });
    }
  });

  it("pivot tersimpan dataset lain → NOT_FOUND saat buat", async () => {
    const deps = {
      repo: { createIfRoom: vi.fn(), widgetTitle: vi.fn() },
      query: { repo: boundRepo({ revision: 1, datasetId: "cmv4klj5r0007oczvgiofocpo" }) },
      enqueue: vi.fn(),
      rateLimit: async () => ({ allowed: true, remaining: 1, retryAfterSec: 1 }),
      now: () => new Date(),
    } as unknown as ExportDeps;
    expect(await createExport(OWNER, { widgetId: BAR, format: "csv" }, deps)).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(deps.repo.createIfRoom).not.toHaveBeenCalled();
  });

  it("CSV grafik terikat: Saring pivot tersimpan berlaku (hanya Cabang 1 dan 2), nilai = Total Omzet", async () => {
    const t = job(BAR, { sourceId: SP, sourceRevision: 2 }, { revision: 2 });
    expect(await runExportJob(EXPORT_ID, t.deps)).toMatchObject({ outcome: "done", rows: 2 });
    const lines = parseCsv(
      readFileSync(t.objects.get(`exports/${OWNER}/${EXPORT_ID}.csv`)!, "utf8").slice(1),
    );
    expect(lines[0]).toEqual(["Cabang", "Total Omzet"]);
    expect(lines.slice(1).map((l) => [l[0], Number(l[1])])).toEqual(
      [...expected].sort(([a], [b]) => a.localeCompare(b)),
    );
  });

  it("CSV tabel terikat: pivot rata (baris + semua nilai + Total)", async () => {
    const t = job(TABLE, { sourceId: SP, sourceRevision: 1 }, { revision: 1 });
    expect(await runExportJob(EXPORT_ID, t.deps)).toMatchObject({ outcome: "done", rows: 3 });
    const lines = parseCsv(
      readFileSync(t.objects.get(`exports/${OWNER}/${EXPORT_ID}.csv`)!, "utf8").slice(1),
    );
    expect(lines[0]).toEqual(["Cabang", "Total Omzet", "Jumlah baris"]);
    expect(lines.map((l) => l[0])).toEqual(["Cabang", "Cabang 1", "Cabang 2", "Total"]);
  });

  it("pivot tersimpan berubah, terikat, atau terlepas setelah diminta → FAILED VERSION_CHANGED tanpa file", async () => {
    for (const [params, revision] of [
      [{ sourceId: SP, sourceRevision: 1 }, 2],
      [{}, 1],
      // Review T-073 L1: diikat ulang ke pivot tersimpan LAIN yang kebetulan berrevisi sama.
      [{ sourceId: "cmv4kljx40009oczvdmpusp99", sourceRevision: 1 }, 1],
    ] as const) {
      const t = job(BAR, params, { revision });
      expect(await runExportJob(EXPORT_ID, t.deps)).toMatchObject({ outcome: "failed" });
      expect(t.status.failed).toEqual({ code: "VERSION_CHANGED", message: SOURCE_CHANGED });
      expect(t.objects.size).toBe(0);
    }
    // Diminta saat masih terikat, kini widget mandiri (tanpa sumber).
    const t = job(
      "cmv4kljx40009oczvdmpukpix0",
      { sourceId: SP, sourceRevision: 1 },
      { revision: 1 },
    );
    await runExportJob(EXPORT_ID, t.deps);
    expect(t.status.failed).toEqual({ code: "VERSION_CHANGED", message: SOURCE_CHANGED });
  });
});
