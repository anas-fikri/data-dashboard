import { IconClockHour4 } from "@tabler/icons-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Dashboard" };

/** Placeholder sampai T-010 (builder dashboard). */
export default function Page() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Dashboard" />
      <EmptyState
        icon={<IconClockHour4 />}
        title="Segera hadir"
        description="Builder dashboard sedang dibangun."
      />
    </div>
  );
}
