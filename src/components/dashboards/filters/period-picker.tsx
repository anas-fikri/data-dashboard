"use client";

import { useId, useState } from "react";
import { Choice } from "@/components/dashboards/config-fields";
import { cn } from "@/lib/utils";
import type { DashFilter, FilterColumnView } from "./filter-model";
import {
  GRAIN_TEXT,
  calendarPeriod,
  periodFilter,
  periodOptions,
  type PeriodGrain,
} from "./period";
import { usePeriodMonths } from "./use-filter-values";

/*
 * "Pilih periode" di panel tanggal (T-9gs1): Bulan / Kuartal / Tahun lalu satu periode dari bulan yang
 * ada di data (terbaru dulu; daftar panjang berkotak cari pintar). Filter yang terpasang = rentang
 * periode itu; rentang kalender utuh yang sudah aktif (dari URL/chip) terpilih kembali di sini. Gagal
 * memuat daftar bulan → bagian ini tidak tampil (preset dan rentang sendiri tetap ada).
 */
const GRAINS: PeriodGrain[] = ["month", "quarter", "year"];

export function PeriodPicker({
  dashboardId,
  column,
  value,
  onChange,
}: {
  dashboardId: string;
  column: FilterColumnView;
  value: DashFilter | undefined;
  onChange: (f: DashFilter | null) => void;
}) {
  const id = useId();
  const months = usePeriodMonths(dashboardId, column.column, column.sheet);
  const current = value ? calendarPeriod(value) : null;
  // Jenis yang dipilih user menang; sebelum itu jenis periode aktif (dari URL/chip) atau Bulan.
  const [picked, setPicked] = useState<PeriodGrain | null>(null);
  const grain = picked ?? current?.grain ?? "month";

  if (months === null) {
    return (
      <p className="text-xs text-muted-foreground" aria-live="polite">
        Memuat periode…
      </p>
    );
  }
  if ("error" in months || !months.months.length) return null;
  const options = periodOptions(months.months, grain);

  return (
    <div role="group" aria-labelledby={`${id}-t`} className="flex min-w-0 flex-col gap-1.5">
      <p id={`${id}-t`} className="text-sm font-medium">
        Pilih periode
      </p>
      <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Jenis periode">
        {GRAINS.map((g) => (
          <button
            key={g}
            type="button"
            aria-pressed={grain === g}
            data-testid="filter-period-grain"
            data-grain={g}
            // Filter aktif tetap berlaku sampai periode jenis baru dipilih (widget tidak memuat ulang).
            onClick={() => setPicked(g)}
            className={cn(
              "min-h-11 rounded-md border border-input px-2 text-sm md:min-h-9",
              "hover:bg-accent aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:font-medium",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "forced-colors:aria-pressed:border-2 forced-colors:aria-pressed:border-[Highlight]",
            )}
          >
            {GRAIN_TEXT[g]}
          </button>
        ))}
      </div>
      <Choice
        label={GRAIN_TEXT[grain]}
        testId="filter-period"
        value={current?.grain === grain ? current.start : ""}
        placeholder={`Pilih ${GRAIN_TEXT[grain].toLowerCase()}`}
        blankOk
        options={options}
        onChange={(start) => onChange(periodFilter(column.column, start, grain))}
      />
    </div>
  );
}
