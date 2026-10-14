"use client";

import { IconAdjustmentsHorizontal, IconChevronDown, IconX } from "@tabler/icons-react";
import { Dialog } from "radix-ui";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DatePanel } from "./date-panel";
import { controlSummary, UnavailableColumn, useColumnFilter } from "./filter-control";
import { useDashboardFilters } from "./filter-context";
import { controlOf, type FilterColumnView } from "./filter-model";
import { NumberPanel } from "./number-panel";
import { SlicerPanel } from "./slicer-panel";

/*
 * Filter di bilah sempit (ponsel, tablet dengan sidebar; T-012): tombol "Filter (n)" selebar bilah
 * membuka lembar dari bawah berisi kontrol yang sama, satu bagian per kolom (dibuka satu per satu —
 * slicer baru memuat nilainya saat bagiannya dibuka). Pilihan langsung berlaku; "Selesai" hanya
 * menutup lembar. Fokus terkunci di lembar, Escape menutup, fokus kembali ke tombol pemicu; setelah
 * "Hapus semua filter" (tombolnya hilang) fokus pindah ke "Selesai".
 */
export function FilterSheet({ triggerRef }: { triggerRef: React.Ref<HTMLButtonElement> }) {
  const { columns, state, clearAll } = useDashboardFilters();
  const count = state.filters.length + (state.cross ? 1 : 0);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const done = useRef<HTMLButtonElement>(null);
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button
          ref={triggerRef}
          variant="outline"
          className="h-(--control-h-lg) w-full"
          leadingIcon={<IconAdjustmentsHorizontal aria-hidden />}
          data-testid="filter-sheet-open"
        >
          Filter{count ? ` (${count})` : ""}
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay/40" />
        <Dialog.Content
          aria-describedby={undefined}
          data-testid="filter-sheet"
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[85dvh] max-w-2xl flex-col rounded-t-lg border bg-card shadow-lg"
        >
          <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
            <Dialog.Title className="text-base font-semibold">Filter dashboard</Dialog.Title>
            <Dialog.Close asChild>
              <Button size="icon-lg" variant="ghost" aria-label="Tutup filter">
                <IconX aria-hidden />
              </Button>
            </Dialog.Close>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-2">
            {columns.map((c) =>
              c.available ? (
                <Section
                  key={c.key}
                  column={c}
                  open={openKey === c.key}
                  onToggle={() => setOpenKey(openKey === c.key ? null : c.key)}
                />
              ) : (
                <div key={c.key} className="border-b py-2 last:border-b-0">
                  <UnavailableColumn column={c} />
                </div>
              ),
            )}
          </div>
          <div className="flex flex-col gap-2 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Dialog.Close asChild>
              <Button ref={done} className="h-(--control-h-lg) w-full">
                Selesai
              </Button>
            </Dialog.Close>
            {count ? (
              <Button
                variant="outline"
                className="h-(--control-h-lg) w-full"
                onClick={() => {
                  done.current?.focus();
                  clearAll();
                }}
              >
                Hapus semua filter
              </Button>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Section({
  column,
  open,
  onToggle,
}: {
  column: FilterColumnView;
  open: boolean;
  onToggle: () => void;
}) {
  const id = useId();
  const { dashboardId } = useDashboardFilters();
  const { value, set, allMode, setAllMode } = useColumnFilter(column);
  const kind = controlOf(column.type);
  return (
    <section className="border-b last:border-b-0">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          onClick={onToggle}
          className="flex min-h-11 w-full items-center gap-2 py-2 text-left text-base"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{column.column}</span>
            <span className={cn("block truncate text-sm", !value && "text-muted-foreground")}>
              {controlSummary(column, value)}
            </span>
          </span>
          <IconChevronDown
            size={20}
            stroke={1.5}
            aria-hidden
            className={cn(
              "shrink-0 transition-transform motion-reduce:transition-none",
              open && "rotate-180",
            )}
          />
        </button>
      </h3>
      {open ? (
        <div id={`${id}-panel`} className="pb-3">
          {kind === "slicer" ? (
            <SlicerPanel
              dashboardId={dashboardId}
              column={column}
              value={value}
              onChange={set}
              allMode={allMode}
              onAllMode={setAllMode}
            />
          ) : kind === "date" ? (
            <DatePanel column={column} value={value} onChange={set} />
          ) : (
            <NumberPanel column={column} value={value} onChange={set} />
          )}
        </div>
      ) : null}
    </section>
  );
}
