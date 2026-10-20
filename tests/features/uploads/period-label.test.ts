import { describe, expect, it } from "vitest";
import {
  guessPeriodFromName,
  partsOf,
  startFromParts,
  yearOptions,
} from "@/features/uploads/period-label";

/* T-053 AC 2: pemilih periode terisi dari nama file (hanya saran), sesuai satuan dataset. */
describe("guessPeriodFromName", () => {
  it.each([
    ["laporan_2026-03.xlsx", "2026-03-01"],
    ["laporan 2026_3.csv", "2026-03-01"],
    ["rekap-03-2026.xlsx", "2026-03-01"],
    ["rekap202603.csv", null], // angka menempel ke kata: tidak dianggap tanggal
    ["rekap_202603.csv", "2026-03-01"],
    ["Penjualan Maret 2026.xlsx", "2026-03-01"],
    ["penjualan-mar-2026.xlsx", "2026-03-01"],
    ["Sales_2026_December.xlsx", "2026-12-01"],
    ["data 2026-03-15.csv", "2026-03-01"],
    ["data 15.03.2026.csv", "2026-03-01"],
  ])("bulanan: %s → %s", (name, want) => {
    expect(guessPeriodFromName(name, "MONTH")).toBe(want);
  });

  it("tanpa petunjuk, hanya tahun (bulanan), atau ambigu → tanpa tebakan", () => {
    expect(guessPeriodFromName("data.xlsx", "MONTH")).toBeNull();
    expect(guessPeriodFromName("laporan 2026.xlsx", "MONTH")).toBeNull();
    expect(guessPeriodFromName("2026-02 vs 2026-03.xlsx", "MONTH")).toBeNull();
    expect(guessPeriodFromName("Q1 2026.xlsx", "MONTH")).toBeNull();
    // Tahun di luar rentang wajar bukan petunjuk.
    expect(guessPeriodFromName("kode 0001-03.xlsx", "MONTH")).toBeNull();
    expect(guessPeriodFromName("laporan 2026-13.xlsx", "MONTH")).toBeNull();
  });

  it("kuartal: dari Q/kuartal/triwulan, atau dari bulan", () => {
    expect(guessPeriodFromName("rekap Q2 2026.xlsx", "QUARTER")).toBe("2026-04-01");
    expect(guessPeriodFromName("rekap_2026Q3.csv", "QUARTER")).toBe("2026-07-01");
    expect(guessPeriodFromName("Kuartal 4 2025.xlsx", "QUARTER")).toBe("2025-10-01");
    expect(guessPeriodFromName("tw1-2026.xlsx", "QUARTER")).toBe("2026-01-01");
    expect(guessPeriodFromName("laporan_2026-05.xlsx", "QUARTER")).toBe("2026-04-01");
    expect(guessPeriodFromName("laporan 2026.xlsx", "QUARTER")).toBeNull();
  });

  it("tahunan: tahun dari petunjuk apa pun", () => {
    expect(guessPeriodFromName("laporan 2025.xlsx", "YEAR")).toBe("2025-01-01");
    expect(guessPeriodFromName("laporan_2026-03.xlsx", "YEAR")).toBe("2026-01-01");
    expect(guessPeriodFromName("2024 dan 2025.xlsx", "YEAR")).toBeNull();
  });
});

describe("partsOf / startFromParts", () => {
  it("bolak-balik untuk setiap satuan", () => {
    expect(partsOf("MONTH", "2026-03-01")).toEqual({ year: 2026, sub: 3 });
    expect(partsOf("QUARTER", "2026-07-01")).toEqual({ year: 2026, sub: 3 });
    expect(partsOf("YEAR", "2026-01-01")).toEqual({ year: 2026, sub: null });
    expect(partsOf("MONTH", null)).toEqual({ year: null, sub: null });
    expect(startFromParts("MONTH", { year: 2026, sub: 3 })).toBe("2026-03-01");
    expect(startFromParts("QUARTER", { year: 2026, sub: 3 })).toBe("2026-07-01");
    expect(startFromParts("YEAR", { year: 2026, sub: null })).toBe("2026-01-01");
  });

  it("belum lengkap atau di luar rentang → null (pemilih wajib diisi)", () => {
    expect(startFromParts("MONTH", { year: 2026, sub: null })).toBeNull();
    expect(startFromParts("MONTH", { year: null, sub: 3 })).toBeNull();
    expect(startFromParts("MONTH", { year: 2026, sub: 13 })).toBeNull();
    expect(startFromParts("QUARTER", { year: 2026, sub: 5 })).toBeNull();
    expect(startFromParts("YEAR", { year: 1200, sub: null })).toBeNull();
  });
});

describe("yearOptions", () => {
  const now = new Date(2026, 9, 20);
  it("tahun depan sampai 20 tahun ke belakang, terbaru dulu", () => {
    const ys = yearOptions(now, null);
    expect(ys[0]).toBe(2027);
    expect(ys.at(-1)).toBe(2006);
  });
  it("diperluas agar tahun terpilih selalu ada", () => {
    expect(yearOptions(now, 1995).at(-1)).toBe(1995);
    expect(yearOptions(now, 2030)[0]).toBe(2030);
  });
});
