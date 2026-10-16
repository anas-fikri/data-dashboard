import { notFound } from "next/navigation";
import { AdminCrumb } from "@/components/admin/admin-crumb";
import { GuideEditor } from "@/components/guides/guide-editor";
import { GuideVideos } from "@/components/guides/guide-videos";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdmin } from "@/features/auth/session";
import { guideOrigins } from "@/features/guides/origins";
import { getGuide } from "@/features/guides/service";
import { videosFor } from "@/features/guides/videos";

export const metadata = { title: "Ubah artikel panduan · Admin" };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const { created } = await searchParams;
  const g = await getGuide(id);
  if (!g) notFound();
  const videos = await videosFor([g.id]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={<AdminCrumb href="/admin/panduan">Panduan</AdminCrumb>}
        title="Ubah artikel panduan"
        description={
          g.status === "PUBLISHED"
            ? "Artikel ini sudah terbit: perubahan langsung tampil."
            : "Draf: belum tampil di halaman Panduan."
        }
      />
      <GuideEditor
        origins={guideOrigins()}
        created={created === "1"}
        guide={{
          id: g.id,
          title: g.title,
          slug: g.slug,
          role: g.role,
          contextKey: g.contextKey,
          bodyMarkdown: g.bodyMarkdown,
        }}
      />
      <GuideVideos articleId={g.id} videos={videos} />
    </div>
  );
}
