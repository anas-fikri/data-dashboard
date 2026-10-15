import { describe, expect, it, vi } from "vitest";
import type { AuditEntry } from "@/features/audit/service";
import { RULES } from "@/features/auth/rate-limit";
import { rendererClient } from "@/features/exports/renderer-client";
import {
  BUSY_MESSAGE,
  createPdfExport,
  downloadExport,
  EXPORT_STATUS,
  RENDERER_UNAVAILABLE_MESSAGE,
  type ExportRepo,
  type ExportRow,
  type NewExport,
  type PdfDashboard,
  type PdfExportDeps,
} from "@/features/exports/service";
import { DASH, EDITOR, OWNER, ROLES, STRANGER, VIEWER } from "./fixtures";

/*
 * T-018 POST /api/exports format "pdf": semua peran yang bisa melihat dashboard boleh (viewer juga),
 * orang lain 404; renderer mati → 503 RENDERER_UNAVAILABLE dalam anggaran cek (tanpa baris, AC3); filter
 * divalidasi + disaring terhadap dashboard; batas berjalan bersama CSV/XLSX; unduh PDF → AuditLog
 * dashboard.export + application/pdf.
 */

const NOW = new Date("2026-10-15T17:30:00.000Z"); // 16 Okt 00:30 WIB
const W1 = "cmv4kljx40009oczvdmpuwid1";
const W2 = "cmv4kljx40009oczvdmpuwid2";

const DASHBOARD: PdfDashboard = {
  id: DASH,
  name: "Penjualan / Q1",
  filterColumns: [
    { key: "s\u0000cabang", sheet: "S", column: "Cabang", type: "text", available: true },
  ],
  crossFilterColumns: ["Kota"],
  widgets: [
    { id: W1, type: "kpi", title: "Total", spec: {} },
    { id: W2, type: "bar", title: "Per kota", spec: {} },
  ],
};

function makeDeps(over: Partial<PdfExportDeps> = {}, dash: PdfDashboard = DASHBOARD) {
  const created: (NewExport & { id: string })[] = [];
  let n = 0;
  const repo = {
    createIfRoom: vi.fn(async (input: NewExport, max: number) => {
      if (created.length >= max) return null;
      const id = `cmv4kljx40009oczvdmpunew${n++}`;
      created.push({ ...input, id });
      return { id };
    }),
    fail: vi.fn(async () => {}),
  } satisfies PdfExportDeps["repo"];
  const deps: PdfExportDeps = {
    repo,
    dashboard: vi.fn(async (userId: string, id: string) =>
      id === DASH && ROLES[userId] ? dash : null,
    ),
    rendererHealth: vi.fn(async () => true),
    enqueue: vi.fn(async () => {}),
    rateLimit: vi.fn(async () => ({ allowed: true, remaining: 9, retryAfterSec: 600 })),
    now: () => NOW,
    ...over,
  };
  return { deps, repo, created };
}

describe("createPdfExport", () => {
  it("pemilik, editor, viewer → baris PDF tanpa widget + antrean pdf; orang lain → 404 tanpa baris", async () => {
    for (const user of [OWNER, EDITOR, VIEWER]) {
      const t = makeDeps();
      const r = await createPdfExport(user, { dashboardId: DASH, format: "pdf" }, t.deps);
      expect(r).toEqual({ ok: true, exportId: t.created[0]!.id });
      expect(t.deps.enqueue).toHaveBeenCalledWith(t.created[0]!.id);
      expect(t.created[0]).toEqual({
        id: t.created[0]!.id,
        userId: user,
        dashboardId: DASH,
        widgetId: null,
        format: "PDF",
        params: { requestedAt: NOW.toISOString() },
        fileName: "Penjualan Q1-20261016-0030.pdf",
      });
    }
    const t = makeDeps();
    expect(await createPdfExport(STRANGER, { dashboardId: DASH, format: "pdf" }, t.deps)).toEqual({
      ok: false,
      code: "NOT_FOUND",
      message: "Dashboard tidak ditemukan.",
    });
    expect(t.created).toEqual([]);
    expect(t.deps.rendererHealth).not.toHaveBeenCalled();
    expect(t.deps.enqueue).not.toHaveBeenCalled();
  });

  it("renderer mati → 503 RENDERER_UNAVAILABLE dalam anggaran cek, tanpa baris/antrean (AC3)", async () => {
    const hanging = vi.fn(
      (_u: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_, reject) =>
          init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)),
        ),
    );
    const client = rendererClient({
      url: "http://127.0.0.1:3200",
      secret: "s".repeat(43),
      fetch: hanging,
    });
    const t = makeDeps({ rendererHealth: () => client.health(200) });
    const t0 = performance.now();
    const r = await createPdfExport(VIEWER, { dashboardId: DASH, format: "pdf" }, t.deps);
    expect(performance.now() - t0).toBeLessThan(1_500);
    expect(r).toEqual({
      ok: false,
      code: "RENDERER_UNAVAILABLE",
      message: RENDERER_UNAVAILABLE_MESSAGE,
    });
    expect(EXPORT_STATUS.RENDERER_UNAVAILABLE).toBe(503);
    expect(t.created).toEqual([]);
    expect(t.deps.enqueue).not.toHaveBeenCalled();
    // Renderer tidak dikonfigurasi juga RENDERER_UNAVAILABLE.
    const none = makeDeps({ rendererHealth: () => rendererClient({}).health() });
    expect(
      await createPdfExport(OWNER, { dashboardId: DASH, format: "pdf" }, none.deps),
    ).toMatchObject({ ok: false, code: "RENDERER_UNAVAILABLE" });
  });

  it("filter: divalidasi lalu disaring terhadap dashboard; yang tersisa disimpan di params", async () => {
    const t = makeDeps();
    const f = JSON.stringify({
      filters: [
        { column: "cabang", op: "in", values: ["Cabang 1", "Cabang 1"] },
        { column: "Rahasia", op: "in", values: ["x"] },
      ],
      cross: { widgetId: W2, filter: { column: "Kota", op: "in", values: ["Bandung"] } },
    });
    await createPdfExport(VIEWER, { dashboardId: DASH, format: "pdf", f }, t.deps);
    expect(JSON.parse((t.created[0]!.params as { f: string }).f)).toEqual({
      filters: [{ column: "Cabang", op: "in", values: ["Cabang 1"] }],
      cross: { widgetId: W2, filter: { column: "Kota", op: "in", values: ["Bandung"] } },
    });
    // Semua filter terbuang → tanpa f; f null/kosong → tanpa f.
    for (const ff of [
      JSON.stringify({ filters: [{ column: "X", op: "in", values: [1] }] }),
      null,
      "",
    ]) {
      const u = makeDeps();
      await createPdfExport(VIEWER, { dashboardId: DASH, format: "pdf", f: ff }, u.deps);
      expect(u.created[0]!.params).toEqual({ requestedAt: NOW.toISOString() });
    }
  });

  it("body strict + filter rusak → INVALID 400 tanpa baris; dashboard tanpa widget → INVALID", async () => {
    const t = makeDeps();
    for (const body of [
      { dashboardId: DASH, format: "pdf", url: "http://evil.example" },
      { dashboardId: DASH, format: "pdf", widgetId: "cmv4kljx40009oczvdmpuwid1" },
      { dashboardId: "../x", format: "pdf" },
      { dashboardId: DASH, format: "PDF" },
      { dashboardId: DASH, format: "pdf", f: "{rusak" },
      { dashboardId: DASH, format: "pdf", f: JSON.stringify({ filters: "semua" }) },
      { dashboardId: DASH, format: "pdf", f: "x".repeat(60_001) },
      { dashboardId: DASH, format: "pdf", f: 42 },
    ]) {
      expect(await createPdfExport(OWNER, body, t.deps)).toMatchObject({
        ok: false,
        code: "INVALID",
      });
    }
    expect(t.created).toEqual([]);
    const empty = makeDeps({}, { ...DASHBOARD, widgets: [] });
    expect(
      await createPdfExport(OWNER, { dashboardId: DASH, format: "pdf" }, empty.deps),
    ).toMatchObject({ ok: false, code: "INVALID" });
    expect(empty.created).toEqual([]);
  });

  it("rate limit RULES.exportPdf 10/10 menit → 429 + retryAfter, sebelum apa pun", async () => {
    expect(RULES.exportPdf).toEqual({ name: "export-pdf:user", limit: 10, windowSec: 600 });
    const t = makeDeps({
      rateLimit: vi.fn(async () => ({ allowed: false, remaining: 0, retryAfterSec: 321 })),
    });
    expect(await createPdfExport(OWNER, { dashboardId: DASH, format: "pdf" }, t.deps)).toEqual({
      ok: false,
      code: "RATE_LIMITED",
      message: "Terlalu banyak permintaan ekspor PDF. Coba lagi dalam 321 detik.",
      retryAfterSec: 321,
    });
    expect(t.deps.dashboard).not.toHaveBeenCalled();
    expect(t.deps.rendererHealth).not.toHaveBeenCalled();
  });

  it("batas 2 ekspor berjalan → EXPORT_BUSY; enqueue gagal → baris digagalkan lalu galat dilempar", async () => {
    const t = makeDeps();
    for (let i = 0; i < 2; i++) {
      await createPdfExport(OWNER, { dashboardId: DASH, format: "pdf" }, t.deps);
    }
    expect(await createPdfExport(OWNER, { dashboardId: DASH, format: "pdf" }, t.deps)).toEqual({
      ok: false,
      code: "EXPORT_BUSY",
      message: BUSY_MESSAGE,
    });
    const u = makeDeps({
      enqueue: vi.fn(async () => {
        throw new Error("redis mati");
      }),
    });
    await expect(
      createPdfExport(OWNER, { dashboardId: DASH, format: "pdf" }, u.deps),
    ).rejects.toThrow("redis mati");
    expect(u.repo.fail).toHaveBeenCalledWith(u.created[0]!.id, "UNAVAILABLE", expect.any(String));
  });
});

describe("downloadExport PDF", () => {
  const ID = "cmv4kljx40009oczvdmpuexp0";
  const row: ExportRow = {
    id: ID,
    userId: VIEWER,
    dashboardId: DASH,
    widgetId: null,
    format: "PDF",
    status: "DONE",
    errorCode: null,
    errorMessage: null,
    key: `exports/${VIEWER}/${ID}.pdf`,
    fileName: "Penjualan Q1-20261016-0030.pdf",
    rows: null,
    finishedAt: NOW,
    expiresAt: new Date(NOW.getTime() + 50 * 60 * 1000),
    deletedAt: null,
  };
  function deps() {
    const audits: AuditEntry[] = [];
    const repo = {
      createIfRoom: vi.fn(),
      findOwned: vi.fn(async (u: string, id: string) =>
        u === row.userId && id === row.id ? row : null,
      ),
      fail: vi.fn(),
      widgetTitle: vi.fn(),
      dashboardRole: vi.fn(async (u: string) => ROLES[u] ?? null),
      audit: vi.fn(async (e: AuditEntry) => {
        audits.push(e);
      }),
    } satisfies ExportRepo;
    const presign = vi.fn(async (key: string) => `http://localhost:9100/b/${key}`);
    return {
      audits,
      presign,
      d: {
        repo,
        presign,
        downloadRateLimit: async () => ({ allowed: true, remaining: 59, retryAfterSec: 600 }),
        now: () => NOW,
      },
    };
  }

  it("pemilik → presigned application/pdf attachment + AuditLog dashboard.export tanpa nilai filter", async () => {
    const t = deps();
    const r = await downloadExport(VIEWER, ID, "10.1.2.3", t.d);
    expect(r).toEqual({ ok: true, url: `http://localhost:9100/b/${row.key}` });
    expect(t.presign).toHaveBeenCalledWith(row.key, {
      expiresIn: 300,
      contentType: "application/pdf",
      contentDisposition:
        "attachment; filename=\"Penjualan Q1-20261016-0030.pdf\"; filename*=UTF-8''Penjualan%20Q1-20261016-0030.pdf",
    });
    expect(t.audits).toEqual([
      {
        actorId: VIEWER,
        action: "dashboard.export",
        targetType: "dashboard",
        targetId: DASH,
        meta: { exportId: ID, format: "pdf", role: "VIEWER" },
        ip: "10.1.2.3",
      },
    ]);
  });

  it("orang lain → 404 tanpa presign/audit", async () => {
    const t = deps();
    expect(await downloadExport(OWNER, ID, "ip", t.d)).toMatchObject({ code: "NOT_FOUND" });
    expect(t.presign).not.toHaveBeenCalled();
    expect(t.audits).toEqual([]);
  });
});
