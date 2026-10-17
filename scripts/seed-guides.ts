/*
 * Isi awal panduan (T-xfzy): artikel terbit dari content/panduan/NN-<slug>.md dan (opsional) video
 * rekaman layar dari folder berisi videos.json [{ slug, file, title }].
 *   npx tsx --conditions=react-server --env-file-if-exists=.env scripts/seed-guides.ts \
 *     [--videos demo/guide-videos] [--update]
 * Idempoten per slug: artikel yang sudah ada dilewati (suntingan admin aman) kecuali --update (isi,
 * judul, peran, konteks ditimpa; urutan dan status tetap). Video dilewati bila artikel sudah punya
 * video dengan judul sama. Durasi (ffprobe) dan poster PNG (ffmpeg detik 1) bila ffmpeg tersedia.
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { parseGuideFile } from "../src/features/guides/content";
import {
  POSTER_MAX_BYTES,
  VIDEO_MAX_BYTES,
  isPng,
  sniffVideo,
  videoExtOf,
} from "../src/features/guides/media";
import { prisma } from "../src/lib/db";
import {
  VIDEO_CONTENT_TYPE,
  guidePosterKey,
  guideVideoKey,
  putGuidePoster,
} from "../src/lib/storage/guides";
import { bucket, s3Internal } from "../src/lib/storage/s3";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const UPDATE = process.argv.includes("--update");
const VIDEOS = arg("--videos");
const DIR = join(process.cwd(), "content/panduan");

async function seedArticles(): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  const files = readdirSync(DIR)
    .filter((f) => f.endsWith(".md"))
    .sort();
  for (const file of files) {
    const g = parseGuideFile(readFileSync(join(DIR, file), "utf8"), file);
    const found = await prisma.guideArticle.findUnique({ where: { slug: g.slug } });
    if (found) {
      ids.set(g.slug, found.id);
      if (!UPDATE) {
        console.log(`lewati (sudah ada): ${g.slug}`);
        continue;
      }
      await prisma.guideArticle.update({ where: { id: found.id }, data: g });
      console.log(`perbarui: ${g.slug}`);
      continue;
    }
    const last = await prisma.guideArticle.aggregate({ _max: { order: true } });
    const row = await prisma.guideArticle.create({
      data: { ...g, order: (last._max.order ?? 0) + 1, status: "PUBLISHED" },
    });
    ids.set(g.slug, row.id);
    console.log(`buat + terbitkan: ${g.slug}`);
  }
  return ids;
}

function probe(path: string): { durationSec: number | null; poster: Buffer | null } {
  try {
    const d = Number(
      execFileSync("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "csv=p=0",
        path,
      ])
        .toString()
        .trim(),
    );
    const poster = execFileSync("ffmpeg", [
      ...["-hide_banner", "-loglevel", "error", "-ss", "1", "-i", path],
      ...[
        "-frames:v",
        "1",
        "-vf",
        "scale='min(1280,iw)':-2",
        "-f",
        "image2pipe",
        "-c:v",
        "png",
        "-",
      ],
    ]);
    return {
      durationSec: Number.isFinite(d) && d > 0 ? Math.round(d) : null,
      poster: isPng(poster) && poster.byteLength <= POSTER_MAX_BYTES ? poster : null,
    };
  } catch {
    return { durationSec: null, poster: null };
  }
}

interface ManifestEntry {
  slug: string;
  file: string;
  title: string;
  /** Dari scripts/guide-video-meta.mjs (mesin perekam punya ffmpeg; image produksi tidak). */
  durationSec?: number;
  poster?: string;
}

/** Metadata dari manifest; bila tidak ada, coba ffprobe/ffmpeg lokal. */
function metaOf(dir: string, v: ManifestEntry) {
  const fallback = v.durationSec && v.poster ? null : probe(join(dir, v.file));
  const png = v.poster ? readFileSync(join(dir, v.poster)) : fallback?.poster;
  return {
    durationSec: v.durationSec ?? fallback?.durationSec ?? null,
    poster: png && isPng(png) && png.byteLength <= POSTER_MAX_BYTES ? png : null,
  };
}

async function seedVideos(dir: string, ids: Map<string, string>) {
  const list = JSON.parse(readFileSync(join(dir, "videos.json"), "utf8")) as ManifestEntry[];
  for (const v of list) {
    const articleId = ids.get(v.slug);
    if (!articleId) throw new Error(`videos.json: artikel ${v.slug} tidak ada di content/panduan`);
    const found = await prisma.guideVideo.findFirst({ where: { articleId, title: v.title } });
    if (found) {
      // Lengkapi durasi/poster yang dulu kosong (seed tanpa metadata); selain itu lewati.
      const meta = found.durationSec && found.posterKey ? null : metaOf(dir, v);
      if (meta && (meta.durationSec || meta.poster)) {
        let posterKey = found.posterKey;
        if (!posterKey && meta.poster) {
          posterKey = guidePosterKey(found.id);
          await putGuidePoster(posterKey, meta.poster);
        }
        await prisma.guideVideo.update({
          where: { id: found.id },
          data: { posterKey, durationSec: found.durationSec ?? meta.durationSec },
        });
        console.log(`lengkapi video: ${v.slug} · ${v.title}`);
      } else console.log(`lewati video (sudah ada): ${v.slug} · ${v.title}`);
      continue;
    }
    const path = join(dir, v.file);
    const ext = videoExtOf(v.file);
    const size = statSync(path).size;
    const body = readFileSync(path);
    if (!ext || size > VIDEO_MAX_BYTES || !sniffVideo(ext, body.subarray(0, 64)))
      throw new Error(`${v.file}: bukan video mp4/webm ≤ 500 MB`);
    const id = `v${randomBytes(12).toString("hex")}`;
    const objectKey = guideVideoKey(id, ext);
    await s3Internal().send(
      new PutObjectCommand({
        Bucket: bucket(),
        Key: objectKey,
        Body: body,
        ContentLength: size,
        ContentType: VIDEO_CONTENT_TYPE[ext],
      }),
    );
    const meta = metaOf(dir, v);
    let posterKey: string | null = null;
    if (meta.poster) {
      posterKey = guidePosterKey(id);
      await putGuidePoster(posterKey, meta.poster);
    }
    await prisma.guideVideo.create({
      data: {
        id,
        articleId,
        title: v.title,
        ext,
        sizeBytes: size,
        objectKey,
        posterKey,
        durationSec: meta.durationSec,
        status: "READY",
      },
    });
    console.log(`video: ${v.slug} · ${v.title} (${meta.durationSec ?? "?"} dtk)`);
  }
}

async function main() {
  const ids = await seedArticles();
  if (VIDEOS) await seedVideos(VIDEOS, ids);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
