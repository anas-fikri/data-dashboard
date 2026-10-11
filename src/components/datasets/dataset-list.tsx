import { IconChevronRight, IconLayoutDashboard } from "@tabler/icons-react";
import Link from "next/link";
import type { DatasetSummary } from "@/features/datasets/service";
import { StatusBadge } from "./status-badge";

function formatDate(d: Date): string {
  return d.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Daftar dataset: satu struktur yang tampil sebagai tabel di ≥768 dan kartu bertumpuk di ponsel
 * (tanpa scroll horizontal). Seluruh baris adalah tautan ke detail.
 */
export function DatasetList({ datasets }: { datasets: DatasetSummary[] }) {
  return (
    <div
      className="overflow-hidden rounded-lg border bg-card"
      role="list"
      aria-label="Daftar dataset"
    >
      <div
        className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_7rem_11rem_1.5rem] gap-4 border-b bg-muted/50 px-4 py-2.5 text-xs font-medium text-muted-foreground md:grid"
        aria-hidden
      >
        <span>Nama</span>
        <span>Status</span>
        <span>Dashboard</span>
        <span>Diperbarui</span>
        <span />
      </div>
      {datasets.map((d) => (
        <Link
          key={d.id}
          href={`/datasets/${d.id}`}
          role="listitem"
          data-testid="dataset-row"
          className="grid grid-cols-[minmax(0,1fr)_1.5rem] items-center gap-x-4 gap-y-1.5 border-b px-4 py-3 last:border-b-0 hover:bg-accent/60 md:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_7rem_11rem_1.5rem]"
        >
          <span className="min-w-0">
            <span className="block truncate font-medium">{d.name}</span>
            {d.description ? (
              <span className="block truncate text-sm text-muted-foreground">{d.description}</span>
            ) : null}
          </span>
          <IconChevronRight
            size={20}
            stroke={1.5}
            aria-hidden
            className="row-span-3 text-muted-foreground md:order-last md:row-span-1"
          />
          <span className="md:order-none">
            <StatusBadge label={d.label} />
          </span>
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <IconLayoutDashboard size={16} stroke={1.5} aria-hidden className="md:hidden" />
            <span className="md:hidden">Dashboard:</span> {d.dashboardCount}
          </span>
          <span className="text-sm text-muted-foreground">
            <span className="md:hidden">Diperbarui </span>
            {formatDate(d.updatedAt)}
          </span>
        </Link>
      ))}
    </div>
  );
}
