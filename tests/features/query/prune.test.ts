import { describe, expect, it } from "vitest";
import { PERIOD_COLUMN } from "@/features/query/period-column";
import { fullIso, pruneSource, segmentExcluded } from "@/features/query/prune";
import type { DashClause } from "@/features/query/filters";
import type { SegmentFile } from "@/features/query/source";
import type { PlanFilter } from "@/features/query/spec";

/* T-058: pemangkasan segmen — hanya segmen yang PASTI di luar filter yang dibuang. Murni. */
const P = `c${PERIOD_COLUMN}`;
const seg = (start: string, min?: string, max?: string): SegmentFile => ({
  typedKey: `seg-${start}`,
  legacyRow: false,
  columns: [1, 2, 3],
  period: { key: start.slice(0, 7), start, min: min ?? null, max: max ?? null },
});
const JAN = seg("2026-01-01", "2026-01-03T00:00:00", "2026-01-31T23:59:59");
const FEB = seg("2026-02-01", "2026-02-01T08:00:00", "2026-02-27T10:00:00");
const MAR = seg("2026-03-01", "2026-03-01T00:00:00", "2026-03-31T00:00:00");
const base = { float: false } as const;
const sys = (o: Partial<DashClause>): DashClause =>
  ({ ...base, col: P, type: "date", ...o }) as DashClause;
const ts = (o: Partial<DashClause>): DashClause =>
  ({ ...base, col: "c3", type: "timestamp", ...o }) as DashClause;
const src = (column: number | null, files = [JAN, FEB, MAR]) => ({
  files,
  schema: [],
  period: { column },
});
const keys = (s: ReturnType<typeof pruneSource>) =>
  typeof s === "string" ? [s] : s.files.map((f) => f.typedKey);

describe("fullIso", () => {
  it("tanggal saja = tengah malam; HH:MM dilengkapi detik; bentuk lain null", () => {
    expect(fullIso("2026-03-01")).toBe("2026-03-01T00:00:00");
    expect(fullIso("2026-03-01 10:15")).toBe("2026-03-01T10:15:00");
    expect(fullIso("Maret")).toBeNull();
  });
});

describe("pruneSource — kolom sistem Periode", () => {
  it("in [Feb] → hanya segmen Februari disewa", () => {
    const s = pruneSource(src(null), { clauses: [sys({ op: "in", values: ["2026-02-01"] })] });
    expect(keys(s)).toEqual(["seg-2026-02-01"]);
  });

  it("rentang 15 Jan–1 Mar (inklusif) → Feb + Mar; Jan (awal 1 Jan < 15 Jan) dibuang", () => {
    const s = pruneSource(src(null), {
      clauses: [sys({ op: "range", gte: "2026-01-15", lte: "2026-03-01" })],
    });
    expect(keys(s)).toEqual(["seg-2026-02-01", "seg-2026-03-01"]);
  });

  it("lt eksklusif: < 1 Mar membuang Maret", () => {
    const s = pruneSource(src(null), {
      clauses: [sys({ op: "range", lt: "2026-03-01T00:00:00" })],
    });
    expect(keys(s)).toEqual(["seg-2026-01-01", "seg-2026-02-01"]);
  });

  it("(Kosong) di daftar nilai, not_in, kolom lain → tidak memangkas", () => {
    for (const cl of [
      sys({ op: "in", values: ["2026-02-01", null] }),
      sys({ op: "not_in", values: ["2026-02-01"] }),
      { ...base, col: "c1", type: "text", op: "in", values: ["x"] } as DashClause,
    ]) {
      expect(keys(pruneSource(src(null), { clauses: [cl] }))).toHaveLength(3);
    }
  });

  it("semua terbuang → segmen pertama tetap (hasil tetap kosong lewat WHERE)", () => {
    const s = pruneSource(src(null), { clauses: [sys({ op: "in", values: ["2027-01-01"] })] });
    expect(keys(s)).toEqual(["seg-2026-01-01"]);
  });
});

describe("pruneSource — kolom periode sumber KOLOM (min/max aktual)", () => {
  it("rentang waktu memakai min/max aktual, bukan batas periode", () => {
    // 27 Feb 10:00 s.d. sebelum 1 Mar: Januari dan Maret pasti di luar; Februari (max tepat 10:00:00) tidak.
    const s = pruneSource(src(3), {
      clauses: [ts({ op: "range", gte: "2026-02-27T10:00:00", lt: "2026-03-01T00:00:00" })],
    });
    // Feb max = 27 Feb 10:00:00 tepat → masih mungkin cocok (batas atas eksklusif + 1 detik).
    expect(keys(s)).toEqual(["seg-2026-02-01"]);
  });

  it("pecahan detik yang terpotong tidak membuang segmen (batas atas = detik sesudahnya)", () => {
    const f = seg("2026-02-01", "2026-02-01T00:00:00", "2026-02-27T10:00:00");
    // Nilai aktual bisa 10:00:00.4 (presisi µs) — filter > 10:00:00 harus mempertahankan segmen.
    const gt: PlanFilter = {
      col: "c3",
      type: "timestamp",
      op: "gt",
      values: ["2026-02-27T10:00:00"],
    };
    expect(segmentExcluded(f, 3, { filters: [gt] })).toBe(false);
    const gte: PlanFilter = { ...gt, op: "gte", values: ["2026-02-27T10:00:01"] };
    expect(segmentExcluded(f, 3, { filters: [gte] })).toBe(true);
  });

  it("tanggal saja pada kolom waktu = sehari penuh (in)", () => {
    expect(segmentExcluded(FEB, 3, { clauses: [ts({ op: "in", values: ["2026-02-27"] })] })).toBe(
      false,
    );
    expect(segmentExcluded(FEB, 3, { clauses: [ts({ op: "in", values: ["2026-02-28"] })] })).toBe(
      true,
    );
  });

  it("filter rencana (query bebas): between/eq/lt pada kolom periode", () => {
    const f = (op: PlanFilter["op"], values: string[]): PlanFilter => ({
      col: "c3",
      type: "timestamp",
      op,
      values,
    });
    const kept = (pf: PlanFilter) => keys(pruneSource(src(3), { filters: [pf] }));
    expect(kept(f("between", ["2026-02-10", "2026-02-20"]))).toEqual(["seg-2026-02-01"]);
    expect(kept(f("lt", ["2026-02-01T08:00:00"]))).toEqual(["seg-2026-01-01"]);
    expect(kept(f("eq", ["2026-03-31T00:00:00"]))).toEqual(["seg-2026-03-01"]);
  });

  it("kolom DATE dengan nilai berjam di filter rencana → tidak dipangkas (ragu = pertahankan)", () => {
    const pf: PlanFilter = { col: "c3", type: "date", op: "eq", values: ["2026-02-10T10:00"] };
    expect(keys(pruneSource(src(3), { filters: [pf] }))).toHaveLength(3);
  });
});

describe("pruneSource — sheet berlabel (T-054: min/max = kolom acuan, bukan periode)", () => {
  it("filter kolom tanggal biasa tidak memangkas walau min/max segmen tersedia", () => {
    const s = pruneSource(src(null), {
      clauses: [ts({ op: "range", gte: "2026-03-01T00:00:00" })],
    });
    expect(keys(s)).toHaveLength(3);
  });

  it("filter Periode tetap memakai periodStart", () => {
    const s = pruneSource(src(null), { clauses: [sys({ op: "range", gte: "2026-03-01" })] });
    expect(keys(s)).toEqual(["seg-2026-03-01"]);
  });
});

describe("pruneSource — bukan sheet periode", () => {
  it("kunci tunggal / daftar segmen tanpa period → sumber yang sama", () => {
    expect(pruneSource("k", { clauses: [sys({ op: "in", values: ["2026-02-01"] })] })).toBe("k");
    const plain = { files: [JAN, FEB], schema: [] };
    expect(pruneSource(plain, { clauses: [sys({ op: "in", values: ["2026-02-01"] })] })).toBe(
      plain,
    );
  });
});
