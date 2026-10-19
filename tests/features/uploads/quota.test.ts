import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/env", () => ({
  env: () => ({ QUOTA_GRACE_DAYS: 14, USER_STORAGE_QUOTA_BYTES: 100 }),
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const q = await import("@/features/uploads/quota");

/*
 * T-039: kuota dari byte yang benar-benar tersimpan — rumus pemakaian (segmen unik terujuk + sumber yang
 * belum dihapus + UPLOADING), proyeksi init, masa transisi makna kuota, dan banner ≥ 80%.
 */
const GiB = 1024 ** 3;
const at = new Date("2026-10-20T00:00:00Z");
const version = (over: Partial<Parameters<typeof q.usageOf>[0][number]> = {}) => ({
  status: "READY",
  sizeBytes: 10n,
  sourceKey: "raw/ds/v/source.csv",
  sourceDeletedAt: null,
  etag: "etag-1",
  ...over,
});

describe("usageOf", () => {
  it("segmen unik terujuk dihitung sekali; sumber yang belum dihapus + UPLOADING ikut; sisanya tidak", () => {
    const usage = q.usageOf(
      [
        version(), // READY, sumber masih ada → 10
        version({ sourceDeletedAt: at }), // sumber dihapus retensi → 0
        version({ status: "UPLOADING", sourceKey: "raw/x", etag: null, sizeBytes: 7n }), // → 7
        version({ status: "FAILED", sizeBytes: 3n }), // gagal saat ingest (pernah UPLOADED): sumber masih ada → 3
        // Review T-039: ditolak saat complete/kedaluwarsa (belum pernah UPLOADED, objek sudah dihapus) → 0,
        // walau markFailed mengisi ingestFinishedAt.
        version({ status: "FAILED", etag: null, sizeBytes: 1000n }),
        version({ sourceKey: null, sizeBytes: 50n }), // tanpa objek sumber → 0
      ],
      [
        // Dua versi merujuk segmen + revisi yang sama → sekali.
        { typedId: "t1", typedBytes: 100n, segmentId: "g1", rawBytes: 200n },
        { typedId: "t1", typedBytes: 100n, segmentId: "g1", rawBytes: 200n },
        // Revisi lain segmen yang sama (versi lain): typed dihitung, raw tidak dua kali.
        { typedId: "t2", typedBytes: 40n, segmentId: "g1", rawBytes: 200n },
        // Segmen lama belum diukur.
        { typedId: "t3", typedBytes: null, segmentId: "g2", rawBytes: null },
      ],
    );
    expect(usage).toEqual({
      bytes: 10 + 7 + 3 + 200 + 100 + 40,
      legacyBytes: 10 + 10 + 7 + 50,
      unmeasured: 2,
    });
  });
});

describe("quotaDecision (init unggah)", () => {
  const quota = 20 * GiB;
  it("proyeksi = sumber + ±1,2× parquet; melewati kuota → ditolak dengan angka terpakai + proyeksi", () => {
    expect(q.projectedBytes(GiB)).toBe(Math.round(2.2 * GiB));
    const usage = { bytes: 17 * GiB, legacyBytes: 17 * GiB, unmeasured: 0 };
    expect(q.quotaDecision(usage, 1.3 * GiB, quota, false)).toEqual({ ok: true, warn: false });
    expect(q.quotaDecision(usage, 1.5 * GiB, quota, false)).toEqual({
      ok: false,
      usedBytes: 17 * GiB,
      projected: q.projectedBytes(1.5 * GiB),
    });
  });

  it("masa transisi: masih muat menurut hitungan lama → diterima dengan peringatan; tidak muat → ditolak", () => {
    const usage = { bytes: 19 * GiB, legacyBytes: 15 * GiB, unmeasured: 0 };
    expect(q.quotaDecision(usage, GiB, quota, true)).toEqual({ ok: true, warn: true });
    expect(q.quotaDecision(usage, GiB, quota, false)).toMatchObject({ ok: false });
    const full = { bytes: 19 * GiB, legacyBytes: 19.5 * GiB, unmeasured: 0 };
    expect(q.quotaDecision(full, GiB, quota, true)).toMatchObject({ ok: false });
  });
});

describe("quotaAlert (banner)", () => {
  const quota = 20 * GiB;
  it("< 80% tanpa banner; ≥ 80% peringatan; > 100% galat + tanggal akhir transisi bila masih berlaku", () => {
    expect(q.quotaAlert(15.9 * GiB, quota, null)).toBeNull();
    expect(q.quotaAlert(16 * GiB, quota, null)).toEqual({
      tone: "warning",
      text: expect.stringMatching(/^Penyimpanan Anda terpakai 16 GB dari 20 GB \(80%\)\./),
    });
    const until = new Date("2026-11-03T00:00:00Z");
    const over = q.quotaAlert(21.3 * GiB, quota, until, at);
    expect(over?.tone).toBe("error");
    expect(over?.text).toMatch(/melebihi kuota: terpakai 21,3 GB dari 20 GB \(106%\)/);
    expect(over?.text).toMatch(/Masa transisi hitungan kuota sampai 3 November 2026/);
    expect(
      q.quotaAlert(21.3 * GiB, quota, until, new Date("2026-11-04T00:00:00Z"))?.text,
    ).not.toMatch(/Masa transisi/);
  });

  it("akhir masa transisi = migrasi T-039 diterapkan + QUOTA_GRACE_DAYS; belum tercatat → tanpa transisi", async () => {
    const db = { $queryRaw: vi.fn(async () => [{ finished_at: at }]) };
    expect(await q.quotaGraceUntil(db as never, 0)).toEqual(new Date("2026-11-03T00:00:00Z"));
    // Di-cache 10 menit.
    expect(await q.quotaGraceUntil(db as never, 60_000)).toEqual(new Date("2026-11-03T00:00:00Z"));
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    const none = { $queryRaw: vi.fn(async () => []) };
    expect(await q.quotaGraceUntil(none as never, 11 * 60_000)).toBeNull();
  });
});
