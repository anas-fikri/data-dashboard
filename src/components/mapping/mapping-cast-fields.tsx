"use client";

import { FormatCell } from "@/components/schema/format-cell";
import { TYPE_LABEL, needsDateFormat, needsLocale, typeOptions } from "@/components/schema/labels";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ColumnType } from "@/features/ingest/infer";
import type { CastChoice } from "./mapping-types";

/**
 * Pilihan tipe + format satu kolom file baru untuk versi ini (baris "nilai tidak cocok" dan kolom
 * yang dipetakan dengan tipe terbaca lain). Fragmen dua sel: pemanggil yang mengatur grid-nya.
 */
export function MappingCastFields({
  id,
  name,
  base,
  value,
  describedBy,
  placeholder = true,
  disabled,
  onChange,
}: {
  id: string;
  /** Nama tampil kolom (untuk label pembaca layar). */
  name: string;
  /** Pilihan awal (kolom aktif); kembali ke tipe ini memulihkan formatnya. */
  base: CastChoice;
  value: CastChoice;
  describedBy?: string;
  /** false = tanpa sel "—" bila tipe tidak punya format (blok sebaris, bukan kolom sejajar). */
  placeholder?: boolean;
  disabled: boolean;
  onChange: (next: CastChoice) => void;
}) {
  const label = (text: string, htmlFor: string) => (
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-muted-foreground">
      {text}
      <span className="sr-only"> untuk “{name}”</span>
    </label>
  );
  return (
    <>
      <div>
        {label("Tipe", `${id}-type`)}
        <Select
          value={value.type}
          disabled={disabled}
          // Tipe lain mulai dari deteksi otomatis; kembali ke tipe aktif memulihkan formatnya.
          onValueChange={(v) => onChange(v === base.type ? base : { type: v as ColumnType })}
        >
          <SelectTrigger
            id={`${id}-type`}
            aria-describedby={describedBy}
            className="h-(--control-h-lg) md:h-(--control-h)"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {typeOptions(base.type).map((t) => (
              <SelectItem key={t} value={t}>
                {TYPE_LABEL[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {placeholder || needsDateFormat(value.type) || needsLocale(value.type) ? (
        <FormatCell
          id={id}
          column={value.type === base.type ? base : {}}
          draft={value}
          disabled={disabled}
          onChange={onChange}
          label={label}
        />
      ) : null}
    </>
  );
}
