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
  const worker = (n: number) =>
    Array.from({ length: n }, (_, k) => ({ name: "ingest", rawname: `bull:aW5nZXN0:${k}` }));
  const q = (impl: () => Promise<unknown>) => ({ getWorkers: vi.fn(impl) });

  it("jumlah worker bernama; ada worker di-cache 10 detik, 0 hanya 3 detik", async () => {
    resetIngestWorkerCountCache();
    const a = q(async () => worker(2));
    expect(await ingestWorkerCount(a as never, 1_000)).toBe(2);
    expect(await ingestWorkerCount(q(async () => []) as never, 5_000)).toBe(2); // masih cache
    expect(a.getWorkers).toHaveBeenCalledTimes(1);
    expect(await ingestWorkerCount(q(async () => []) as never, 11_001)).toBe(0);
    // 0 cepat kedaluwarsa: worker menyala lagi → peringatan hilang dalam ≤ 3 detik (review L1).
    expect(await ingestWorkerCount(q(async () => worker(1)) as never, 14_002)).toBe(1);
  });

  it("CLIENT LIST tidak tersedia (entri pengganti BullMQ tanpa rawname) / Redis gagal → null", async () => {
    resetIngestWorkerCountCache();
    expect(
      await ingestWorkerCount(
        q(async () => [{ name: "GCP does not support client list" }]) as never,
        1,
      ),
    ).toBeNull();
    resetIngestWorkerCountCache();
    expect(
      await ingestWorkerCount(
        q(async () => {
          throw new Error("NOPERM this user has no permissions to run the 'client' command");
        }) as never,
        1,
      ),
    ).toBeNull();
  });
});

describe("peringatan pemroses tidak aktif", () => {
  it("menunggu: aman di antrean, tidak perlu unggah ulang; terhenti: tidak menjanjikan berlebihan", () => {
    expect(noWorkerText("UPLOADED")).toContain("Antrean belum berjalan");
    expect(noWorkerText("UPLOADED")).toContain("tidak perlu mengunggah ulang");
    // Review L2: setelah stall berulang job bisa gagal → jangan menjanjikan "tidak perlu unggah ulang".
    expect(noWorkerText("INGESTING")).toContain("tampaknya terhenti");
    expect(noWorkerText("INGESTING")).toContain("bila akhirnya gagal, unggah ulang");
  });

  it("cek /health: 0 → gagal dengan saran, null → gagal 'tidak bisa dibaca', ≥ 1 → OK", async () => {
    await expect(ingestWorkerCheck(async () => 0).run()).rejects.toThrow(/tidak ada worker/);
    await expect(ingestWorkerCheck(async () => null).run()).rejects.toThrow(/tidak bisa dibaca/);
    await expect(ingestWorkerCheck(async () => 2).run()).resolves.toBe(
      "2 worker terhubung ke antrean ingest",
    );
  });
});
