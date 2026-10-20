import { describe, expect, it } from "vitest";
import { groupSourceKey, groupTitle, parseGroupFiles } from "@/features/ingest/period-group";

/* T-060: daftar file versi kelompok dibaca fail-closed (tidak pernah diproses sebagian). */
const f = (seq: number, key = `raw/d/v/part-${seq}.csv`) => ({
  seq,
  key,
  name: `m${seq}.csv`,
  size: 1,
});

describe("parseGroupFiles", () => {
  it("urut nomor file; nomor 1..n tanpa celah, kunci unik, minimal 2 file", () => {
    expect(parseGroupFiles([f(2), f(1)])?.map((x) => x.seq)).toEqual([1, 2]);
    expect(parseGroupFiles([f(1), f(3)])).toBeNull();
    expect(parseGroupFiles([f(1), f(2, "raw/d/v/part-1.csv")])).toBeNull();
    expect(parseGroupFiles([f(1)])).toBeNull();
    expect(parseGroupFiles(null)).toBeNull();
    expect(parseGroupFiles([{ seq: 1, key: "k" }, f(2)])).toBeNull();
  });

  it("kunci di prefix versi kelompok dan judul versi", () => {
    expect(groupSourceKey("ds", "ver", 2, "xlsx")).toBe("raw/ds/ver/part-2.xlsx");
    expect(groupTitle(["a.xlsx", "b.xlsx", "c.xlsx"])).toBe("a.xlsx + 2 file lain");
    expect(groupTitle(["a.xlsx"])).toBe("a.xlsx");
  });
});
