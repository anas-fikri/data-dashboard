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
