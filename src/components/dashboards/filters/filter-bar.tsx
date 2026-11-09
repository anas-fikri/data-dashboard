"use client";

import {
  IconChevronDown,
  IconFilter,
  IconFilterCog,
  IconLayoutSidebarLeftCollapse,
} from "@tabler/icons-react";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { usePersistedBoolean } from "@/lib/hooks/use-persisted-boolean";
import { cn } from "@/lib/utils";
import type { FilterColumnView, SourceSheet } from "@/features/dashboards/service";
import { FilterColumnsSettings } from "../filter-columns-settings";
import { CrossFilterHint } from "./cross-hint";
import { DefaultFilters } from "./default-filters";
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
 * ≥ 1280 px (v1.12.0): bilah yang sama menjadi SIDEBAR kiri yang menempel (sticky) di samping kanvas —
 * kontrol tersusun vertikal selebar 16rem, tetap terlihat saat halaman digulir. Bisa diciutkan menjadi
 * rel ikon + jumlah filter aktif (diingat browser); di mode edit dengan panel widget terbuka otomatis
 * menjadi rel agar kanvas tidak sempit. Satu DOM untuk semua lebar (kelas xl:), tanpa lompatan saat hidrasi.
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

/**
 * Sidebar (≥ 1280 px) hanya bila dashboard punya kolom filter atau sedang diubah. Hanya filter silang
 * (tanpa kolom filter, mode lihat): bilah tetap di atas — grid tidak bergeser di bawah kursor saat
 * grafik diklik (review v1.12.0).
 */
function useFilterSidebar(editing: boolean): boolean {
  const { columns } = useDashboardFilters();
  return columns.length > 0 || editing;
}

/**
 * Tata letak kanvas + filter (v1.12.0): di ≥ 1280 px sidebar filter di kiri, kanvas di kanan; di bawahnya
 * bilah filter di atas kanvas seperti sebelumnya.
 */
export function FilterLayout({
  editing,
  filterBar,
  children,
}: {
  editing: boolean;
  filterBar: React.ReactNode;
  children: React.ReactNode;
}) {
  const sidebar = useFilterSidebar(editing);
  return (
    <div className={cn("flex flex-col gap-4", sidebar && "xl:flex-row xl:items-start")}>
      {filterBar}
      <div className="flex min-w-0 flex-1 flex-col gap-4">{children}</div>
    </div>
  );
}

const COLLAPSED_KEY = "dd:filter-sidebar-collapsed";

export function FilterBar({
  editing,
  manage,
  compact = false,
}: {
  editing: boolean;
  /** Kolom filter (server) + sumber data untuk "Atur kolom filter" (mode edit pemilik/editor). */
  manage: { dashboardId: string; columns: FilterColumnView[]; sources: SourceSheet[] } | null;
  /** Panel pengaturan widget menempel di kanan (≥ 1280 px): sidebar menjadi rel agar kanvas lebar. */
  compact?: boolean;
}) {
  const { columns, state, defaults, urlTooLong, widgetTitle, widgetGrain, stale } =
    useDashboardFilters();
  const panelId = useId();
  const [managing, setManaging] = useState(false);
  const sheetButton = useRef<HTMLButtonElement>(null);
  const desktop = useRef<HTMLDivElement>(null);
  const active = state.filters.length + (state.cross ? 1 : 0);
  // Sidebar diciutkan (≥ 1280 px saja): pilihan pengguna, atau otomatis selama panel widget terbuka
  // kecuali pengguna membukanya lagi ("intip") — kembali otomatis saat panel ditutup.
  const [stored, setStored] = usePersistedBoolean(COLLAPSED_KEY);
  const [peek, setPeek] = useState(false);
  const [prevCompact, setPrevCompact] = useState(compact);
  if (prevCompact !== compact) {
    setPrevCompact(compact);
    setPeek(false);
  }
  const sidebar = useFilterSidebar(editing);
  const collapsed = sidebar && (stored || (compact && !peek));
  const railButton = useRef<HTMLButtonElement>(null);
  const collapseButton = useRef<HTMLButtonElement>(null);
  const focusAfter = useRef<"rail" | "collapse" | null>(null);
  useEffect(() => {
    const target = focusAfter.current;
    focusAfter.current = null;
    if (target === "rail") railButton.current?.focus();
    else if (target === "collapse") collapseButton.current?.focus();
  }, [collapsed]);
  const collapse = () => {
    focusAfter.current = "rail";
    setStored(true);
    setPeek(false);
  };
  const expand = () => {
    focusAfter.current = "collapse";
    setStored(false);
    if (compact) setPeek(true);
  };

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
        data-collapsed={collapsed ? "" : undefined}
        className={cn(
          "@container flex flex-col gap-3 rounded-lg border bg-card p-3",
          // ≥ 1280 px: sidebar kiri yang menempel di bawah topbar dan menggulir sendiri bila panjang.
          sidebar &&
            "xl:sticky xl:top-[calc(var(--topbar-h)+1rem)] xl:max-h-[calc(100dvh-var(--topbar-h)-2rem)] xl:shrink-0 xl:overflow-x-hidden xl:overflow-y-auto",
          // Rel: lebar tetap (container query membuat lebar "auto" = 0); 44 px tombol + 2 × 4 px + garis.
          sidebar && (collapsed ? "xl:w-14 xl:items-center xl:p-1" : "xl:w-64"),
        )}
      >
        {/* Rel saat diciutkan (≥ 1280 px): ikon + jumlah filter aktif. */}
        {collapsed ? (
          <Button
            ref={railButton}
            variant="ghost"
            size="icon-lg"
            className="relative hidden xl:inline-flex"
            aria-label={`Tampilkan filter${active ? ` (${active} aktif)` : ""}`}
            aria-expanded={false}
            title="Tampilkan filter"
            data-testid="filter-sidebar-expand"
            onClick={expand}
          >
            <IconFilter aria-hidden />
            {active ? (
              <span
                aria-hidden
                className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-4 font-semibold text-primary-foreground"
              >
                {active}
              </span>
            ) : null}
          </Button>
        ) : null}
        <div className={cn("contents", collapsed && "xl:hidden")}>
          {/* Kepala sidebar (≥ 1280 px): judul + tombol ciutkan. */}
          <div className={cn("hidden items-center justify-between gap-2", sidebar && "xl:flex")}>
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
              <IconFilter size={18} stroke={1.5} aria-hidden className="text-muted-foreground" />
              Filter{active ? ` (${active})` : ""}
            </span>
            <Button
              ref={collapseButton}
              variant="ghost"
              size="icon-sm"
              aria-label="Ciutkan filter"
              aria-expanded
              title="Ciutkan filter"
              data-testid="filter-sidebar-collapse"
              onClick={collapse}
            >
              <IconLayoutSidebarLeftCollapse aria-hidden />
            </Button>
          </div>
          {columns.length ? (
            <>
              <div className={cn("@2xl:hidden", sidebar && "xl:hidden")}>
                <FilterSheet triggerRef={sheetButton} />
              </div>
              <div
                ref={desktop}
                className={cn(
                  "hidden min-w-0 @2xl:flex @2xl:flex-wrap @2xl:items-center @2xl:gap-2",
                  sidebar && "xl:flex xl:flex-col xl:flex-nowrap xl:items-stretch xl:gap-2",
                )}
              >
                <span
                  className={cn(
                    "mr-1 inline-flex items-center gap-1.5 text-sm font-medium",
                    sidebar && "xl:hidden",
                  )}
                >
                  <IconFilter
                    size={18}
                    stroke={1.5}
                    aria-hidden
                    className="text-muted-foreground"
                  />
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
          {columns.length ? <DefaultFilters manage={editing ? manage : null} /> : null}
          {urlTooLong ? (
            <p className="text-xs text-muted-foreground">
              Pilihan filter terlalu panjang untuk disimpan di alamat halaman — filter tetap
              berlaku, tetapi {defaults.filters.length ? "kembali ke filter bawaan" : "hilang"} bila
              halaman dimuat ulang.
            </p>
          ) : null}
          <CrossFilterHint editing={editing} />
        </div>
      </section>
    </>
  );
}
