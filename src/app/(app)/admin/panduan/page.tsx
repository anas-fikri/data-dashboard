import { IconBook2, IconPlus } from "@tabler/icons-react";
import Link from "next/link";
import { AdminCrumb } from "@/components/admin/admin-crumb";
import { GuideList } from "@/components/guides/guide-list";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdmin } from "@/features/auth/session";
import { listGuidesForAdmin } from "@/features/guides/service";

export const metadata = { title: "Panduan · Admin" };

/** Artikel panduan per peran (T-020): urutan, status terbit, ubah/hapus. Hanya admin (selain 404). */
export default async function Page() {
  await requireAdmin();
  const guides = await listGuidesForAdmin();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={<AdminCrumb />}
        title="Panduan"
        description="Artikel panduan per peran. Hanya artikel terbit yang tampil di halaman Panduan."
        actions={
          <Button asChild className="h-(--control-h-lg) w-full md:h-(--control-h) md:w-auto">
            <Link href="/admin/panduan/baru">
              <IconPlus aria-hidden />
              Artikel baru
            </Link>
          </Button>
        }
      />
      {guides.length ? (
        <GuideList
          guides={guides.map(({ id, title, slug, role, contextKey, status }) => ({
            id,
            title,
            slug,
            role,
            contextKey,
            status,
          }))}
        />
      ) : (
        <EmptyState
          icon={<IconBook2 />}
          title="Belum ada artikel"
          description="Tulis artikel pertama untuk pemilik data, editor, viewer, atau semua peran."
        />
      )}
    </div>
  );
}
