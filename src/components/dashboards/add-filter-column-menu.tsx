"use client";

import { IconPlus } from "@tabler/icons-react";
import { DropdownMenu as Primitive } from "radix-ui";
import { TYPE_LABEL } from "@/components/schema/labels";
import { Button } from "@/components/ui/button";
import { Highlighted, MenuSearch, useMenuSearch } from "@/components/ui/menu-search";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { filterColumnKey } from "@/features/dashboards/filter-columns";
import type { FilterColumnView, SourceSheet } from "@/features/dashboards/service";
import { normName } from "@/features/widgets/remap";

/*
 * Menu "Tambah kolom filter" (T-012): kolom tampil versi data aktif, dikelompokkan per sheet bila lebih
 * dari satu; kolom yang sudah dipakai — atau yang namanya sudah dipakai kolom filter dari sheet lain
 * (filter berlaku per nama di semua sheet: satu kontrol per nama) — tetap terlihat tetapi nonaktif,
 * dengan alasannya. Non-modal (halaman tidak di-aria-hidden). Penuh (8 kolom): tombol tetap bisa
 * difokus (aria-disabled + penjelasan), menu tidak terbuka — fokus tidak hilang saat kolom ke-8
 * ditambahkan.
 * Kotak cari pintar (T-pxnn, ui/menu-search): menyaring kolom semua sheet dengan huruf cocok disorot;
 * Enter menambah hasil pertama yang bisa dipakai.
 */
export function AddFilterColumnMenu({
  sources,
  taken,
  names,
  full,
  describedBy,
  onAdd,
}: {
  sources: SourceSheet[];
  /** Kunci kolom filter yang sudah dipilih. */
  taken: Set<string>;
  /** Nama kolom filter yang sudah dipakai (ternormalisasi), dari sheet mana pun. */
  names: Set<string>;
  full: boolean;
  describedBy?: string;
  onAdd: (column: FilterColumnView) => void;
}) {
  const { open, onOpenChange, query, setQuery, inputRef, contentRef, filter } = useMenuSearch();
  const multiSheet = sources.length > 1;
  const entries: Entry[] = sources.flatMap((s) =>
    s.columns.map((c) => {
      const key = filterColumnKey(s.name, c.name);
      const used = taken.has(key);
      return {
        label: c.name,
        sheet: s,
        col: c,
        key,
        used,
        sameName: !used && names.has(normName(c.name)),
      };
    }),
  );
  const results = filter(entries);

  const add = (e: Entry) =>
    onAdd({
      key: e.key,
      sheet: e.sheet.name,
      column: e.col.name,
      type: e.col.type,
      available: true,
      ...(e.col.period ? { period: true as const } : {}),
    });

  const item = (e: Entry, hits: readonly number[] = []) => (
    <DropdownMenuItem
      key={`${e.sheet.id}:${e.col.pos}`}
      disabled={e.used || e.sameName}
      className="h-auto min-h-11 py-1.5 md:min-h-9"
      onSelect={() => add(e)}
    >
      <span className="min-w-0 flex-1 truncate" title={e.col.name}>
        <Highlighted text={e.col.name} hits={hits} />
      </span>
      {/* Baris disorot (latar accent): teks bantu ikut gelap agar kontras tetap ≥ 4,5:1. */}
      <span className="shrink-0 text-xs text-muted-foreground in-data-highlighted:text-accent-foreground">
        {e.used ? "sudah dipakai" : e.sameName ? "nama sudah dipakai" : TYPE_LABEL[e.col.type]}
        {/* Hasil cari tidak dikelompokkan per sheet: sebut sheetnya. */}
        {results && multiSheet ? ` · ${e.sheet.name}` : null}
      </span>
    </DropdownMenuItem>
  );

  return (
    <DropdownMenu modal={false} open={open && !full} onOpenChange={(o) => onOpenChange(o && !full)}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          leadingIcon={<IconPlus aria-hidden />}
          aria-disabled={full || undefined}
          aria-describedby={describedBy}
          data-filter-add=""
          className="h-(--control-h-lg) w-full aria-disabled:opacity-50 md:h-(--control-h) md:w-auto md:self-start"
        >
          Tambah kolom filter
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
          label="Cari kolom"
          count={results ? results.length : null}
          onEnter={() => {
            const hit = (results?.map((r) => r.option) ?? entries).find(
              (e) => !e.used && !e.sameName,
            );
            if (hit) {
              add(hit);
              onOpenChange(false);
            }
          }}
        />
        {multiSheet && !results ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            Filter berlaku untuk semua sheet yang punya kolom bernama sama, jadi satu nama hanya
            bisa dipakai sekali.
          </p>
        ) : null}
        {results
          ? results.map(({ option, hits }) => item(option, hits))
          : sources.map((s) => (
              <Primitive.Group key={s.id}>
                {multiSheet ? <DropdownMenuLabel>Sheet {s.name}</DropdownMenuLabel> : null}
                {entries.filter((e) => e.sheet.id === s.id).map((e) => item(e))}
              </Primitive.Group>
            ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type Entry = {
  label: string;
  sheet: SourceSheet;
  col: SourceSheet["columns"][number];
  key: string;
  used: boolean;
  sameName: boolean;
};
