import { AdminCrumb } from "@/components/admin/admin-crumb";
import { ResourcesPanel } from "@/components/admin/resources-panel";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdmin } from "@/features/auth/session";

export const metadata = { title: "Sumber daya · Admin" };

/** Pemakaian server (v1.18, ADR-0010): admin saja — non-admin mendapat 404 dari requireAdmin. */
export default async function AdminResourcesPage() {
  await requireAdmin();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={<AdminCrumb />}
        title="Sumber daya server"
        description="CPU, RAM, disk, dan jaringan server beserta pemakaian container dashboard. Diperbarui tiap 10 detik."
      />
      <ResourcesPanel />
    </div>
  );
}
