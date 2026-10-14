import { describe, expect, it } from "vitest";
import { controlSummary } from "@/components/dashboards/filters/filter-control";
import {
  datesReversed,
  filterText,
  hoursToSeconds,
} from "@/components/dashboards/filters/filter-text";
import { slicerModel, type SlicerInput } from "@/components/dashboards/filters/slicer-model";
import type { FilterColumnView } from "@/components/dashboards/filters/filter-model";

/* T-012 review putaran 2: kecualikan semua, durasi detik bulat, urutan tanggal, teks "Kecuali". */

const slicer = (over: Partial<SlicerInput>) =>
  slicerModel({
    column: "Aktif",
    value: undefined,
    allMode: false,
    results: [null, true, false],
    truncated: false,
    searching: false,
    ...over,
  });

describe("mode kecualikan: minimal satu nilai tetap tercentang", () => {
  it("dua dari tiga nilai dikecualikan → centang terakhir dikunci dengan alasan", () => {
    const m = slicer({ value: { column: "Aktif", op: "not_in", values: [null, true] } });
    expect(m.isOn(false)).toBe(true);
    expect(m.lastKept(false)).toBe(true);
    expect(m.lastKept(null)).toBe(false);
    expect(m.minOne).toBe("Minimal satu nilai harus dipilih.");
  });

  it("masih dua yang tercentang → tidak ada yang dikunci", () => {
    const m = slicer({ value: { column: "Aktif", op: "not_in", values: [null] } });
    expect(m.lastKept(true)).toBe(false);
    expect(m.lastKept(false)).toBe(false);
    expect(m.minOne).toBeNull();
  });

  it("daftar belum lengkap (terpotong atau hasil cari) atau mode pilih → tidak dikunci", () => {
    const value = { column: "Aktif", op: "not_in" as const, values: [null, true] };
    expect(slicer({ value, truncated: true }).minOne).toBeNull();
    expect(slicer({ value, searching: true }).minOne).toBeNull();
    const pick = slicer({ value: { column: "Aktif", op: "in", values: [false] } });
    expect(pick.lastKept(false)).toBe(false);
  });

  it("satu-satunya nilai di mode Pilih semua → dikunci", () => {
    const m = slicer({ allMode: true, results: ["Lunas"] });
    expect(m.exclude).toBe(true);
    expect(m.lastKept("Lunas")).toBe(true);
  });
});

describe('teks "Kecuali"', () => {
  const col: FilterColumnView = {
    key: "t\u0000status",
    sheet: "T",
    column: "Status",
    type: "text",
    available: true,
  };
  it("chip dan pemicu memuat nilai yang dikecualikan tanpa awalan panjang", () => {
    const one = { column: "Status", op: "not_in" as const, values: ["Belum lunas"] };
    expect(filterText(one, "text")).toBe("Kecuali Belum lunas");
    expect(controlSummary(col, one)).toBe("Kecuali Belum lunas");
    const two = { ...one, values: ["Belum lunas", "Batal"] };
    expect(controlSummary(col, two)).toBe("Kecuali 2 nilai");
  });
});

describe("filter durasi: detik bulat", () => {
  it("batas jam pecahan → detik bulat ke arah yang aman; chip sama dengan batas", () => {
    // 0,7499 jam = 2699,64 s: ≤ 2699 (0:44:59), bukan ≤ 0:45:00 dengan batas 2699,64.
    expect(hoursToSeconds(0.7499, "lte")).toBe(2699);
    expect(filterText({ column: "D", op: "range", lte: 2699 }, "duration")).toBe("≤ 0:44:59");
    // 0,333 jam = 1198,8 s.
    expect(hoursToSeconds(0.333, "lte")).toBe(1198);
    expect(hoursToSeconds(0.333, "gte")).toBe(1199);
    // Jam yang pas detik bulat tidak bergeser (sisa pecahan biner).
    expect(hoursToSeconds(1.5, "gte")).toBe(5400);
    expect(hoursToSeconds(0.75, "lte")).toBe(2700);
    expect(hoursToSeconds(2699 / 3600, "lte")).toBe(2699);
    expect(hoursToSeconds(1199 / 3600, "gte")).toBe(1199);
    expect(Object.is(hoursToSeconds(-0.0001, "gte"), 0)).toBe(true);
  });
});

describe("rentang tanggal: galat urutan hanya untuk tanggal lengkap", () => {
  it("tahun yang sedang diketik (0202) tidak dianggap terbalik", () => {
    expect(datesReversed("2026-02-01", "0202-04-03")).toBe(false);
    expect(datesReversed("2026-02-01", "2026-01-03")).toBe(true);
    expect(datesReversed("2026-02-01", "2026-02-01")).toBe(false);
    expect(datesReversed("", "2026-01-03")).toBe(false);
  });
});
