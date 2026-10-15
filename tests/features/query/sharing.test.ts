import { describe, expect, it, vi } from "vitest";
import { runFilterValues } from "@/features/query/filter-values";
import {
  COLUMN_UNAVAILABLE_VIEWER,
  runDashboardQuery,
  runQuery,
  runWidgetQuery,
} from "@/features/query/service";
import { missingMessage } from "@/features/widgets/remap";
import {
  DASH,
  DS,
  EDITOR,
  FILTER_COLUMNS,
  FOREIGN_SHEET,
  OWNER,
  SHEET,
  SPEC,
  STRANGER,
  VER,
  VIEWER,
  WID,
  WIDGETS,
  WIDGET_UPDATED_AT,
  makeDeps,
} from "./sharing-fixtures";

/*
 * T-016: otorisasi query per peran dashboard — widget (pemilik/editor/viewer), nilai slicer (ketiganya),
 * { dashboardId, spec } (pemilik/editor), query bebas (pemilik saja); otorisasi sebelum cache/DuckDB,
 * pesan umum COLUMN_UNAVAILABLE untuk viewer, cached/ms hanya untuk pemilik.
 */

const NOT_ALLOWED =
  "Filter tidak diizinkan untuk dashboard ini. Muat ulang halaman bila pengaturan dashboard baru diubah.";
const NOT_FILTER =
  "Kolom ini bukan kolom filter dashboard. Muat ulang halaman bila pengaturan dashboard baru diubah.";
/** Versi pengaturan semua widget fixture (widgetVersion di setiap jawaban setelah otorisasi). */
const V = WIDGET_UPDATED_AT.toISOString();

describe("T-016 widget { widgetId, … }: matriks peran", () => {
  it("pemilik, editor, viewer dashboard → hasil; orang lain → NOT_FOUND tanpa cache/DuckDB", async () => {
    const { deps, exec, cache } = makeDeps();
    for (const user of [OWNER, EDITOR, VIEWER]) {
      expect(await runWidgetQuery(user, { widgetId: WID("kpi") }, deps)).toMatchObject({
        ok: true,
        rows: [[42]],
      });
    }
    const get = vi.spyOn(cache, "get");
    exec.mockClear();
    expect(await runWidgetQuery(STRANGER, { widgetId: WID("kpi") }, deps)).toEqual({
      ok: false,
      code: "NOT_FOUND",
      message: "Widget tidak ditemukan.",
    });
    expect(get).not.toHaveBeenCalled();
    expect(exec).not.toHaveBeenCalled();
  });

  it("review DI-1: jawaban sukses membawa widgetVersion (Widget.updatedAt ISO) untuk semua peran, juga dari cache", async () => {
    const { deps, repo } = makeDeps();
    const version = WIDGET_UPDATED_AT.toISOString();
    for (const user of [VIEWER, EDITOR, OWNER]) {
      expect(await runWidgetQuery(user, { widgetId: WID("kpi") }, deps)).toMatchObject({
        ok: true,
        widgetVersion: version,
      });
    }
    // Versi dibaca bersama widget per permintaan, bukan bagian nilai cache hasil: spec yang baru
    // diubah editor (updatedAt baru) langsung terlihat walau hasilnya dilayani cache.
    const later = new Date("2026-10-15T09:00:00.001Z");
    repo.widget.mockImplementationOnce(async () => ({
      ...WIDGETS.kpi!,
      updatedAt: later,
      datasetId: DS,
      activeVersionId: VER,
      dashboardId: DASH,
      filterColumns: [],
      role: "VIEWER" as const,
    }));
    expect(await runWidgetQuery(VIEWER, { widgetId: WID("kpi") }, deps)).toMatchObject({
      ok: true,
      widgetVersion: later.toISOString(),
    });
  });

  it("review R2 CL-2: jawaban GAGAL setelah otorisasi juga membawa widgetVersion; 404/body rusak tanpa versi", async () => {
    const { deps, repo, exec } = makeDeps();
    // Tabel yang kolom Omzet-nya baru dihapus editor (spec [1]); klien lama mengurutkan kolom 2.
    const later = new Date("2026-10-15T10:00:00.002Z");
    repo.widget.mockImplementationOnce(async () => ({
      type: "table",
      spec: { sheetId: SHEET, columns: [1], format: { style: "number", decimals: 0 } },
      updatedAt: later,
      datasetId: DS,
      activeVersionId: VER,
      dashboardId: DASH,
      filterColumns: [],
      role: "VIEWER" as const,
    }));
    expect(
      await runWidgetQuery(VIEWER, { widgetId: WID("kpi"), sort: { column: 2, dir: "asc" } }, deps),
    ).toEqual({
      ok: false,
      code: "INVALID",
      message: "Urutan hanya untuk kolom di tabel ini.",
      widgetVersion: later.toISOString(),
    });
    // Filter yang tidak diizinkan (kolom filter baru dihapus pemilik): petunjuk muat ulang + versi.
    expect(
      await runWidgetQuery(
        VIEWER,
        { widgetId: WID("kpi"), dashboardFilters: [{ column: "Omzet", op: "in", values: ["1"] }] },
        deps,
      ),
    ).toEqual({ ok: false, code: "INVALID", message: NOT_ALLOWED, widgetVersion: V });
    // COLUMN_UNAVAILABLE (pesan umum viewer) dan error mesin query juga membawa versi.
    expect(await runWidgetQuery(VIEWER, { widgetId: WID("hidden") }, deps)).toEqual({
      ok: false,
      code: "COLUMN_UNAVAILABLE",
      message: COLUMN_UNAVAILABLE_VIEWER,
      widgetVersion: V,
    });
    exec.mockRejectedValueOnce(new Error("Out of Memory Error: x"));
    const failed = await runWidgetQuery(EDITOR, { widgetId: WID("kpi") }, deps);
    expect(failed).toMatchObject({ ok: false, code: "QUERY_TOO_HEAVY", widgetVersion: V });
    // Sebelum otorisasi: tanpa versi (tidak membocorkan apa pun tentang widget yang tidak boleh dilihat).
    const denied = await runWidgetQuery(STRANGER, { widgetId: WID("kpi") }, deps);
    expect(denied).toEqual({ ok: false, code: "NOT_FOUND", message: "Widget tidak ditemukan." });
    const invalid = await runWidgetQuery(VIEWER, { widgetId: WID("kpi"), page: -1 }, deps);
    expect(invalid).toMatchObject({ ok: false, code: "INVALID" });
    expect(invalid).not.toHaveProperty("widgetVersion");
  });

  it("cached/ms hanya untuk pemilik — juga saat dilayani cache bersama", async () => {
    const { deps, exec } = makeDeps();
    // Viewer lebih dulu (cache kosong → DuckDB): tanpa cached/ms.
    const first = await runWidgetQuery(VIEWER, { widgetId: WID("kpi") }, deps);
    expect(first).toMatchObject({ ok: true, rows: [[42]] });
    expect(first).not.toHaveProperty("cached");
    expect(first).not.toHaveProperty("ms");
    // Editor dari cache: tetap tanpa penanda (tidak bisa menebak query user lain).
    const editor = await runWidgetQuery(EDITOR, { widgetId: WID("kpi") }, deps);
    expect(editor).toMatchObject({ ok: true, rows: [[42]] });
    expect(editor).not.toHaveProperty("cached");
    expect(editor).not.toHaveProperty("ms");
    // Pemilik tetap mendapat penanda cache + waktu.
    const owner = await runWidgetQuery(OWNER, { widgetId: WID("kpi") }, deps);
    expect(owner).toMatchObject({ ok: true, cached: true, ms: expect.any(Number) });
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it("D6: filter kolom yang tidak diizinkan → INVALID untuk viewer (juga editor/pemilik), tanpa DuckDB", async () => {
    const { deps, exec } = makeDeps();
    const body = {
      widgetId: WID("kpi"),
      dashboardFilters: [{ column: "Omzet", op: "in", values: ["1"] }],
    };
    for (const user of [VIEWER, EDITOR, OWNER]) {
      expect(await runWidgetQuery(user, body, deps)).toEqual({
        ok: false,
        code: "INVALID",
        message: NOT_ALLOWED,
        widgetVersion: V,
      });
    }
    expect(exec).not.toHaveBeenCalled();
    // Kolom filter dashboard yang sah tetap jalan untuk viewer.
    const ok = await runWidgetQuery(
      VIEWER,
      { widgetId: WID("kpi"), dashboardFilters: [{ column: "Cabang", op: "in", values: ["A"] }] },
      deps,
    );
    expect(ok).toMatchObject({ ok: true });
  });

  it("repo tanpa peran → diperlakukan viewer (pesan umum, tanpa cached/ms)", async () => {
    // `role` wajib menurut tipe QueryRepo; uji ini menjaga deny-by-default forRole saat runtime (repo JS
    // atau cast yang lupa mengisinya tidak boleh mendapat detail kolom pemilik).
    const { deps, repo } = makeDeps();
    repo.widget.mockImplementation(async (_u: string, widgetId: string) => {
      const name = Object.keys(WIDGETS).find((n) => WID(n) === widgetId)!;
      return {
        ...WIDGETS[name]!,
        updatedAt: WIDGET_UPDATED_AT,
        datasetId: DS,
        activeVersionId: VER,
      } as never;
    });
    expect(await runWidgetQuery(OWNER, { widgetId: WID("hidden") }, deps)).toEqual({
      ok: false,
      code: "COLUMN_UNAVAILABLE",
      message: COLUMN_UNAVAILABLE_VIEWER,
      widgetVersion: V,
    });
    const r = await runWidgetQuery(OWNER, { widgetId: WID("kpi") }, deps);
    expect(r).toMatchObject({ ok: true });
    expect(r).not.toHaveProperty("cached");
  });
});

describe("T-016 pesan COLUMN_UNAVAILABLE per peran (catatan T-011)", () => {
  // Detail untuk pemilik/editor: nama kolom tersembunyi/lama disebut.
  const detail: Record<string, (m: string) => void> = {
    hidden: (m) => expect(m).toContain('"Rahasia" disembunyikan'),
    gone: (m) => expect(m).toContain("sudah tidak ada di data"),
    marked: (m) => expect(m).toBe(missingMessage(["Diskon"])),
    retired: (m) => expect(m).toBe(missingMessage(["Omzet Lama"])),
    remapped: (m) => expect(m).toBe(missingMessage(["Omzet Lama"])),
  };

  it.each(Object.keys(detail))(
    "%s: viewer → pesan umum tanpa nama; pemilik/editor → detail; tanpa DuckDB",
    async (name) => {
      const { deps, exec } = makeDeps();
      const viewer = await runWidgetQuery(VIEWER, { widgetId: WID(name) }, deps);
      expect(viewer).toEqual({
        ok: false,
        code: "COLUMN_UNAVAILABLE",
        message: COLUMN_UNAVAILABLE_VIEWER,
        widgetVersion: V,
      });
      for (const n of ["Rahasia", "Diskon", "Omzet Lama"]) {
        expect(JSON.stringify(viewer)).not.toContain(n);
      }
      for (const user of [OWNER, EDITOR]) {
        const r = await runWidgetQuery(user, { widgetId: WID(name) }, deps);
        expect(r).toMatchObject({ ok: false, code: "COLUMN_UNAVAILABLE" });
        if (r.ok) throw new Error("harus gagal");
        expect(r.message).not.toBe(COLUMN_UNAVAILABLE_VIEWER);
        detail[name]!(r.message);
      }
      expect(exec).not.toHaveBeenCalled();
    },
  );
});

describe("T-016 nilai slicer: pemilik/editor/viewer; lainnya NOT_FOUND sebelum cache/DuckDB", () => {
  it("ketiga peran mendapat daftar nilai; orang asing NOT_FOUND tanpa cache/DuckDB", async () => {
    const { deps, exec, cache } = makeDeps();
    for (const user of [OWNER, EDITOR, VIEWER]) {
      expect(await runFilterValues(user, DASH, { column: "Cabang" }, deps)).toMatchObject({
        ok: true,
        type: "text",
      });
    }
    const get = vi.spyOn(cache, "get");
    exec.mockClear();
    expect(await runFilterValues(STRANGER, DASH, { column: "Cabang" }, deps)).toEqual({
      ok: false,
      code: "NOT_FOUND",
      message: "Dashboard tidak ditemukan.",
    });
    expect(get).not.toHaveBeenCalled();
    expect(exec).not.toHaveBeenCalled();
  });

  it("viewer: kolom di luar kolom filter dashboard → INVALID (D6 slicer)", async () => {
    const { deps } = makeDeps();
    expect(await runFilterValues(VIEWER, DASH, { column: "Rahasia" }, deps)).toMatchObject({
      ok: false,
      code: "INVALID",
    });
  });
});

describe("review T-016 R3 SEC-1: kolom filter tersimpan yang kini tersembunyi/hilang", () => {
  // Pemilik menjadikan "Rahasia" kolom filter lalu menyembunyikannya; "Gaji" ada di sheet yang sudah
  // tidak ada. Non-pemilik tidak menerima nama itu (getDashboard), jadi jawabannya harus sama persis
  // dengan nama yang tidak pernah jadi kolom filter ("Wilayah") — kode, pesan, dan status HTTP (dari kode).
  const STORED = [
    ...FILTER_COLUMNS,
    { sheet: "Data", column: "Rahasia" },
    { sheet: "Hilang", column: "Gaji" },
  ];
  function staleDeps() {
    const made = makeDeps();
    made.deps.repo.filterSources = async () => [
      { name: "Cabang", type: "text" },
      { name: "Rahasia", type: null },
      { name: "Gaji", type: null },
    ];
    const base = made.repo.filterSource.getMockImplementation()!;
    made.repo.filterSource.mockImplementation(async (u: string, d: string) => {
      const src = await base(u, d);
      return src && { ...src, filterColumns: STORED };
    });
    return made;
  }
  const filterBody = (column: string) => ({
    widgetId: WID("kpi"),
    dashboardFilters: [{ column, op: "in", values: ["x"] }],
  });

  it("widget: viewer/editor → NOT_ALLOWED persis seperti nama asing, tanpa DuckDB; pemilik → skippedFilters", async () => {
    const { deps, exec } = staleDeps();
    for (const user of [VIEWER, EDITOR]) {
      const never = await runWidgetQuery(user, filterBody("Wilayah"), deps);
      expect(never).toEqual({ ok: false, code: "INVALID", message: NOT_ALLOWED, widgetVersion: V });
      for (const stale of ["Rahasia", "rahasia", "Gaji"]) {
        expect(await runWidgetQuery(user, filterBody(stale), deps)).toEqual(never);
      }
    }
    expect(exec).not.toHaveBeenCalled();
    // Pemilik melihat kolom itu di pengaturan: filternya tetap dilewati (bukan ditolak).
    expect(await runWidgetQuery(OWNER, filterBody("Rahasia"), deps)).toMatchObject({
      ok: true,
      skippedFilters: ["Rahasia"],
    });
    expect(await runWidgetQuery(OWNER, filterBody("Wilayah"), deps)).toMatchObject({
      code: "INVALID",
      message: NOT_ALLOWED,
    });
    // Kolom filter yang tersedia tetap jalan untuk viewer.
    expect(await runWidgetQuery(VIEWER, filterBody("Cabang"), deps)).toMatchObject({ ok: true });
  });

  it("slicer: viewer/editor → INVALID persis seperti nama asing; pemilik → COLUMN_UNAVAILABLE/NOT_READY", async () => {
    const { deps, repo, exec } = staleDeps();
    for (const user of [VIEWER, EDITOR]) {
      const never = await runFilterValues(user, DASH, { column: "Wilayah" }, deps);
      // Petunjuk muat ulang (review T-016 R4 CC-1): kolom yang baru dikeluarkan/disembunyikan saat
      // halaman terbuka tidak berujung "Coba lagi" yang tidak pernah berhasil.
      expect(never).toEqual({ ok: false, code: "INVALID", message: NOT_FILTER });
      for (const body of [
        { column: "Rahasia" },
        { column: "Rahasia", sheet: "Data" },
        { column: "Gaji" },
      ]) {
        expect(await runFilterValues(user, DASH, body, deps)).toEqual(never);
      }
    }
    // Pesan yang sama untuk pemilik (nama yang bukan kolom filter dashboard ini).
    expect(await runFilterValues(OWNER, DASH, { column: "Wilayah" }, deps)).toEqual({
      ok: false,
      code: "INVALID",
      message: NOT_FILTER,
    });
    expect(await runFilterValues(OWNER, DASH, { column: "Rahasia" }, deps)).toMatchObject({
      code: "COLUMN_UNAVAILABLE",
    });
    expect(await runFilterValues(OWNER, DASH, { column: "Gaji" }, deps)).toMatchObject({
      code: "COLUMN_UNAVAILABLE",
    });
    // Dataset tanpa versi aktif: non-pemilik tidak bisa membedakan nama tersimpan dari nama asing.
    const base = repo.filterSource.getMockImplementation()!;
    deps.repo.filterSource = async (u, d) => {
      const src = await base(u, d);
      return src && { ...src, activeVersionId: null };
    };
    expect(await runFilterValues(VIEWER, DASH, { column: "Cabang" }, deps)).toEqual(
      await runFilterValues(VIEWER, DASH, { column: "Wilayah" }, deps),
    );
    expect(await runFilterValues(OWNER, DASH, { column: "Cabang" }, deps)).toMatchObject({
      code: "NOT_READY",
    });
    expect(exec).not.toHaveBeenCalled();
  });
});

describe("T-016 mode editor { dashboardId, spec }", () => {
  it("body tidak valid → INVALID sebelum otorisasi (siapa pun peminta)", async () => {
    const { deps, repo, exec } = makeDeps();
    for (const body of [
      { dashboardId: DASH },
      { dashboardId: "bukan-id", spec: SPEC },
      // Dataset tidak pernah dari body: field tambahan ditolak (strict).
      { dashboardId: DASH, spec: SPEC, datasetId: DS },
      { dashboardId: DASH, spec: { ...SPEC, extra: 1 } },
    ]) {
      for (const user of [EDITOR, STRANGER]) {
        expect(await runDashboardQuery(user, body, deps)).toMatchObject({
          ok: false,
          code: "INVALID",
        });
      }
    }
    expect(repo.dashboardAccess).not.toHaveBeenCalled();
    expect(exec).not.toHaveBeenCalled();
  });

  it("viewer dan orang lain → NOT_FOUND tanpa membaca sheet/cache/DuckDB", async () => {
    const { deps, repo, exec, cache } = makeDeps();
    const get = vi.spyOn(cache, "get");
    for (const user of [VIEWER, STRANGER]) {
      expect(await runDashboardQuery(user, { dashboardId: DASH, spec: SPEC }, deps)).toEqual({
        ok: false,
        code: "NOT_FOUND",
        message: "Dashboard tidak ditemukan.",
      });
    }
    expect(repo.sheet).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    expect(exec).not.toHaveBeenCalled();
  });

  it("editor dan pemilik → hasil atas versi aktif dataset dashboard; cached/ms hanya pemilik", async () => {
    const { deps, repo } = makeDeps();
    const editor = await runDashboardQuery(EDITOR, { dashboardId: DASH, spec: SPEC }, deps);
    expect(editor).toMatchObject({ ok: true, rows: [[42]] });
    expect(editor).not.toHaveProperty("cached");
    expect(editor).not.toHaveProperty("ms");
    expect(repo.dashboardAccess).toHaveBeenCalledWith(EDITOR, DASH);
    expect(repo.sheet).toHaveBeenCalledWith(VER, SHEET);
    const owner = await runDashboardQuery(OWNER, { dashboardId: DASH, spec: SPEC }, deps);
    expect(owner).toMatchObject({ ok: true, rows: [[42]], cached: true, ms: expect.any(Number) });
  });

  it("AC6: sheet dataset lain → NOT_FOUND tanpa DuckDB (editor maupun pemilik)", async () => {
    const { deps, repo, exec } = makeDeps();
    for (const user of [EDITOR, OWNER]) {
      const r = await runDashboardQuery(
        user,
        { dashboardId: DASH, spec: { ...SPEC, sheetId: FOREIGN_SHEET } },
        deps,
      );
      expect(r).toEqual({ ok: false, code: "NOT_FOUND", message: "Sheet tidak ditemukan." });
    }
    expect(repo.sheet).toHaveBeenCalledWith(VER, FOREIGN_SHEET);
    expect(exec).not.toHaveBeenCalled();
  });

  it("kunci cache sama dengan query bebas: hasil pemilik dipakai editor tanpa DuckDB lagi", async () => {
    const { deps, exec } = makeDeps();
    expect(await runQuery(OWNER, { datasetId: DS, spec: SPEC }, deps)).toMatchObject({
      ok: true,
      cached: false,
    });
    const editor = await runDashboardQuery(EDITOR, { dashboardId: DASH, spec: SPEC }, deps);
    expect(editor).toMatchObject({ ok: true, rows: [[42]] });
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it("kolom tersembunyi di spec editor → INVALID (sama dengan kolom tidak ada)", async () => {
    const { deps, exec } = makeDeps();
    const answers = [];
    for (const column of ["Rahasia", "Tidak Ada"]) {
      const r = await runDashboardQuery(
        EDITOR,
        { dashboardId: DASH, spec: { ...SPEC, dimensions: [{ column }] } },
        deps,
      );
      expect(r).toMatchObject({ ok: false, code: "INVALID" });
      answers.push(r.ok ? "" : r.message.replace(column, "X"));
    }
    expect(answers[0]).toBe(answers[1]);
    expect(exec).not.toHaveBeenCalled();
  });

  it("repo tanpa dashboardAccess → NOT_FOUND; dataset tanpa versi aktif → NOT_READY", async () => {
    const { deps, repo } = makeDeps();
    const { dashboardAccess: _omit, ...withoutAccess } = repo;
    expect(
      await runDashboardQuery(
        OWNER,
        { dashboardId: DASH, spec: SPEC },
        { ...deps, repo: withoutAccess },
      ),
    ).toMatchObject({ ok: false, code: "NOT_FOUND" });
    repo.dashboardAccess.mockResolvedValueOnce({
      role: "EDITOR",
      datasetId: DS,
      activeVersionId: null,
    });
    expect(await runDashboardQuery(EDITOR, { dashboardId: DASH, spec: SPEC }, deps)).toMatchObject({
      ok: false,
      code: "NOT_READY",
    });
  });
});

describe("T-016 AC1: query bebas { datasetId, spec } tetap pemilik saja", () => {
  it("editor/viewer dashboard dataset itu → NOT_FOUND tanpa memakai akses dashboard; pemilik → hasil", async () => {
    const { deps, repo, exec } = makeDeps();
    for (const user of [EDITOR, VIEWER, STRANGER]) {
      expect(await runQuery(user, { datasetId: DS, spec: SPEC }, deps)).toEqual({
        ok: false,
        code: "NOT_FOUND",
        message: "Dataset tidak ditemukan.",
      });
    }
    expect(repo.dashboardAccess).not.toHaveBeenCalled();
    expect(exec).not.toHaveBeenCalled();
    expect(await runQuery(OWNER, { datasetId: DS, spec: SPEC }, deps)).toMatchObject({
      ok: true,
      cached: false,
      ms: expect.any(Number),
    });
  });
});
