import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * T-016 halaman /dashboards/[id] per peran: viewer + ?mode=edit dialihkan ke URL lihat (?f= ikut)
 * SEBELUM sumber data dimuat; sumber panel hanya untuk mode edit pemilik/editor; audit pembukaan
 * lewat after() dengan IP dibaca di render; kepala halaman: badge peran + pemilik untuk non-pemilik,
 * tautan dataset/Bagikan/pengaturan dashboard hanya pemilik, tombol edit untuk pemilik/editor.
 */
const m = vi.hoisted(() => ({
  requireUser: vi.fn(async () => ({ id: "u1", isAdmin: false })),
  getDashboard: vi.fn(),
  getDashboardSources: vi.fn(async () => []),
  recordDashboardOpen: vi.fn(async () => {}),
  after: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

vi.mock("@/features/auth/session", () => ({ requireUser: m.requireUser }));
vi.mock("@/features/dashboards/service", () => ({
  getDashboard: m.getDashboard,
  getDashboardSources: m.getDashboardSources,
}));
vi.mock("@/features/sharing/service", () => ({ recordDashboardOpen: m.recordDashboardOpen }));
vi.mock("@/lib/env", () => ({ env: () => ({ TRUST_PROXY: true }) }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-real-ip": "203.0.113.7" }),
}));
vi.mock("next/server", () => ({ after: m.after }));
vi.mock("next/navigation", () => ({ redirect: m.redirect, notFound: m.notFound }));
// Komponen klien diganti penanda: yang diuji adalah keputusan halaman, bukan isinya.
const marker = (testid: string) =>
  function Marker(props: Record<string, unknown>) {
    return createElement("i", { "data-testid": testid, "data-props": JSON.stringify(props) });
  };
vi.mock("@/components/dashboards/dashboard-canvas", () => ({ DashboardCanvas: marker("canvas") }));
vi.mock("@/components/dashboards/dashboard-settings", () => ({
  DashboardSettings: marker("settings"),
}));
vi.mock("@/components/dashboards/edit-dashboard-link", () => ({
  EditDashboardLink: marker("edit-dashboard"),
}));
vi.mock("@/components/sharing/share-dialog", () => ({ ShareDialog: marker("share-open") }));

const { default: DashboardPage } = await import("@/app/(app)/dashboards/[id]/page");

const D = "cmv4kljx40009oczvdmpurrs1";
const view = (role: "OWNER" | "EDITOR" | "VIEWER", ownerName: string | null = "Sari") => ({
  id: D,
  name: "Penjualan",
  role,
  ownerName,
  dataset: { id: "ds1", name: "Rekap 2026" },
  layout: [],
  layoutRevision: 1,
  widgets: [],
  updatedAt: new Date(),
  filterColumns: [],
  crossFilterColumns: [],
});
const open = (search: Record<string, string> = {}) =>
  DashboardPage({ params: Promise.resolve({ id: D }), searchParams: Promise.resolve(search) });
const render = async (search?: Record<string, string>) =>
  renderToStaticMarkup((await open(search)) as ReactElement);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("akses halaman dashboard", () => {
  it("tanpa akses → notFound, tanpa audit dan tanpa sumber data", async () => {
    m.getDashboard.mockResolvedValue(null);
    await expect(open()).rejects.toThrow("NOT_FOUND");
    expect(m.after).not.toHaveBeenCalled();
    expect(m.getDashboardSources).not.toHaveBeenCalled();
  });

  it("viewer + ?mode=edit → URL lihat dengan ?f= tetap, sebelum sumber data dan audit", async () => {
    m.getDashboard.mockResolvedValue(view("VIEWER"));
    const f = JSON.stringify([{ column: "Cabang", op: "in", values: ["A&B"] }]);
    await expect(open({ mode: "edit", f })).rejects.toThrow(
      `REDIRECT /dashboards/${D}?f=${encodeURIComponent(f)}`,
    );
    expect(m.getDashboardSources).not.toHaveBeenCalled();
    expect(m.after).not.toHaveBeenCalled();
  });

  it("viewer + ?mode=edit tanpa filter → URL lihat polos", async () => {
    m.getDashboard.mockResolvedValue(view("VIEWER"));
    await expect(open({ mode: "edit" })).rejects.toThrow(`REDIRECT /dashboards/${D}`);
  });

  it("viewer mode lihat: badge + pemilik, tanpa tautan dataset/edit/Bagikan/pengaturan", async () => {
    m.getDashboard.mockResolvedValue(view("VIEWER"));
    const out = await render();
    expect(out).toContain("Hanya lihat");
    expect(out).toContain("Dibagikan oleh");
    expect(out).toContain("Sari");
    expect(out).toContain("Rekap 2026");
    expect(out).not.toContain('href="/datasets/ds1"');
    expect(out).not.toContain('data-testid="edit-dashboard"');
    expect(out).not.toContain('data-testid="share-open"');
    expect(out).not.toContain('data-testid="settings"');
    expect(m.getDashboardSources).not.toHaveBeenCalled();
  });

  it("audit pembukaan lewat after() dengan peran dan IP yang dibaca saat render", async () => {
    m.getDashboard.mockResolvedValue(view("VIEWER"));
    await open();
    expect(m.after).toHaveBeenCalledTimes(1);
    expect(m.recordDashboardOpen).not.toHaveBeenCalled(); // tidak menahan render
    (m.after.mock.calls[0] as unknown as [() => unknown])[0]();
    expect(m.recordDashboardOpen).toHaveBeenCalledWith("u1", D, "VIEWER", "203.0.113.7");
  });

  it("editor mode edit: sumber data dashboard-scoped, tanpa pengaturan/Bagikan/tautan dataset", async () => {
    m.getDashboard.mockResolvedValue(view("EDITOR", null));
    const out = await render({ mode: "edit" });
    expect(m.getDashboardSources).toHaveBeenCalledWith("u1", D);
    expect(out).toContain("Editor");
    expect(out).toContain("pemilik dataset"); // pemilik tanpa nama
    expect(out).not.toContain('data-testid="settings"');
    expect(out).not.toContain('data-testid="share-open"');
    expect(out).not.toContain('href="/datasets/ds1"');
    // Kanvas menerima peran (mode edit editor: tanpa tautan/pengaturan pemilik di dalamnya).
    expect(out).toContain("&quot;role&quot;:&quot;EDITOR&quot;");
  });

  it("editor mode lihat: tombol edit ada", async () => {
    m.getDashboard.mockResolvedValue(view("EDITOR"));
    const out = await render();
    expect(out).toContain('data-testid="edit-dashboard"');
    expect(m.getDashboardSources).not.toHaveBeenCalled();
  });

  it("pemilik: tautan dataset, Bagikan, edit; tanpa badge peran; pengaturan di mode edit", async () => {
    m.getDashboard.mockResolvedValue(view("OWNER"));
    const out = await render();
    expect(out).toContain('href="/datasets/ds1"');
    expect(out).toContain('data-testid="share-open"');
    expect(out).toContain('data-testid="edit-dashboard"');
    expect(out).not.toContain("Dibagikan oleh");
    const edit = await render({ mode: "edit" });
    expect(edit).toContain('data-testid="settings"');
    expect(edit).toContain('data-testid="share-open"');
    expect(edit).not.toContain('data-testid="edit-dashboard"');
    expect(m.getDashboardSources).toHaveBeenCalledWith("u1", D);
  });
});
