import { IconClockHour4 } from "@tabler/icons-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/features/auth/session";

export const metadata = { title: "Panduan" };

/** Placeholder sampai T-022 (halaman panduan per peran). */
export default async function Page() {
  await requireUser();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Panduan penggunaan" />
      <EmptyState
        icon={<IconClockHour4 />}
        title="Segera hadir"
        description="Panduan teks dan video sesuai peran Anda sedang disiapkan."
      />
    </div>
  );
}
