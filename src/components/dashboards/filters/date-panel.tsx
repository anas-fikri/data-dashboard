"use client";

import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PRESETS, type DashFilter, type FilterColumnView, type Preset } from "./filter-model";
import { PRESET_LABEL, dateBounds, dateRange } from "./filter-text";

/*
 * Rentang tanggal (T-012): preset (bulan ini, kuartal ini, sejak awal tahun — dihitung server menurut
 * tanggal hari ini di Jakarta, dibandingkan apa adanya tanpa geser zona, D8) atau rentang sendiri
 * lewat dua isian tanggal (bertumpuk: ikon kalender tidak terpotong). Isian hanya diterapkan saat
 * tanggalnya lengkap dan sah, tahun 1900–2100 (min/max) — tahun yang sedang diketik (0002, 0020,
 * 0202) tidak dikirim sebagai filter. Kolom cap waktu: hari "Sampai" ikut utuh (server menerima
 * < hari berikutnya).
 */
const MIN = "1900-01-01";
const MAX = "2100-12-31";
/** Kosong (batas terbuka) atau tanggal lengkap 1900–2100 (tahun 5 digit tidak). */
const usable = (d: string) => !d || (/^\d{4}-\d{2}-\d{2}$/.test(d) && d >= MIN && d <= MAX);
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
  // Isian yang ditinggalkan (blur) dengan tanggal belum lengkap/di luar 1900–2100.
  const [bad, setBad] = useState({ from: false, to: false });
  // Filter berubah dari luar (preset, chip dihapus): isian mengikuti.
  if (seen !== valueKey) {
    setSeen(valueKey);
    setFrom(range.from);
    setTo(range.to);
    setBad({ from: false, to: false });
  }
  const wrongOrder = !!from && !!to && from > to;
  const outOfRange = bad.from || bad.to;
  const active: Preset | "all" | null =
    value?.op === "preset" ? value.preset : value ? null : "all";

  const edit = (which: "from" | "to", e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    if (which === "from") setFrom(next);
    else setTo(next);
    // Belum lengkap (badInput) atau di luar 1900–2100 (tahun setengah diketik): belum diterapkan.
    if (e.target.validity.badInput || !usable(next)) return;
    setBad((b) => ({ ...b, [which]: false }));
    const f = which === "from" ? next : from;
    const t = which === "to" ? next : to;
    if (!usable(f) || !usable(t) || (f && t && f > t)) return;
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
        <div className="flex flex-col gap-2">
          {(["from", "to"] as const).map((which) => (
            <div key={which} className="flex min-w-0 flex-col gap-1">
              <label htmlFor={`${id}-${which}`} className="text-xs text-muted-foreground">
                {which === "from" ? "Dari" : "Sampai"}
              </label>
              <Input
                id={`${id}-${which}`}
                type="date"
                min={MIN}
                max={MAX}
                value={which === "from" ? from : to}
                invalid={wrongOrder || bad[which]}
                aria-describedby={wrongOrder || bad[which] ? `${id}-err` : undefined}
                onChange={(e) => edit(which, e)}
                onBlur={(e) =>
                  setBad((b) => ({
                    ...b,
                    [which]: e.target.validity.badInput || !usable(e.target.value),
                  }))
                }
                className="h-(--control-h-lg) md:h-(--control-h)"
              />
            </div>
          ))}
        </div>
        {wrongOrder || outOfRange ? (
          <p id={`${id}-err`} role="alert" className="text-xs text-destructive">
            {outOfRange
              ? "Isi tanggal lengkap antara 1900 dan 2100."
              : "Tanggal “Dari” harus sebelum atau sama dengan “Sampai”."}
          </p>
        ) : null}
      </fieldset>
    </div>
  );
}
