import { IconChevronRight } from "@tabler/icons-react";
import Link from "next/link";
import { AccessBadges } from "@/components/sharing/access-badge";
import type { DashboardSummary } from "@/features/dashboards/service";

/** Waktu "Diperbarui" daftar dashboard (Asia/Jakarta); dipakai juga daftar "Dibagikan ke saya". */
export function formatUpdated(d: Date): string {
  return d.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Daftar dashboard milik sendiri (<ul> berisi tautan), pola yang sama dengan daftar dataset: tabel saat
 * kontainer lebar (@container), bertumpuk saat sempit; label kolom tetap terbaca pembaca layar. Kolom
 * Akses (T-016): Pribadi / N orang / Organisasi.
 */
export function DashboardList({ dashboards }: { dashboards: DashboardSummary[] }) {
  const cols =
    "@3xl:grid-cols-[minmax(0,2fr)_minmax(9rem,1.4fr)_minmax(7rem,auto)_5rem_11rem_1.25rem]";
  return (
    <div className="@container overflow-hidden rounded-lg border bg-card">
      <div
        className={`hidden gap-4 border-b bg-muted/50 px-4 py-2.5 text-xs font-medium text-muted-foreground @3xl:grid ${cols}`}
        aria-hidden
      >
        <span>Nama</span>
        <span>Dataset</span>
        <span>Akses</span>
        <span>Widget</span>
        <span>Diperbarui</span>
        <span />
      </div>
      <ul aria-label="Dashboard saya">
        {dashboards.map((d) => (
          <li key={d.id} className="border-b last:border-b-0">
            <Link
              href={`/dashboards/${d.id}`}
              data-testid="dashboard-row"
              className={`grid min-h-11 grid-cols-[minmax(0,1fr)_1.25rem] items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-accent/60 ${cols}`}
            >
              <span className="line-clamp-2 min-w-0 break-words font-medium" title={d.name}>
                {d.name}
              </span>
              <IconChevronRight
                size={20}
                stroke={1.5}
                aria-hidden
                className="row-span-4 text-muted-foreground @3xl:order-last @3xl:row-span-1"
              />
              <span className="min-w-0 truncate text-sm text-muted-foreground">
                <span className="@3xl:sr-only">Dataset: </span>
                {d.datasetName}
              </span>
              <span className="min-w-0">
                <span className="sr-only">Akses: </span>
                <AccessBadges orgShared={d.orgShared} shareCount={d.shareCount} />
              </span>
              <span className="text-sm tabular-nums text-muted-foreground">
                {d.widgetCount}
                <span className="@3xl:sr-only"> widget</span>
              </span>
              <span className="text-sm text-muted-foreground">
                <span className="@3xl:sr-only">Diperbarui </span>
                {formatUpdated(d.updatedAt)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
