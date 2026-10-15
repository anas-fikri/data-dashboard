import { describe, expect, it, vi } from "vitest";
import type { ExportJobRow } from "@/features/exports/job";
import {
  isPdf,
  PDF_TIMEOUT_MESSAGE,
  pdfTooLargeMessage,
  RendererBusyError,
  runPdfJob,
  type PdfJobDeps,
} from "@/features/exports/pdf-job";
import type { RenderClaims } from "@/features/exports/render-token";
import type { RenderResult } from "@/features/exports/renderer-client";
import { FAILED_MESSAGE, RENDERER_UNAVAILABLE_MESSAGE } from "@/features/exports/service";

/*
 * T-018 job PDF di worker (repo/renderer/storage palsu): akses dicek ulang, renderer dicek ulang, token
 * render baru per percobaan, PDF diperiksa (%PDF- + batas) lalu diunggah WORKER ke exports/<user>/<id>.pdf,
 * DONE + jadwal hapus; renderer mati/penuh, PDF rusak/terlalu besar, akses dicabut, dan run tumpang
 * tindih (objek baris DONE tidak dihapus — review T-017 INT-1).
 */

const ID = "cmv4kljx40009oczvdmpuexp0";
const USER = "cmv4kljx40009oczvdmpuvwr0";
const DASH = "cmv4kljx40009oczvdmpurrd0";
const KEY = `exports/${USER}/${ID}.pdf`;
const NOW = new Date("2026-10-16T02:00:00.000Z");
const TTL = 60 * 60 * 1000;
const PDF = new TextEncoder().encode("%PDF-1.7\n1 0 obj\n%%EOF\n");
const F = '{"filters":[{"column":"Cabang","op":"in","values":["Cabang 1"]}]}';

function setup(
  over: {
    row?: Partial<ExportJobRow>;
    role?: "OWNER" | "EDITOR" | "VIEWER" | null;
    healthy?: boolean;
    render?: () => Promise<RenderResult>;
    deps?: Partial<PdfJobDeps>;
  } = {},
) {
  const state: {
    status: ExportJobRow["status"];
    key: string | null;
    failed?: { code: string; message: string };
    done?: { key: string; rows: number | null; bytes: number; expiresAt: Date };
  } = { status: over.row?.status ?? "QUEUED", key: null };
  let exists = true;
  const row: ExportJobRow = {
    id: ID,
    userId: USER,
    dashboardId: DASH,
    widgetId: null,
    format: "PDF",
    status: "QUEUED",
    params: { f: F, requestedAt: "2026-10-16T01:59:00.000Z" },
    fileName: "Penjualan-20261016-0859.pdf",
    key: null,
    title: null,
    ...over.row,
  };
  const repo = {
    load: vi.fn(async () => (exists ? { ...row, status: state.status, key: state.key } : null)),
    start: vi.fn(async () => {
      if (!exists || (state.status !== "QUEUED" && state.status !== "RUNNING")) return false;
      state.status = "RUNNING";
      return true;
    }),
    finish: vi.fn(
      async (
        _id: string,
        d: { key: string; rows: number | null; bytes: number; expiresAt: Date },
      ) => {
        if (!exists || state.status !== "RUNNING") return false;
        state.status = "DONE";
        state.key = d.key;
        state.done = d;
        return true;
      },
    ),
    fail: vi.fn(async (_id: string, code: string, message: string) => {
      if (state.status !== "QUEUED" && state.status !== "RUNNING") return;
      state.status = "FAILED";
      state.failed = { code, message };
    }),
    exists: vi.fn(async () => exists),
    dashboardRole: vi.fn(async () => (over.role === undefined ? "VIEWER" : over.role)),
  };
  const objects = new Map<string, { body: Uint8Array; type: string; cd?: string }>();
  const storage = {
    put: vi.fn(
      async (key: string, body: Uint8Array, type: string, o: { contentDisposition?: string }) => {
        objects.set(key, { body, type, cd: o.contentDisposition });
      },
    ),
    remove: vi.fn(async (key: string) => {
      objects.delete(key);
    }),
  };
  const tokens: RenderClaims[] = [];
  const renderer = {
    health: vi.fn(async () => over.healthy ?? true),
    render: vi.fn(over.render ?? (async (): Promise<RenderResult> => ({ ok: true, pdf: PDF }))),
  };
  const deps: PdfJobDeps = {
    repo,
    renderer,
    mintToken: vi.fn(async (c: RenderClaims) => {
      tokens.push(c);
      return `tok${tokens.length}`.padEnd(43, "x");
    }),
    storage,
    scheduleDelete: vi.fn(async () => {}),
    ttlMs: TTL,
    timeoutMs: 60_000,
    maxBytes: 1024,
    now: () => NOW,
    ...over.deps,
  };
  return {
    deps,
    repo,
    storage,
    renderer,
    state,
    objects,
    tokens,
    gone: () => {
      exists = false;
    },
  };
}

describe("runPdfJob", () => {
  it("sukses: token terikat ekspor, render, unggah exports/<user>/<id>.pdf, DONE + kedaluwarsa + jadwal hapus", async () => {
    const t = setup();
    expect(await runPdfJob(ID, t.deps)).toEqual({ outcome: "done", bytes: PDF.byteLength });
    expect(t.tokens).toEqual([
      {
        exportId: ID,
        userId: USER,
        dashboardId: DASH,
        f: F,
        requestedAt: "2026-10-16T01:59:00.000Z",
      },
    ]);
    expect(t.renderer.render).toHaveBeenCalledWith("tok1".padEnd(43, "x"), {
      timeoutMs: 60_000,
      maxBytes: 1024,
    });
    const obj = t.objects.get(KEY)!;
    expect(obj.type).toBe("application/pdf");
    expect(obj.cd).toBe(
      "attachment; filename=\"Penjualan-20261016-0859.pdf\"; filename*=UTF-8''Penjualan-20261016-0859.pdf",
    );
    expect(t.state.status).toBe("DONE");
    expect(t.state.done).toMatchObject({
      key: KEY,
      rows: null,
      bytes: PDF.byteLength,
      expiresAt: new Date(NOW.getTime() + TTL),
    });
    expect(t.deps.scheduleDelete).toHaveBeenCalledWith(ID, KEY, TTL);
  });

  it("idempoten: DONE/FAILED dilewati tanpa render; bukan PDF/tanpa dashboard → NOT_FOUND", async () => {
    for (const status of ["DONE", "FAILED"] as const) {
      const t = setup({ row: { status } });
      expect(await runPdfJob(ID, t.deps)).toEqual({ outcome: "skipped" });
      expect(t.renderer.render).not.toHaveBeenCalled();
    }
    for (const row of [{ format: "CSV" as const }, { dashboardId: null }]) {
      const t = setup({ row });
      expect(await runPdfJob(ID, t.deps)).toMatchObject({ outcome: "failed", code: "NOT_FOUND" });
      expect(t.renderer.render).not.toHaveBeenCalled();
    }
    const bad = setup({ row: { params: { requestedAt: "kemarin" } } });
    expect(await runPdfJob(ID, bad.deps)).toMatchObject({ outcome: "failed", code: "INVALID" });
  });

  it("akses dicabut setelah permintaan → NOT_FOUND tanpa token/render/unggah", async () => {
    const t = setup({ role: null });
    expect(await runPdfJob(ID, t.deps)).toMatchObject({ outcome: "failed", code: "NOT_FOUND" });
    expect(t.state.failed?.message).toBe(
      "Dashboard tidak ditemukan atau akses ke dashboard sudah dicabut.",
    );
    expect(t.tokens).toEqual([]);
    expect(t.renderer.render).not.toHaveBeenCalled();
    expect(t.storage.put).not.toHaveBeenCalled();
  });

  it("renderer mati saat dicek ulang → RENDERER_UNAVAILABLE tanpa token (tidak diulang)", async () => {
    const t = setup({ healthy: false });
    expect(await runPdfJob(ID, t.deps)).toEqual({
      outcome: "failed",
      code: "RENDERER_UNAVAILABLE",
    });
    expect(t.state.failed).toEqual({
      code: "RENDERER_UNAVAILABLE",
      message: RENDERER_UNAVAILABLE_MESSAGE,
    });
    expect(t.tokens).toEqual([]);
  });

  it("renderer mati di tengah render → RENDERER_UNAVAILABLE; waktu habis → EXPORT_TIMEOUT", async () => {
    const down = setup({
      render: async () => ({ ok: false, code: "RENDERER_UNAVAILABLE", detail: "ECONNREFUSED" }),
    });
    expect(await runPdfJob(ID, down.deps)).toEqual({
      outcome: "failed",
      code: "RENDERER_UNAVAILABLE",
      detail: "ECONNREFUSED",
    });
    expect(down.state.failed?.message).toBe(RENDERER_UNAVAILABLE_MESSAGE);
    const slow = setup({
      render: async () => ({ ok: false, code: "EXPORT_TIMEOUT", detail: "60000 ms" }),
    });
    expect(await runPdfJob(ID, slow.deps)).toMatchObject({ code: "EXPORT_TIMEOUT" });
    expect(slow.state.failed?.message).toBe(PDF_TIMEOUT_MESSAGE);
    expect(slow.storage.put).not.toHaveBeenCalled();
  });

  it("renderer penuh (503) → RendererBusyError dilempar (BullMQ mengulang), baris tetap RUNNING", async () => {
    const t = setup({
      render: async () => ({
        ok: false,
        code: "RENDERER_UNAVAILABLE",
        busy: true,
        detail: "renderer penuh (503)",
      }),
    });
    const err = await runPdfJob(ID, t.deps).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RendererBusyError);
    expect((err as Error).name).toBe("RendererBusyError");
    expect(t.state.status).toBe("RUNNING");
    // Ulangan: token BARU (token lama sudah tidak berlaku).
    await runPdfJob(ID, t.deps).catch(() => {});
    expect(t.deps.mintToken).toHaveBeenCalledTimes(2);
  });

  it("jawaban bukan PDF → EXPORT_FAILED; terlalu besar → EXPORT_TOO_LARGE; tidak ada yang diunggah", async () => {
    const html = setup({
      render: async () => ({ ok: true, pdf: new TextEncoder().encode("<html>bukan pdf") }),
    });
    expect(await runPdfJob(ID, html.deps)).toMatchObject({ code: "EXPORT_FAILED" });
    expect(html.state.failed?.message).toBe(FAILED_MESSAGE);
    const big = setup({ render: async () => ({ ok: true, pdf: new Uint8Array(2048).fill(0x25) }) });
    expect(await runPdfJob(ID, big.deps)).toMatchObject({ code: "EXPORT_TOO_LARGE" });
    const clientCap = setup({
      render: async () => ({ ok: false, code: "EXPORT_TOO_LARGE", detail: "> 1024" }),
    });
    expect(await runPdfJob(ID, clientCap.deps)).toMatchObject({ code: "EXPORT_TOO_LARGE" });
    expect(clientCap.state.failed?.message).toBe(pdfTooLargeMessage(1024));
    for (const t of [html, big, clientCap]) expect(t.storage.put).not.toHaveBeenCalled();
    expect(isPdf(PDF)).toBe(true);
    expect(isPdf(new Uint8Array([0x25, 0x50, 0x44]))).toBe(false);
  });

  it("ekspor dihapus saat render → dilewati tanpa unggah", async () => {
    const t = setup({
      render: async () => {
        t.gone();
        return { ok: true, pdf: PDF };
      },
    });
    expect(await runPdfJob(ID, t.deps)).toEqual({ outcome: "skipped" });
    expect(t.storage.put).not.toHaveBeenCalled();
  });

  it("tumpang tindih: run kalah (baris sudah DONE oleh run lain) tidak menghapus objek baris DONE", async () => {
    const t = setup();
    // Run A selesai lebih dulu SAAT run B sedang render (keduanya RUNNING sebelumnya).
    t.renderer.render.mockImplementationOnce(async () => {
      t.state.status = "DONE";
      t.state.key = KEY;
      return { ok: true, pdf: PDF };
    });
    expect(await runPdfJob(ID, t.deps)).toEqual({ outcome: "skipped" });
    expect(t.storage.put).toHaveBeenCalledTimes(1);
    expect(t.storage.remove).not.toHaveBeenCalled();
    expect(t.objects.has(KEY)).toBe(true);
  });

  it("finish gagal karena baris hilang → objek yang baru diunggah dihapus", async () => {
    const t = setup();
    t.repo.finish.mockImplementationOnce(async () => {
      t.gone();
      return false;
    });
    expect(await runPdfJob(ID, t.deps)).toEqual({ outcome: "skipped" });
    expect(t.storage.remove).toHaveBeenCalledWith(KEY);
    expect(t.objects.has(KEY)).toBe(false);
  });

  it("unggah gagal → galat dilempar (BullMQ mengulang), tidak ada DONE", async () => {
    const t = setup({
      deps: {
        storage: {
          put: vi.fn(async () => {
            throw new Error("S3 503");
          }),
          remove: vi.fn(async () => {}),
        },
      },
    });
    await expect(runPdfJob(ID, t.deps)).rejects.toThrow("S3 503");
    expect(t.state.status).toBe("RUNNING");
  });
});
