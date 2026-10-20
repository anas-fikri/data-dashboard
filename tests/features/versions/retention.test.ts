import { describe, expect, it } from "vitest";
import {
  RAW_RETENTION_MS,
  rawCutoff,
  rawRetentionWhere,
  retentionVictims,
  versionPrefixes,
} from "@/features/versions/retention";

/*
 * T-013: retensi versi (3 READY terbaru ∪ aktif; FAILED yang tergantikan), prefix objek versi, dan
 * pilihan file asli yang sudah lewat 7 hari. Murni.
 */
const day = (n: number) => new Date(Date.UTC(2026, 9, n));
const v = (id: string, status: string, d: number) => ({ id, status, createdAt: day(d) });

describe("retentionVictims", () => {
  it("READY ke-4 → yang tertua dibuang; versi aktif selalu disimpan", () => {
    const versions = [
      v("r1", "READY", 1),
      v("r2", "READY", 2),
      v("r3", "READY", 3),
      v("r4", "READY", 4),
    ];
    expect(retentionVictims(versions, "r4")).toEqual(["r1"]);
    // Setelah rollback ke r1 lalu data baru r5: r1 (yang baru saja aktif) ikut dibuang, bukan r5.
    expect(retentionVictims([...versions, v("r5", "READY", 5)], "r5").sort()).toEqual(["r1", "r2"]);
    // Aktif lebih tua dari 3 terbaru (rollback) tetap disimpan.
    expect(retentionVictims(versions, "r1")).toEqual([]);
  });

  it("FAILED sebelum READY terbaru tergantikan; FAILED setelahnya (badge gagal) dan status lain disimpan", () => {
    const versions = [
      v("f0", "FAILED", 1),
      v("r1", "READY", 2),
      v("f2", "FAILED", 3),
      v("r3", "READY", 4),
      v("f4", "FAILED", 5),
      v("a5", "AWAITING_MAPPING", 6),
      v("u6", "UPLOADING", 0),
    ];
    expect(retentionVictims(versions, "r3").sort()).toEqual(["f0", "f2"]);
  });

  it("tanpa READY → tidak ada yang dibuang", () => {
    expect(retentionVictims([v("f1", "FAILED", 1), v("f2", "FAILED", 2)], "x")).toEqual([]);
  });
});

describe("versionPrefixes", () => {
  const DS = "cmv4klj5r0007oczvgiofocpg";
  const VER = "cmv4kljx40009oczvdmpurrve";
  it("raw + parquet versi, diakhiri '/'; id yang tidak berbentuk cuid ditolak", () => {
    expect(versionPrefixes(DS, VER)).toEqual([`raw/${DS}/${VER}/`, `parquet/${DS}/${VER}/`]);
    expect(() => versionPrefixes(DS, "../x")).toThrow();
    expect(() => versionPrefixes("", VER)).toThrow();
  });
});

describe("rawRetentionWhere", () => {
  it("batas = sekarang − 7 hari; selesai sebelum batas atau FAILED tanpa ingestFinishedAt via updatedAt", () => {
    const now = new Date("2026-10-14T05:00:00Z");
    const cutoff = rawCutoff(now);
    expect(now.getTime() - cutoff.getTime()).toBe(RAW_RETENTION_MS);
    expect(cutoff.toISOString()).toBe("2026-10-07T05:00:00.000Z");
    expect(rawRetentionWhere(now)).toEqual({
      sourceKey: { not: null },
      sourceDeletedAt: null,
      OR: [
        {
          status: { in: ["READY", "FAILED", "AWAITING_MAPPING", "AWAITING_CONFIRM"] },
          ingestFinishedAt: { lt: cutoff },
        },
        { status: "FAILED", ingestFinishedAt: null, updatedAt: { lt: cutoff } },
      ],
    });
  });
});
