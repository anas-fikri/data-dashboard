import { describe, expect, it, vi } from "vitest";
import {
  loadRenderSession,
  RENDER_QUERY_PARALLEL,
  type RenderDashboard,
  type RenderSessionDeps,
  type WidgetQueryJson,
} from "@/features/exports/render-session";
import type { RenderClaims } from "@/features/exports/render-token";

/*
 * T-018 D3/D4: data halaman /render — sesi sekali pakai, user/ekspor masih berlaku, akses dashboard
 * dicek ulang (peran sekarang), filter token disaring lagi terhadap dashboard sekarang, semua widget
 * di-query di server dengan body yang sama dengan kartu di layar, jam preset = waktu ekspor diminta.
 */

const DASH = "cmv4kljx40009oczvdmpurrd0";
const USER = "cmv4kljx40009oczvdmpuvwr0";
const W = (n: number) => `cmv4kljx40009oczvdmpuwid${n}`;
const SID = "s".repeat(43);

const dashboard = (over: Partial<RenderDashboard> = {}): RenderDashboard => ({
  id: DASH,
  name: "Penjualan",
  dataset: { name: "Data penjualan" },
  layout: [
    { i: W(1), x: 0, y: 0, w: 4, h: 2 },
    { i: W(2), x: 4, y: 0, w: 8, h: 4 },
    { i: W(3), x: 0, y: 4, w: 12, h: 6 },
  ],
  filterColumns: [
    { key: "s\u0000cabang", sheet: "S", column: "Cabang", type: "text", available: true },
    { key: "s\u0000tanggal", sheet: "S", column: "Tanggal", type: "date", available: true },
    { key: "s\u0000rahasia", sheet: "S", column: "Rahasia", type: "text", available: false },
  ],
  crossFilterColumns: ["Kota"],
  widgets: [
    { id: W(1), type: "kpi", title: "Total", spec: {} },
    {
      id: W(2),
      type: "bar",
      title: "Per kota",
      spec: {
        sheetId: "cmv4kljx40009oczvdmpurrxa",
        dimension: { column: 1 },
        measure: { agg: "sum", column: 2 },
        sort: "value_desc",
        topN: 10,
        format: { style: "number", decimals: 0 },
      },
    },
    { id: W(3), type: "table", title: "Rincian", spec: {} },
  ],
  ...over,
});

const F = JSON.stringify({
  filters: [
    { column: "cabang", op: "in", values: ["Cabang 1"] },
    { column: "Rahasia", op: "in", values: ["x"] },
    { column: "Tanggal", op: "preset", preset: "this_month" },
  ],
  cross: { widgetId: W(2), filter: { column: "Kota", op: "in", values: ["Bandung"] } },
});

const CLAIMS: RenderClaims = {
  exportId: "cmv4kljx40009oczvdmpuexp0",
  userId: USER,
  dashboardId: DASH,
  f: F,
  requestedAt: "2026-03-15T05:00:00.000Z",
};

const ok = (widgetId: string): WidgetQueryJson => ({
  ok: true,
  columns: [{ key: "m0", label: "Omzet", type: "decimal" }],
  rows: [[widgetId.length]],
  widgetVersion: "2026-10-15T00:00:00.000Z",
});

function setup(over: Partial<RenderSessionDeps> = {}, claims: RenderClaims | null = CLAIMS) {
  let consumed = false;
  const calls: { userId: string; body: unknown; now: Date }[] = [];
  const deps: RenderSessionDeps = {
    consumeClaims: vi.fn(async (sid: string) => {
      if (sid !== SID || consumed) return null;
      consumed = true;
      return claims;
    }),
    subjectLive: vi.fn(async () => true),
    dashboard: vi.fn(async (userId: string, id: string) =>
      userId === USER && id === DASH ? dashboard() : null,
    ),
    query: vi.fn(async (userId: string, body: unknown, now: Date) => {
      calls.push({ userId, body, now });
      return ok((body as { widgetId: string }).widgetId);
    }),
    sleep: vi.fn(async () => {}),
    ...over,
  };
  return { deps, calls };
}

describe("loadRenderSession", () => {
  it("data lengkap: urutan widget, layout, ringkasan filter, waktu ekspor; sesi sekali pakai", async () => {
    const { deps, calls } = setup();
    const r = await loadRenderSession(SID, deps);
    expect(r).not.toBeNull();
    expect(r!.dashboard).toEqual({
      id: DASH,
      name: "Penjualan",
      datasetName: "Data penjualan",
      layout: dashboard().layout,
      filterSummary: "Cabang: Cabang 1; Tanggal: Bulan ini; Disaring dari Per kota: Bandung",
      exportedAt: "2026-03-15T05:00:00.000Z",
    });
    expect(r!.widgets.map((w) => [w.id, w.type, w.title])).toEqual([
      [W(1), "kpi", "Total"],
      [W(2), "bar", "Per kota"],
      [W(3), "table", "Rincian"],
    ]);
    expect(r!.widgets[0]!.result).toEqual(ok(W(1)));
    // Jam preset = requestedAt; user dari token.
    for (const c of calls) {
      expect(c.userId).toBe(USER);
      expect(c.now.toISOString()).toBe("2026-03-15T05:00:00.000Z");
    }
    // Halaman tidak bisa dimuat ulang dengan sesi yang sama.
    expect(await loadRenderSession(SID, deps)).toBeNull();
  });

  it("filter disaring ulang: kolom tak tersedia dibuang, nama kolom dari dashboard, silang tidak ke sumbernya", async () => {
    const { deps, calls } = setup();
    await loadRenderSession(SID, deps);
    const byId = new Map(calls.map((c) => [(c.body as { widgetId: string }).widgetId, c.body]));
    const base = [
      { column: "Cabang", op: "in", values: ["Cabang 1"] },
      { column: "Tanggal", op: "preset", preset: "this_month" },
    ];
    const cross = { column: "Kota", op: "in", values: ["Bandung"] };
    expect(byId.get(W(1))).toEqual({ widgetId: W(1), dashboardFilters: [...base, cross] });
    // Sumber filter silang tidak menyaring dirinya sendiri.
    expect(byId.get(W(2))).toEqual({ widgetId: W(2), dashboardFilters: base });
    // Tabel: halaman 0, urutan bawaan (sama dengan kartu di layar tanpa urutan).
    expect(byId.get(W(3))).toEqual({ widgetId: W(3), page: 0, dashboardFilters: [...base, cross] });
  });

  it("tanpa filter → tanpa dashboardFilters, ringkasan 'Tanpa filter'", async () => {
    const { f: _f, ...noFilter } = CLAIMS;
    const { deps, calls } = setup({}, noFilter);
    const r = await loadRenderSession(SID, deps);
    expect(r!.dashboard.filterSummary).toBe("Tanpa filter");
    expect(calls.map((c) => c.body)).toEqual([
      { widgetId: W(1) },
      { widgetId: W(2) },
      { widgetId: W(3), page: 0 },
    ]);
  });

  it("kolom filter yang kini dicabut dari dashboard tidak berlaku lagi saat render", async () => {
    const { deps, calls } = setup({
      dashboard: vi.fn(async () => dashboard({ filterColumns: [], crossFilterColumns: [] })),
    });
    const r = await loadRenderSession(SID, deps);
    expect(r!.dashboard.filterSummary).toBe("Tanpa filter");
    expect(calls.every((c) => !("dashboardFilters" in (c.body as object)))).toBe(true);
  });

  it("akses dicek ulang: user nonaktif/ekspor tidak berlaku, tanpa akses dashboard → null tanpa query", async () => {
    for (const over of [
      { subjectLive: vi.fn(async () => false) },
      { dashboard: vi.fn(async () => null) },
      { dashboard: vi.fn(async () => dashboard({ id: "cmv4kljx40009oczvdmpuother" })) },
    ]) {
      const { deps, calls } = setup(over);
      expect(await loadRenderSession(SID, deps)).toBeNull();
      expect(calls).toEqual([]);
    }
  });

  it("sesi tidak ada/bukan string, atau filter token rusak → null", async () => {
    const { deps } = setup();
    for (const bad of [undefined, null, 1, "", "x".repeat(43)]) {
      expect(await loadRenderSession(bad, deps)).toBeNull();
    }
    const broken = setup({}, { ...CLAIMS, f: "{rusak" });
    expect(await loadRenderSession(SID, broken.deps)).toBeNull();
    expect(broken.calls).toEqual([]);
  });

  it("QUERY_BUSY dicoba ulang 2×; galat lain dan lemparan menjadi jawaban galat widget itu saja", async () => {
    const busy: WidgetQueryJson = { ok: false, code: "QUERY_BUSY", message: "sibuk" };
    let n = 0;
    const { deps } = setup({
      query: vi.fn(async (_u: string, body: unknown) => {
        const id = (body as { widgetId: string }).widgetId;
        if (id === W(1)) return n++ < 2 ? busy : ok(id);
        if (id === W(2)) throw new Error("duckdb meledak");
        return busy;
      }),
    });
    const r = await loadRenderSession(SID, deps);
    expect(r!.widgets[0]!.result).toEqual(ok(W(1)));
    expect(r!.widgets[1]!.result).toEqual({
      ok: false,
      code: "QUERY_FAILED",
      message: "Query gagal diproses. Coba lagi beberapa saat lagi.",
    });
    // Tetap sibuk setelah 2 ulangan → jawaban QUERY_BUSY apa adanya.
    expect(r!.widgets[2]!.result).toEqual(busy);
    expect(deps.query).toHaveBeenCalledTimes(3 + 1 + 3);
  });

  it(`paling banyak ${RENDER_QUERY_PARALLEL} query bersamaan`, async () => {
    let active = 0;
    let peak = 0;
    const many = Array.from({ length: 7 }, (_, i) => ({
      id: W(i),
      type: "kpi",
      title: `K${i}`,
      spec: {},
    }));
    const { deps } = setup({
      dashboard: vi.fn(async () => dashboard({ widgets: many })),
      query: vi.fn(async (_u: string, body: unknown) => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
        return ok((body as { widgetId: string }).widgetId);
      }),
    });
    const r = await loadRenderSession(SID, deps);
    expect(r!.widgets.map((w) => w.id)).toEqual(many.map((w) => w.id));
    expect(peak).toBe(RENDER_QUERY_PARALLEL);
  });
});
