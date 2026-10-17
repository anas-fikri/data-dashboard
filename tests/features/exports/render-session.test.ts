import { describe, expect, it, vi } from "vitest";
import {
  BUSY_WAIT_MS,
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
  // Jam palsu: sleep memajukan waktu (jeda ulang QUERY_BUSY tanpa menunggu sungguhan).
  const time = { ms: 0 };
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
    sleep: vi.fn(async (ms: number) => {
      time.ms += ms;
    }),
    clock: () => time.ms,
    ...over,
  };
  return { deps, calls, time };
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

  it("QUERY_BUSY dicoba ulang; galat lain dan lemparan menjadi jawaban galat widget itu saja", async () => {
    const busy: WidgetQueryJson = { ok: false, code: "QUERY_BUSY", message: "sibuk" };
    let n = 0;
    const { deps, time } = setup({
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
    // Tetap sibuk sampai batas tunggu bersama → jawaban QUERY_BUSY apa adanya, tidak lewat batas.
    expect(r!.widgets[2]!.result).toEqual(busy);
    expect(time.ms).toBeLessThanOrEqual(BUSY_WAIT_MS);
  });

  /*
   * T-rb6x: cache parquet tiruan dengan jam palsu (vi fake timers). Tiap percobaan menunggu unduhan
   * sheet-nya paling lama waitMs (seperti acquire + prepareWaitMs); unduhan kedua pemilik yang sama saat
   * unduhan lain belum selesai ditolak langsung (perOwnerDownloads = 1) → QUERY_BUSY.
   */
  function fakeCache(downloadMs: Record<string, number>, sheetOf: (id: string) => string) {
    const started = new Map<string, number>();
    const readyAt = (sheet: string) => (started.get(sheet) ?? Infinity) + downloadMs[sheet]!;
    const busy: WidgetQueryJson = { ok: false, code: "QUERY_BUSY", message: "disiapkan" };
    return vi.fn(async (_u: string, body: unknown, _now: Date, waitMs: number) => {
      const id = (body as { widgetId: string }).widgetId;
      const sheet = sheetOf(id);
      if (!started.has(sheet)) {
        if ([...started.keys()].some((k) => Date.now() < readyAt(k))) return busy;
        started.set(sheet, Date.now());
      }
      const left = readyAt(sheet) - Date.now();
      if (left > 0) await new Promise((r) => setTimeout(r, Math.min(waitMs, left)));
      return Date.now() >= readyAt(sheet) ? ok(id) : busy;
    });
  }

  async function renderWithClock(widgets: { id: string }[], query: RenderSessionDeps["query"]) {
    const { deps } = setup({
      dashboard: vi.fn(async () =>
        dashboard({
          widgets: widgets.map((w, i) => ({ ...w, type: "kpi", title: `K${i}`, spec: {} })),
        }),
      ),
      query,
      sleep: undefined,
      clock: undefined,
    });
    const start = Date.now();
    let doneAt = 0;
    const p = loadRenderSession(SID, deps).then((r) => {
      doneAt = Date.now();
      return r;
    });
    await vi.advanceTimersByTimeAsync(120_000);
    return { r: await p, elapsed: doneAt - start };
  }

  // AC 1: unduhan sheet 1 lima detik (> 1,2 dtk ulangan lama), sheet 2 tiga detik setelahnya.
  it("cache dingin dua sheet: semua widget tercetak berisi data", async () => {
    vi.useFakeTimers();
    try {
      const ids = [W(1), W(2), W(3), W(4)];
      const query = fakeCache({ s1: 5_000, s2: 3_000 }, (id) =>
        id === W(2) || id === W(4) ? "s2" : "s1",
      );
      const { r, elapsed } = await renderWithClock(
        ids.map((id) => ({ id })),
        query,
      );
      expect(r!.widgets.map((w) => w.result.ok)).toEqual([true, true, true, true]);
      expect(elapsed).toBeLessThan(BUSY_WAIT_MS);
    } finally {
      vi.useRealTimers();
    }
  });

  // AC 2: unduhan tak kunjung selesai — tiap widget kartu QUERY_BUSY, data selesai ≤ batas tunggu
  // (percobaan ikut dibatasi sisa waktu, bukan hanya jeda), jauh di bawah batas siap renderer 30 s.
  it("unduhan tidak selesai: kartu QUERY_BUSY dan pemuatan data ≤ batas tunggu", async () => {
    vi.useFakeTimers();
    try {
      const ids = Array.from({ length: 10 }, (_, i) => W(i));
      const query = fakeCache({ s1: Infinity, s2: Infinity }, (id) =>
        Number(id.at(-1)) % 2 ? "s2" : "s1",
      );
      const { r, elapsed } = await renderWithClock(
        ids.map((id) => ({ id })),
        query,
      );
      expect(r!.widgets.map((w) => (w.result.ok ? "ok" : w.result.code))).toEqual(
        ids.map(() => "QUERY_BUSY"),
      );
      // + toleransi timer 0 ms setelah batas (dihitung 1 ms oleh timer palsu); tanpa batas per
      // percobaan angka ini ± 10 dtk lebih per widget yang tersisa.
      expect(elapsed).toBeLessThanOrEqual(BUSY_WAIT_MS + 100);
      expect(query.mock.calls.length).toBeLessThanOrEqual(ids.length * 12);
    } finally {
      vi.useRealTimers();
    }
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
