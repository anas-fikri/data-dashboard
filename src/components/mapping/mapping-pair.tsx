"use client";

import { IconTableOff } from "@tabler/icons-react";
import { Select as SelectPrimitive } from "radix-ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PairOption } from "./mapping-model";

const DROP = "drop";

/**
 * Sheet aktif yang tidak ditemukan di file baru: pasangkan dengan sheet baru yang belum berpasangan
 * (mis. sheet yang diganti nama), atau nyatakan tidak dipakai lagi. Satu-ke-satu: sheet baru yang
 * sudah dipilih sheet aktif lain tetap terlihat tetapi tidak bisa dipilih, dengan alasannya.
 */
export function MappingPair({
  id,
  sheetName,
  candidates,
  value,
  error,
  disabled,
  onChange,
}: {
  id: string;
  sheetName: string;
  candidates: PairOption[];
  /** undefined = belum dipilih, null = tidak dipakai lagi. */
  value: string | null | undefined;
  error: string | null;
  disabled: boolean;
  onChange: (next: string | null) => void;
}) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-err`;
  const free = candidates.some((c) => c.takenBy === null);
  return (
    <div className="flex flex-col gap-3 border-t px-5 py-4">
      <p className="flex items-start gap-2 text-sm">
        <IconTableOff
          size={20}
          stroke={1.5}
          aria-hidden
          className="shrink-0 text-muted-foreground"
        />
        <span className="min-w-0 [overflow-wrap:anywhere]">
          Sheet “{sheetName}” tidak ada di file baru.{" "}
          {free
            ? "Pilih sheet file baru yang berisi datanya, atau nyatakan sheet ini tidak dipakai lagi."
            : "Semua sheet file baru sudah berpasangan, jadi sheet ini hanya bisa dinyatakan tidak dipakai lagi."}
        </span>
      </p>
      <div className="flex flex-col gap-1.5 md:max-w-md">
        <label htmlFor={id} className="text-sm font-medium">
          Sheet file baru<span className="sr-only"> untuk sheet “{sheetName}”</span>
        </label>
        <Select
          value={value === undefined ? "" : value === null ? DROP : value}
          disabled={disabled}
          onValueChange={(v) => onChange(v === DROP ? null : v)}
        >
          <SelectTrigger
            id={id}
            data-testid="mapping-sheet-pair"
            aria-invalid={error ? true : undefined}
            aria-describedby={
              [error ? errorId : null, value === null ? hintId : null].filter(Boolean).join(" ") ||
              undefined
            }
            className="h-(--control-h-lg) md:h-(--control-h)"
          >
            <SelectValue placeholder="Pilih sheet…" />
          </SelectTrigger>
          <SelectContent>
            {candidates.map((c) => (
              <SelectItem
                key={c.id}
                value={c.id}
                textValue={c.name}
                disabled={c.takenBy !== null}
                className="group"
              >
                {/* Hanya sheet bebas yang bisa terpilih: teksnya tetap polos untuk tampilan pemicu. */}
                {c.takenBy === null ? (
                  `Sheet “${c.name}”`
                ) : (
                  <>
                    <span className="block [overflow-wrap:anywhere]">Sheet “{c.name}”</span>
                    <span className="block text-xs text-muted-foreground group-data-[highlighted]:text-accent-foreground [overflow-wrap:anywhere]">
                      sudah dipakai untuk “{c.takenBy}”
                    </span>
                  </>
                )}
              </SelectItem>
            ))}
            {candidates.length > 0 ? (
              <SelectPrimitive.Separator className="-mx-1 my-1 h-px bg-border" />
            ) : null}
            <SelectItem value={DROP}>Tidak dipakai lagi</SelectItem>
          </SelectContent>
        </Select>
        {value === null ? (
          <p id={hintId} className="text-sm text-muted-foreground">
            Widget yang memakai sheet ini tidak menampilkan data setelah versi baru aktif.
          </p>
        ) : null}
        {error ? (
          <p id={errorId} className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
