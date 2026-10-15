import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CanvasToolbar } from "@/components/dashboards/canvas-toolbar";
import {
  ACCESS_CHANGED,
  freezeOf,
  isFrozen,
  type SaveState,
} from "@/components/dashboards/use-dashboard-editor";
import { createAccessGuard } from "@/components/widgets/access-refresh";

/*
 * T-016 pencabutan/penurunan akses di tengah sesi: editor membeku pada FORBIDDEN/NOT_FOUND seperti
 * STALE (tanpa loop "Coba lagi"), dan query widget 404 memuat ulang halaman paling banyak sekali per
 * pemasangan kanvas — bersama untuk semua widget.
 */
describe("editor membeku saat akses edit berubah", () => {
  it("FORBIDDEN (diturunkan jadi viewer) dan NOT_FOUND (dicabut) → denied + pesan akses", () => {
    expect(freezeOf("FORBIDDEN")).toEqual({ state: "denied", message: ACCESS_CHANGED });
    expect(freezeOf("NOT_FOUND")).toEqual({ state: "denied", message: ACCESS_CHANGED });
    expect(ACCESS_CHANGED).toBe("Akses edit Anda berubah. Muat ulang halaman.");
  });

  it("STALE tetap stale (pesan server); galat sementara/validasi tidak membekukan", () => {
    expect(freezeOf("STALE")).toEqual({ state: "stale" });
    for (const code of [
      "INVALID",
      "BUSY",
      "UNAVAILABLE",
      "OFFLINE",
      "RATE_LIMITED",
      "LIMIT_REACHED",
    ]) {
      expect(freezeOf(code)).toBeNull();
    }
  });

  it("isFrozen hanya stale/denied", () => {
    const all: SaveState[] = ["saved", "pending", "saving", "error", "stale", "denied"];
    expect(all.filter(isFrozen)).toEqual(["stale", "denied"]);
  });

  const toolbar = (save: SaveState) =>
    renderToStaticMarkup(
      createElement(CanvasToolbar, {
        save,
        undoKind: "layout",
        adding: false,
        finishing: false,
        onAdd: () => {},
        onUndo: () => {},
        onRetry: () => {},
        onDone: () => {},
      }),
    );

  it("toolbar denied: status akses, tambah/urungkan nonaktif, tanpa 'Coba lagi'", () => {
    const out = toolbar("denied");
    expect(out).toContain("Akses edit berubah.");
    expect(out).not.toContain("Coba lagi");
    expect(out).toContain('data-state="denied"');
    // Tambah widget dan Urungkan: keduanya disabled.
    expect(out.match(/<button[^>]*disabled=""[^>]*>/g)?.length).toBeGreaterThanOrEqual(2);
    expect(toolbar("stale")).toContain("Diubah di tab atau perangkat lain.");
  });
});

describe("query widget 404 → muat ulang halaman sekali", () => {
  it("banyak widget gagal bersamaan → satu refresh; berikutnya diabaikan", () => {
    const refresh = vi.fn();
    const { lost } = createAccessGuard(refresh, ["w1", "w2"]);
    expect(lost("w1")).toBe(true);
    expect(lost("w2")).toBe(false);
    lost();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("pemasangan baru (pindah mode / dashboard lain) punya penjaga sendiri", () => {
    const refresh = vi.fn();
    createAccessGuard(refresh).lost();
    createAccessGuard(refresh).lost();
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
