"use client";

import { IconCheck } from "@tabler/icons-react";
import type { SheetPreview } from "@/features/ingest/preview";
import { cn } from "@/lib/utils";
import { fmtInt } from "./labels";

const SHOWN_CELLS = 8;

/** Baris mentah awal sebagai pilihan radio (kolom pertama saja; sel kosong ditandai). */
export function HeaderPreviewList({
  preview,
  headerRow,
  selected,
  name,
  disabled,
  onSelect,
}: {
  preview: SheetPreview;
  headerRow: number;
  selected: number;
  name: string;
  disabled: boolean;
  onSelect: (row: number) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-sm font-medium">Pilih baris yang berisi judul kolom</legend>
      <div
        className="relative max-h-80 overflow-auto rounded-md border"
        role="group"
        aria-label="Pratinjau baris awal file"
      >
        {preview.rows.map((r) => {
          const isSelected = selected === r.row;
          return (
            <label
              key={r.row}
              data-testid="header-row-option"
              data-row={r.row}
              className={cn(
                "group flex min-h-11 cursor-pointer items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0 hover:bg-accent/50",
              )}
            >
              <input
                type="radio"
                name={name}
                value={r.row}
                checked={isSelected}
                disabled={disabled}
                className="size-4 shrink-0 accent-[var(--color-primary)]"
                onChange={() => onSelect(r.row)}
              />
              <span
                className={cn(
                  "w-14 shrink-0 tabular-nums group-hover:text-foreground",
                  isSelected ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                Baris {fmtInt(r.row)}
              </span>
              <span className="flex min-w-0 flex-1 gap-1.5 overflow-hidden">
                {r.cells.slice(0, SHOWN_CELLS).map((c, i) => (
                  <span
                    key={i}
                    className={cn(
                      "max-w-[9rem] shrink-0 truncate rounded-sm border px-1.5 py-0.5",
                      c === null && "border-dashed text-muted-foreground",
                    )}
                  >
                    {c ?? "kosong"}
                  </span>
                ))}
              </span>
              {r.row === headerRow ? (
                <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  <IconCheck size={14} stroke={2} aria-hidden /> Saat ini
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
      {preview.colCount > SHOWN_CELLS ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Menampilkan {SHOWN_CELLS} kolom pertama dari {fmtInt(preview.colCount)}.
        </p>
      ) : null}
    </fieldset>
  );
}
