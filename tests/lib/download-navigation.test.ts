import { describe, expect, it } from "vitest";
import {
  DOWNLOAD_NAV_MS,
  markDownloadNavigation,
  takeDownloadNavigation,
} from "@/lib/download-navigation";

/*
 * T-017 (e2e exports.spec.ts, mode edit): unduhan ekspor yang dialihkan 302 lintas origin menjadi
 * navigasi di Chromium dan memicu "Leave site?" editor. Penjaga beforeunload melewati satu peringatan
 * dalam jendela singkat sejak unduhan ditandai; di luar itu peringatan tetap tampil.
 */
describe("download-navigation", () => {
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
