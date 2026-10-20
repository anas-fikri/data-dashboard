"use client";

import {
  IconArrowAutofitWidth,
  IconCalendar,
  IconCalendarTime,
  IconCheck,
  IconClock,
  IconDecimal,
  IconDotsVertical,
  IconEyeOff,
  IconHash,
  IconLetterCase,
  IconPin,
  IconPinnedOff,
  IconToggleLeft,
} from "@tabler/icons-react";
import type { IHeaderParams } from "ag-grid-community";
import { useEffect, useState } from "react";
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
import { MAX_FROZEN, numericType } from "./grid-model";

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
  | { kind: "format"; format: NumberFormat };

/** Keadaan kolom yang dibutuhkan menu (dibaca saat menu dibuka, bukan saat render header). */
export interface HeaderMenuState {
  /** Posisi kolom di antara kolom data terlihat (0-based). */
  index: number;
  frozen: boolean;
  frozenCount: number;
  visibleCount: number;
  format: NumberFormat | undefined;
}

export interface GridHeaderParams {
  letter: string;
  type: ColumnType;
  menuState: (colId: string) => HeaderMenuState;
  onAction: (colId: string, action: HeaderAction) => void;
}

const STYLES: { style: NumberFormat["style"]; label: string; decimals: number }[] = [
  { style: "auto", label: "Otomatis", decimals: 0 },
  { style: "number", label: "Angka", decimals: 0 },
  { style: "rupiah", label: "Rupiah", decimals: 0 },
  { style: "percent", label: "Persen", decimals: 1 },
];

/**
 * Kepala kolom: huruf (urutan skema, tetap walau kolom digeser/disembunyikan), ikon tipe + nama, dan
 * menu kolom. Menu dibuka dengan klik tombol ⋮ atau Enter saat kepala kolom difokus keyboard.
 */
export function GridHeader(props: IHeaderParams & GridHeaderParams) {
  const { column, displayName, eGridHeader, letter, type, menuState, onAction } = props;
  const colId = column.getColId();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<HeaderMenuState | null>(null);
  const Icon = TYPE_ICON[type];

  const openMenu = () => {
    setState(menuState(colId));
    setOpen(true);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.target !== eGridHeader) return;
      e.preventDefault();
      setState(menuState(colId));
      setOpen(true);
    };
    eGridHeader.addEventListener("keydown", onKey);
    return () => eGridHeader.removeEventListener("keydown", onKey);
  }, [eGridHeader, menuState, colId]);

  const act = (a: HeaderAction) => onAction(colId, a);
  const fmt = state?.format ?? { style: "auto" as const, decimals: 0 };
  const canFreeze = state ? state.index + 1 <= MAX_FROZEN : false;

  return (
    <div className="dd-grid-header">
      <div className="dd-grid-header-text">
        <span className="dd-grid-letter">{letter}</span>
        <span className="dd-grid-name">
          <Icon size={16} stroke={1.5} aria-hidden className="shrink-0 text-muted-foreground" />
          <span className="truncate">{displayName}</span>
          <span className="sr-only">, {TYPE_LABEL[type]}</span>
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
