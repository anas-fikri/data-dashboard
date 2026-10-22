"use client";

import { IconChevronDown, IconFilter, IconFilterCog } from "@tabler/icons-react";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import type { FilterColumnView, SourceSheet } from "@/features/dashboards/service";
import { FilterColumnsSettings } from "../filter-columns-settings";
import { CrossFilterHint } from "./cross-hint";
import { FilterChips } from "./filter-chips";
import { FilterControl } from "./filter-control";
import { useDashboardFilters } from "./filter-context";
import { normName } from "./filter-model";
import { filterText } from "./filter-text";
import { FilterSheet } from "./filter-sheet";

/*
 * Bilah filter di atas kanvas (T-012), mode lihat dan edit. Bilah selebar ≥ 42rem (container query,
 * bukan viewport — sidebar 240 px di tablet menyempitkan konten): satu kontrol per kolom filter
 * (popover); lebih sempit: tombol "Filter (n)" yang membuka lembar, jadi tidak ada pemicu + chip
 * ganda yang menumpuk. Di bawahnya chip filter aktif + filter silang. Tanpa kolom filter: di mode lihat
 * hanya muncul saat ada filter silang; di mode edit memberi tahu tempat menambah kolom filter.
 * Mode edit (pemilik dan editor, T-k2ec): tombol "Atur kolom filter" membuka pengaturan kolom filter
 * langsung di bilah (disclosure, bukan popover — menu tambah kolom sendiri sudah berupa popover).
 * Petunjuk filter silang (satu untuk seluruh dashboard) di baris terakhir bilah, atau sendiri di atas
 * kanvas bila bilah tidak tampil.
 * Perubahan (termasuk nilai) diumumkan sopan ke pembaca layar — tidak ada pengumuman saat dimuat.
 * Kartu yang masih menampilkan angka filter lama > 0,4 s ("Memperbarui…") diumumkan SEKALI untuk
 * semuanya ("Memperbarui 8 widget…"), lalu dikosongkan setelah semua kartu diperbarui.
 */
export { FILTER_SETTINGS_ID } from "../filter-columns-settings";
/** Timer basi semua kartu berjalan bersamaan: tunggu laporan semuanya, lalu umumkan satu kali. */
const STALE_SETTLE_MS = 100;

/** Fokus ke sumber filter silang (bilah hilang bersama chip terakhirnya): kategori, atau judul kartu. */
function focusCrossSource(widgetId: string) {
  const card = document.querySelector<HTMLElement>(
    `[data-testid=widget][data-widget-id="${widgetId}"]`,
  );
  const item = card?.querySelector<HTMLElement>(
    "[data-testid=crossfilter-item][aria-pressed=true]",
  );
  const heading = card?.querySelector<HTMLElement>("h2");
  if (item) return item.focus();
  heading?.setAttribute("tabindex", "-1");
  heading?.focus();
}

export function FilterBar({
  editing,
  manage,
}: {
  editing: boolean;
  /** Kolom filter (server) + sumber data untuk "Atur kolom filter" (mode edit pemilik/editor). */
  manage: { dashboardId: string; columns: FilterColumnView[]; sources: SourceSheet[] } | null;
}) {
  const { columns, state, urlTooLong, widgetTitle, widgetGrain, stale } = useDashboardFilters();
  const panelId = useId();
  const [managing, setManaging] = useState(false);
  const sheetButton = useRef<HTMLButtonElement>(null);
  const desktop = useRef<HTMLDivElement>(null);
  const active = state.filters.length + (state.cross ? 1 : 0);

  // Fokus setelah chip terakhir dihapus: kontrol pertama yang terlihat (bilah sempit: tombol lembar);
  // tanpa kolom filter: sumber filter silang.
  const focusFirst = () => {
    const first = desktop.current?.querySelector<HTMLElement>("button");
    if (first && first.offsetParent !== null) first.focus();
    else if (sheetButton.current) sheetButton.current.focus();
    else if (state.cross) focusCrossSource(state.cross.widgetId);
  };

  // Pengumuman hanya setelah status berubah (bukan "Semua filter dihapus." sejak halaman dimuat).
  const key = JSON.stringify(state);
  const [seen, setSeen] = useState(key);
  const [announce, setAnnounce] = useState("");
  if (seen !== key) {
    setSeen(key);
    const parts = state.filters.map((f) => {
      const type = columns.find((c) => normName(c.column) === normName(f.column))?.type;
      return `${f.column}: ${filterText(f, type)}`;
    });
    if (state.cross) {
      const { widgetId, filter } = state.cross;
      parts.push(
        `disaring dari ${widgetTitle(widgetId)}: ${filterText(filter, undefined, widgetGrain(widgetId))}`,
      );
    }
    setAnnounce(parts.length ? `Filter aktif: ${parts.join("; ")}.` : "Semua filter dihapus.");
  }

  const busy = useSyncExternalStore(stale.subscribe, stale.count, () => 0) > 0;
  const [busyText, setBusyText] = useState("");
  useEffect(() => {
    if (!busy) return;
    const t = setTimeout(() => {
      const n = stale.count();
      if (n) setBusyText(`Memperbarui ${n.toLocaleString("id-ID")} widget…`);
    }, STALE_SETTLE_MS);
    return () => {
      clearTimeout(t);
      setBusyText("");
    };
  }, [busy, stale]);

  // Wilayah pengumuman selalu terpasang (di luar bilah yang bisa muncul/hilang) agar perubahan pertama
  // pun terbaca. Tidak atomik: munculnya "Memperbarui …" tidak membacakan ulang daftar filter.
  const live = (
    <p className="sr-only" role="status" aria-atomic="false">
      {announce}
      {busyText ? <span> {busyText}</span> : null}
    </p>
  );
  if (!columns.length && !active && !editing) {
    return (
      <>
        {live}
        <CrossFilterHint editing={false} className="px-1" />
      </>
    );
  }
  return (
    <>
      {live}
      <section
        aria-label="Filter dashboard"
        data-testid="filter-bar"
        className="@container flex flex-col gap-3 rounded-lg border bg-card p-3"
      >
        {columns.length ? (
          <>
            <div className="@2xl:hidden">
              <FilterSheet triggerRef={sheetButton} />
            </div>
            <div
              ref={desktop}
              className="hidden min-w-0 @2xl:flex @2xl:flex-wrap @2xl:items-center @2xl:gap-2"
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
              Belum ada kolom filter.
              {manage ? " Tambahkan lewat Atur kolom filter." : null}
            </span>
          </p>
        ) : null}
        {editing && manage ? (
          <div className="flex flex-col gap-3">
            <Button
              variant="outline"
              aria-expanded={managing}
              aria-controls={panelId}
              data-testid="filter-bar-manage"
              leadingIcon={<IconFilterCog aria-hidden />}
              onClick={() => setManaging((m) => !m)}
              className="h-(--control-h-lg) w-full md:h-(--control-h) md:w-auto md:self-start"
            >
              Atur kolom filter
              <IconChevronDown
                aria-hidden
                className={`motion-safe:transition-transform ${managing ? "rotate-180" : ""}`}
              />
            </Button>
            <div id={panelId} hidden={!managing} className="border-t pt-3">
              {managing ? (
                <FilterColumnsSettings
                  dashboardId={manage.dashboardId}
                  columns={manage.columns}
                  sources={manage.sources}
                  embedded
                />
              ) : null}
            </div>
          </div>
        ) : null}
        <FilterChips onEmpty={focusFirst} />
        {urlTooLong ? (
          <p className="text-xs text-muted-foreground">
            Pilihan filter terlalu panjang untuk disimpan di alamat halaman — filter tetap berlaku,
            tetapi hilang bila halaman dimuat ulang.
          </p>
        ) : null}
        <CrossFilterHint editing={editing} />
      </section>
    </>
  );
}
