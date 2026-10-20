import { describe, expect, it, vi } from "vitest";
import { fetchBlock } from "@/components/grid/grid-fetch";
import {
  blockNearView,
  chunkCols,
  colLetter,
  displayCell,
  EMPTY_SETTINGS,
  formatGridDate,
  loadSettings,
  parseRowInput,
  sanitizeSettings,
  saveSettings,
  settingsKey,
  statusText,
} from "@/components/grid/grid-model";

/*
 * T-043 logika murni grid Lihat data: huruf kolom, format sel id-ID (AC 1), pengaturan kolom per
 * (sheet, revisi) yang tahan storage diblokir/rusak (AC 3), status baris, "Ke baris", pembatalan blok,
 * dan penggabungan potongan kolom yang menolak versi lain (AC 4).
 */
describe("colLetter", () => {
  it("mengikuti huruf kolom Excel", () => {
    expect([1, 2, 26, 27, 52, 53, 702, 703].map(colLetter)).toEqual([
      "A",
      "B",
      "Z",
      "AA",
      "AZ",
      "BA",
      "ZZ",
      "AAA",
    ]);
  });
});

describe("displayCell (format id-ID)", () => {
  it("angka, tanggal, Ya/Tidak, NULL, durasi, dan teks terpotong", () => {
    expect(displayCell(1234567.89, "decimal", undefined)).toBe("1.234.567,89");
    expect(displayCell(9812334, "integer", undefined)).toBe("9.812.334");
    expect(displayCell(0.000123, "decimal", undefined)).toBe("0,000123");
    expect(displayCell("2026-03-05", "date", undefined)).toBe("5 Mar 2026");
    expect(displayCell("2026-12-31T08:05:00", "timestamp", undefined)).toBe("31 Des 2026 08.05");
    expect(displayCell(true, "boolean", undefined)).toBe("Ya");
    expect(displayCell(false, "boolean", undefined)).toBe("Tidak");
    expect(displayCell(null, "integer", undefined)).toBeNull();
    expect(displayCell(undefined, "text", undefined)).toBeNull();
    expect(displayCell(3725, "duration", undefined)).toBe("1:02:05");
    expect(displayCell("abc", "text", undefined, true)).toBe("abc…");
    expect(displayCell("=1+1", "text", undefined)).toBe("=1+1");
  });

  it("format tampilan Rupiah/Persen/Angka hanya pada kolom angka", () => {
    expect(displayCell(1234567.5, "decimal", { style: "rupiah", decimals: 0 })).toBe(
      "Rp 1.234.568",
    );
    expect(displayCell(-1500, "integer", { style: "rupiah", decimals: 0 })).toBe("-Rp 1.500");
    expect(displayCell(0.256, "decimal", { style: "percent", decimals: 1 })).toBe("25,6%");
    expect(displayCell(12.5, "decimal", { style: "number", decimals: 2 })).toBe("12,50");
    expect(displayCell("x", "text", { style: "rupiah", decimals: 0 })).toBe("x");
  });

  it("tanggal tidak dikenal dikembalikan apa adanya", () => {
    expect(formatGridDate("bukan tanggal", false)).toBe("bukan tanggal");
  });
});

describe("pengaturan kolom (localStorage)", () => {
  const known = ["c1", "c2", "c3", "c4", "c5"];

  it("membersihkan colId asing/ganda, lebar di luar batas, beku > 3 atau tidak di awal", () => {
    const s = sanitizeSettings(
      {
        columns: [
          { colId: "c2", width: 10, pinned: true },
          { colId: "c1", width: 99999, pinned: true },
          { colId: "zz", width: 100 },
          { colId: "c1", width: 100 },
          { colId: "c3", pinned: true },
          { colId: "c4", pinned: true },
          { colId: "c5", hide: true, pinned: true },
        ],
        formats: { c1: { style: "rupiah", decimals: 0 }, c2: { style: "x" }, zz: {} },
      },
      known,
    );
    expect(s.columns).toEqual([
      { colId: "c2", width: 40, pinned: true },
      { colId: "c1", width: 2000, pinned: true },
      { colId: "c3", pinned: true },
      { colId: "c4" },
      { colId: "c5", hide: true },
    ]);
    expect(s.formats).toEqual({ c1: { style: "rupiah", decimals: 0 } });
  });

  it("semua kolom tersembunyi → semua ditampilkan lagi", () => {
    const s = sanitizeSettings({ columns: known.map((colId) => ({ colId, hide: true })) }, known);
    expect(s.columns.every((c) => !c.hide)).toBe(true);
  });

  it("storage diblokir, rusak, atau penuh tidak memutus grid", () => {
    const throwing = () => {
      throw new DOMException("diblokir", "SecurityError");
    };
    expect(loadSettings(throwing, "k", known)).toEqual(EMPTY_SETTINGS);
    expect(saveSettings(throwing, "k", EMPTY_SETTINGS)).toBe(false);
    const bad = { getItem: () => "{rusak", setItem: () => {} } as unknown as Storage;
    expect(loadSettings(() => bad, "k", known)).toEqual(EMPTY_SETTINGS);
    const full = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("penuh", "QuotaExceededError");
      },
    } as unknown as Storage;
    expect(saveSettings(() => full, "k", EMPTY_SETTINGS)).toBe(false);
    expect(loadSettings(() => null, "k", known)).toEqual(EMPTY_SETTINGS);
  });

  it("kunci per sheet + revisi skema; simpan lalu baca pulih", () => {
    expect(settingsKey("s1", 3)).toBe("dd.grid.v1:s1:3");
    const mem = new Map<string, string>();
    const st = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
    } as unknown as Storage;
    const saved = {
      columns: [
        { colId: "c3", width: 150, pinned: true },
        { colId: "c1", hide: true },
      ],
      formats: { c2: { style: "percent" as const, decimals: 1 } },
    };
    expect(saveSettings(() => st, settingsKey("s1", 3), saved)).toBe(true);
    expect(loadSettings(() => st, settingsKey("s1", 3), known)).toEqual(saved);
    expect(loadSettings(() => st, settingsKey("s1", 4), known)).toEqual(EMPTY_SETTINGS);
  });
});

describe("status, Ke baris, dan blok", () => {
  it("statusText", () => {
    expect(statusText(1, 40, 9_812_334)).toBe("Baris 1–40 dari 9.812.334");
    expect(statusText(9_812_330, 9_812_335, 9_812_334)).toBe(
      "Baris 9.812.330–9.812.334 dari 9.812.334",
    );
    expect(statusText(null, null, null)).toBe("Memuat baris…");
    expect(statusText(1, 1, 0)).toBe("Tidak ada baris data");
  });

  it("parseRowInput menerima titik ribuan dan menjepit ke total", () => {
    expect(parseRowInput("9.000.000", 10_000_000)).toBe(9_000_000);
    expect(parseRowInput(" 42 ", 100)).toBe(42);
    expect(parseRowInput("999", 100)).toBe(100);
    expect(parseRowInput("0", 100)).toBeNull();
    expect(parseRowInput("abc", 100)).toBeNull();
    expect(parseRowInput("-5", 100)).toBeNull();
  });

  it("chunkCols memecah per 64 kolom", () => {
    const cols = Array.from({ length: 130 }, (_, i) => i + 1);
    expect(chunkCols(cols).map((c) => c.length)).toEqual([64, 64, 2]);
    expect(chunkCols([1, 2])).toEqual([[1, 2]]);
  });

  it("blockNearView: blok jauh dari layar dibatalkan, tetangga satu blok dipertahankan", () => {
    expect(blockNearView(1000, 1200, 1100, 1140)).toBe(true);
    expect(blockNearView(800, 1000, 1100, 1140)).toBe(true);
    expect(blockNearView(400, 600, 1100, 1140)).toBe(false);
    expect(blockNearView(5_000_000, 5_000_200, 9_000_000, 9_000_030)).toBe(false);
  });
});

describe("fetchBlock", () => {
  const base = {
    sheetId: "s1",
    versionId: "v1",
    schemaRevision: 2,
    rowStart: 0,
    rowCount: 2,
  };
  const ok = (cols: number[], extra: Record<string, unknown> = {}) => ({
    ok: true,
    versionId: "v1",
    schemaRevision: 2,
    total: 2,
    filteredTotal: 2,
    rows: [1, 2].map((n) => ({
      n,
      _row: n + 1,
      cells: cols.map((p) => `${p}:${n}`),
      cut: n === 1 ? [0] : [],
    })),
    ...extra,
  });
  const fetcher = (fn: (body: { cols: number[] }) => { status: number; json: unknown }) =>
    vi.fn(async (_url: string, init?: RequestInit) => {
      const r = fn(JSON.parse(String(init!.body)));
      return new Response(JSON.stringify(r.json), { status: r.status });
    }) as unknown as typeof fetch;

  it("menggabungkan potongan > 64 kolom per baris", async () => {
    const cols = Array.from({ length: 70 }, (_, i) => i + 1);
    const f = fetcher((b) => ({ status: 200, json: ok(b.cols) }));
    const r = await fetchBlock({ ...base, cols }, f);
    expect(f).toHaveBeenCalledTimes(2);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.total).toBe(2);
    expect(r.rows[0]).toMatchObject({
      n: 1,
      _row: 2,
      c1: "1:1",
      c64: "64:1",
      c65: "65:1",
      c70: "70:1",
    });
    expect(r.rows[0]!.cut).toEqual(["c1", "c65"]);
    expect(r.rows[1]!.cut).toBeUndefined();
  });

  it("409 VERSION_CHANGED atau versi/revisi lain di respons → kind version (tidak diisi)", async () => {
    const changed = fetcher(() => ({
      status: 409,
      json: { ok: false, code: "VERSION_CHANGED", message: "x", activeVersionId: "v2" },
    }));
    expect(await fetchBlock({ ...base, cols: [1] }, changed)).toEqual({
      ok: false,
      kind: "version",
      activeVersionId: "v2",
    });
    const otherRev = fetcher((b) => ({ status: 200, json: ok(b.cols, { schemaRevision: 3 }) }));
    expect((await fetchBlock({ ...base, cols: [1] }, otherRev)).ok).toBe(false);
    // Satu potongan dari versi lain → seluruh blok ditolak.
    let i = 0;
    const mixed = fetcher((b) => ({
      status: 200,
      json: ok(b.cols, i++ === 1 ? { versionId: "v2" } : {}),
    }));
    const cols = Array.from({ length: 70 }, (_, k) => k + 1);
    expect(await fetchBlock({ ...base, cols }, mixed)).toMatchObject({
      ok: false,
      kind: "version",
    });
  });

  it("galat server → pesan server; batal → aborted; jaringan putus → pesan umum", async () => {
    const busy = fetcher(() => ({
      status: 429,
      json: { ok: false, code: "RATE_LIMITED", message: "Terlalu banyak permintaan data." },
    }));
    expect(await fetchBlock({ ...base, cols: [1] }, busy)).toEqual({
      ok: false,
      kind: "error",
      message: "Terlalu banyak permintaan data.",
      status: 429,
    });
    const ctrl = new AbortController();
    ctrl.abort();
    const abortable = vi.fn(async () => {
      throw new DOMException("dibatalkan", "AbortError");
    }) as unknown as typeof fetch;
    expect(await fetchBlock({ ...base, cols: [1], signal: ctrl.signal }, abortable)).toEqual({
      ok: false,
      kind: "aborted",
    });
    const down = vi.fn(async () => {
      throw new TypeError("network");
    }) as unknown as typeof fetch;
    expect(await fetchBlock({ ...base, cols: [1] }, down)).toMatchObject({
      ok: false,
      kind: "error",
      status: 0,
    });
  });

  it("potongan kolom berurutan: satu blok tidak pernah memakai > 1 slot server (review H1)", async () => {
    let active = 0;
    let peak = 0;
    const f = vi.fn(async (_url: string, init?: RequestInit) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      const b = JSON.parse(String(init!.body)) as { cols: number[] };
      return new Response(JSON.stringify(ok(b.cols)), { status: 200 });
    }) as unknown as typeof fetch;
    const cols = Array.from({ length: 200 }, (_, i) => i + 1);
    const r = await fetchBlock({ ...base, cols }, f);
    expect(f).toHaveBeenCalledTimes(4);
    expect(peak).toBe(1);
    expect(r.ok && r.rows[0]!.c200).toBe("200:1");
  });

  it("429 QUERY_BUSY dicoba ulang dengan jeda; tetap sibuk → kind busy (bukan galat)", async () => {
    let calls = 0;
    const flaky = fetcher((b) =>
      calls++ < 2
        ? { status: 429, json: { ok: false, code: "QUERY_BUSY", message: "sibuk" } }
        : { status: 200, json: ok(b.cols) },
    );
    expect((await fetchBlock({ ...base, cols: [1] }, flaky, [1, 1, 1])).ok).toBe(true);
    expect(calls).toBe(3);
    const busy = fetcher(() => ({
      status: 429,
      json: { ok: false, code: "QUERY_BUSY", message: "sibuk" },
    }));
    expect(await fetchBlock({ ...base, cols: [1] }, busy, [1, 1])).toEqual({
      ok: false,
      kind: "busy",
    });
    expect(busy).toHaveBeenCalledTimes(3);
  });

  it("meneruskan AbortSignal ke fetch", async () => {
    const ctrl = new AbortController();
    const f = fetcher((b) => ({ status: 200, json: ok(b.cols) }));
    await fetchBlock({ ...base, cols: [1], signal: ctrl.signal }, f);
    expect((f as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1].signal).toBe(ctrl.signal);
  });
});
