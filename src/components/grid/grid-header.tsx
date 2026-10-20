"use client";

import {
  IconArrowAutofitWidth,
  IconArrowDown,
  IconArrowsSort,
  IconArrowUp,
  IconCalendar,
  IconCalendarTime,
  IconCheck,
  IconClock,
  IconDecimal,
  IconDotsVertical,
  IconEyeOff,
  IconFilter,
  IconFilterOff,
  IconHash,
  IconLetterCase,
  IconPin,
  IconPinnedOff,
  IconSortAscending,
  IconSortDescending,
  IconToggleLeft,
} from "@tabler/icons-react";
import type { IHeaderParams } from "ag-grid-community";
import { useEffect, useState, useSyncExternalStore } from "react";
import { TYPE_LABEL } from "@/components/schema/labels";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ColumnType } from "@/features/ingest/infer";
import type { NumberFormat } from "@/features/widgets/spec";
import { MAX_FROZEN, MAX_SORT, numericType, type SortDir, type Store } from "./grid-model";

const TYPE_ICON: Record<ColumnType, typeof IconHash> = {
  text: IconLetterCase,
  integer: IconHash,
  decimal: IconDecimal,
  date: IconCalendar,
  timestamp: IconCalendarTime,
  duration: IconClock,
  boolean: IconToggleLeft,
};

export type HeaderAction =
  | { kind: "autofit" }
  | { kind: "freeze" }
  | { kind: "unfreeze" }
  | { kind: "hide" }
  | { kind: "format"; format: NumberFormat }
  /** Urut kolom ini (null = lepas); `add` = pertahankan urutan kolom lain (urut multi-kolom). */
  | { kind: "sort"; dir: SortDir | null; add: boolean }
  | { kind: "clearSorts" }
  | { kind: "filter" }
  | { kind: "clearFilter" };

/** Keadaan kolom yang dibutuhkan menu (dibaca saat menu dibuka, bukan saat render header). */
export interface HeaderMenuState {
  /** Posisi kolom di antara kolom data terlihat (0-based). */
  index: number;
  frozen: boolean;
  frozenCount: number;
  visibleCount: number;
  format: NumberFormat | undefined;
  /** Urutan kolom ini dan berapa kolom yang sedang diurutkan. */
  sort: SortDir | null;
  sortCount: number;
}

export interface GridHeaderParams {
  letter: string;
  type: ColumnType;
  menuState: (colId: string) => HeaderMenuState;
  onAction: (colId: string, action: HeaderAction) => void;
  /** colId yang punya saringan aktif (T-044). */
  filtered: Store<ReadonlySet<string>>;
}

const STYLES: { style: NumberFormat["style"]; label: string; decimals: number }[] = [
  { style: "auto", label: "Otomatis", decimals: 0 },
  { style: "number", label: "Angka", decimals: 0 },
  { style: "rupiah", label: "Rupiah", decimals: 0 },
  { style: "percent", label: "Persen", decimals: 1 },
];

/** Tombol keyboard kepala kolom yang ditangani komponen ini, bukan AG (Enter = menu, Alt+↓ = saring). */
export const isHeaderMenuKey = (e: KeyboardEvent) =>
  (e.key === "Enter" && !e.ctrlKey && !e.metaKey) || (e.key === "ArrowDown" && e.altKey);

/** Urutan kolom ini dari AG (diperbarui pada event sortChanged grid). */
function useColumnSort(props: IHeaderParams) {
  const { api, column } = props;
  const read = () => {
    const dir = column.getSort();
    const count = api.isDestroyed() ? 0 : api.getColumnState().filter((s) => s.sort).length;
    return {
      dir: dir === "asc" || dir === "desc" ? dir : null,
      index: column.getSortIndex() ?? 0,
      count,
    };
  };
  const [sort, setSort] = useState(read);
  useEffect(() => {
    const update = () => setSort(read());
    api.addEventListener("sortChanged", update);
    return () => {
      if (!api.isDestroyed()) api.removeEventListener("sortChanged", update);
    };
    // read memakai api/column yang sama selama kepala kolom hidup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, column]);
  return sort;
}

/**
 * Kepala kolom: huruf (urutan skema, tetap walau kolom digeser/disembunyikan), ikon tipe + nama,
 * penanda urut/saring, dan menu kolom. Klik nama = urut (naik → turun → tanpa urut), Shift+klik =
 * tambah ke urutan (≤ 3, T-044). Keyboard: Enter membuka menu kolom (urut ada di menu), Alt+↓ membuka
 * saringan; aria-sort dipasang AG pada sel kepala.
 */
export function GridHeader(props: IHeaderParams & GridHeaderParams) {
  const { column, displayName, eGridHeader, letter, type, menuState, onAction, filtered } = props;
  const colId = column.getColId();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<HeaderMenuState | null>(null);
  const Icon = TYPE_ICON[type];
  const sort = useColumnSort(props);
  const isFiltered = useSyncExternalStore(
    filtered.subscribe,
    () => filtered.get().has(colId),
    () => false,
  );

  const openMenu = () => {
    setState(menuState(colId));
    setOpen(true);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target !== eGridHeader || !isHeaderMenuKey(e)) return;
      e.preventDefault();
      if (e.altKey) {
        onAction(colId, { kind: "filter" });
        return;
      }
      setState(menuState(colId));
      setOpen(true);
    };
    eGridHeader.addEventListener("keydown", onKey);
    return () => eGridHeader.removeEventListener("keydown", onKey);
  }, [eGridHeader, menuState, onAction, colId]);

  const act = (a: HeaderAction) => onAction(colId, a);
  const fmt = state?.format ?? { style: "auto" as const, decimals: 0 };
  const canFreeze = state ? state.index + 1 <= MAX_FROZEN : false;
  const SortIcon = sort.dir === "asc" ? IconArrowUp : IconArrowDown;
  const others = state ? state.sortCount - (state.sort ? 1 : 0) : 0;
  const canAdd = others > 0 && others < MAX_SORT;

  return (
    <div className="dd-grid-header">
      {/* Klik = jalan pintas mouse/sentuh; keyboard: sel kepala kolom AG yang difokus (Enter → menu
          berisi urut, Alt+↓ → saring), jadi elemen ini sengaja bukan tombol tersendiri. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        className="dd-grid-header-text dd-grid-sortable"
        data-testid="grid-header-sort"
        onClick={(e) => props.progressSort(e.shiftKey)}
      >
        <span className="dd-grid-letter">
          {letter}
          {sort.dir || isFiltered ? (
            <span className="dd-grid-header-marks" aria-hidden>
              {sort.dir ? (
                <span
                  className="dd-grid-sort-mark"
                  data-testid="grid-sort-mark"
                  data-dir={sort.dir}
                >
                  <SortIcon size={14} stroke={1.5} />
                  {sort.count > 1 ? sort.index + 1 : null}
                </span>
              ) : null}
              {isFiltered ? (
                <IconFilter size={14} stroke={1.5} data-testid="grid-filter-mark" />
              ) : null}
            </span>
          ) : null}
        </span>
        <span className="dd-grid-name">
          <Icon size={16} stroke={1.5} aria-hidden className="shrink-0 text-muted-foreground" />
          <span className="truncate">{displayName}</span>
          <span className="sr-only">
            , {TYPE_LABEL[type]}
            {sort.dir && sort.count > 1 ? `, urutan ke-${sort.index + 1}` : ""}
            {isFiltered ? ", disaring" : ""}
          </span>
        </span>
      </div>
      <DropdownMenu
        open={open}
        onOpenChange={(o) => {
          if (o) openMenu();
          else setOpen(false);
        }}
      >
        <DropdownMenuTrigger
          // Kepala kolom dikelola navigasi keyboard AG (Enter membuka menu); tombol hanya untuk mouse/sentuh.
          tabIndex={-1}
          aria-label={`Menu kolom ${displayName}`}
          className="dd-grid-menu-btn"
          onClick={(e) => e.stopPropagation()}
        >
          <IconDotsVertical size={20} stroke={1.5} aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            eGridHeader.focus();
          }}
        >
          <DropdownMenuLabel>
            Kolom {letter}: {displayName}
          </DropdownMenuLabel>
          <DropdownMenuItem
            role="menuitemradio"
            aria-checked={state?.sort === "asc"}
            onSelect={() => act({ kind: "sort", dir: "asc", add: false })}
          >
            <IconSortAscending aria-hidden />
            {others > 0 ? "Urutkan naik saja (lepas urutan lain)" : "Urutkan naik"}
          </DropdownMenuItem>
          <DropdownMenuItem
            role="menuitemradio"
            aria-checked={state?.sort === "desc"}
            onSelect={() => act({ kind: "sort", dir: "desc", add: false })}
          >
            <IconSortDescending aria-hidden />
            {others > 0 ? "Urutkan turun saja (lepas urutan lain)" : "Urutkan turun"}
          </DropdownMenuItem>
          {canAdd && !state?.sort ? (
            <>
              <DropdownMenuItem onSelect={() => act({ kind: "sort", dir: "asc", add: true })}>
                <IconArrowsSort aria-hidden />
                Tambah ke urutan (naik)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => act({ kind: "sort", dir: "desc", add: true })}>
                <IconArrowsSort aria-hidden />
                Tambah ke urutan (turun)
              </DropdownMenuItem>
            </>
          ) : null}
          {state?.sort ? (
            <DropdownMenuItem onSelect={() => act({ kind: "sort", dir: null, add: true })}>
              <IconArrowsSort aria-hidden />
              Lepas urutan kolom ini
            </DropdownMenuItem>
          ) : null}
          {(state?.sortCount ?? 0) > 1 ? (
            <DropdownMenuItem onSelect={() => act({ kind: "clearSorts" })}>
              <span className="size-5 shrink-0" aria-hidden />
              Hapus semua urutan
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => act({ kind: "filter" })}>
            <IconFilter aria-hidden />
            <span className="flex flex-1 items-center justify-between gap-4">
              Saring…
              <kbd className="text-xs text-muted-foreground">Alt+↓</kbd>
            </span>
          </DropdownMenuItem>
          {isFiltered ? (
            <DropdownMenuItem onSelect={() => act({ kind: "clearFilter" })}>
              <IconFilterOff aria-hidden />
              Hapus saringan kolom ini
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => act({ kind: "autofit" })}>
            <IconArrowAutofitWidth aria-hidden />
            Paskan lebar kolom
          </DropdownMenuItem>
          {state?.frozen ? (
            <DropdownMenuItem onSelect={() => act({ kind: "unfreeze" })}>
              <IconPinnedOff aria-hidden />
              Lepas pembekuan kolom
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem disabled={!canFreeze} onSelect={() => act({ kind: "freeze" })}>
              <IconPin aria-hidden />
              <span className="flex flex-col">
                Bekukan sampai kolom ini
                {!canFreeze ? (
                  <span className="text-xs text-muted-foreground">
                    Paling banyak {MAX_FROZEN} kolom pertama
                  </span>
                ) : null}
              </span>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            disabled={(state?.visibleCount ?? 0) <= 1}
            onSelect={() => act({ kind: "hide" })}
          >
            <IconEyeOff aria-hidden />
            Sembunyikan kolom
          </DropdownMenuItem>
          {numericType(type) ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Format tampilan</DropdownMenuLabel>
              {STYLES.map((s) => (
                <DropdownMenuItem
                  key={s.style}
                  role="menuitemradio"
                  aria-checked={fmt.style === s.style}
                  onSelect={() =>
                    act({
                      kind: "format",
                      format: {
                        style: s.style,
                        decimals: fmt.style === s.style ? fmt.decimals : s.decimals,
                      },
                    })
                  }
                >
                  {fmt.style === s.style ? (
                    <IconCheck aria-hidden />
                  ) : (
                    <span className="size-5 shrink-0" aria-hidden />
                  )}
                  {s.label}
                </DropdownMenuItem>
              ))}
              {fmt.style !== "auto" ? (
                <>
                  <DropdownMenuItem
                    disabled={fmt.decimals >= 4}
                    onSelect={(e) => {
                      e.preventDefault();
                      const next = { ...fmt, decimals: fmt.decimals + 1 };
                      setState((s) => (s ? { ...s, format: next } : s));
                      act({ kind: "format", format: next });
                    }}
                  >
                    <span className="size-5 shrink-0" aria-hidden />
                    Tambah desimal ({fmt.decimals})
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={fmt.decimals <= 0}
                    onSelect={(e) => {
                      e.preventDefault();
                      const next = { ...fmt, decimals: fmt.decimals - 1 };
                      setState((s) => (s ? { ...s, format: next } : s));
                      act({ kind: "format", format: next });
                    }}
                  >
                    <span className="size-5 shrink-0" aria-hidden />
                    Kurangi desimal ({fmt.decimals})
                  </DropdownMenuItem>
                </>
              ) : null}
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
