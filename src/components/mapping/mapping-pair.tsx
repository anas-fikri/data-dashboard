"use client";

import { IconAlertCircle, IconLoader2, IconRefresh, IconTableOff } from "@tabler/icons-react";
import { Select as SelectPrimitive } from "radix-ui";
import type { ReactNode } from "react";
import { fmtInt } from "@/components/schema/labels";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PairOption } from "./mapping-model";
import type { PlanState } from "./use-pair-plans";

const DROP = "drop";

/**
 * Sheet aktif yang tidak ditemukan di file baru: pasangkan dengan sheet baru yang belum berpasangan
 * (mis. sheet yang diganti nama), atau nyatakan tidak dipakai lagi. Satu-ke-satu: sheet baru yang
 * sudah dipilih sheet aktif lain tetap terlihat tetapi tidak bisa dipilih, dengan alasannya.
 * `children` = status kolom sheet pilihan (PairPlanStatus; di bawah pilihan, sebelum galat).
 */
export function MappingPair({
  id,
  sheetName,
  candidates,
  value,
  error,
  disabled,
  onChange,
  children,
}: {
  id: string;
  sheetName: string;
  candidates: PairOption[];
  /** undefined = belum dipilih, null = tidak dipakai lagi. */
  value: string | null | undefined;
  error: string | null;
  disabled: boolean;
  onChange: (next: string | null) => void;
  children?: ReactNode;
}) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-err`;
  const free = candidates.some((c) => c.takenBy === null);
  const chosen = candidates.find((c) => c.id === value);
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
            {/* Pemicu hanya menyebut nama sheet; jumlah kolom ada di daftar pilihan. */}
            <SelectValue placeholder="Pilih sheet…">
              {chosen
                ? `Sheet “${chosen.name}”`
                : value === null
                  ? "Tidak dipakai lagi"
                  : undefined}
            </SelectValue>
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
                <span className="block [overflow-wrap:anywhere]">Sheet “{c.name}”</span>
                <span className="block text-xs text-muted-foreground group-data-[highlighted]:text-accent-foreground [overflow-wrap:anywhere]">
                  {fmtInt(c.colCount)} kolom
                  {c.takenBy !== null ? ` · sudah dipakai untuk “${c.takenBy}”` : ""}
                </span>
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
        {children}
        {error ? (
          <p id={errorId} className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Kolom sheet pilihan: sedang dimuat, gagal dimuat dengan "Muat lagi", atau termuat (catatan bila
 * baris judulnya mengikuti sheet aktif, bukan tebakan saat unggah).
 */
export function PairPlanStatus({
  state,
  disabled,
  onRetry,
}: {
  state: PlanState;
  disabled: boolean;
  onRetry: () => void;
}) {
  if (state.status === "ready") {
    return state.plan.headerChanged ? (
      <p className="text-sm text-muted-foreground">
        Judul kolom diambil dari baris {fmtInt(state.plan.headerRow)}, sama dengan sheet aktif.
      </p>
    ) : null;
  }
  if (state.status === "loading") {
    return (
      <p
        role="status"
        data-testid="mapping-pair-loading"
        className="flex items-center gap-2 text-sm text-muted-foreground"
      >
        <IconLoader2 size={16} stroke={1.5} aria-hidden className="motion-safe:animate-spin" />
        Memuat kolom sheet…
      </p>
    );
  }
  return (
    <div
      role="alert"
      data-testid="mapping-pair-error"
      className="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
    >
      <p className="flex items-start gap-2">
        <IconAlertCircle
          size={20}
          stroke={1.5}
          aria-hidden
          className="mt-px shrink-0 text-destructive"
        />
        <span className="min-w-0 [overflow-wrap:anywhere]">
          Kolom sheet ini belum bisa dimuat. {state.message}
        </span>
      </p>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled}
        leadingIcon={<IconRefresh aria-hidden />}
        className="h-(--control-h-lg) w-full sm:w-auto sm:self-start md:h-(--control-h-sm)"
        onClick={onRetry}
      >
        Muat lagi
      </Button>
    </div>
  );
}
