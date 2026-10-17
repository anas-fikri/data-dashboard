import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * T-z5nq: objek video/poster/takarir panduan tidak pernah yatim permanen. Pembersihan dijadwalkan ke
 * StorageCleanup di transaksi yang menghapus baris (jeda 10 menit); objek terhapus → jadwal dibuang,
 * gagal / proses mati → jadwal tetap (diulang job). Poster selalu ikut dihapus (kunci pasti per video);
 * takarir memakai kunci baru per unggahan (T-qqbc) dan dibaca dari baris yang dikunci (FOR UPDATE).
 * Prisma + storage dimock.
 */
type Cleanup = { data: { prefix: string; reason: string; notBefore: Date }[] };
const prisma = {
  guideVideo: {
    findUnique: vi.fn(),
    deleteMany: vi.fn(async () => ({ count: 1 })),
    updateMany: vi.fn(async () => ({ count: 1 })),
    update: vi.fn(async () => ({})),
  },
  storageCleanup: {
    createMany: vi.fn(async (_a: Cleanup) => ({ count: 2 })),
    deleteMany: vi.fn(async () => ({ count: 2 })),
  },
  /** lockVideo: SELECT status, captionKey … FOR UPDATE. */
  $queryRaw: vi.fn(async (): Promise<{ status: string; captionKey: string | null }[]> => []),
  $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
};
const storage = {
  deleteGuideObject: vi.fn(async (_key: string) => {}),
  putGuidePoster: vi.fn(async () => {}),
  putGuideCaption: vi.fn(async (_key: string, _body: Uint8Array) => {}),
};
vi.mock("@/lib/db", () => ({ prisma }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
const audit = { recordAudit: vi.fn() };
vi.mock("@/features/audit/service", () => audit);
vi.mock("@/lib/storage/guides", async (orig) => ({
  ...(await orig<typeof import("@/lib/storage/guides")>()),
  deleteGuideObject: storage.deleteGuideObject,
  putGuidePoster: storage.putGuidePoster,
  putGuideCaption: storage.putGuideCaption,
}));

const {
  deleteVideo,
  removeVideoCaption,
  removeVideoObjects,
  scheduleVideoCleanup,
  setVideoCaption,
  setVideoPoster,
} = await import("@/features/guides/videos");

const VID = "cmv4kljx40009oczvdmpuvid1";
const ART = "cmv4kljx40009oczvdmpuart1";
const OLD = `guides/captions/${VID}-0123456789ab.vtt`;
const admin = { id: "cmv4kljx40009oczvdmpuadm1", isAdmin: true } as never;
const multipart = { abort: vi.fn(async () => {}), remove: vi.fn(async () => {}) } as never;
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const vtt = new TextEncoder().encode("WEBVTT\n\n00:00.000 --> 00:02.000\nHalo\n");
const video = (over = {}) => ({
  id: VID,
  articleId: ART,
  objectKey: `guides/videos/${VID}.mp4`,
  uploadId: null,
  posterKey: null,
  captionKey: null as string | null,
  status: "READY",
  ...over,
});
const locked = (captionKey: string | null, status = "READY") =>
  prisma.$queryRaw.mockResolvedValueOnce([{ status, captionKey }]);
const audits = () => audit.recordAudit.mock.calls.map((c) => (c as unknown[])[1]);
const scheduled = () =>
  prisma.storageCleanup.createMany.mock.calls.flatMap((c) => c[0].data.map((d) => d.prefix));

beforeEach(() => vi.clearAllMocks());

const BASE = [`guides/videos/${VID}.mp4`, `guides/posters/${VID}.png`];

describe("scheduleVideoCleanup", () => {
  it("video + poster (+ takarir yang tersimpan) dijadwalkan 10 menit lagi; daftar kosong tidak menulis", async () => {
    const before = Date.now();
    await scheduleVideoCleanup(prisma as never, [video(), video({ captionKey: OLD })]);
    const data = prisma.storageCleanup.createMany.mock.calls[0]![0].data;
    expect(data.map((d) => d.prefix)).toEqual([...BASE, ...BASE, OLD]);
    expect(data[0]!.reason).toBe("guide-video");
    expect(data[0]!.notBefore.getTime() - before).toBeGreaterThanOrEqual(10 * 60 * 1000);
    await scheduleVideoCleanup(prisma as never, []);
    expect(prisma.storageCleanup.createMany).toHaveBeenCalledTimes(1);
  });
});

describe("removeVideoObjects", () => {
  it("menghapus video + poster (walau posterKey kosong) + takarir; sukses → jadwal dibuang", async () => {
    await removeVideoObjects([video({ captionKey: OLD })], multipart);
    expect(storage.deleteGuideObject.mock.calls.map((c) => c[0])).toEqual([...BASE, OLD]);
    expect(prisma.storageCleanup.deleteMany).toHaveBeenCalledWith({
      where: { prefix: { in: [...BASE, OLD] } },
    });
  });

  it("storage gagal → jadwal tetap (diulang job), tidak melempar", async () => {
    storage.deleteGuideObject.mockRejectedValueOnce(new Error("storage mati"));
    await expect(removeVideoObjects([video()], multipart)).resolves.toBeUndefined();
    expect(prisma.storageCleanup.deleteMany).not.toHaveBeenCalled();
  });
});

describe("deleteVideo", () => {
  it("baris dikunci → dihapus + jadwal (takarir dari baris terkunci, bukan bacaan basi) → objek", async () => {
    prisma.guideVideo.findUnique.mockResolvedValueOnce(video()); // ownVideo: belum bertakarir
    locked(OLD); // takarir tersimpan bersamaan sebelum kunci didapat
    const order: string[] = [];
    prisma.guideVideo.deleteMany.mockImplementationOnce(async () => {
      order.push("baris");
      return { count: 1 };
    });
    prisma.storageCleanup.createMany.mockImplementationOnce(async (a: Cleanup) => {
      order.push(`jadwal:${a.data.length}`);
      return { count: a.data.length };
    });
    storage.deleteGuideObject.mockImplementation(async () => void order.push("objek"));
    expect(await deleteVideo(admin, VID, "127.0.0.1", multipart)).toEqual({
      ok: true,
      videoId: VID,
    });
    expect(order).toEqual(["baris", "jadwal:3", "objek", "objek", "objek"]);
    expect(storage.deleteGuideObject).toHaveBeenLastCalledWith(OLD);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    storage.deleteGuideObject.mockImplementation(async () => {});
  });
});

describe("setVideoCaption (T-j9j6, T-qqbc)", () => {
  it("WebVTT sah → kunci baru per unggahan, captionKey di-commit pada baris terkunci, audit replaced=false", async () => {
    prisma.guideVideo.findUnique.mockResolvedValueOnce(video());
    locked(null);
    const r = await setVideoCaption(admin, VID, vtt, "127.0.0.1");
    expect(r).toMatchObject({ ok: true });
    const key = (r as { captionKey: string }).captionKey;
    expect(key).toMatch(new RegExp(`^guides/captions/${VID}-[a-f0-9]{12}\\.vtt$`));
    expect(storage.putGuideCaption).toHaveBeenCalledWith(key, vtt);
    expect(prisma.guideVideo.update).toHaveBeenCalledWith({
      where: { id: VID },
      data: { captionKey: key },
    });
    // Kunci baru dijadwalkan sebelum file ditulis (proses mati → tidak yatim), dibuang sesudah commit.
    expect(scheduled()).toEqual([key]);
    expect(prisma.storageCleanup.createMany.mock.calls[0]![0].data[0]!.reason).toBe(
      "guide-caption-upload",
    );
    expect(prisma.storageCleanup.deleteMany).toHaveBeenCalledWith({ where: { prefix: key } });
    expect(audits()).toEqual([
      expect.objectContaining({
        action: "guide.video.caption",
        targetId: ART,
        meta: { videoId: VID, replaced: false },
        ip: "127.0.0.1",
      }),
    ]);
  });

  it("ganti → kunci lama dijadwalkan di transaksi yang sama lalu dihapus; file baru tidak pernah ditimpa", async () => {
    prisma.guideVideo.findUnique.mockResolvedValueOnce(video({ captionKey: OLD }));
    locked(OLD);
    const r = (await setVideoCaption(admin, VID, vtt, "127.0.0.1")) as { captionKey: string };
    expect(r.captionKey).not.toBe(OLD);
    expect(scheduled()).toEqual([r.captionKey, OLD]);
    expect(prisma.storageCleanup.createMany.mock.calls[1]![0].data[0]!.reason).toBe(
      "guide-caption",
    );
    expect(storage.deleteGuideObject.mock.calls.map((c) => c[0])).toEqual([OLD]);
    expect(prisma.storageCleanup.deleteMany).toHaveBeenCalledWith({ where: { prefix: OLD } });
    expect(audits()[0]).toMatchObject({ meta: { videoId: VID, replaced: true } });
  });

  it("bukan WebVTT → INVALID_FORMAT; > 200 KB → FILE_TOO_LARGE; keduanya tanpa menyentuh storage/DB", async () => {
    prisma.guideVideo.findUnique.mockResolvedValueOnce(video()).mockResolvedValueOnce(video());
    const srt = new TextEncoder().encode("1\n00:00:00,000 --> 00:00:02,000\nHalo\n");
    expect(await setVideoCaption(admin, VID, srt, "127.0.0.1")).toMatchObject({
      code: "INVALID_FORMAT",
    });
    const big = new Uint8Array(200 * 1024 + 1).fill(0x41);
    big.set(new TextEncoder().encode("WEBVTT\n"));
    expect(await setVideoCaption(admin, VID, big, "127.0.0.1")).toMatchObject({
      code: "FILE_TOO_LARGE",
    });
    expect(storage.putGuideCaption).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("video belum siap / dihapus selagi takarir diunggah → NOT_FOUND, objek baru dibuang, tanpa audit", async () => {
    prisma.guideVideo.findUnique.mockResolvedValueOnce(video({ status: "UPLOADING" }));
    expect(await setVideoCaption(admin, VID, vtt, "127.0.0.1")).toMatchObject({
      code: "NOT_FOUND",
    });
    prisma.guideVideo.findUnique.mockResolvedValueOnce(video());
    prisma.$queryRaw.mockResolvedValueOnce([]); // baris sudah terhapus saat dikunci
    expect(await setVideoCaption(admin, VID, vtt, "127.0.0.1")).toMatchObject({
      code: "NOT_FOUND",
    });
    const written = storage.putGuideCaption.mock.calls[0]![0];
    expect(storage.deleteGuideObject).toHaveBeenCalledWith(written);
    expect(prisma.guideVideo.update).not.toHaveBeenCalled();
    expect(audit.recordAudit).not.toHaveBeenCalled();
  });
});

describe("setVideoPoster", () => {
  it("video dihapus selagi poster diunggah → poster yang baru tersimpan dibuang, NOT_FOUND, tanpa audit", async () => {
    prisma.guideVideo.findUnique.mockResolvedValueOnce(video());
    prisma.guideVideo.updateMany.mockResolvedValueOnce({ count: 0 });
    const r = await setVideoPoster(admin, VID, png, "127.0.0.1");
    expect(r).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(storage.putGuidePoster).toHaveBeenCalled();
    expect(storage.deleteGuideObject).toHaveBeenCalledWith(`guides/posters/${VID}.png`);
    expect(audit.recordAudit).not.toHaveBeenCalled();
  });

  it("poster tersimpan → posterKey diisi hanya untuk video READY; audit guide.video.poster {videoId}", async () => {
    prisma.guideVideo.findUnique.mockResolvedValueOnce(video());
    expect(await setVideoPoster(admin, VID, png, "203.0.113.9")).toEqual({
      ok: true,
      posterKey: `guides/posters/${VID}.png`,
    });
    expect(prisma.guideVideo.updateMany).toHaveBeenCalledWith({
      where: { id: VID, status: "READY" },
      data: { posterKey: `guides/posters/${VID}.png` },
    });
    expect(audits()).toEqual([
      expect.objectContaining({
        action: "guide.video.poster",
        targetId: ART,
        meta: { videoId: VID },
        ip: "203.0.113.9",
      }),
    ]);
  });
});

describe("removeVideoCaption (T-qqbc)", () => {
  it("baris dikunci → captionKey dikosongkan + kunci lama dijadwalkan + audit, lalu objek dihapus dan jadwal dibuang", async () => {
    prisma.guideVideo.findUnique.mockResolvedValueOnce(video({ captionKey: OLD }));
    locked(OLD);
    expect(await removeVideoCaption(admin, VID, "203.0.113.9")).toEqual({ ok: true, videoId: VID });
    expect(prisma.guideVideo.update).toHaveBeenCalledWith({
      where: { id: VID },
      data: { captionKey: null },
    });
    expect(scheduled()).toEqual([OLD]);
    expect(audits()).toEqual([
      expect.objectContaining({ action: "guide.video.caption.delete", meta: { videoId: VID } }),
    ]);
    expect(storage.deleteGuideObject).toHaveBeenCalledWith(OLD);
    expect(prisma.storageCleanup.deleteMany).toHaveBeenCalledWith({ where: { prefix: OLD } });
  });

  it("hapus storage gagal → jadwal tetap (diulang job), tetap ok", async () => {
    prisma.guideVideo.findUnique.mockResolvedValueOnce(video({ captionKey: OLD }));
    locked(OLD);
    storage.deleteGuideObject.mockRejectedValueOnce(new Error("storage mati"));
    expect(await removeVideoCaption(admin, VID, "203.0.113.9")).toEqual({ ok: true, videoId: VID });
    expect(prisma.storageCleanup.deleteMany).not.toHaveBeenCalled();
  });

  it("sudah tanpa takarir → ok tanpa jadwal/audit; belum siap / hilang saat dikunci → NOT_FOUND", async () => {
    prisma.guideVideo.findUnique.mockResolvedValueOnce(video());
    locked(null);
    expect(await removeVideoCaption(admin, VID, "203.0.113.9")).toEqual({ ok: true, videoId: VID });
    expect(prisma.storageCleanup.createMany).not.toHaveBeenCalled();
    expect(audit.recordAudit).not.toHaveBeenCalled();
    prisma.guideVideo.findUnique.mockResolvedValueOnce(video({ status: "UPLOADING" }));
    expect(await removeVideoCaption(admin, VID, "203.0.113.9")).toMatchObject({
      code: "NOT_FOUND",
    });
    prisma.guideVideo.findUnique.mockResolvedValueOnce(video({ captionKey: OLD }));
    prisma.$queryRaw.mockResolvedValueOnce([]);
    expect(await removeVideoCaption(admin, VID, "203.0.113.9")).toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
