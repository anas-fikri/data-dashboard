"use client";

import { Select as SelectPrimitive } from "radix-ui";
import { TYPE_LABEL } from "@/components/schema/labels";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PickOption } from "./mapping-model";

const NULL = "null";
export const NULL_LABEL = "Tidak ada di file — kosongkan (NULL)";

/** Contoh nilai pendek untuk membedakan kolom bernama mirip. */
function samplesText(samples: string[]): string {
  if (samples.length === 0) return "contoh tidak tersedia";
  const cut = (v: string) => (v.length > 32 ? `${v.slice(0, 31)}…` : v);
  return `contoh: ${samples.map((v) => `“${cut(v)}”`).join(", ")}`;
}

/**
 * Pilihan kolom file baru untuk satu kolom aktif yang hilang: kolom baru yang belum cocok (dengan
 * tipe tebakan dan contoh nilai), lalu "kosongkan". Satu-ke-satu: kolom yang sudah dipakai kolom
 * aktif lain tetap terlihat tetapi tidak bisa dipilih, dengan alasannya.
 */
export function MappingPicker({
  id,
  options,
  value,
  invalid,
  describedBy,
  disabled,
  onChange,
  noNull = false,
}: {
  id: string;
  options: PickOption[];
  /** undefined = belum dipilih, null = kosongkan, angka = posisi kolom baru. */
  value: number | null | undefined;
  invalid: boolean;
  describedBy: string | undefined;
  disabled: boolean;
  onChange: (next: number | null) => void;
  /** Kolom periode unggahan periode (T-057): "kosongkan" tidak tersedia (alasan ditampilkan). */
  noNull?: boolean;
}) {
  const chosen = options.find((o) => o.column.pos === value)?.column;
  return (
    <Select
      value={value === undefined ? "" : value === null ? NULL : String(value)}
      disabled={disabled}
      onValueChange={(v) => onChange(v === NULL ? null : Number(v))}
    >
      <SelectTrigger
        id={id}
        data-testid="mapping-picker"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="h-(--control-h-lg) md:h-(--control-h)"
      >
        <SelectValue placeholder="Pilih kolom…">
          {value === null ? "Kosongkan (NULL)" : chosen ? `“${chosen.original}”` : undefined}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.length > 0 ? (
          <SelectGroup>
            {options.map(({ column: c, takenBy }) => (
              <SelectItem
                key={c.pos}
                value={String(c.pos)}
                textValue={c.original}
                disabled={takenBy !== null}
                className="group"
              >
                <span className="block font-medium [overflow-wrap:anywhere]">
                  “{c.original || `Kolom ${c.pos}`}”
                </span>
                {/* Baris disorot berlatar aksen: teks redup ikut warna aksen agar kontras ≥ 4,5:1. */}
                <span className="block text-xs text-muted-foreground group-data-[highlighted]:text-accent-foreground [overflow-wrap:anywhere]">
                  Kolom {c.pos} · {TYPE_LABEL[c.type]} · {samplesText(c.samples)}
                  {takenBy !== null ? ` · sudah dipakai untuk “${takenBy}”` : ""}
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        ) : null}
        {options.length > 0 ? (
          <SelectPrimitive.Separator className="-mx-1 my-1 h-px bg-border" />
        ) : null}
        <SelectItem value={NULL} textValue={NULL_LABEL} disabled={noNull} className="group">
          <span className="block">{NULL_LABEL}</span>
          {noNull ? (
            <span className="block text-xs text-muted-foreground [overflow-wrap:anywhere]">
              Tidak tersedia: kolom periode menentukan periode setiap baris.
            </span>
          ) : null}
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
