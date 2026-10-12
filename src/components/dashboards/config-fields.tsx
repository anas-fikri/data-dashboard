"use client";

import { useId } from "react";
import { TYPE_LABEL } from "@/components/schema/labels";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { NumberFormat } from "@/features/widgets/spec";
import type { SourceColumn } from "./widget-config-model";

/*
 * Kontrol kecil panel konfigurasi widget (T-011): pilihan kustom (Radix Select, bukan native), label
 * terlihat yang terhubung ke kontrol, ukuran sentuh 44 px di ponsel. Nilai yang tidak lagi tersedia
 * (kolom disembunyikan) tampil sebagai "Pilih kolom" dengan aria-invalid.
 */
const control = "h-(--control-h-lg) w-full md:h-(--control-h)";

export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  testId,
  placeholder,
}: {
  label: string;
  /** Kosong = belum dipilih / tidak lagi tersedia → placeholder + aria-invalid. */
  value: T | "";
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  testId?: string;
  placeholder?: string;
}) {
  const id = useId();
  const missing = value === "" || !options.some((o) => o.value === value);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Select value={missing ? "" : value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger
          id={id}
          className={control}
          data-testid={testId}
          aria-invalid={missing && placeholder ? true : undefined}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Pilih satu kolom; nama kolom + jenis datanya agar mudah dibedakan. */
export function ColumnChoice({
  label,
  value,
  columns,
  onChange,
  testId,
}: {
  label: string;
  value: number | undefined;
  columns: SourceColumn[];
  onChange: (pos: number) => void;
  testId?: string;
}) {
  return (
    <Choice
      label={label}
      testId={testId}
      placeholder="Pilih kolom"
      value={value === undefined ? "" : String(value)}
      options={columns.map((c) => ({
        value: String(c.pos),
        label: `${c.name} · ${TYPE_LABEL[c.type]}`,
      }))}
      onChange={(v) => onChange(Number(v))}
    />
  );
}

export const FORMAT_OPTIONS: { value: NumberFormat["style"]; label: string }[] = [
  { value: "auto", label: "Otomatis" },
  { value: "number", label: "Angka (1.234)" },
  { value: "rupiah", label: "Rupiah (Rp 1.234)" },
  { value: "percent", label: "Persen (12%)" },
];

export function FormatFields({
  value,
  onChange,
}: {
  value: NumberFormat;
  onChange: (f: NumberFormat) => void;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2">
      <Choice
        label="Format angka"
        testId="config-format"
        value={value.style}
        options={FORMAT_OPTIONS}
        onChange={(style) => onChange({ ...value, style })}
      />
      {value.style === "auto" ? null : (
        <Choice
          label="Desimal"
          value={String(value.decimals)}
          options={[0, 1, 2, 3, 4].map((n) => ({ value: String(n), label: String(n) }))}
          onChange={(d) => onChange({ ...value, decimals: Number(d) })}
        />
      )}
    </div>
  );
}
