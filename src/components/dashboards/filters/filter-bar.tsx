"use client";

import { IconFilter } from "@tabler/icons-react";
import { useRef } from "react";
import { FilterChips } from "./filter-chips";
import { FilterControl } from "./filter-control";
import { useDashboardFilters } from "./filter-context";
import { filterText } from "./filter-text";
import { FilterSheet } from "./filter-sheet";

/*
 * Bilah filter di atas kanvas (T-012), mode lihat dan edit. ≥ 768 px: satu kontrol per kolom filter
 * (popover); < 768 px: tombol "Filter (n)" yang membuka lembar. Di bawahnya chip filter aktif + filter
 * silang. Tanpa kolom filter: di mode lihat hanya muncul saat ada filter silang; di mode edit memberi
 * tahu tempat menambah kolom filter. Perubahan diumumkan sopan ke pembaca layar.
 */
export const FILTER_SETTINGS_ID = "kolom-filter";

export function FilterBar({ editing }: { editing: boolean }) {
  const { columns, state, urlTooLong, widgetTitle } = useDashboardFilters();
  const sheetButton = useRef<HTMLButtonElement>(null);
  const desktop = useRef<HTMLDivElement>(null);
  const active = state.filters.length + (state.cross ? 1 : 0);

  // Fokus setelah chip terakhir dihapus: kontrol pertama yang terlihat (ponsel: tombol lembar).
  const focusFirst = () => {
    const first = desktop.current?.querySelector<HTMLElement>("button");
    if (first && first.offsetParent !== null) first.focus();
    else sheetButton.current?.focus();
  };
  const announce = state.cross
    ? `Widget lain disaring dari ${widgetTitle(state.cross.widgetId)}: ${filterText(state.cross.filter)}.`
    : active
      ? `${active} filter aktif.`
      : "Semua filter dihapus.";

  // Wilayah pengumuman selalu terpasang (di luar bilah yang bisa muncul/hilang) agar perubahan pertama
  // pun terbaca.
  const live = (
    <p className="sr-only" aria-live="polite">
      {announce}
    </p>
  );
  if (!columns.length && !active && !editing) return live;
  return (
    <>
      {live}
      <section
        aria-label="Filter dashboard"
        data-testid="filter-bar"
        className="flex flex-col gap-3 rounded-lg border bg-card p-3"
      >
        {columns.length ? (
          <>
            <div className="md:hidden">
              <FilterSheet triggerRef={sheetButton} />
            </div>
            <div
              ref={desktop}
              className="hidden min-w-0 md:flex md:flex-wrap md:items-center md:gap-2"
            >
              <span className="mr-1 inline-flex items-center gap-1.5 text-sm font-medium">
                <IconFilter size={18} stroke={1.5} aria-hidden className="text-muted-foreground" />
                Filter
              </span>
              {columns.map((c) => (
                <FilterControl key={c.key} column={c} />
              ))}
            </div>
          </>
        ) : editing ? (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <IconFilter size={18} stroke={1.5} aria-hidden className="mt-px shrink-0" />
            <span>
              Belum ada kolom filter. Tambahkan lewat{" "}
              <a
                href={`#${FILTER_SETTINGS_ID}`}
                className="font-medium text-foreground underline underline-offset-4"
              >
                Kolom filter
              </a>{" "}
              di pengaturan dashboard.
            </span>
          </p>
        ) : null}
        <FilterChips onEmpty={focusFirst} />
        {urlTooLong ? (
          <p className="text-xs text-muted-foreground">
            Pilihan filter terlalu panjang untuk disimpan di alamat halaman — filter tetap berlaku,
            tetapi hilang bila halaman dimuat ulang.
          </p>
        ) : null}
      </section>
    </>
  );
}
