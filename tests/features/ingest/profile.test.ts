import { describe, expect, it } from "vitest";
import { toProfile } from "@/features/ingest/infer";
import {
  mergeProfiles,
  packProfile,
  PROFILE_VERSION,
  unpackProfile,
  type RawProfile,
} from "@/features/ingest/profile";

/* Profil raw tersimpan per file typed segmen (T-040). */
const raw = (rows: number, cols: Record<string, Record<string, unknown>>): RawProfile => ({
  dataRows: rows,
  profiles: new Map(Object.entries(cols).map(([col, r]) => [col, toProfile({ col, ...r })])),
});

describe("profil raw segmen", () => {
  it("pack → unpack mengembalikan profil yang sama; hanya field ≠ 0 disimpan", () => {
    const p = raw(10, { c1: { n: 8, distinct_n: 3, chars: 40, int_us: 8, d_f0: 2 }, c2: { n: 1 } });
    const stored = packProfile(1, p);
    expect(stored.cols.c1).toEqual({
      n: 8,
      distinct: 3,
      chars: 40,
      intUs: 8,
      date: { "yyyy-mm-dd": 2 },
    });
    expect(stored.cols.c2).toEqual({ n: 1 });
    expect(unpackProfile(JSON.parse(JSON.stringify(stored)), 1)).toEqual(p);
  });

  it("baris judul lain, bentuk SQL lain, atau rusak → null (dihitung ulang dari raw)", () => {
    const stored = packProfile(1, raw(3, { c1: { n: 3 } }));
    expect(unpackProfile(stored, 2)).toBeNull();
    expect(unpackProfile({ ...stored, v: "lama" }, 1)).toBeNull();
    expect(unpackProfile({ ...stored, dataRows: "3" }, 1)).toBeNull();
    expect(unpackProfile(null, 1)).toBeNull();
    expect(PROFILE_VERSION).toMatch(/^[0-9a-f]{16}$/);
  });

  it("gabungan segmen: hitungan dijumlah (kolom yang tidak ada di segmen tidak menyumbang), unik dibatasi n", () => {
    const m = mergeProfiles([
      raw(5, { c1: { n: 5, distinct_n: 5, wide_us: 0, t_f0: 1 } }),
      raw(7, { c1: { n: 2, distinct_n: 2, wide_us: 1 }, c2: { n: 7, distinct_n: 9 } }),
    ]);
    expect(m.dataRows).toBe(12);
    expect(m.profiles.get("c1")).toMatchObject({ n: 7, distinct: 7, wideUs: 1 });
    expect(m.profiles.get("c1")!.time["yyyy-mm-dd"]).toBe(1);
    expect(m.profiles.get("c2")).toMatchObject({ n: 7, distinct: 7 });
  });
});
