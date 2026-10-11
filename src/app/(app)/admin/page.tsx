import { IconClockHour4 } from "@tabler/icons-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Admin" };

/** Placeholder sampai T-019 (pengguna) dan T-020 (panduan). Akses dibatasi di T-002/T-019. */
export default function Page() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Admin" />
      <EmptyState
        icon={<IconClockHour4 />}
        title="Segera hadir"
        description="Pengelolaan pengguna dan panduan sedang dibangun."
      />
    </div>
  );
}
