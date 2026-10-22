import type { GuideContext, GuideRole } from "@prisma/client";
import Link from "next/link";
import { GuideMarkdown } from "@/features/guides/markdown";
import { guideOrigins } from "@/features/guides/origins";
import { contextGuides } from "@/features/guides/reader";
import { videosFor } from "@/features/guides/videos";
import { HelpSheet } from "./help-sheet";
import { GuideVideoPlayer } from "./video-player";

/**
 * Tombol "Bantuan" + panel samping untuk satu halaman (T-022): artikel terbit dengan contextKey cocok
 * untuk peran user DI HALAMAN INI (+ Semua peran). `as` ditetapkan halaman server yang sudah menjaga
 * aksesnya (dataset/skema: pemilik; dashboard: pemilik atau editor), bukan dari input user — artikel
 * peran lain milik user (mis. Viewer dari share organisasi) tidak relevan di sini. Tanpa artikel →
 * tidak ada tombol. Halaman dengan beberapa bagian (dataset: unggah + pivot tersimpan) memberi beberapa
 * konteks.
 */
export async function GuideHelp({
  context,
  page,
  as,
}: {
  context: GuideContext | readonly GuideContext[];
  page: string;
  as: GuideRole;
}) {
  const guides = await contextGuides([as], context);
  if (!guides.length) return null;
  const [videos, origins] = [await videosFor(guides.map((g) => g.id)), guideOrigins()];
  return (
    <HelpSheet page={page}>
      {guides.map((g) => (
        <article
          key={g.id}
          aria-labelledby={`help-${g.id}`}
          data-testid="help-article"
          className="flex flex-col gap-3"
        >
          <h3 id={`help-${g.id}`} className="text-base font-semibold [overflow-wrap:anywhere]">
            {g.title}
          </h3>
          <GuideMarkdown markdown={g.bodyMarkdown} origins={origins} headingOffset={3} />
          {videos
            .filter((v) => v.articleId === g.id)
            .map((v) => (
              <GuideVideoPlayer key={v.id} video={v} />
            ))}
          <Link
            href={`/panduan/${g.slug}`}
            className="inline-flex min-h-11 items-center self-start text-sm font-medium text-primary underline underline-offset-4 md:min-h-6"
          >
            Buka artikel lengkap<span className="sr-only">: {g.title}</span>
          </Link>
        </article>
      ))}
    </HelpSheet>
  );
}
