import { IconClockHour4 } from "@tabler/icons-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Dataset" };

/** Placeholder sampai T-003 (profil dataset). */
export default function Page() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Dataset" />
      <EmptyState
        icon={<IconClockHour4 />}
        title="Segera hadir"
        description="Daftar profil dataset sedang dibangun."
      />
    </div>
  );
}
