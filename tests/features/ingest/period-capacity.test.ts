import { describe, expect, it } from "vitest";
import {
  capacityMeterLine,
  capacityProjectionText,
  compactCount,
  initPeriodRejection,
  periodCapacity,
  uploadEstimate,
  type CapacitySheet,
} from "@/features/ingest/period-capacity";
import type { OnLimit, PeriodLimits } from "@/features/ingest/period-plan";

/*
 * T-055 (rencana G-6 §5.1, §5.4): meter + proyeksi kapasitas data aktif, perkiraan dari ukuran file
 * saat init (hanya peringatan), dan penolakan pasti saat init untuk unggahan label (batas periode).
 */

const GiB = 1024 ** 3;
const LIMITS: PeriodLimits = {
  keepDefault: 24,
  keepMax: 60,
  sheetMaxRows: 10_000_000,
  datasetMaxBytes: 16 * GiB,
  sheetMaxSegments: 120,
  shrinkConfirmPct: 50,
  strayPct: 10,
  warnPct: 80,
};

const monthStart = (i: number) => {
  const y = 2024 + Math.floor(i / 12);
  return `${y}-${String((i % 12) + 1).padStart(2, "0")}-01`;
};

/** n bulan berurutan mulai Jan 2024; rows/bytes per bulan. */
const sheet = (
  n: number,
  rows: number,
  bytes: number,
  lineageId = "l1",
  name = "Pengiriman",
): CapacitySheet => ({
  lineageId,
  name,
  segments: Array.from({ length: n }, (_, i) => ({
    periodKey: monthStart(i).slice(0, 7),
    periodStart: monthStart(i),
    rows,
    bytes,
  })),
});

const cap = (
  sheets: CapacitySheet[],
  keepPeriods: number | null = null,
  onLimit: OnLimit = "REJECT",
) => periodCapacity({ grain: "MONTH", sheets, settings: { keepPeriods, onLimit }, limits: LIMITS });

describe("AC3: meter dan proyeksi kapasitas", () => {
  it("contoh rencana: '18 dari 24 periode · 8,2 jt dari 10 jt baris · 11,3 dari 16 GB'", () => {
    const c = cap([sheet(18, 455_556, Math.round((11.3 * GiB) / 18))]);
    expect(c.periods).toBe(18);
    // Baris 82% ≥ 80% → peringatan (periode 75% belum).
    expect(c.warn).toBe(true);
    expect(c.usage.find((u) => u.limit === "periods")).toMatchObject({ warn: false });
    expect(c.usage.find((u) => u.limit === "sheetRows")).toMatchObject({ warn: true });
    expect(capacityMeterLine(c)).toBe(
      "18 dari 24 periode · 8,2 jt dari 10 jt baris · 11,3 dari 16 GB",
    );
  });

  it("proyeksi jujur: 1,0 jt baris per bulan → ±10 bulan, sisa unggahan, akibat REJECT/EVICT", () => {
    const c = cap([sheet(8, 1_000_000, GiB / 2)]);
    expect(c.projection).toMatchObject({ capacity: 10, binding: "sheetRows", remaining: 2 });
    expect(capacityProjectionText(c)).toBe(
      "Dengan rata-rata 1,0 jt baris per bulan, dataset ini menyimpan ±10 bulan. ±2 unggahan bulan baru lagi akan menyentuh batas; setelah itu periode baru berikutnya ditolak sampai periode lama dihapus.",
    );
    const full = cap([sheet(3, 100, 1000)], 3, "EVICT_OLDEST");
    expect(full.warn).toBe(true);
    expect(capacityProjectionText(full)).toBe(
      "Dengan rata-rata 100 baris per bulan, dataset ini menyimpan ±3 bulan (batas simpan periode). Batas sudah tercapai: periode baru berikutnya akan melepas bulan terlama (selalu ditinjau dulu).",
    );
    expect(capacityMeterLine(full)).toBe(
      "3 dari 3 periode · 300 dari 10 jt baris · 0,0 dari 16 GB",
    );
  });

  it("dua sheet: sheet terberat disebut; di bawah ambang tidak ada peringatan", () => {
    const c = cap([
      sheet(10, 900_000, 1000, "l1", "Pengiriman"),
      sheet(10, 10, 1000, "l2", "Retur"),
    ]);
    expect(c.warn).toBe(true);
    expect(capacityMeterLine(c)).toContain("9,0 jt dari 10 jt baris (sheet “Pengiriman”)");
    expect(capacityProjectionText(c)).toContain("per bulan (sheet “Pengiriman”)");
    expect(cap([sheet(3, 100, 1000)]).warn).toBe(false);
  });

  it("angka ringkas", () => {
    expect(compactCount(12_950)).toBe("12.950");
    expect(compactCount(1_000_000)).toBe("1,0 jt");
    expect(compactCount(8_200_000)).toBe("8,2 jt");
    expect(compactCount(10_000_000)).toBe("10 jt");
    expect(compactCount(14_200_000)).toBe("14,2 jt");
  });
});

describe("AC3: perkiraan saat init (hanya peringatan)", () => {
  const est = (
    c: ReturnType<typeof cap>,
    fileBytes: number,
    bytesPerRow: number | null,
    newPeriod: boolean | null = null,
  ) =>
    uploadEstimate({
      capacity: c,
      limits: LIMITS,
      fileBytes,
      bytesPerRow,
      parquetRatio: 1.2,
      newPeriod,
    });

  it("file sendiri melebihi batas baris → 'Perkiraan ±14 jt baris …, kemungkinan ditolak'", () => {
    const e = est(cap([sheet(3, 100, 1000)]), 1_400_000_000, 100);
    expect(e).toMatchObject({ rows: 14_000_000, likely: "TOO_LARGE" });
    expect(e!.message).toBe(
      "Perkiraan ±14 jt baris dari ukuran file, melebihi batas 10 jt baris per sheet: kemungkinan ditolak. Ini hanya perkiraan; batas diperiksa pasti setelah file dibaca.",
    );
  });

  it("data sesudahnya melewati batas: REJECT vs EVICT_OLDEST; periode label yang diganti tidak menambah periode", () => {
    const rej = est(cap([sheet(3, 100, 1000)], 3), 10_000, 100);
    expect(rej).toMatchObject({ likely: "REJECT" });
    expect(rej!.message).toContain("kemungkinan ditolak kecuali file ini hanya mengganti periode");
    expect(est(cap([sheet(3, 100, 1000)], 3), 10_000, 100, true)!.message).toContain(
      ": kemungkinan ditolak. Ini hanya perkiraan",
    );
    expect(est(cap([sheet(3, 100, 1000)], 3, "EVICT_OLDEST"), 10_000, 100)).toMatchObject({
      likely: "EVICT",
    });
    // Mengganti periode label yang ada: hanya dicek apakah file sendiri terlalu besar; masih ≥ 80%.
    expect(est(cap([sheet(3, 100, 1000)], 3), 10_000, 100, false)).toMatchObject({ likely: null });
    // Baris: 9 jt aktif + ±2 jt dari file > 10 jt.
    expect(est(cap([sheet(9, 1_000_000, 1000)]), 200_000_000, 100)).toMatchObject({
      rows: 2_000_000,
      likely: "REJECT",
    });
  });

  it("tanpa riwayat file sejenis: perkiraan byte saja; tanpa masalah dan di bawah ambang → null", () => {
    const e = est(cap([sheet(3, 100, (15 * GiB) / 3)]), GiB, null);
    expect(e).toMatchObject({ rows: null, likely: "REJECT" });
    expect(e!.message).toMatch(/^Perkiraan ±1,2 GB setelah diproses: kemungkinan ditolak/);
    expect(est(cap([sheet(3, 100, 1000)]), 10_000, 100)).toBeNull();
  });
});

describe("penegakan saat init: unggahan label yang pasti melewati batas periode", () => {
  const reject = (
    label: string,
    keepPeriods: number,
    onLimit: OnLimit,
    sheets = [sheet(3, 100, 1000)],
  ) =>
    initPeriodRejection({
      grain: "MONTH",
      sheets,
      label,
      settings: { keepPeriods, onLimit },
      limits: LIMITS,
    });

  it("REJECT: periode baru saat jendela penuh → ditolak dengan nama periode dan yang harus dihapus", () => {
    expect(reject("2024-04-01", 3, "REJECT")).toBe(
      'Menyimpan April 2024 akan melewati batas simpan 3 periode. Hapus periode Januari 2024 dulu, atau ubah pengaturan "Saat batas tercapai".',
    );
  });

  it("EVICT_OLDEST: periode baru boleh (tinjauan); periode lebih tua dari tertua → di luar jendela", () => {
    expect(reject("2024-04-01", 3, "EVICT_OLDEST")).toBeNull();
    expect(reject("2023-12-01", 3, "EVICT_OLDEST")).toMatch(
      /^Periode Desember 2023 di luar batas simpan 3 periode/,
    );
  });

  it("mengganti periode yang ada atau jendela belum penuh → tidak ditolak di init", () => {
    expect(reject("2024-02-01", 3, "REJECT")).toBeNull();
    expect(reject("2024-04-01", 4, "REJECT")).toBeNull();
    expect(reject("2024-04-01", 3, "REJECT", [])).toBeNull();
  });
});
