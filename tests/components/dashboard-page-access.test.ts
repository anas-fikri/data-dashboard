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
vi.mock("@/components/dashboards/dashboard-pdf-export", () => ({
  DashboardPdfExport: marker("dashboard-pdf-export"),
  DashboardPdfWatch: marker("dashboard-pdf-watch"),
}));

const { default: DashboardPage } = await import("@/app/(app)/dashboards/[id]/page");

const D = "cmv4kljx40009oczvdmpurrs1";
const view = (role: "OWNER" | "EDITOR" | "VIEWER", ownerName: string | null = "Sari") => ({
  id: D,
  name: "Penjualan",
  role,
  ownerName,
  ownerEmail: "sari@pcp.co.id",
  access: role === "OWNER" ? { orgShared: true, shareCount: 3 } : null,
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

  it("non-pemilik: nama dataset di breadcrumb membungkus, tidak terpotong (T016-UI-5)", async () => {
    m.getDashboard.mockResolvedValue(view("VIEWER"));
    const out = await render();
    const crumb = /<span class="([^"]*)" data-testid="dashboard-dataset">Rekap 2026<\/span>/.exec(
      out,
    )?.[1];
    expect(crumb).toContain("[overflow-wrap:anywhere]");
    expect(crumb).not.toContain("truncate");
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
    // Pemilik tanpa nama: emailnya (identitas), bukan frasa "pengguna tanpa nama" (R3-CC-1).
    expect(out).toContain(
      'Dibagikan oleh <span class="font-medium text-foreground"><bdi dir="ltr">sari<wbr/>@pcp.co.id</bdi></span>',
    );
    expect(out).not.toContain("tanpa nama");
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

describe("review T-016 R3", () => {
  it("CC-1: 'Dibagikan oleh' memuat nama DAN email pemilik (nama bisa meniru rekan)", async () => {
    m.getDashboard.mockResolvedValue(view("VIEWER"));
    const out = await render();
    expect(out).toContain(
      'Dibagikan oleh <bdi class="font-medium text-foreground">Sari</bdi> (<bdi dir="ltr">sari<wbr/>@pcp.co.id</bdi>)',
    );
  });

  it("CC-2: pengaturan dashboard (pemilik) menerima status berbagi untuk konfirmasi hapus", async () => {
    m.getDashboard.mockResolvedValue(view("OWNER"));
    const out = await render({ mode: "edit" });
    expect(out).toContain(
      "&quot;access&quot;:{&quot;orgShared&quot;:true,&quot;shareCount&quot;:3}",
    );
  });
});

describe("T-018 D10: Ekspor PDF di kepala halaman", () => {
  const W = { id: "w1", type: "kpi", title: "Omzet", spec: {}, version: "v1" };
  const withWidgets = (role: "OWNER" | "EDITOR" | "VIEWER") => ({ ...view(role), widgets: [W] });
  const pdf = 'data-testid="dashboard-pdf-export"';

  it("mode lihat, semua peran (viewer juga), bila dashboard punya widget", async () => {
    for (const role of ["OWNER", "EDITOR", "VIEWER"] as const) {
      m.getDashboard.mockResolvedValue(withWidgets(role));
      const out = await render();
      expect(out, role).toContain(pdf);
      expect(out, role).toContain(`&quot;dashboardId&quot;:&quot;${D}&quot;`);
    }
  });

  it("viewer: slot aksi hanya berisi Ekspor PDF (tanpa edit/Bagikan)", async () => {
    m.getDashboard.mockResolvedValue(withWidgets("VIEWER"));
    const out = await render();
    expect(out).toContain(pdf);
    expect(out).not.toContain('data-testid="edit-dashboard"');
    expect(out).not.toContain('data-testid="share-open"');
  });

  it("disembunyikan di mode edit dan untuk dashboard tanpa widget", async () => {
    m.getDashboard.mockResolvedValue(withWidgets("OWNER"));
    expect(await render({ mode: "edit" })).not.toContain(pdf);
    m.getDashboard.mockResolvedValue(view("VIEWER"));
    const empty = await render();
    expect(empty).not.toContain(pdf);
    // Viewer tanpa widget: tanpa slot aksi kosong.
    expect(empty).not.toContain("md:[&amp;&gt;*]:w-auto");
  });

  it("tanpa tombol (mode edit / tanpa widget): PDF yang berjalan tetap dipantau, tepat satu pemantau", async () => {
    // Review R1-CL-1: PDF dimulai di mode lihat lalu pindah ke mode edit → tetap diunduh otomatis.
    const watch = 'data-testid="dashboard-pdf-watch"';
    const count = (html: string, needle: string) => html.split(needle).length - 1;
    for (const role of ["OWNER", "EDITOR"] as const) {
      m.getDashboard.mockResolvedValue(withWidgets(role));
      const edit = await render({ mode: "edit" });
      expect(count(edit, watch), role).toBe(1);
      expect(edit, role).toContain(`&quot;dashboardId&quot;:&quot;${D}&quot;`);
      expect(edit, role).not.toContain(pdf);
      const shown = await render();
      expect(count(shown, pdf), role).toBe(1);
      expect(shown, role).not.toContain(watch);
    }
    m.getDashboard.mockResolvedValue(view("VIEWER"));
    expect(count(await render(), watch)).toBe(1);
  });

  it("kepala halaman di dalam ExportUserProvider (status ekspor per user)", async () => {
    m.getDashboard.mockResolvedValue(withWidgets("VIEWER"));
    const page = (await open()) as ReactElement<{ userId?: string }>;
    expect(page.props.userId).toBe("u1");
  });
});
