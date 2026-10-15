"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { KeyboardEvent } from "react";
import type { ShareRole } from "@/features/sharing/types";
import { cn } from "@/lib/utils";
import { isShareRole, ROLE_OPTIONS } from "./share-model";

/**
 * Enter di daftar pilihan: Radix sudah memilih opsinya di keydown item (sebelum bubbling ke sini), tetapi
 * tidak mencegah aksi bawaan Enter. Pilihan yang membuka konfirmasi ("Jadikan editor?") memindah fokus
 * ke tombol "Batal" di keydown itu, lalu keypress Enter yang sama mengekliknya → konfirmasi langsung
 * tertutup. Dicegah di sini (review T-016 R5-UI-1). Handler Radix di konten tidak melakukan apa pun
 * untuk Enter, jadi tidak ada yang hilang saat dilewati.
 */
export function keepEnterInList(e: Pick<KeyboardEvent, "key" | "preventDefault">) {
  if (e.key === "Enter") e.preventDefault();
}

/**
 * Pilihan peran share (Select kustom, bukan native). Label terlihat atau aria-label wajib dari
 * pemanggil (`id` untuk <label htmlFor>, atau `aria-label` di baris daftar akses).
 */
export function RoleSelect({
  value,
  onChange,
  disabled,
  className,
  ...trigger
}: {
  value: ShareRole;
  onChange: (role: ShareRole) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
  "aria-label"?: string;
  /** Pesan galat baris (ganti peran gagal) yang dibacakan bersama Select. */
  "aria-describedby"?: string;
  "data-testid": string;
}) {
  return (
    <Select value={value} onValueChange={(v) => isShareRole(v) && onChange(v)} disabled={disabled}>
      <SelectTrigger
        {...trigger}
        className={cn("h-(--control-h-lg) md:h-(--control-h)", className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent onKeyDown={keepEnterInList}>
        {ROLE_OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
