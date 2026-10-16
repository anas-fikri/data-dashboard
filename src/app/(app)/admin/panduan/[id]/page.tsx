import { notFound } from "next/navigation";
import { GuideEditor } from "@/components/guides/guide-editor";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdmin } from "@/features/auth/session";
import { guideOrigins } from "@/features/guides/origins";
import { getGuide } from "@/features/guides/service";

export const metadata = { title: "Ubah artikel panduan · Admin" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const g = await getGuide(id);
  if (!g) notFound();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Ubah artikel panduan"
        description={
          g.status === "PUBLISHED"
            ? "Artikel ini sudah terbit: perubahan langsung tampil."
            : "Draf: belum tampil di halaman Panduan."
        }
      />
      <GuideEditor
        origins={guideOrigins()}
        guide={{
          id: g.id,
          title: g.title,
          slug: g.slug,
          role: g.role,
          contextKey: g.contextKey,
          bodyMarkdown: g.bodyMarkdown,
        }}
      />
    </div>
  );
}
