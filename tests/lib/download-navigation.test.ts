import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DOWNLOAD_NAV_MS,
  markDownloadNavigation,
  takeDownloadNavigation,
  unloadGuard,
} from "@/lib/download-navigation";

/*
 * T-017 (e2e exports.spec.ts, mode edit): unduhan ekspor yang dialihkan 302 lintas origin menjadi
 * navigasi di Chromium dan memicu "Leave site?" editor. Penjaga beforeunload melewati satu peringatan
 * dalam jendela singkat sejak unduhan ditandai; di luar itu peringatan tetap tampil. Review R1 CL-2:
 * penjaga selalu terpasang di mode edit dan memakai tandanya pada beforeunload unduhan itu sendiri,
 * sehingga tanda tidak tertinggal untuk menelan peringatan sungguhan (simpan gagal sesudahnya).
 */
describe("download-navigation", () => {
  beforeEach(() => void takeDownloadNavigation()); // tanda dari tes lain dibuang

  it("jendela tanda 5 detik", () => {
    expect(DOWNLOAD_NAV_MS).toBe(5_000);
  });

  it("tanpa tanda: peringatan tetap (bukan navigasi unduhan)", () => {
    expect(takeDownloadNavigation(1_000)).toBe(false);
  });

  it("ditandai: satu beforeunload dalam jendela dilewati, berikutnya diperingatkan lagi", () => {
    markDownloadNavigation(1_000);
    expect(takeDownloadNavigation(1_000 + DOWNLOAD_NAV_MS - 1)).toBe(true);
    expect(takeDownloadNavigation(1_000 + DOWNLOAD_NAV_MS - 1)).toBe(false);
  });

  it("lewat jendela (server lambat): peringatan tampil seperti biasa", () => {
    markDownloadNavigation(5_000);
    expect(takeDownloadNavigation(5_000 + DOWNLOAD_NAV_MS)).toBe(false);
  });

  it("unduhan berikutnya menandai ulang", () => {
    markDownloadNavigation(0);
    expect(takeDownloadNavigation(1)).toBe(true);
    markDownloadNavigation(2);
    expect(takeDownloadNavigation(3)).toBe(true);
  });
});

describe("unloadGuard (penjaga beforeunload editor)", () => {
  type Save = "saved" | "pending" | "saving" | "error";
  let save: Save;
  const guard = unloadGuard(() => save === "pending" || save === "saving" || save === "error");
  /** Satu beforeunload; true = peringatan "Leave site?" ditampilkan. */
  const unload = () => {
    const e = { preventDefault: vi.fn() };
    guard(e);
    return e.preventDefault.mock.calls.length > 0;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    void takeDownloadNavigation();
  });
  afterEach(() => vi.useRealTimers());

  it("tanpa unduhan: memperingatkan tepat saat ada yang belum tersimpan", () => {
    save = "saved";
    expect(unload()).toBe(false);
    for (const s of ["pending", "saving", "error"] as const) {
      save = s;
      expect(unload()).toBe(true);
    }
  });

  it("tersimpan + unduhan, lalu simpan gagal + muat ulang → peringatan tampil", () => {
    save = "saved";
    markDownloadNavigation(); // unduhan otomatis saat semuanya tersimpan
    expect(unload()).toBe(false); // beforeunload navigasi unduhan memakai tanda
    vi.advanceTimersByTime(2_000);
    save = "error"; // simpan pengaturan widget gagal
    expect(unload()).toBe(true); // muat ulang 2 s kemudian: masih di jendela lama, tetap diperingatkan
  });

  it("tersimpan + unduhan tanpa navigasi (storage satu origin): tanda habis setelah 5 s", () => {
    save = "saved";
    markDownloadNavigation();
    vi.advanceTimersByTime(DOWNLOAD_NAV_MS);
    save = "error";
    expect(unload()).toBe(true);
  });

  it("belum tersimpan + unduhan: beforeunload unduhan dilewati, berikutnya diperingatkan", () => {
    save = "pending";
    markDownloadNavigation();
    expect(unload()).toBe(false);
    vi.advanceTimersByTime(500);
    expect(unload()).toBe(true);
  });
});
