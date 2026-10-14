"use client";

import type { ColumnType } from "@/features/ingest/infer";
import { cn } from "@/lib/utils";
import type { FilterValue } from "./filter-model";
import { valueText } from "./filter-text";

/*
 * Satu nilai slicer (T-012): kotak centang + label (maks. 2 baris, teks lengkap di title). `locked`:
 * daftar penuh (disabled). `last`: centang terakhir di mode kecualikan — tetap bisa difokus
 * (aria-disabled, tekan diabaikan) dengan alasannya di `reasonId`.
 */
export function SlicerOption({
  value,
  type,
  on,
  locked,
  last,
  reasonId,
  onToggle,
}: {
  value: FilterValue;
  type: ColumnType;
  on: boolean;
  locked: boolean;
  last: boolean;
  reasonId: string;
  onToggle: () => void;
}) {
  const text = valueText(value, type);
  return (
    <label
      data-testid="filter-slicer-option"
      data-value={value === null ? "" : String(value)}
      className="flex min-h-11 min-w-0 cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-sm hover:bg-accent has-disabled:cursor-not-allowed has-disabled:opacity-60 has-aria-disabled:cursor-not-allowed md:min-h-9"
    >
      <input
        type="checkbox"
        className="size-4 shrink-0 accent-(--color-primary)"
        checked={on}
        disabled={locked}
        aria-disabled={last || undefined}
        aria-describedby={last ? reasonId : undefined}
        onChange={() => {
          if (!last) onToggle();
        }}
      />
      <span
        className={cn(
          "line-clamp-2 min-w-0 break-words [overflow-wrap:anywhere]",
          value === null && "italic",
        )}
        title={text}
      >
        {text}
      </span>
    </label>
  );
}
