import { describe, expect, it } from "vitest";
import { filterText, PRESET_LABEL } from "@/components/dashboards/filters/filter-text";
import { PRESETS } from "@/components/dashboards/filters/filter-model";
import {
  calendarPeriod,
  periodFilter,
  periodOptions,
} from "@/components/dashboards/filters/period";
import { PRESETS as SERVER_PRESETS } from "@/features/query/filters";

/* T-9gs1: filter dashboard per periode (bulan/kuartal/tahun tertentu) + preset relatif baru. Murni. */
const months = ["2026-03", "2025-12", "2026-01", "2025-11", "2026-02", "2024-07", "rusak"];

describe("periodOptions", () => {
  it("bulan: terbaru dulu, label bahasa sehari-hari; nilai rusak dibuang", () => {
    expect(periodOptions(months, "month").map((o) => [o.value, o.label])).toEqual([
      ["2026-03-01", "Maret 2026"],
      ["2026-02-01", "Februari 2026"],
      ["2026-01-01", "Januari 2026"],
      ["2025-12-01", "Desember 2025"],
      ["2025-11-01", "November 2025"],
      ["2024-07-01", "Juli 2024"],
    ]);
  });

  it("kuartal dan tahun: tanpa kembar, dari bulan yang ada", () => {
    expect(periodOptions(months, "quarter").map((o) => o.label)).toEqual([
      "Kuartal 1 2026",
      "Kuartal 4 2025",
      "Kuartal 3 2024",
    ]);
    expect(periodOptions(months, "year").map((o) => [o.value, o.label])).toEqual([
      ["2026-01-01", "Tahun 2026"],
      ["2025-01-01", "Tahun 2025"],
      ["2024-01-01", "Tahun 2024"],
    ]);
  });
});

describe("periodFilter + calendarPeriod", () => {
  it("rentang [awal, awal berikutnya) dan dikenali kembali; label chip", () => {
    const m = periodFilter("Tanggal", "2026-03-01", "month");
    expect(m).toEqual({ column: "Tanggal", op: "range", gte: "2026-03-01", lt: "2026-04-01" });
    expect(calendarPeriod(m)).toMatchObject({ grain: "month", label: "Maret 2026" });
    const q = periodFilter("Tanggal", "2025-10-01", "quarter");
    expect(q).toMatchObject({ gte: "2025-10-01", lt: "2026-01-01" });
    expect(calendarPeriod(q)).toMatchObject({ grain: "quarter", label: "Kuartal 4 2025" });
    const y = periodFilter("Tanggal", "2025-01-01", "year");
    expect(calendarPeriod(y)).toMatchObject({ grain: "year", label: "Tahun 2025" });
    // Chip bilah filter memakai label periode; rentang lain tetap tanggal.
    expect(filterText(m, "date")).toBe("Maret 2026");
    expect(
      filterText({ column: "Tanggal", op: "range", gte: "2026-03-02", lt: "2026-04-01" }, "date"),
    ).not.toBe("Maret 2026");
  });

  it("bukan periode kalender utuh → null", () => {
    expect(calendarPeriod({ column: "T", op: "range", gte: "2026-03-01", lte: "2026-03-31" })).toBe(
      null,
    );
    expect(calendarPeriod({ column: "T", op: "range", gte: "2026-02-01", lt: "2026-05-01" })).toBe(
      null,
    );
    expect(calendarPeriod({ column: "T", op: "in", values: ["x"] })).toBe(null);
  });
});

describe("preset relatif", () => {
  it("daftar klien = server, semua berlabel", () => {
    expect([...PRESETS]).toEqual([...SERVER_PRESETS]);
    for (const p of PRESETS) expect(PRESET_LABEL[p]).toBeTruthy();
    expect(filterText({ column: "T", op: "preset", preset: "last_month" })).toBe("Bulan lalu");
  });
});
