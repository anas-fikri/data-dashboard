"use client";

import { IconClick } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { useDashboardFilters } from "./filter-context";

/*
 * Petunjuk filter silang (T-012): SATU baris untuk seluruh dashboard (di bilah filter, atau di atas
 * kanvas bila bilahnya tidak tampil) — bukan diulang di setiap grafik, jadi tinggi grafik tidak
 * terpakai. Tampil hanya bila ada grafik yang boleh menyaring; mode lihat terlihat, mode edit hanya
 * untuk pembaca layar. Tombol kategori grafik menunjuk ke sini lewat aria-describedby (CROSS_HINT_ID).
 * Kata kerja netral ("Pilih"), bukan "Klik" — juga untuk layar sentuh.
 */
export const CROSS_HINT_ID = "petunjuk-filter-silang";

export function CrossFilterHint({ editing, className }: { editing: boolean; className?: string }) {
  const { crossColumns } = useDashboardFilters();
  if (!crossColumns.length) return null;
  return (
    <p
      id={CROSS_HINT_ID}
      data-testid="crossfilter-hint"
      className={cn(
        editing ? "sr-only" : "flex items-start gap-1.5 text-xs text-muted-foreground",
        !editing && className,
      )}
    >
      <IconClick size={16} stroke={1.5} aria-hidden className="shrink-0" />
      <span>Pilih kategori di grafik untuk menyaring widget lain; pilih lagi untuk melepas.</span>
    </p>
  );
}
