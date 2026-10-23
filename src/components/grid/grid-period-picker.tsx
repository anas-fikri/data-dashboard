"use client";

import { IconCalendarMonth, IconCheck, IconChevronDown } from "@tabler/icons-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Highlighted, MenuSearch, useMenuSearch } from "@/components/ui/menu-search";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/*
 * Pemilih "Periode: Semua ▾" di Lihat data (T-058, rencana G-6 §3.1): sheet periode bisa dibatasi ke
 * satu periode. Pilihan = navigasi (?periode=<kunci>, bisa dimuat ulang/dibagikan); grid dimuat ulang
 * dengan manifest periode itu saja, jadi jumlah baris di status grid = baris periode di metadata
 * (ditampilkan juga di sini). Daftar urut kronologis; kotak cari pintar (T-pxnn, ui/menu-search).
 */
export interface PeriodOption {
  /** null = semua periode. */
  key: string | null;
  label: string;
  rows: number | null;
  href: string;
}

const fmtInt = (n: number) => n.toLocaleString("id-ID");
const rowsText = (n: number | null) => (n === null ? "" : `${fmtInt(n)} baris`);

export function GridPeriodPicker({
  options,
  current,
}: {
  options: PeriodOption[];
  current: string | null;
}) {
  const active = options.find((o) => o.key === current) ?? options[0];
  const { open, onOpenChange, query, setQuery, inputRef, contentRef, filter } = useMenuSearch();
  const results = filter(options);
  return (
    <DropdownMenu modal={false} open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          leadingIcon={<IconCalendarMonth size={20} stroke={1.5} aria-hidden />}
          className="h-(--control-h-lg) w-full justify-between md:h-(--control-h) md:w-auto md:self-start"
          data-testid="grid-period-picker"
        >
          <span className="min-w-0 truncate">
            Periode: {active?.key === null ? "Semua" : active?.label}
          </span>
          <IconChevronDown size={20} stroke={1.5} aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        ref={contentRef}
        align="start"
        className="max-h-(--radix-dropdown-menu-content-available-height) w-72 overflow-y-auto"
      >
        <MenuSearch
          inputRef={inputRef}
          contentRef={contentRef}
          query={query}
          setQuery={setQuery}
          label="Cari periode"
          count={results ? results.length : null}
        />
        {(results ?? options.map((option) => ({ option, hits: [] as number[] }))).map(
          ({ option: o, hits }) => {
            const on = o.key === (active?.key ?? null);
            return (
              <DropdownMenuItem
                key={o.key ?? "semua"}
                asChild
                className="h-auto min-h-11 py-1.5 md:min-h-9"
              >
                <Link
                  href={o.href}
                  scroll={false}
                  aria-current={on ? "true" : undefined}
                  data-testid="grid-period-option"
                  data-period={o.key ?? ""}
                >
                  <span className="flex size-5 shrink-0 items-center justify-center" aria-hidden>
                    {on ? <IconCheck size={20} stroke={1.5} /> : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    <Highlighted text={o.label} hits={hits} />
                  </span>
                  {/* Baris disorot (latar accent): teks bantu ikut gelap agar kontras tetap ≥ 4,5:1. */}
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground in-data-highlighted:text-accent-foreground">
                    {rowsText(o.rows)}
                  </span>
                </Link>
              </DropdownMenuItem>
            );
          },
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
