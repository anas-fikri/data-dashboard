import { describe, expect, it, vi } from "vitest";
import { filterText, hoursToSeconds, valueText } from "@/components/dashboards/filters/filter-text";
import { slicerModel, type SlicerInput } from "@/components/dashboards/filters/slicer-model";
import { createStaleStore } from "@/components/dashboards/filters/stale-store";

/* T-012 review putaran 3: kunci minimal satu nilai saat mencari, chip durasi ≥ 24 jam, satu pengumuman. */

const CITIES = ["Jakarta", "Bandung", "Surabaya", "Medan", null, "Denpasar"];

const slicer = (over: Partial<SlicerInput>) =>
  slicerModel({
    column: "Cabang",
    value: undefined,
    allMode: false,
    results: CITIES,
    truncated: false,
    searching: false,
    ...over,
  });

describe("mode kecualikan: kunci minimal satu nilai juga saat mencari", () => {
  const fiveOut = { column: "Cabang", op: "not_in" as const, values: CITIES.slice(0, 5) };

  it("cari 'Den' setelah 5 dari 6 dikecualikan → Denpasar tetap terkunci, lepas centang diabaikan", () => {
    const m = slicer({ value: fiveOut, searching: true, results: ["Denpasar"], fullList: CITIES });
    expect(m.isOn("Denpasar")).toBe(true);
    expect(m.lastKept("Denpasar")).toBe(true);
    expect(m.minOne).toBe("Minimal satu nilai harus dipilih.");
    // Tidak pernah menjadi not_in [semua nilai] (0 baris yang tampak seperti "Semua").
    expect(m.toggle("Denpasar")).toEqual(fiveOut);
  });

  it("cari 'lunas' (kedua nilai cocok) dengan satu dikecualikan → yang tersisa terkunci", () => {
    const value = { column: "Status", op: "not_in" as const, values: ["Lunas"] };
    const all = ["Lunas", "Belum lunas"];
    const m = slicer({ column: "Status", value, searching: true, results: all, fullList: all });
    expect(m.lastKept("Belum lunas")).toBe(true);
    expect(m.lastKept("Lunas")).toBe(false);
    expect(m.toggle("Belum lunas")).toEqual(value);
    // Nilai yang dikecualikan tetap bisa dicentang lagi.
    expect(m.toggle("Lunas")).toBeNull();
  });

  it("masih dua yang tercentang saat mencari → tidak ada kunci, lepas centang tetap jalan", () => {
    const value = { column: "Cabang", op: "not_in" as const, values: CITIES.slice(0, 4) };
    const m = slicer({ value, searching: true, results: ["Denpasar"], fullList: CITIES });
    expect(m.lastKept("Denpasar")).toBe(false);
    expect(m.minOne).toBeNull();
    expect(m.toggle("Denpasar")).toEqual({ ...value, values: [...value.values, "Denpasar"] });
  });

  it("nilai dikecualikan yang tidak ada di daftar lengkap (mis. dari URL) tidak ikut dihitung", () => {
    const value = { column: "Cabang", op: "not_in" as const, values: ["Lama", "Jakarta"] };
    const m = slicer({ value, searching: true, results: ["Bandung"], fullList: CITIES });
    expect(m.lastKept("Bandung")).toBe(false);
  });

  it("daftar lengkap belum diketahui (terpotong / belum dimuat) atau mode pilih → tanpa kunci", () => {
    expect(slicer({ value: fiveOut, searching: true, results: ["Denpasar"] }).minOne).toBeNull();
    expect(
      slicer({ value: fiveOut, searching: true, results: ["Denpasar"], fullList: null }).minOne,
    ).toBeNull();
    const pick = slicer({
      value: { column: "Cabang", op: "in", values: ["Denpasar"] },
      searching: true,
      results: ["Denpasar"],
      fullList: CITIES,
    });
    expect(pick.lastKept("Denpasar")).toBe(false);
  });
});

describe("chip durasi ≥ 24 jam = batas yang dikirim", () => {
  it("detik ≠ 0 tetap tampil di atas 24 jam", () => {
    const gte = hoursToSeconds(25.005, "gte");
    expect(gte).toBe(90018);
    expect(filterText({ column: "D", op: "range", gte }, "duration")).toBe("≥ 1 hari 1:00:18");
    expect(filterText({ column: "D", op: "range", gte: 86_401, lte: 90_000 }, "duration")).toBe(
      "1 hari 0:00:01 – 1 hari 1:00:00",
    );
    expect(valueText(-90_018, "duration")).toBe("-1 hari 1:00:18");
  });

  it("≥ 24 jam selalu berdetik (satu bentuk per chip); < 24 jam tidak berubah", () => {
    expect(valueText(90_000, "duration")).toBe("1 hari 1:00:00");
    expect(valueText(86_400, "duration")).toBe("1 hari 0:00:00");
    expect(valueText(86_399, "duration")).toBe("23:59:59");
    expect(filterText({ column: "D", op: "range", lte: 2699 }, "duration")).toBe("≤ 0:44:59");
  });
});

describe("penanda basi: satu hitungan untuk bilah filter", () => {
  it("menghitung kartu basi, memberi tahu hanya saat berubah", () => {
    const store = createStaleStore();
    const listener = vi.fn();
    const off = store.subscribe(listener);
    store.set("a", true);
    store.set("b", true);
    store.set("a", true);
    expect(store.count()).toBe(2);
    expect(listener).toHaveBeenCalledTimes(2);
    store.set("a", false);
    store.set("c", false);
    expect(store.count()).toBe(1);
    expect(listener).toHaveBeenCalledTimes(3);
    off();
    store.set("b", false);
    expect(store.count()).toBe(0);
    expect(listener).toHaveBeenCalledTimes(3);
  });
});
