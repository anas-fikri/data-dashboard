import { IconChevronRight, IconLayoutDashboard } from "@tabler/icons-react";
import Link from "next/link";
import type { DatasetSummary } from "@/features/datasets/service";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./status-badge";

function formatDate(d: Date): string {
  return d.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

interface DatasetListProps {
  datasets: DatasetSummary[];
  /** Ringkas (nama + status): untuk kartu sempit seperti Beranda. */
  compact?: boolean;
  /** Tanpa bingkai sendiri saat berada di dalam Card (hindari kotak di dalam kotak). */
  bare?: boolean;
}

/**
 * Daftar dataset (<ul> berisi tautan). Tata letak tabel bergantung LEBAR KONTAINER (@container),
 * bukan viewport, sehingga tidak rusak di kartu setengah lebar (review desain T-003 #1).
 * Label kolom tetap terbaca pembaca layar (sr-only) saat tampil sebagai tabel.
 */
export function DatasetList({ datasets, compact = false, bare = false }: DatasetListProps) {
  const tableCols = "@3xl:grid-cols-[minmax(0,2fr)_minmax(9rem,1.2fr)_6rem_11rem_1.25rem]";
  return (
    <div className={cn("@container", !bare && "overflow-hidden rounded-lg border bg-card")}>
      {!compact ? (
        <div
          className={cn(
            "hidden gap-4 border-b bg-muted/50 px-4 py-2.5 text-xs font-medium text-muted-foreground @3xl:grid",
            tableCols,
          )}
          aria-hidden
        >
          <span>Nama</span>
          <span>Status</span>
          <span>Dashboard</span>
          <span>Diperbarui</span>
          <span />
        </div>
      ) : null}
      <ul aria-label="Daftar dataset" className={cn(bare && "-mx-5 divide-y border-t")}>
        {datasets.map((d) => (
          <li key={d.id} className={cn(!bare && "border-b last:border-b-0")}>
            <Link
              href={`/datasets/${d.id}`}
              data-testid="dataset-row"
              className={cn(
                "grid grid-cols-[minmax(0,1fr)_1.25rem] items-center gap-x-4 gap-y-1.5 px-4 py-3 hover:bg-accent/60",
                !compact && tableCols,
              )}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{d.name}</span>
                {d.description && !compact ? (
                  <span className="block truncate text-sm text-muted-foreground">
                    {d.description}
                  </span>
                ) : null}
              </span>
              <IconChevronRight
                size={20}
                stroke={1.5}
                aria-hidden
                className={cn(
                  "text-muted-foreground",
                  compact ? "row-span-2" : "row-span-3 @3xl:order-last @3xl:row-span-1",
                )}
              />
              <span>
                <span className="sr-only">Status: </span>
                <StatusBadge label={d.label} />
              </span>
              {!compact ? (
                <>
                  <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                    <IconLayoutDashboard
                      size={16}
                      stroke={1.5}
                      aria-hidden
                      className="@3xl:hidden"
                    />
                    <span className="@3xl:sr-only">Dashboard:</span> {d.dashboardCount}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    <span className="@3xl:sr-only">Diperbarui </span>
                    {formatDate(d.updatedAt)}
                  </span>
                </>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
