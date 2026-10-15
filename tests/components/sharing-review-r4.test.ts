import { Dialog } from "radix-ui";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Perbaikan review T-016 putaran 4 (klien): catatan "Dibagikan ke saya" memakai { items, hidden }
 * (DI-1/DI-2) dengan teks yang tidak bertentangan dan memberi langkah berikutnya (UI-2), nama dashboard
 * membungkus di ponsel (UI-1), Ctrl/Cmd+Z kanvas tidak berjalan di belakang dialog lain (CL-1),
 * kerangka Back/Forward setinggi kanvas terakhir (CL-2), tautan peringatan share membawa ?f= (CL-3),
 * slicer "Muat ulang" untuk galat yang tidak pulih (CC-1), status STALE netral (CC-2).
 */
const m = vi.hoisted(() => ({
  search: "",
  ready: true,
  values: null as null | Record<string, unknown>,
  requireUser: vi.fn(async () => ({ id: "u1", isAdmin: false })),
  listDashboards: vi.fn(async () => [] as unknown[]),
  listSharedDashboards: vi.fn(),
  listDatasets: vi.fn(async () => [] as unknown[]),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
  useSearchParams: () => new URLSearchParams(m.search),
}));
// CSS react-grid-layout tidak diproses di unit test (PostCSS proyek untuk Tailwind).
vi.mock("react-grid-layout/css/styles.css", () => ({}));
vi.mock("react-resizable/css/styles.css", () => ({}));
vi.mock("@/features/auth/session", () => ({ requireUser: m.requireUser }));
vi.mock("@/features/dashboards/service", () => ({
  listDashboards: m.listDashboards,
  listSharedDashboards: m.listSharedDashboards,
  SHARED_PER_OWNER_MAX: 20,
}));
vi.mock("@/features/datasets/service", () => ({ listDatasets: m.listDatasets }));
// Kerangka Back/Forward dikendalikan uji; sisanya modul asli.
vi.mock("@/components/dashboards/use-dashboard-editor", async (orig) => ({
  ...(await orig<typeof import("@/components/dashboards/use-dashboard-editor")>()),
  useFreshAfterHistory: () => m.ready,
}));
// Hasil nilai slicer ditentukan uji (null = modul asli).
vi.mock("@/components/dashboards/filters/use-filter-values", async (orig) => {
  const real = await orig<typeof import("@/components/dashboards/filters/use-filter-values")>();
  return {
    ...real,
    useFilterValues: (...a: Parameters<typeof real.useFilterValues>) =>
      m.values ?? real.useFilterValues(...a),
  };
});

const model = await import("@/components/sharing/share-model");
const { SharedDashboardList } = await import("@/components/sharing/shared-dashboard-list");
const { DashboardList } = await import("@/components/dashboards/dashboard-list");
const { ShareWarnings } = await import("@/components/sharing/share-warnings");
const { editModeHref } = await import("@/components/dashboards/edit-dashboard-link");
const { FILTER_SETTINGS_ID } = await import("@/components/dashboards/filters/filter-bar");
const { CanvasToolbar } = await import("@/components/dashboards/canvas-toolbar");
const canvas = await import("@/components/dashboards/dashboard-canvas");
const { SlicerPanel } = await import("@/components/dashboards/filters/slicer-panel");
const { fetchValues, needsReload } =
  await import("@/components/dashboards/filters/use-filter-values");
const { default: DashboardsPage } = await import("@/app/(app)/dashboards/page");

const html = (el: ReactElement) => renderToStaticMarkup(el);

beforeEach(() => {
  vi.clearAllMocks();
  m.search = "";
  m.ready = true;
  m.values = null;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const shared = {
  id: "d1",
  name: "Laporan pengiriman cabang Jabodetabek dan Jawa Barat bulanan — Oktober",
  datasetName: "Rekap",
  ownerName: "Sari",
  ownerEmail: "sari@pcp.co.id",
  role: "VIEWER" as const,
  widgetCount: 1,
  updatedAt: new Date("2026-10-15T03:00:00Z"),
};

describe("R4-DI-1/DI-2/UI-2: catatan 'Dibagikan ke saya' dari { items, hidden }", () => {
  const render = async (hidden: number) => {
    m.listSharedDashboards.mockResolvedValue({ items: [shared], hidden });
    return html((await DashboardsPage({ searchParams: Promise.resolve({}) })) as ReactElement);
  };

  it("teks tidak menyebut 'dari satu pemilik' sebagai batas mutlak dan memberi langkah berikutnya", () => {
    const text = model.hiddenSharedText(3, 20);
    expect(text).toBe(
      "3 dashboard lain yang dibagikan kepada Anda tidak ditampilkan karena daftar terlalu panjang (paling banyak 20 per pemilik). Buka lewat tautan dari pemiliknya.",
    );
    expect(text).not.toContain("dibagikan langsung"); // share organisasi ikut dihitung
  });

  it("hidden > 0 → catatan di bagian 'Dibagikan ke saya' (test id shared-hidden)", async () => {
    const out = await render(5);
    const section = out.slice(out.indexOf('aria-labelledby="dibagikan-ke-saya"'));
    expect(section).toContain(
      `<p class="text-sm text-muted-foreground" data-testid="shared-hidden">${model.hiddenSharedText(5, 20)}</p>`,
    );
  });

  it("hidden 0 (daftar ≤ batas: semua share terdaftar) → tanpa catatan", async () => {
    expect(await render(0)).not.toContain('data-testid="shared-hidden"');
  });
});

describe("R4-UI-1: nama dashboard membungkus di tata letak bertumpuk", () => {
  const nameClass = (out: string, name: string) =>
    new RegExp(`<span class="([^"]*)" title="${name}">`).exec(out)?.[1]?.split(" ") ?? [];

  it("'Dibagikan ke saya' lebar: membungkus, dipotong 2 baris hanya di tabel @3xl", () => {
    const cls = nameClass(
      html(createElement(SharedDashboardList, { dashboards: [shared] })),
      shared.name,
    );
    expect(cls).toContain("[overflow-wrap:anywhere]");
    expect(cls).toContain("@3xl:line-clamp-2");
    expect(cls).not.toContain("line-clamp-2");
  });

  it("kartu Beranda (compact): tidak pernah dipotong", () => {
    const cls = nameClass(
      html(createElement(SharedDashboardList, { dashboards: [shared], compact: true })),
      shared.name,
    );
    expect(cls).toContain("[overflow-wrap:anywhere]");
    expect(cls.some((c) => c.includes("line-clamp"))).toBe(false);
  });

  it("'Dashboard saya' memakai aturan yang sama", () => {
    const out = html(
      createElement(DashboardList, {
        dashboards: [
          {
            id: "d2",
            name: shared.name,
            datasetId: "s1",
            datasetName: "Rekap",
            widgetCount: 1,
            updatedAt: shared.updatedAt,
            orgShared: false,
            shareCount: 0,
          },
        ],
      }),
    );
    const cls = nameClass(out, shared.name);
    expect(cls).toContain("[overflow-wrap:anywhere]");
    expect(cls).toContain("@3xl:line-clamp-2");
    expect(cls).not.toContain("line-clamp-2");
  });
});

describe("R4-CL-1: Ctrl/Cmd+Z kanvas tidak berjalan di belakang dialog lain", () => {
  /** Pencocok kecil untuk bentuk selektor OTHER_MODAL: [role="x"] dengan :not([data-testid="y"]). */
  const docWith = (els: { role: string; testid?: string }[]) => ({
    querySelector: (sel: string) =>
      els.find((el) =>
        sel.split(",").some((part) => {
          const role = /\[role="([^"]+)"\]/.exec(part)?.[1];
          const not = /:not\(\[data-testid="([^"]+)"\]\)/.exec(part)?.[1];
          return el.role === role && (!not || el.testid !== not);
        }),
      ) ?? null,
  });
  const target = (typing = false) => ({ closest: () => (typing ? {} : null) });
  const key = (over: Partial<KeyboardEvent> = {}) =>
    ({
      key: "z",
      ctrlKey: true,
      metaKey: false,
      defaultPrevented: false,
      target: target(),
      ...over,
    }) as unknown as KeyboardEvent;
  const empty = docWith([]);

  it("tanpa dialog: Ctrl+Z / Cmd+Z di luar kolom isian → urungkan kanvas", () => {
    expect(canvas.isCanvasUndo(key(), empty)).toBe(true);
    expect(canvas.isCanvasUndo(key({ ctrlKey: false, metaKey: true, key: "Z" }), empty)).toBe(true);
  });

  it("dialog Bagikan (role=dialog) atau konfirmasinya (alertdialog) terbuka → bukan milik kanvas", () => {
    // Fokus di Select peran (atau daftarnya yang di-portal ke body): target bukan isian.
    expect(canvas.isCanvasUndo(key(), docWith([{ role: "dialog", testid: "share-dialog" }]))).toBe(
      false,
    );
    expect(canvas.isCanvasUndo(key(), docWith([{ role: "alertdialog" }]))).toBe(false);
  });

  it("lembar pengaturan widget kanvas sendiri (< 1280 px) tetap boleh urungkan", () => {
    expect(canvas.isCanvasUndo(key(), docWith([{ role: "dialog", testid: "widget-panel" }]))).toBe(
      true,
    );
    expect(
      canvas.isCanvasUndo(
        key(),
        docWith([{ role: "dialog", testid: "widget-panel" }, { role: "alertdialog" }]),
      ),
    ).toBe(false);
  });

  it("sudah ditangani (defaultPrevented), sedang mengetik, atau tanpa Ctrl/Cmd → tidak", () => {
    expect(canvas.isCanvasUndo(key({ defaultPrevented: true }), empty)).toBe(false);
    expect(
      canvas.isCanvasUndo(key({ target: target(true) as unknown as EventTarget }), empty),
    ).toBe(false);
    expect(canvas.isCanvasUndo(key({ ctrlKey: false }), empty)).toBe(false);
    expect(canvas.isCanvasUndo(key({ key: "y" }), empty)).toBe(false);
    // Target tanpa closest (document/window) tidak melempar.
    expect(canvas.isCanvasUndo(key({ target: null }), empty)).toBe(true);
  });

  it("selektor dialog lain mengecualikan lembar panel widget, mencakup semua alertdialog", () => {
    expect(canvas.OTHER_MODAL).toBe(
      '[role="dialog"]:not([data-testid="widget-panel"]), [role="alertdialog"]',
    );
  });
});

describe("R4-CL-2: kerangka Back/Forward setinggi kanvas terakhir", () => {
  const props = (dashboardId: string, editing: boolean) => ({
    dashboardId,
    role: "OWNER" as const,
    widgets: [],
    layout: [],
    revision: 1,
    editing,
    datasetId: "s1",
    sources: [],
    filterColumns: [],
    crossFilterColumns: [],
  });
  const skeleton = (dashboardId: string, editing = false) => {
    m.ready = false;
    return html(createElement(canvas.DashboardCanvas, props(dashboardId, editing)));
  };

  it("tinggi terakhir dashboard + mode menjadi min-height kerangka (posisi gulir tidak terpotong)", () => {
    canvas.rememberCanvasHeight(canvas.canvasHeightKey("dA", false), 1483);
    canvas.rememberCanvasHeight(canvas.canvasHeightKey("dA", true), 1029);
    expect(skeleton("dA")).toContain('style="min-height:1483px"');
    expect(skeleton("dA", true)).toContain('style="min-height:1029px"');
    expect(skeleton("dA")).toContain('data-testid="canvas-refreshing"');
  });

  it("belum pernah dirender di dokumen ini → kerangka bawaan h-64 tanpa min-height", () => {
    const out = skeleton("dBaru");
    expect(out).not.toContain("min-height");
    expect(out).toContain("h-64");
  });

  it("tinggi 0 (sudah tidak tampil saat dilepas) tidak menimpa tinggi terakhir", () => {
    const k = canvas.canvasHeightKey("dC", false);
    canvas.rememberCanvasHeight(k, 900);
    canvas.rememberCanvasHeight(k, 0);
    expect(canvas.lastCanvasHeight(k)).toBe(900);
    canvas.rememberCanvasHeight(k, 1200);
    expect(canvas.lastCanvasHeight(k)).toBe(1200);
  });

  it("kunci dari props (bukan URL): mode lihat dan edit terpisah, dashboard lain terpisah", () => {
    expect(canvas.canvasHeightKey("d1", false)).not.toBe(canvas.canvasHeightKey("d1", true));
    expect(canvas.canvasHeightKey("d1", false)).not.toBe(canvas.canvasHeightKey("d2", false));
  });
});

describe("R4-CL-3: tautan peringatan share ke mode edit membawa ?f=", () => {
  const link = () =>
    html(
      createElement(
        Dialog.Root,
        null,
        createElement(ShareWarnings, { dashboardId: "d1", editor: false, filterColumns: ["Kota"] }),
      ),
    ).match(/<a [^>]*>/)?.[0] ?? "";

  it("filter aktif → &f= (ter-encode) sebelum #kolom-filter, sama dengan 'Ubah tata letak'", () => {
    const f = '[{"column":"Kota","op":"in","values":["Bandung"]}]';
    m.search = `f=${encodeURIComponent(f)}`;
    const href = `/dashboards/d1?mode=edit&f=${encodeURIComponent(f)}#${FILTER_SETTINGS_ID}`;
    expect(link()).toContain(`href="${href.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}"`);
    expect(editModeHref("d1", f)).toBe(href.split("#")[0]);
  });

  it("tanpa filter → URL mode edit polos", () => {
    expect(link()).toContain(`href="/dashboards/d1?mode=edit#${FILTER_SETTINGS_ID}"`);
    expect(editModeHref("d1", null)).toBe("/dashboards/d1?mode=edit");
  });
});

describe("R4-CC-1: slicer — galat yang tidak pulih memberi 'Muat ulang'", () => {
  const NOT_FILTER = "Kolom ini bukan kolom filter dashboard.";
  const respond = (status: number, body: unknown) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(body), { status })),
    );
  const ask = () =>
    fetchValues("d1", { column: "Kota", sheet: "S1" }, new AbortController().signal);

  it("INVALID 'bukan kolom filter' (kolom diubah pemilik) → kode ikut, perlu muat ulang", async () => {
    respond(400, { ok: false, code: "INVALID", message: NOT_FILTER });
    const r = await ask();
    expect(r).toEqual({ ok: false, status: 400, code: "INVALID", message: NOT_FILTER });
    expect(needsReload(r)).toBe(true);
  });

  it("sesi berakhir → muat ulang; batas laju, galat server, jaringan → coba lagi", async () => {
    respond(401, { ok: false, code: "UNAUTHENTICATED", message: "x" });
    expect(needsReload(await ask())).toBe(true);
    respond(429, { ok: false, code: "RATE_LIMITED", message: "Terlalu banyak" });
    expect(needsReload(await ask())).toBe(false);
    respond(500, { ok: false, code: "INTERNAL", message: "Gagal" });
    expect(needsReload(await ask())).toBe(false);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("offline");
      }),
    );
    const offline = await ask();
    expect(offline.ok).toBe(false);
    expect(needsReload(offline)).toBe(false);
    respond(200, { ok: true, values: ["A"], truncated: false });
    expect(needsReload(await ask())).toBe(false);
  });

  const panel = (reload: boolean) => {
    m.values = {
      loading: false,
      data: null,
      error: NOT_FILTER,
      reload,
      full: null,
      retry: () => {},
    };
    return html(
      createElement(SlicerPanel, {
        dashboardId: "d1",
        column: { key: "s1\u0000kota", sheet: "S1", column: "Kota", type: "text", available: true },
        value: undefined,
        onChange: () => {},
        allMode: false,
        onAllMode: () => {},
      }),
    );
  };

  it("panel: perlu muat ulang → tombol 'Muat ulang', tanpa 'Coba lagi' yang tidak akan berhasil", () => {
    const out = panel(true);
    expect(out).toContain(NOT_FILTER);
    expect(out).toMatch(/data-testid="filter-slicer-retry"[^>]*>.*Muat ulang<\/button>/);
    expect(out).not.toContain("Coba lagi");
  });

  it("panel: galat sementara → tetap 'Coba lagi'", () => {
    const out = panel(false);
    expect(out).toContain("Coba lagi");
    expect(out).not.toContain("Muat ulang");
  });
});

describe("R4-CC-2: status STALE di toolbar netral", () => {
  const toolbar = (save: "stale" | "denied") =>
    html(
      createElement(CanvasToolbar, {
        save,
        undoKind: null,
        adding: false,
        finishing: false,
        onAdd: () => {},
        onUndo: () => {},
        onRetry: () => {},
        onDone: () => {},
      }),
    );

  it("STALE (editor lain atau tab lain) → 'Diubah di tempat lain.'; akses berubah tetap", () => {
    expect(toolbar("stale")).toContain("Diubah di tempat lain.");
    expect(toolbar("stale")).not.toContain("tab atau perangkat");
    expect(toolbar("denied")).toContain("Akses edit berubah.");
  });
});
