import "server-only";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { bucket, s3Internal, s3Public } from "@/lib/storage/s3";

/*
 * Objek video panduan (T-021): guides/videos/<videoId>.<mp4|webm> dan guides/posters/<videoId>.png.
 * Operasi hanya lewat kunci yang lolos pola ketat. Pemutaran lewat presigned GET 1 jam (endpoint
 * publik, D5); storage melayani Range → 206 sehingga melompat ke menit tertentu tanpa unduh penuh.
 */

export const GUIDE_VIDEO_KEY = /^guides\/videos\/[a-z0-9]{20,32}\.(mp4|webm)$/;
export const GUIDE_POSTER_KEY = /^guides\/posters\/[a-z0-9]{20,32}\.png$/;
export const GUIDE_MEDIA_TTL_SEC = 60 * 60;

export type GuideVideoExt = "mp4" | "webm";
export const VIDEO_CONTENT_TYPE: Record<GuideVideoExt, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
};

const valid = (key: string) => GUIDE_VIDEO_KEY.test(key) || GUIDE_POSTER_KEY.test(key);

export function guideVideoKey(videoId: string, ext: GuideVideoExt): string {
  const key = `guides/videos/${videoId}.${ext}`;
  if (!GUIDE_VIDEO_KEY.test(key)) throw new Error("kunci video panduan tidak valid");
  return key;
}

export function guidePosterKey(videoId: string): string {
  const key = `guides/posters/${videoId}.png`;
  if (!GUIDE_POSTER_KEY.test(key)) throw new Error("kunci poster panduan tidak valid");
  return key;
}

/** Simpan poster PNG (≤ 2 MB, sudah diperiksa pemanggil) dengan Content-Type dari server. */
export async function putGuidePoster(key: string, body: Uint8Array): Promise<void> {
  if (!GUIDE_POSTER_KEY.test(key)) throw new Error("kunci poster panduan tidak valid");
  await s3Internal().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentLength: body.byteLength,
      ContentType: "image/png",
    }),
  );
}

/** Hapus satu objek video/poster panduan. Tidak ada → tetap sukses (S3 idempoten). */
export async function deleteGuideObject(key: string): Promise<void> {
  if (!valid(key)) throw new Error("kunci objek panduan tidak valid");
  await s3Internal().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

/** Presigned GET 1 jam untuk <video src> / poster (inline, Content-Type dari server). */
export function presignGuideGet(key: string, contentType: string): Promise<string> {
  if (!valid(key)) throw new Error("kunci objek panduan tidak valid");
  return getSignedUrl(
    s3Public(),
    new GetObjectCommand({ Bucket: bucket(), Key: key, ResponseContentType: contentType }),
    { expiresIn: GUIDE_MEDIA_TTL_SEC },
  );
}
