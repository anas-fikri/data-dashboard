"use client";

import { useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PRESETS, type DashFilter, type FilterColumnView, type Preset } from "./filter-model";
import { PeriodPicker } from "./period-picker";
import {
  DATE_MAX,
  DATE_MIN,
  PRESET_LABEL,
  dateBounds,
  dateRange,
  dateUsable as usable,
  datesReversed,
} from "./filter-text";

/*
 * Rentang tanggal (T-012): preset (bulan/kuartal/tahun berjalan dan sebelumnya, 30/90 hari terakhir —
 * dihitung server menurut tanggal hari ini di Jakarta, dibandingkan apa adanya tanpa geser zona, D8),
 * satu periode tertentu dari data (PeriodPicker, T-9gs1), atau rentang sendiri
 * lewat dua isian tanggal (bertumpuk: ikon kalender tidak terpotong). Isian hanya diterapkan saat
 * tanggalnya lengkap dan sah, tahun 1900–2100 (min/max) — tahun yang sedang diketik (0002, 0020,
 * 0202) tidak dikirim sebagai filter. Kolom cap waktu: hari "Sampai" ikut utuh (server menerima
 * < hari berikutnya). Galat urutan ("Dari" sesudah "Sampai") hanya setelah isian ditetapkan — blur,
 * Enter, atau dipilih dari kalender — bukan di tengah ketikan (mis. hari "1" dari "15").
 */
const OPTIONS: { value: Preset | "all"; label: string }[] = [
  { value: "all", label: "Semua tanggal" },
  ...PRESETS.map((p) => ({ value: p, label: PRESET_LABEL[p] })),
];

export function DatePanel({
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
  const range = value?.op === "range" ? dateBounds(value) : { from: "", to: "" };
  const valueKey = JSON.stringify(value ?? null);
  const [seen, setSeen] = useState(valueKey);
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  // Isian yang ditinggalkan (blur) dengan tanggal belum lengkap/di luar 1900–2100.
  const [bad, setBad] = useState({ from: false, to: false });
  // Urutan diperiksa setelah isian ditetapkan; perubahan lewat ketikan menunda pemeriksaan.
  const [settled, setSettled] = useState(false);
  const typing = useRef(false);
  // Filter berubah dari luar (preset, chip dihapus): isian mengikuti.
  if (seen !== valueKey) {
    setSeen(valueKey);
    setFrom(range.from);
    setTo(range.to);
    setBad({ from: false, to: false });
    setSettled(false);
  }
  const wrongOrder = settled && datesReversed(from, to);
  const outOfRange = bad.from || bad.to;
  const active: Preset | "all" | null =
    value?.op === "preset" ? value.preset : value ? null : "all";

  const edit = (which: "from" | "to", e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    if (which === "from") setFrom(next);
    else setTo(next);
    // Dipilih dari kalender (tanpa tombol ditekan) = ditetapkan; ketikan = belum.
    setSettled(!typing.current);
    typing.current = false;
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
          Pilihan cepat
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
      <PeriodPicker dashboardId={dashboardId} column={column} value={value} onChange={onChange} />
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
                min={DATE_MIN}
                max={DATE_MAX}
                value={which === "from" ? from : to}
                invalid={wrongOrder || bad[which]}
                aria-describedby={wrongOrder || bad[which] ? `${id}-err` : undefined}
                onChange={(e) => edit(which, e)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setSettled(true);
                  else typing.current = true;
                }}
                onBlur={(e) => {
                  typing.current = false;
                  setSettled(true);
                  setBad((b) => ({
                    ...b,
                    [which]: e.target.validity.badInput || !usable(e.target.value),
                  }));
                }}
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
