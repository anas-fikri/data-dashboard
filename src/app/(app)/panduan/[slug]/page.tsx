import Link from "next/link";
import { notFound } from "next/navigation";
import { ROLE_PARAM } from "@/components/guides/guide-browse";
import { MarkReadButton } from "@/components/guides/mark-read-button";
import { GuideVideoPlayer } from "@/components/guides/video-player";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/features/auth/session";
import { GuideMarkdown } from "@/features/guides/markdown";
import { guideOrigins } from "@/features/guides/origins";
import { guideBySlug, guideRolesFor, readArticleIds } from "@/features/guides/reader";
import { videosFor } from "@/features/guides/videos";

type Params = Promise<{ slug: string }>;

export const metadata = { title: "Panduan" };

/** Satu artikel panduan (T-022). Di luar peran user atau belum terbit → 404 (bukan 403). */
export default async function Page({ params }: { params: Params }) {
  const user = await requireUser();
  const roles = await guideRolesFor(user.id, user.isAdmin);
  const { slug } = await params;
  const g = await guideBySlug(roles, slug);
  if (!g) notFound();
  const [videos, read] = await Promise.all([videosFor([g.id]), readArticleIds(user.id, [g.id])]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={
          <Link
            href={`/panduan?peran=${ROLE_PARAM[g.role]}`}
            className="inline-flex min-h-11 items-center underline-offset-4 hover:underline md:min-h-6"
          >
            Panduan
          </Link>
        }
        title={g.title}
        actions={<MarkReadButton articleId={g.id} read={read.has(g.id)} />}
      />
      <article aria-label={g.title} className="flex max-w-3xl flex-col gap-6">
        <GuideMarkdown markdown={g.bodyMarkdown} origins={guideOrigins()} headingOffset={1} />
        {videos.length ? (
          <div className="flex flex-col gap-4">
            {videos.map((v) => (
              <GuideVideoPlayer key={v.id} video={v} preload="metadata" />
            ))}
          </div>
        ) : null}
        {/* Artikel panjang: pembaca yang sampai di akhir tidak perlu menggulir balik ke kepala (T-exfc). */}
        <footer className="border-t pt-5">
          <MarkReadButton articleId={g.id} read={read.has(g.id)} />
        </footer>
      </article>
    </div>
  );
}
