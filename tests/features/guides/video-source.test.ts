import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * T-z5nq AC 2: sumber video baru untuk pemutar yang terbuka > 1 jam. Akses sama dengan halaman: admin
 * semua video siap; selain admin hanya video artikel terbit sesuai perannya (filter di query); id
 * bukan cuid / video tidak terlihat → null (404). Prisma + presign dimock.
 */
const prisma = {
  guideVideo: { findFirst: vi.fn() },
  dataset: { findFirst: vi.fn(async () => null) },
  dashboardShare: { findFirst: vi.fn(async () => null) },
  dashboard: { findFirst: vi.fn(async () => null) },
};
vi.mock("@/lib/db", () => ({ prisma }));
vi.mock("@/lib/storage/guides", async (orig) => ({
  ...(await orig<typeof import("@/lib/storage/guides")>()),
  presignGuideGet: vi.fn(async (key: string, type: string) => `https://storage/${key}?ct=${type}`),
}));

const { videoCaptionKey, videoSource } = await import("@/features/guides/reader");

const VID = "cmv4kljx40009oczvdmpuvid1";
const row = {
  objectKey: `guides/videos/${VID}.webm`,
  ext: "webm",
  posterKey: `guides/posters/${VID}.png`,
};

beforeEach(() => vi.clearAllMocks());

describe("videoSource", () => {
  it("admin: video siap mana pun → src + poster presigned baru (Content-Type dari ekstensi)", async () => {
    prisma.guideVideo.findFirst.mockResolvedValueOnce(row);
    expect(await videoSource({ id: "u-admin", isAdmin: true }, VID)).toEqual({
      src: `https://storage/guides/videos/${VID}.webm?ct=video/webm`,
      poster: `https://storage/guides/posters/${VID}.png?ct=image/png`,
    });
    expect(prisma.guideVideo.findFirst).toHaveBeenCalledWith({
      where: { id: VID, status: "READY" },
      select: { objectKey: true, ext: true, posterKey: true },
    });
  });

  it("bukan admin: query dibatasi artikel terbit untuk perannya (+ ALL)", async () => {
    prisma.guideVideo.findFirst.mockResolvedValueOnce({ ...row, posterKey: null });
    const r = await videoSource({ id: "cmv4kljx40009oczvdmpuusr1", isAdmin: false }, VID);
    expect(r).toMatchObject({ poster: null });
    const where = prisma.guideVideo.findFirst.mock.calls[0]![0].where;
    // User baru tanpa dataset/share = OWNER (lihat guideRolesFor).
    expect(where.article).toEqual({ status: "PUBLISHED", role: { in: ["OWNER", "ALL"] } });
  });

  it("id bukan cuid tidak menyentuh DB; video tidak terlihat → null", async () => {
    expect(await videoSource({ id: "u", isAdmin: true }, "../x")).toBeNull();
    expect(prisma.guideVideo.findFirst).not.toHaveBeenCalled();
    prisma.guideVideo.findFirst.mockResolvedValueOnce(null);
    expect(await videoSource({ id: "u", isAdmin: true }, VID)).toBeNull();
  });
});

describe("videoCaptionKey (T-j9j6)", () => {
  it("akses sama dengan videoSource: bukan admin dibatasi artikel terbit per peran; tanpa takarir → null", async () => {
    prisma.guideVideo.findFirst.mockResolvedValueOnce({ captionKey: `guides/captions/${VID}.vtt` });
    expect(await videoCaptionKey({ id: "cmv4kljx40009oczvdmpuusr1", isAdmin: false }, VID)).toBe(
      `guides/captions/${VID}.vtt`,
    );
    expect(prisma.guideVideo.findFirst.mock.calls[0]![0]).toEqual({
      where: {
        id: VID,
        status: "READY",
        article: { status: "PUBLISHED", role: { in: ["OWNER", "ALL"] } },
      },
      select: { captionKey: true },
    });
    prisma.guideVideo.findFirst.mockResolvedValueOnce({ captionKey: null });
    expect(await videoCaptionKey({ id: "u", isAdmin: true }, VID)).toBeNull();
    prisma.guideVideo.findFirst.mockResolvedValueOnce(null);
    expect(await videoCaptionKey({ id: "u", isAdmin: true }, VID)).toBeNull();
  });

  it("id bukan cuid tidak menyentuh DB", async () => {
    expect(await videoCaptionKey({ id: "u", isAdmin: true }, "../x")).toBeNull();
    expect(prisma.guideVideo.findFirst).not.toHaveBeenCalled();
  });
});
