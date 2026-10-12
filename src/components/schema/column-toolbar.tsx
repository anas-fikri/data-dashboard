"use client";

import { IconSearch } from "@tabler/icons-react";
import { Input } from "@/components/ui/input";
import { fmtInt } from "./labels";

/** Cari nama kolom dan saring kolom bermasalah (sheet bisa ribuan kolom). */
export function ColumnToolbar({
  query,
  onQuery,
  onlyIssues,
  onOnlyIssues,
  issues,
  shown,
  total,
}: {
  query: string;
  onQuery: (q: string) => void;
  onlyIssues: boolean;
  onOnlyIssues: (v: boolean) => void;
  /** Jumlah kolom dengan nilai gagal konversi. */
  issues: number;
  shown: number;
  total: number;
}) {
  return (
    <div className="flex flex-col gap-3 px-5 pb-3 sm:flex-row sm:items-center">
      <div className="relative sm:w-72">
        <label htmlFor="column-search" className="sr-only">
          Cari kolom
        </label>
        <IconSearch
          size={16}
          stroke={1.5}
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id="column-search"
          type="search"
          placeholder="Cari nama kolom"
          className="pl-9 h-11 md:h-(--control-h)"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
      </div>
      {issues > 0 ? (
        <label className="flex min-h-11 items-center gap-2 text-sm sm:min-h-0">
          <input
            type="checkbox"
            className="size-4 accent-[var(--color-primary)]"
            checked={onlyIssues}
            onChange={(e) => onOnlyIssues(e.target.checked)}
          />
          Hanya kolom dengan nilai gagal konversi ({fmtInt(issues)})
        </label>
      ) : null}
      <p className="text-sm text-muted-foreground sm:ml-auto" aria-live="polite">
        {shown === total
          ? `${fmtInt(total)} kolom`
          : `${fmtInt(shown)} dari ${fmtInt(total)} kolom`}
      </p>
    </div>
  );
}
