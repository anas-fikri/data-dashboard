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
import { normName } from "@/features/widgets/remap";

/*
 * Menu "Tambah kolom filter" (T-012): kolom tampil versi data aktif, dikelompokkan per sheet bila lebih
 * dari satu; kolom yang sudah dipakai — atau yang namanya sudah dipakai kolom filter dari sheet lain
 * (filter berlaku per nama di semua sheet: satu kontrol per nama) — tetap terlihat tetapi nonaktif,
 * dengan alasannya. Non-modal (halaman tidak di-aria-hidden). Penuh (8 kolom): tombol tetap bisa
 * difokus (aria-disabled + penjelasan), menu tidak terbuka — fokus tidak hilang saat kolom ke-8
 * ditambahkan.
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
        {multiSheet ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            Filter berlaku untuk semua sheet yang punya kolom bernama sama, jadi satu nama hanya
            bisa dipakai sekali.
          </p>
        ) : null}
        {sources.map((s) => (
          <Primitive.Group key={s.id}>
            {multiSheet ? <DropdownMenuLabel>Sheet {s.name}</DropdownMenuLabel> : null}
            {s.columns.map((c) => {
              const key = filterColumnKey(s.name, c.name);
              const used = taken.has(key);
              const sameName = !used && names.has(normName(c.name));
              return (
                <DropdownMenuItem
                  key={c.pos}
                  disabled={used || sameName}
                  className="h-auto min-h-11 py-1.5 md:min-h-9"
                  onSelect={() =>
                    onAdd({
                      key,
                      sheet: s.name,
                      column: c.name,
                      type: c.type,
                      available: true,
                      ...(c.period ? { period: true as const } : {}),
                    })
                  }
                >
                  <span className="min-w-0 flex-1 truncate" title={c.name}>
                    {c.name}
                  </span>
                  {/* Baris disorot (latar accent): teks bantu ikut gelap agar kontras tetap ≥ 4,5:1. */}
                  <span className="shrink-0 text-xs text-muted-foreground in-data-highlighted:text-accent-foreground">
                    {used ? "sudah dipakai" : sameName ? "nama sudah dipakai" : TYPE_LABEL[c.type]}
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
