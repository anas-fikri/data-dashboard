import { AdminCrumb } from "@/components/admin/admin-crumb";
import { GuideEditor } from "@/components/guides/guide-editor";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdmin } from "@/features/auth/session";
import { guideOrigins } from "@/features/guides/origins";

export const metadata = { title: "Artikel panduan baru · Admin" };

export default async function Page() {
  await requireAdmin();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={<AdminCrumb href="/admin/panduan">Panduan</AdminCrumb>}
        title="Artikel panduan baru"
        description="Tersimpan sebagai draf; terbitkan dari daftar Panduan setelah diperiksa."
      />
      <GuideEditor origins={guideOrigins()} />
    </div>
  );
}
