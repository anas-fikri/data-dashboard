import { IconChevronRight } from "@tabler/icons-react";
import Link from "next/link";
import { formatUpdated } from "@/components/dashboards/dashboard-list";
import type { SharedDashboardSummary } from "@/features/dashboards/service";
import { cn } from "@/lib/utils";
import { SharedRoleBadge } from "./access-badge";

interface SharedDashboardListProps {
  dashboards: SharedDashboardSummary[];
  /** Ringkas (nama, pemilik, peran): untuk kartu sempit seperti Beranda. */
  compact?: boolean;
  /** Tanpa bingkai sendiri saat berada di dalam Card (hindari kotak di dalam kotak). */
  bare?: boolean;
}

/**
 * Dashboard yang dibagikan ke saya (T-016), termasuk lewat berbagi organisasi: nama, dataset, pemilik,
 * peran. Pola sama dengan daftar dashboard sendiri — tabel saat kontainer lebar, bertumpuk saat sempit;
 * label kolom tetap terbaca pembaca layar. Nama pemilik/dataset diisolasi (<bdi>) dari teks sekitarnya.
 */
export function SharedDashboardList({
  dashboards,
  compact = false,
  bare = false,
}: SharedDashboardListProps) {
  const cols =
    "@3xl:grid-cols-[minmax(0,2fr)_minmax(8rem,1.2fr)_minmax(8rem,1.2fr)_7.5rem_11rem_1.25rem]";
  return (
    <div
      data-testid="shared-list"
      className={cn("@container", !bare && "overflow-hidden rounded-lg border bg-card")}
    >
      {!compact ? (
        <div
          className={cn(
            "hidden gap-4 border-b bg-muted/50 px-4 py-2.5 text-xs font-medium text-muted-foreground @3xl:grid",
            cols,
          )}
          aria-hidden
        >
          <span>Nama</span>
          <span>Dataset</span>
          <span>Pemilik</span>
          <span>Peran</span>
          <span>Diperbarui</span>
          <span />
        </div>
      ) : null}
      <ul
        aria-label="Dashboard dibagikan ke saya"
        className={cn(bare && "-mx-5 divide-y border-t")}
      >
        {dashboards.map((d) => (
          <li key={d.id} className={cn(!bare && "border-b last:border-b-0")}>
            <Link
              href={`/dashboards/${d.id}`}
              data-testid="shared-row"
              className={cn(
                "grid min-h-11 grid-cols-[minmax(0,1fr)_1.25rem] items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-accent/60",
                !compact && cols,
              )}
            >
              <span className="line-clamp-2 min-w-0 break-words font-medium" title={d.name}>
                {d.name}
              </span>
              <IconChevronRight
                size={20}
                stroke={1.5}
                aria-hidden
                className={cn(
                  "text-muted-foreground",
                  compact ? "row-span-3" : "row-span-5 @3xl:order-last @3xl:row-span-1",
                )}
              />
              {compact ? null : (
                <span className="min-w-0 truncate text-sm text-muted-foreground">
                  <span className="@3xl:sr-only">Dataset: </span>
                  <bdi>{d.datasetName}</bdi>
                </span>
              )}
              <span className="min-w-0 truncate text-sm text-muted-foreground">
                <span className={compact ? undefined : "@3xl:sr-only"}>Pemilik: </span>
                <bdi>{d.ownerName ?? "Tanpa nama"}</bdi>
              </span>
              <span>
                <span className="sr-only">Peran Anda: </span>
                <SharedRoleBadge role={d.role} />
              </span>
              {compact ? null : (
                <span className="text-sm text-muted-foreground">
                  <span className="@3xl:sr-only">Diperbarui </span>
                  {formatUpdated(d.updatedAt)}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
