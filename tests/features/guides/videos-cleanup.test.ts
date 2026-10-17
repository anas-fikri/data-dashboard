import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * T-z5nq: objek video/poster panduan tidak pernah yatim permanen. Pembersihan dijadwalkan ke
 * StorageCleanup di transaksi yang menghapus baris (jeda 10 menit); objek terhapus → jadwal dibuang,
 * gagal / proses mati → jadwal tetap (diulang job). Poster selalu ikut dihapus (kunci pasti per video);
 * poster yang selesai diunggah setelah videonya dihapus langsung dibuang. Prisma + storage dimock.
 */
const prisma = {
  guideVideo: {
    findUnique: vi.fn(),
    deleteMany: vi.fn(async () => ({ count: 1 })),
    updateMany: vi.fn(),
  },
  storageCleanup: {
    createMany: vi.fn(
      async (_a: { data: { prefix: string; reason: string; notBefore: Date }[] }) => ({
        count: 2,
      }),
    ),
    deleteMany: vi.fn(async () => ({ count: 2 })),
  },
  $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
};
const storage = {
  deleteGuideObject: vi.fn(async (_key: string) => {}),
  putGuidePoster: vi.fn(async () => {}),
  putGuideCaption: vi.fn(async () => {}),
};
vi.mock("@/lib/db", () => ({ prisma }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock("@/features/audit/service", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/storage/guides", async (orig) => ({
  ...(await orig<typeof import("@/lib/storage/guides")>()),
  deleteGuideObject: storage.deleteGuideObject,
  putGuidePoster: storage.putGuidePoster,
  putGuideCaption: storage.putGuideCaption,
}));

const { deleteVideo, removeVideoObjects, scheduleVideoCleanup, setVideoCaption, setVideoPoster } =
  await import("@/features/guides/videos");

const VID = "cmv4kljx40009oczvdmpuvid1";
const ART = "cmv4kljx40009oczvdmpuart1";
const admin = { id: "cmv4kljx40009oczvdmpuadm1", isAdmin: true } as never;
const multipart = { abort: vi.fn(async () => {}), remove: vi.fn(async () => {}) } as never;
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const video = (over = {}) => ({
  id: VID,
  articleId: ART,
  objectKey: `guides/videos/${VID}.mp4`,
  uploadId: null,
  posterKey: null,
  status: "READY",
  ...over,
});

beforeEach(() => vi.clearAllMocks());

const KEYS = [
  `guides/videos/${VID}.mp4`,
  `guides/posters/${VID}.png`,
  `guides/captions/${VID}.vtt`,
];

describe("scheduleVideoCleanup", () => {
  it("video + poster dijadwalkan 10 menit lagi; daftar kosong tidak menulis", async () => {
    const before = Date.now();
    await scheduleVideoCleanup(prisma as never, [video()]);
    const data = prisma.storageCleanup.createMany.mock.calls[0]![0].data;
    expect(data.map((d) => d.prefix)).toEqual(KEYS);
    expect(data[0]!.reason).toBe("guide-video");
    expect(data[0]!.notBefore.getTime() - before).toBeGreaterThanOrEqual(10 * 60 * 1000);
    await scheduleVideoCleanup(prisma as never, []);
    expect(prisma.storageCleanup.createMany).toHaveBeenCalledTimes(1);
  });
});

describe("removeVideoObjects", () => {
  it("menghapus video + poster (walau posterKey kosong); sukses → jadwal dibuang", async () => {
    await removeVideoObjects([video()], multipart);
    expect(storage.deleteGuideObject.mock.calls.map((c) => c[0])).toEqual(KEYS);
    expect(prisma.storageCleanup.deleteMany).toHaveBeenCalledWith({
      where: { prefix: { in: KEYS } },
    });
  });

  it("storage gagal → jadwal tetap (diulang job), tidak melempar", async () => {
    storage.deleteGuideObject.mockRejectedValueOnce(new Error("storage mati"));
    await expect(removeVideoObjects([video()], multipart)).resolves.toBeUndefined();
    expect(prisma.storageCleanup.deleteMany).not.toHaveBeenCalled();
  });
});

describe("deleteVideo", () => {
  it("baris dihapus + jadwal dibuat dalam satu transaksi, objek sesudahnya", async () => {
    prisma.guideVideo.findUnique.mockResolvedValueOnce(video());
    const order: string[] = [];
    prisma.guideVideo.deleteMany.mockImplementationOnce(async () => {
      order.push("baris");
      return { count: 1 };
    });
    prisma.storageCleanup.createMany.mockImplementationOnce(async () => {
      order.push("jadwal");
      return { count: 2 };
    });
    storage.deleteGuideObject.mockImplementation(async () => void order.push("objek"));
    expect(await deleteVideo(admin, VID, "127.0.0.1", multipart)).toEqual({
      ok: true,
      videoId: VID,
    });
    expect(order).toEqual(["baris", "jadwal", "objek", "objek", "objek"]);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    storage.deleteGuideObject.mockImplementation(async () => {});
  });
});

describe("setVideoCaption (T-j9j6)", () => {
  const vtt = new TextEncoder().encode("WEBVTT\n\n00:00.000 --> 00:02.000\nHalo\n");

  it("WebVTT sah → disimpan dengan kunci per video, captionKey diisi hanya untuk video READY", async () => {
    prisma.guideVideo.findUnique.mockResolvedValueOnce(video());
    prisma.guideVideo.updateMany.mockResolvedValueOnce({ count: 1 });
    expect(await setVideoCaption(admin, VID, vtt)).toEqual({
      ok: true,
      captionKey: `guides/captions/${VID}.vtt`,
    });
    expect(storage.putGuideCaption).toHaveBeenCalledWith(`guides/captions/${VID}.vtt`, vtt);
    expect(prisma.guideVideo.updateMany).toHaveBeenCalledWith({
      where: { id: VID, status: "READY" },
      data: { captionKey: `guides/captions/${VID}.vtt` },
    });
  });

  it("bukan WebVTT → INVALID_FORMAT; > 200 KB → FILE_TOO_LARGE; keduanya tanpa menyentuh storage/DB", async () => {
    prisma.guideVideo.findUnique.mockResolvedValue(video());
    const srt = new TextEncoder().encode("1\n00:00:00,000 --> 00:00:02,000\nHalo\n");
    expect(await setVideoCaption(admin, VID, srt)).toMatchObject({ code: "INVALID_FORMAT" });
    const big = new Uint8Array(200 * 1024 + 1).fill(0x41);
    big.set(new TextEncoder().encode("WEBVTT\n"));
    expect(await setVideoCaption(admin, VID, big)).toMatchObject({ code: "FILE_TOO_LARGE" });
    expect(storage.putGuideCaption).not.toHaveBeenCalled();
    expect(prisma.guideVideo.updateMany).not.toHaveBeenCalled();
    prisma.guideVideo.findUnique.mockReset();
  });

  it("video belum siap / dihapus selagi takarir diunggah → NOT_FOUND, objek baru dibuang", async () => {
    prisma.guideVideo.findUnique.mockResolvedValueOnce(video({ status: "UPLOADING" }));
    expect(await setVideoCaption(admin, VID, vtt)).toMatchObject({ code: "NOT_FOUND" });
    prisma.guideVideo.findUnique.mockResolvedValueOnce(video());
    prisma.guideVideo.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await setVideoCaption(admin, VID, vtt)).toMatchObject({ code: "NOT_FOUND" });
    expect(storage.deleteGuideObject).toHaveBeenCalledWith(`guides/captions/${VID}.vtt`);
  });
});

describe("setVideoPoster", () => {
  it("video dihapus selagi poster diunggah → poster yang baru tersimpan dibuang, NOT_FOUND", async () => {
    prisma.guideVideo.findUnique.mockResolvedValueOnce(video());
    prisma.guideVideo.updateMany.mockResolvedValueOnce({ count: 0 });
    const r = await setVideoPoster(admin, VID, png);
    expect(r).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(storage.putGuidePoster).toHaveBeenCalled();
    expect(storage.deleteGuideObject).toHaveBeenCalledWith(`guides/posters/${VID}.png`);
  });

  it("poster tersimpan → posterKey diisi hanya untuk video READY", async () => {
    prisma.guideVideo.findUnique.mockResolvedValueOnce(video());
    prisma.guideVideo.updateMany.mockResolvedValueOnce({ count: 1 });
    expect(await setVideoPoster(admin, VID, png)).toEqual({
      ok: true,
      posterKey: `guides/posters/${VID}.png`,
    });
    expect(prisma.guideVideo.updateMany).toHaveBeenCalledWith({
      where: { id: VID, status: "READY" },
      data: { posterKey: `guides/posters/${VID}.png` },
    });
  });
});
