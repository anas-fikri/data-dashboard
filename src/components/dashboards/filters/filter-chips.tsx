"use client";

import { IconClick, IconX } from "@tabler/icons-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDashboardFilters } from "./filter-context";
import { normName } from "./filter-model";
import { filterText } from "./filter-text";

/*
 * Filter aktif sebagai chip (T-012): "Kolom: isi" + tombol hapus berlabel, filter silang "Disaring
 * dari <widget>: <nilai>" dengan tombol hapusnya sendiri, dan "Hapus semua filter". Setelah menghapus,
 * fokus pindah ke chip berikutnya (atau sebelumnya); bila tidak ada lagi → `onEmpty` (pemanggil
 * memfokuskan kontrol filter pertama), agar fokus tidak jatuh ke <body>.
 */
const CHIP =
  "inline-flex min-h-8 max-w-full items-center gap-1 rounded-full border bg-muted pl-3 text-sm";
const REMOVE =
  "size-11 shrink-0 rounded-full text-muted-foreground hover:text-foreground md:not-any-pointer-coarse:size-8 [&_svg]:size-4";

export function FilterChips({ onEmpty }: { onEmpty: () => void }) {
  const { state, columns, setFilter, clearCross, clearAll, widgetTitle, widgetGrain } =
    useDashboardFilters();
  const list = useRef<HTMLUListElement>(null);
  /** Indeks chip yang difokus setelah render berikutnya (null = tidak ada permintaan). */
  const focusAt = useRef<number | null>(null);
  const count = state.filters.length + (state.cross ? 1 : 0);

  useEffect(() => {
    const at = focusAt.current;
    if (at === null) return;
    focusAt.current = null;
    const buttons = list.current?.querySelectorAll<HTMLButtonElement>("[data-chip-remove]");
    const target = buttons?.[Math.min(at, buttons.length - 1)];
    if (target) target.focus();
    else onEmpty();
  });

  if (count === 0) return null;
  const remove = (index: number, run: () => void) => {
    focusAt.current = index;
    run();
  };
  const cross = state.cross;
  const crossTitle = cross ? widgetTitle(cross.widgetId) : "";

  return (
    <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
      <ul ref={list} aria-label="Filter aktif" className="flex min-w-0 flex-wrap gap-2">
        {state.filters.map((f, i) => {
          const col = columns.find((c) => normName(c.column) === normName(f.column));
          const text = `${f.column}: ${filterText(f, col?.type)}`;
          return (
            <li key={f.column} className={CHIP} data-testid="filter-chip" data-column={f.column}>
              <span className="min-w-0 truncate" title={text}>
                {text}
              </span>
              <Button
                size="icon-sm"
                variant="ghost"
                className={REMOVE}
                aria-label={`Hapus filter ${f.column}`}
                data-chip-remove=""
                onClick={() => remove(i, () => setFilter(f.column, null))}
              >
                <IconX aria-hidden />
              </Button>
            </li>
          );
        })}
        {cross ? (
          <li
            className={cn(CHIP, "border-primary bg-primary/10")}
            data-testid="cross-filter-chip"
            data-widget-id={cross.widgetId}
          >
            <IconClick size={16} stroke={1.5} aria-hidden className="shrink-0 text-primary" />
            <span
              className="min-w-0 truncate"
              title={`Disaring dari ${crossTitle}: ${filterText(cross.filter, undefined, widgetGrain(cross.widgetId))}`}
            >
              Disaring dari <span className="font-medium">{crossTitle}</span>:{" "}
              {filterText(cross.filter, undefined, widgetGrain(cross.widgetId))}
            </span>
            <Button
              size="icon-sm"
              variant="ghost"
              className={REMOVE}
              aria-label={`Hapus filter silang dari ${crossTitle}`}
              data-chip-remove=""
              data-testid="cross-filter-clear"
              onClick={() => remove(state.filters.length, clearCross)}
            >
              <IconX aria-hidden />
            </Button>
          </li>
        ) : null}
      </ul>
      <Button
        variant="ghost"
        size="sm"
        className="h-(--control-h-lg) self-start md:h-(--control-h-sm)"
        data-testid="filter-clear-all"
        onClick={() => remove(0, clearAll)}
      >
        Hapus semua filter
      </Button>
    </div>
  );
}
