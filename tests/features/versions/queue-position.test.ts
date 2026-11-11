import { describe, expect, it, vi } from "vitest";
import { waitingText } from "@/components/datasets/ingest-progress";
import { ingestQueuePosition } from "@/lib/queue/versions";

/*
 * T-024 AC 2: posisi versi di antrean ingest (jobId = versionId, daftar menunggu urut tertua dulu) dan
 * teksnya di panel progres. Antrean BullMQ dipalsukan (getRanges + getActiveCount saja).
 */
function fakeQueue(waiting: string[], active: number) {
  return {
    getRanges: vi.fn(async () => waiting),
    getActiveCount: vi.fn(async () => active),
  };
}

describe("ingestQueuePosition", () => {
  it("posisi = urutan di daftar menunggu (1 = berikutnya) + jumlah job berjalan", async () => {
    const q = fakeQueue(["v1", "v2", "v3"], 2);
    expect(await ingestQueuePosition("v3", q as never)).toEqual({ position: 3, active: 2 });
    expect(await ingestQueuePosition("v1", q as never)).toEqual({ position: 1, active: 2 });
    // Urut tertua dulu, termasuk job berprioritas; dibaca terbatas.
    expect(q.getRanges).toHaveBeenCalledWith(["waiting", "prioritized"], 0, 499, true);
  });

  it("versi tidak menunggu (sedang diproses / tertunda retry) → null", async () => {
    expect(await ingestQueuePosition("vX", fakeQueue(["v1"], 1) as never)).toBeNull();
  });
});

describe("waitingText", () => {
  it("dengan posisi menampilkan nomor antrean; tanpa posisi teks umum", () => {
    expect(waitingText(1)).toBe("Menunggu giliran: antrean ke-1, diproses berikutnya. ");
    expect(waitingText(1234)).toBe("Menunggu giliran: antrean ke-1.234. ");
    expect(waitingText(undefined)).toBe("Menunggu giliran diproses. ");
  });
});

/* v1.17.1: pemroses (worker) tidak aktif → panel progres dan /health admin memberi tahu. */
import { ingestWorkerCount, resetIngestWorkerCountCache } from "@/lib/queue/versions";
import { noWorkerText } from "@/components/datasets/ingest-progress";
import { ingestWorkerCheck } from "@/lib/health/worker-check";

describe("ingestWorkerCount", () => {
  const q = (impl: () => Promise<number>) => ({ getWorkersCount: vi.fn(impl) });

  it("jumlah worker terhubung; di-cache 10 detik lalu dibaca ulang", async () => {
    resetIngestWorkerCountCache();
    const a = q(async () => 2);
    expect(await ingestWorkerCount(a as never, 1_000)).toBe(2);
    expect(await ingestWorkerCount(q(async () => 0) as never, 5_000)).toBe(2); // masih cache
    expect(a.getWorkersCount).toHaveBeenCalledTimes(1);
    expect(await ingestWorkerCount(q(async () => 0) as never, 11_001)).toBe(0);
  });

  it("Redis gagal / nilai aneh → null (tanpa peringatan palsu)", async () => {
    resetIngestWorkerCountCache();
    expect(
      await ingestWorkerCount(
        q(async () => {
          throw new Error("ERR unknown command 'CLIENT'");
        }) as never,
        1,
      ),
    ).toBeNull();
    resetIngestWorkerCountCache();
    expect(await ingestWorkerCount(q(async () => Number.NaN) as never, 1)).toBeNull();
  });
});

describe("peringatan pemroses tidak aktif", () => {
  it("teks menunggu vs terhenti; keduanya bilang tidak perlu unggah ulang", () => {
    expect(noWorkerText("UPLOADED")).toContain("Antrean belum berjalan");
    expect(noWorkerText("INGESTING")).toContain("diproses ulang otomatis");
    for (const s of ["UPLOADED", "INGESTING"]) {
      expect(noWorkerText(s)).toContain("tidak perlu mengunggah ulang");
    }
  });

  it("cek /health: 0 → gagal dengan saran, null → gagal 'tidak bisa dibaca', ≥ 1 → OK", async () => {
    await expect(ingestWorkerCheck(async () => 0).run()).rejects.toThrow(/tidak ada worker/);
    await expect(ingestWorkerCheck(async () => null).run()).rejects.toThrow(/tidak bisa dibaca/);
    await expect(ingestWorkerCheck(async () => 2).run()).resolves.toBe(
      "2 worker terhubung ke antrean ingest",
    );
  });
});
