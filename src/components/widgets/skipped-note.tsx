"use client";

import { IconFilterOff } from "@tabler/icons-react";
import { useId } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/*
 * Filter dashboard yang tidak berlaku untuk widget ini (T-012): kolomnya tidak ada di sheet widget,
 * atau tipenya berbeda. Teks yang terlihat selalu muat dan tetap bermakna — tidak pernah kata yang
 * terpotong: "2 filter tidak berlaku", di kartu < 10rem (container query kartu) "2 dilewati", di kartu
 * < 6,5rem hanya ikon + angka ("2"; nama aksesibel tetap "2 filter tidak berlaku"). Sentuh: tinggi
 * 44 px (konvensi proyek); dengan mouse di ≥ md tetap ringkas 24 px.
 * Penjelasan lengkap (filter mana, kenapa, akibatnya pada angka) di popover yang bisa dibuka dengan
 * klik, sentuh, atau keyboard, dan dibacakan pembaca layar lewat aria-describedby tanpa membukanya.
 */
export function SkippedNote({ names }: { names?: string[] }) {
  const id = useId();
  if (!names?.length) return null;
  const n = names.length.toLocaleString("id-ID");
  const full = `Filter ${names.join(", ")} tidak berlaku untuk widget ini: kolomnya tidak ada di sheet yang dipakai widget ini, atau tipenya berbeda. Angka di widget ini belum tersaring oleh filter tersebut.`;
  return (
    <div
      className="shrink-0 border-t px-2 md:not-any-pointer-coarse:py-0.5"
      data-testid="widget-skipped-filters"
    >
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-describedby={`${id}-full`}
            className="inline-flex min-h-11 max-w-full items-center gap-1 rounded-sm px-1 text-left text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground md:not-any-pointer-coarse:min-h-6"
          >
            <IconFilterOff size={14} stroke={1.5} aria-hidden className="shrink-0" />
            {/* Nama aksesibel = teks yang tampil (display:none tidak ikut) + penjelasan di describedby. */}
            <span className="min-w-0 @max-[10rem]:hidden">{n} filter tidak berlaku</span>
            <span className="hidden min-w-0 @max-[10rem]:inline @max-[6.5rem]:hidden">
              {n} dilewati
            </span>
            <span className="hidden @max-[6.5rem]:inline">
              {n}
              <span className="sr-only"> filter tidak berlaku</span>
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent aria-label="Filter yang tidak berlaku" className="w-72 text-sm">
          <p>{full}</p>
        </PopoverContent>
      </Popover>
      <span id={`${id}-full`} className="sr-only">
        {full}
      </span>
    </div>
  );
}
