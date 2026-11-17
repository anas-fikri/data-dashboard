import { describe, expect, it, vi } from "vitest";
import { looksLike } from "@/features/exports/pdf-job";
import { loadRenderSession, type RenderSessionDeps } from "@/features/exports/render-session";
import { pdfBodySchema } from "@/features/exports/schema";

/*
 * T-7c8v/T-yye9/T-c2bh: unduhan gambar (PNG) widget/dashboard dan halaman HTML lewat renderer.
 */
const DASH = "cmv4kljx40009oczvdmpurrd0";
const USER = "cmv4kljx40009oczvdmpuvwr0";
const W1 = "cmv4kljx40009oczvdmpuwid1";
const W2 = "cmv4kljx40009oczvdmpuwid2";

describe("pdfBodySchema: format render", () => {
  it("pdf/png/html diterima; widgetId hanya untuk png", () => {
    for (const format of ["pdf", "png", "html"]) {
      expect(pdfBodySchema.safeParse({ dashboardId: DASH, format }).success).toBe(true);
    }
    expect(pdfBodySchema.safeParse({ dashboardId: DASH, format: "png", widgetId: W1 }).success).toBe(
      true,
    );
    expect(pdfBodySchema.safeParse({ dashboardId: DASH, format: "pdf", widgetId: W1 }).success).toBe(
      false,
    );
    expect(pdfBodySchema.safeParse({ dashboardId: DASH, format: "svg" }).success).toBe(false);
    expect(
      pdfBodySchema.safeParse({ dashboardId: DASH, format: "png", widgetId: "../x" }).success,
    ).toBe(false);
  });
});

describe("looksLike: isi jawaban renderer sesuai format", () => {
  const enc = (s: string) => new TextEncoder().encode(s);
  it("PNG magic, HTML doctype, PDF header", () => {
    expect(looksLike("png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe(
      true,
    );
    expect(looksLike("png", enc("%PDF-1.7"))).toBe(false);
    expect(looksLike("html", enc("  <!DOCTYPE html><html></html>"))).toBe(true);
    expect(looksLike("html", enc("<script>x</script>"))).toBe(false);
    expect(looksLike("pdf", enc("<!doctype html>"))).toBe(false);
  });
});

describe("loadRenderSession: PNG satu widget", () => {
  const deps = (widgetId: string): RenderSessionDeps => {
    let used = false;
    return {
      consumeClaims: vi.fn(async () => {
        if (used) return null;
        used = true;
        return {
          exportId: "cmv4kljx40009oczvdmpuexp0",
          userId: USER,
          dashboardId: DASH,
          requestedAt: "2026-03-15T05:00:00.000Z",
          widgetId,
        };
      }),
      subjectLive: vi.fn(async () => true),
      dashboard: vi.fn(async () => ({
        id: DASH,
        name: "Penjualan",
        dataset: { name: "Data" },
        layout: [
          { i: W1, x: 0, y: 0, w: 4, h: 2 },
          { i: W2, x: 4, y: 3, w: 8, h: 5 },
        ],
        filterColumns: [],
        crossFilterColumns: [],
        widgets: [
          { id: W1, type: "kpi", title: "Total", spec: {} },
          { id: W2, type: "bar", title: "Per kota", spec: {} },
        ],
      })),
      query: vi.fn(async () => ({ ok: true, columns: [], rows: [], widgetVersion: "v" }) as never),
    };
  };

  it("hanya widget itu, selebar halaman di baris pertama, tinggi kartu tetap", async () => {
    const d = deps(W2);
    const r = await loadRenderSession("s".repeat(43), d);
    expect(r!.widgets.map((w) => w.id)).toEqual([W2]);
    expect(r!.dashboard.layout).toEqual([{ i: W2, x: 0, y: 0, w: 12, h: 5 }]);
    expect(d.query).toHaveBeenCalledTimes(1);
  });

  it("widget sudah dihapus → null (404 polos)", async () => {
    expect(await loadRenderSession("s".repeat(43), deps("cmv4kljx40009oczvdmpuwid9"))).toBeNull();
  });
});
