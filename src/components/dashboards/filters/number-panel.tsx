"use client";

import { IconCheck } from "@tabler/icons-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DashFilter, FilterColumnView } from "./filter-model";
import { parseNumber } from "./filter-text";

/*
 * Rentang angka (T-012): batas bawah dan/atau atas (inklusif), ditulis gaya Indonesia ("1.500.000",
 * "2,5"). Berlaku lewat "Terapkan" (atau Enter) — bukan tiap ketukan, agar widget tidak memuat ulang
 * untuk angka setengah jadi. Durasi diisi dalam jam (disimpan detik, sama dengan data).
 */
const HOUR = 3600;

export function NumberPanel({
  column,
  value,
  onChange,
  onDone,
}: {
  column: FilterColumnView;
  value: DashFilter | undefined;
  onChange: (f: DashFilter | null) => void;
  /** Setelah diterapkan/dihapus (mis. menutup popover). */
  onDone?: () => void;
}) {
  const id = useId();
  const unit = column.type === "duration" ? HOUR : 1;
  const show = (b: unknown) =>
    typeof b === "number" ? (b / unit).toLocaleString("id-ID", { maximumFractionDigits: 6 }) : "";
  const range = value?.op === "range" ? value : undefined;
  const [min, setMin] = useState(show(range?.gte));
  const [max, setMax] = useState(show(range?.lte));
  const [error, setError] = useState<string | null>(null);
  // Filter berubah dari luar (chip dihapus, "Hapus semua filter"): isian mengikuti.
  const valueKey = JSON.stringify(value ?? null);
  const [seen, setSeen] = useState(valueKey);
  if (seen !== valueKey) {
    setSeen(valueKey);
    setMin(show(range?.gte));
    setMax(show(range?.lte));
    setError(null);
  }
  const suffix = unit === HOUR ? " (jam)" : "";

  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    const lo = parseNumber(min);
    const hi = parseNumber(max);
    if (lo === null || hi === null) return setError("Isi angka, mis. 1.500 atau 2,5.");
    if (lo !== undefined && hi !== undefined && lo > hi) {
      return setError("Batas bawah harus lebih kecil atau sama dengan batas atas.");
    }
    setError(null);
    const f: DashFilter = { column: column.column, op: "range" };
    if (lo !== undefined) f.gte = Math.round(lo * unit * 1e6) / 1e6;
    if (hi !== undefined) f.lte = Math.round(hi * unit * 1e6) / 1e6;
    onChange(lo === undefined && hi === undefined ? null : f);
    onDone?.();
  };
  const field = (which: "min" | "max") => (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={`${id}-${which}`} className="text-xs text-muted-foreground">
        {which === "min" ? `Paling kecil${suffix}` : `Paling besar${suffix}`}
      </label>
      <Input
        id={`${id}-${which}`}
        inputMode="decimal"
        autoComplete="off"
        value={which === "min" ? min : max}
        invalid={!!error}
        aria-describedby={error ? `${id}-err` : undefined}
        onChange={(e) => (which === "min" ? setMin : setMax)(e.target.value)}
        className="h-(--control-h-lg) md:h-(--control-h)"
      />
    </div>
  );

  return (
    <form onSubmit={apply} noValidate className="flex min-w-0 flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        {field("min")}
        {field("max")}
      </div>
      {error ? (
        <p id={`${id}-err`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Kosongkan salah satu untuk batas terbuka.</p>
      )}
      <div className="flex flex-col gap-2 md:flex-row-reverse">
        <Button
          type="submit"
          leadingIcon={<IconCheck aria-hidden />}
          className="h-(--control-h-lg) w-full md:h-(--control-h) md:w-auto"
        >
          Terapkan
        </Button>
        {value ? (
          <Button
            variant="outline"
            className="h-(--control-h-lg) w-full md:h-(--control-h) md:w-auto"
            onClick={() => {
              setMin("");
              setMax("");
              setError(null);
              onChange(null);
              onDone?.();
            }}
          >
            Hapus
          </Button>
        ) : null}
      </div>
    </form>
  );
}
