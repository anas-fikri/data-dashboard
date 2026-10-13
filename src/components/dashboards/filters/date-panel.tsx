"use client";

import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PRESETS, type DashFilter, type FilterColumnView, type Preset } from "./filter-model";
import { PRESET_LABEL, dateBounds, dateRange } from "./filter-text";

/*
 * Rentang tanggal (T-012): preset (bulan ini, kuartal ini, sejak awal tahun — dihitung server menurut
 * tanggal hari ini di Jakarta, dibandingkan apa adanya tanpa geser zona, D8) atau rentang sendiri
 * lewat dua isian tanggal. Isian yang belum lengkap (badInput) belum mengubah filter. Kolom cap waktu:
 * hari "Sampai" ikut utuh (server menerima < hari berikutnya).
 */
const OPTIONS: { value: Preset | "all"; label: string }[] = [
  { value: "all", label: "Semua tanggal" },
  ...PRESETS.map((p) => ({ value: p, label: PRESET_LABEL[p] })),
];

export function DatePanel({
  column,
  value,
  onChange,
}: {
  column: FilterColumnView;
  value: DashFilter | undefined;
  onChange: (f: DashFilter | null) => void;
}) {
  const id = useId();
  const range = value?.op === "range" ? dateBounds(value) : { from: "", to: "" };
  const valueKey = JSON.stringify(value ?? null);
  const [seen, setSeen] = useState(valueKey);
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  // Filter berubah dari luar (preset, chip dihapus): isian mengikuti.
  if (seen !== valueKey) {
    setSeen(valueKey);
    setFrom(range.from);
    setTo(range.to);
  }
  const wrongOrder = !!from && !!to && from > to;
  const active: Preset | "all" | null =
    value?.op === "preset" ? value.preset : value ? null : "all";

  const edit = (which: "from" | "to", e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    if (which === "from") setFrom(next);
    else setTo(next);
    if (e.target.validity.badInput) return;
    const f = which === "from" ? next : from;
    const t = which === "to" ? next : to;
    if (f && t && f > t) return;
    onChange(dateRange(column.column, column.type, f, t));
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div role="group" aria-labelledby={`${id}-p`} className="flex flex-col gap-1.5">
        <p id={`${id}-p`} className="text-sm font-medium">
          Periode
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={active === o.value}
              data-testid="filter-date-preset"
              data-preset={o.value}
              onClick={() =>
                onChange(
                  o.value === "all"
                    ? null
                    : { column: column.column, op: "preset", preset: o.value },
                )
              }
              className={cn(
                "min-h-11 rounded-md border border-input px-2 text-sm md:min-h-9",
                "hover:bg-accent aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:font-medium",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "forced-colors:aria-pressed:border-2 forced-colors:aria-pressed:border-[Highlight]",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Menurut tanggal hari ini di Jakarta (WIB).</p>
      </div>
      <fieldset className="flex min-w-0 flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">Rentang sendiri</legend>
        <div className="grid grid-cols-2 gap-2">
          {(["from", "to"] as const).map((which) => (
            <div key={which} className="flex min-w-0 flex-col gap-1">
              <label htmlFor={`${id}-${which}`} className="text-xs text-muted-foreground">
                {which === "from" ? "Dari" : "Sampai"}
              </label>
              <Input
                id={`${id}-${which}`}
                type="date"
                value={which === "from" ? from : to}
                invalid={wrongOrder}
                aria-describedby={wrongOrder ? `${id}-err` : undefined}
                onChange={(e) => edit(which, e)}
                className="h-(--control-h-lg) min-w-0 px-2 md:h-(--control-h)"
              />
            </div>
          ))}
        </div>
        {wrongOrder ? (
          <p id={`${id}-err`} role="alert" className="text-xs text-destructive">
            Tanggal “Dari” harus sebelum atau sama dengan “Sampai”.
          </p>
        ) : null}
      </fieldset>
    </div>
  );
}
