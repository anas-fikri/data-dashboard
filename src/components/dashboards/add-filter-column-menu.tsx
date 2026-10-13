"use client";

import { IconPlus } from "@tabler/icons-react";
import { DropdownMenu as Primitive } from "radix-ui";
import { useState } from "react";
import { TYPE_LABEL } from "@/components/schema/labels";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { filterColumnKey } from "@/features/dashboards/filter-columns";
import type { FilterColumnView, SourceSheet } from "@/features/dashboards/service";

/*
 * Menu "Tambah kolom filter" (T-012): kolom tampil versi data aktif, dikelompokkan per sheet bila lebih
 * dari satu; kolom yang sudah dipakai tetap terlihat tetapi nonaktif. Non-modal (halaman tidak
 * di-aria-hidden). Penuh (8 kolom): tombol tetap bisa difokus (aria-disabled + penjelasan), menu tidak
 * terbuka — fokus tidak hilang saat kolom ke-8 ditambahkan.
 */
export function AddFilterColumnMenu({
  sources,
  taken,
  full,
  describedBy,
  onAdd,
}: {
  sources: SourceSheet[];
  /** Kunci kolom filter yang sudah dipilih. */
  taken: Set<string>;
  full: boolean;
  describedBy?: string;
  onAdd: (column: FilterColumnView) => void;
}) {
  const [open, setOpen] = useState(false);
  const multiSheet = sources.length > 1;
  return (
    <DropdownMenu modal={false} open={open && !full} onOpenChange={(o) => setOpen(o && !full)}>
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
        align="start"
        className="max-h-(--radix-dropdown-menu-content-available-height) w-72 overflow-y-auto"
      >
        {sources.map((s) => (
          <Primitive.Group key={s.id}>
            {multiSheet ? <DropdownMenuLabel>Sheet {s.name}</DropdownMenuLabel> : null}
            {s.columns.map((c) => {
              const key = filterColumnKey(s.name, c.name);
              const used = taken.has(key);
              return (
                <DropdownMenuItem
                  key={c.pos}
                  disabled={used}
                  className="h-auto min-h-11 py-1.5 md:min-h-9"
                  onSelect={() =>
                    onAdd({ key, sheet: s.name, column: c.name, type: c.type, available: true })
                  }
                >
                  <span className="min-w-0 flex-1 truncate" title={c.name}>
                    {c.name}
                  </span>
                  {/* Baris disorot (latar accent): teks bantu ikut gelap agar kontras tetap ≥ 4,5:1. */}
                  <span className="shrink-0 text-xs text-muted-foreground in-data-highlighted:text-accent-foreground">
                    {used ? "sudah dipakai" : TYPE_LABEL[c.type]}
                  </span>
                </DropdownMenuItem>
              );
            })}
          </Primitive.Group>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
