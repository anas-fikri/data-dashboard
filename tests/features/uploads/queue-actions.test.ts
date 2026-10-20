import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * T-059 Server Action antrean: tanpa sesi → NOT_FOUND tanpa memanggil service; buat antrean memakai
 * rate limit unggah dan datasetId dari argumen (bukan isian klien); galat tak terduga → pesan umum.
 */
const { AuthError, requireUser } = vi.hoisted(() => {
  class AuthError extends Error {}
  return { AuthError, requireUser: vi.fn() };
});
const create = vi.fn();
const stop = vi.fn();
const dismiss = vi.fn();
const hit = vi.fn(async () => ({ allowed: true, retryAfterSec: 0 }));
const revalidatePath = vi.fn();
vi.mock("@/features/auth/session", () => ({ AuthError, requireUser }));
vi.mock("@/features/auth/rate-limit", () => ({ RULES: { uploadInit: {} }, hit }));
vi.mock("@/lib/redis", () => ({ redisReady: vi.fn(async () => ({})) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/features/uploads/queue", () => ({
  createUploadQueue: create,
  stopUploadQueue: stop,
  dismissUploadQueue: dismiss,
}));

const a = await import("@/features/uploads/queue-actions");
const DID = "cmv4klj5r0007oczvgiofocpg";

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "u1" });
});

describe("aksi antrean", () => {
  it("tanpa sesi → NOT_FOUND, service tidak dipanggil", async () => {
    requireUser.mockRejectedValueOnce(new AuthError());
    expect(await a.createUploadQueueAction(DID, { baseVersionId: "b", files: [] })).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("buat antrean: datasetId dari argumen, rate limit unggah, revalidasi halaman dataset", async () => {
    create.mockResolvedValueOnce({ ok: true, queue: { id: "q" } });
    const input = { baseVersionId: "b", files: [1], datasetId: "lain" } as never;
    expect(await a.createUploadQueueAction(DID, input)).toMatchObject({ ok: true });
    expect(create).toHaveBeenCalledWith("u1", { datasetId: DID, baseVersionId: "b", files: [1] });
    expect(hit).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith(`/datasets/${DID}`);
    hit.mockResolvedValueOnce({ allowed: false, retryAfterSec: 120 });
    expect(await a.createUploadQueueAction(DID, input)).toMatchObject({ code: "RATE_LIMITED" });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("hentikan/tutup meneruskan ke service; galat tak terduga → pesan umum", async () => {
    stop.mockResolvedValueOnce({ ok: true, queue: null });
    expect(await a.stopUploadQueueAction(DID, "q")).toEqual({ ok: true, queue: null });
    expect(stop).toHaveBeenCalledWith("u1", "q");
    dismiss.mockRejectedValueOnce(new Error("db mati"));
    expect(await a.dismissUploadQueueAction(DID, "q")).toMatchObject({
      ok: false,
      message: "Terjadi gangguan. Coba lagi beberapa saat lagi.",
    });
  });
});
