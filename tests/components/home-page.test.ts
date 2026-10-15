import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/*
 * T016-UI-7 Beranda: kepala kartu "Dashboard dibagikan ke saya" di 320 px — tautan "Lihat semua (N)"
 * pindah utuh ke bawah judul (flex-wrap + whitespace-nowrap), tidak terbelah di samping judul dua baris.
 */
const m = vi.hoisted(() => ({
  requireUser: vi.fn(async () => ({ id: "u1", isAdmin: false })),
  listDatasets: vi.fn(async () => Array.from({ length: 6 }, (_, i) => ({ id: `s${i}` }))),
  // R3-SEC-2: { items, hiddenDirect } — Beranda memakai items saja.
  listSharedDashboards: vi.fn(async () => ({
    items: Array.from({ length: 7 }, (_, i) => ({
      id: `d${i}`,
      name: `Dashboard ${i}`,
      datasetName: "Rekap",
      ownerName: null,
      ownerEmail: `pemilik${i}@pcp.co.id`,
      role: "VIEWER" as const,
      widgetCount: 1,
      updatedAt: new Date("2026-10-15T03:00:00Z"),
    })),
    hiddenDirect: 4,
  })),
}));

vi.mock("@/features/auth/session", () => ({ requireUser: m.requireUser }));
vi.mock("@/features/datasets/service", () => ({ listDatasets: m.listDatasets }));
vi.mock("@/features/dashboards/service", () => ({
  listSharedDashboards: m.listSharedDashboards,
}));
vi.mock("@/components/datasets/dataset-list", () => ({
  DatasetList: () => createElement("i", { "data-testid": "dataset-list" }),
}));

const { default: HomePage } = await import("@/app/(app)/page");

const render = async () =>
  renderToStaticMarkup((await HomePage({ searchParams: Promise.resolve({}) })) as ReactElement);

describe("Beranda: kepala kartu", () => {
  it("'Lihat semua (N)' tidak terbelah: kepala membungkus, tautan satu baris", async () => {
    const out = await render();
    const links = [
      ...out.matchAll(
        /<a class="([^"]*)" href="\/(datasets|dashboards)">Lihat semua \((\d+)\)<\/a>/g,
      ),
    ];
    expect(links.map((l) => [l[2], l[3]])).toEqual([
      ["datasets", "6"],
      ["dashboards", "7"],
    ]);
    for (const l of links) {
      expect(l[1]).toContain("whitespace-nowrap");
      // Target sentuh ≥ 24 px (WCAG 2.5.8).
      expect(l[1]).toContain("min-h-6");
    }
    // Kedua kepala kartu (Dataset saya + Dashboard dibagikan) membungkus dengan jarak baris.
    const heads = out.match(/<div class="[^"]*flex-row flex-wrap[^"]*">/g) ?? [];
    expect(heads).toHaveLength(2);
    for (const h of heads) expect(h).toContain("gap-x-3");
    expect(out).toContain("Dashboard dibagikan ke saya");
  });
});
