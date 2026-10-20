import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QueueItemView } from "@/features/uploads/queue-plan";

/*
 * T-059 pengunggah antrean di browser: file dicocokkan ke file antrean (nama + ukuran + waktu ubah),
 * diunggah satu per satu menurut seq; pra-cek gagal → file dilewati dengan alasan (server memberi
 * pesan); galat permanen server → lanjut ke file berikutnya; jaringan putus terus → berhenti dengan
 * pesan "Coba lagi" (tanpa melompati file, urutan tetap).
 */
const { api, precheck, runMultipart, UploadError } = vi.hoisted(() => {
  class UploadError extends Error {
    constructor(
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  }
  return { api: vi.fn(), precheck: vi.fn(), runMultipart: vi.fn(), UploadError };
});
vi.mock("@/features/uploads/client", () => ({ api, precheck, runMultipart, UploadError }));

const { queueUploader, forgetQueueUploader } =
  await import("@/components/datasets/upload-queue-store");

const item = (seq: number, state: QueueItemView["state"] = "WAITING"): QueueItemView => ({
  id: `i${seq}`,
  seq,
  name: `f${seq}.csv`,
  size: seq * 10,
  lastModified: 1,
  label: null,
  state,
  message: null,
  versionId: `v${seq}`,
  versionStatus: null,
  statusText: "",
  tone: "muted",
});
const fileOf = (it: QueueItemView, lastModified = it.lastModified) =>
  new File(["x".repeat(it.size)], it.name, { lastModified });

async function settle(u: ReturnType<typeof queueUploader>) {
  await vi.waitFor(() => expect(u.snapshot.running).toBe(false));
}

beforeEach(() => {
  vi.clearAllMocks();
  forgetQueueUploader("q");
  precheck.mockResolvedValue(undefined);
  api.mockResolvedValue({
    ok: true,
    versionId: "x",
    partSize: 1,
    partCount: 1,
    uploadedParts: [],
    resumed: false,
  });
  runMultipart.mockResolvedValue(undefined);
});

describe("queueUploader", () => {
  it("mencocokkan file pilihan; yang tidak cocok dilaporkan; unggah menurut seq", async () => {
    const items = [item(2), item(1), item(3, "QUEUED")];
    const u = queueUploader("q");
    const unmatched = u.attach(items, [
      fileOf(items[0]!),
      fileOf(items[1]!),
      fileOf(items[2]!),
      new File(["y"], "lain.csv"),
      fileOf(item(4), 99),
    ]);
    expect(unmatched).toEqual(["lain.csv", "f4.csv"]);
    u.start(1024);
    await settle(u);
    // QUEUED sudah utuh di server → tidak diunggah ulang.
    expect(runMultipart.mock.calls.map((c) => (c[0] as { base: string }).base)).toEqual([
      "/api/upload-queue/items/i1",
      "/api/upload-queue/items/i2",
    ]);
    expect([...u.snapshot.sent]).toEqual(["i1", "i2"]);
  });

  it("pra-cek gagal → dilewati dengan alasan; galat permanen server → lanjut file berikutnya", async () => {
    const items = [item(1), item(2), item(3)];
    precheck.mockRejectedValueOnce(new UploadError("INVALID_FORMAT", "format"));
    runMultipart.mockRejectedValueOnce(new UploadError("UPLOAD_CORRUPT", "rusak"));
    const u = queueUploader("q");
    u.attach(
      items,
      items.map((i) => fileOf(i)),
    );
    u.start(1024);
    await settle(u);
    expect(api).toHaveBeenCalledWith(
      "/api/upload-queue/items/i1/skip",
      "POST",
      { reason: "INVALID_FORMAT" },
      expect.anything(),
    );
    expect(runMultipart).toHaveBeenCalledTimes(2); // i2 (ditolak server) lalu i3
    expect(u.snapshot.error).toBeNull();
    expect([...u.snapshot.sent]).toEqual(["i1", "i2", "i3"]);
  });

  it("sesi berakhir → berhenti dengan pesan; file berikutnya tidak didahulukan", async () => {
    const items = [item(1), item(2)];
    runMultipart.mockRejectedValueOnce(new UploadError("UNAUTHENTICATED", "Sesi berakhir."));
    const u = queueUploader("q");
    u.attach(
      items,
      items.map((i) => fileOf(i)),
    );
    u.start(1024);
    await settle(u);
    expect(u.snapshot.error).toEqual({ itemId: "i1", message: "Sesi berakhir." });
    expect(runMultipart).toHaveBeenCalledTimes(1);
    // Coba lagi melanjutkan dari file yang sama.
    u.start(1024);
    await settle(u);
    expect([...u.snapshot.sent]).toEqual(["i1", "i2"]);
  });
});
