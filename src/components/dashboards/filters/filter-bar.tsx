"use client";

import { IconFilter } from "@tabler/icons-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
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
 * Petunjuk filter silang (satu untuk seluruh dashboard) di baris terakhir bilah, atau sendiri di atas
 * kanvas bila bilah tidak tampil.
 * Perubahan (termasuk nilai) diumumkan sopan ke pembaca layar — tidak ada pengumuman saat dimuat.
 * Kartu yang masih menampilkan angka filter lama > 0,4 s ("Memperbarui…") diumumkan SEKALI untuk
 * semuanya ("Memperbarui 8 widget…"), lalu dikosongkan setelah semua kartu diperbarui.
 */
export const FILTER_SETTINGS_ID = "kolom-filter";
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

export function FilterBar({ editing }: { editing: boolean }) {
  const { columns, state, urlTooLong, widgetTitle, widgetGrain, stale } = useDashboardFilters();
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
        <CrossFilterHint editing={editing} />
      </section>
    </>
  );
}
