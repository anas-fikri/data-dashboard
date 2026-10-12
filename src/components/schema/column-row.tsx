"use client";

import { IconAlertTriangle, IconEyeOff } from "@tabler/icons-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ColumnSchema } from "@/features/ingest/infer";
import { cn } from "@/lib/utils";
import { FormatCell } from "./format-cell";
import { TYPE_LABEL, fmtInt, fmtPct, typeOptions, type ColumnDraft } from "./labels";

/*
 * Satu kolom di editor skema. Satu DOM untuk semua lebar layar: di ≥ md baris grid dengan judul
 * kolom bersama (label disembunyikan secara visual), di ponsel kartu bertumpuk dengan label terlihat.
 */
export const ROW_GRID =
  "md:grid md:grid-cols-[minmax(12rem,1.4fr)_minmax(9rem,1fr)_minmax(10rem,1fr)_minmax(9rem,0.9fr)_6.5rem] md:items-start md:gap-3";

export function ColumnRow({
  column,
  draft,
  changed,
  error,
  disabled,
  onChange,
}: {
  column: ColumnSchema;
  draft: ColumnDraft;
  changed: boolean;
  error: string | undefined;
  disabled: boolean;
  onChange: (next: ColumnDraft) => void;
}) {
  const id = `col-${column.pos}`;
  const label = (text: string, htmlFor: string) => (
    <label
      htmlFor={htmlFor}
      className="mb-1 block text-xs font-medium text-muted-foreground md:sr-only"
    >
      {text}
      <span className="sr-only"> untuk kolom {column.pos}</span>
    </label>
  );
  return (
    <li
      data-testid="schema-column"
      data-pos={column.pos}
      className={cn(
        "flex flex-col gap-3 border-b px-5 py-3 last:border-b-0",
        ROW_GRID,
        changed && "bg-primary/5 shadow-[inset_3px_0_0_0_var(--color-primary)]",
      )}
    >
      <div className="min-w-0">
        {label("Nama kolom", `${id}-name`)}
        <Input
          id={`${id}-name`}
          value={draft.name}
          maxLength={120}
          disabled={disabled}
          invalid={Boolean(error)}
          aria-describedby={`${id}-orig${error ? ` ${id}-err` : ""}`}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
        />
        <p
          id={`${id}-orig`}
          className="mt-1 truncate text-xs text-muted-foreground"
          title={column.original}
        >
          Kolom {column.pos}
          {column.original && column.original !== draft.name ? ` · asli: "${column.original}"` : ""}
          {changed ? <span className="sr-only"> (diubah)</span> : null}
        </p>
        {error ? (
          <p id={`${id}-err`} className="mt-1 text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      <div>
        {label("Tipe", `${id}-type`)}
        <Select
          value={draft.type}
          disabled={disabled}
          onValueChange={(v) => onChange({ ...draft, type: v as ColumnDraft["type"] })}
        >
          <SelectTrigger id={`${id}-type`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {typeOptions(column.type).map((t) => (
              <SelectItem key={t} value={t}>
                {TYPE_LABEL[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <FormatCell
        id={id}
        column={column}
        draft={draft}
        disabled={disabled}
        onChange={onChange}
        label={label}
      />

      <dl className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground md:flex-col md:pt-1.5">
        <div className="flex gap-1">
          <dt>Kosong</dt>
          <dd className="tabular-nums text-foreground">{fmtPct(column.nullPct)}</dd>
        </div>
        <div className="flex gap-1">
          <dt>Unik</dt>
          <dd className="tabular-nums text-foreground">{fmtInt(column.distinctCount)}</dd>
        </div>
        {column.castFailCount > 0 ? (
          <div className="flex items-center gap-1" data-testid="cast-fail">
            <IconAlertTriangle
              size={14}
              stroke={2}
              aria-hidden
              className="shrink-0 text-destructive"
            />
            <dt>Gagal konversi</dt>
            <dd className="tabular-nums font-medium text-foreground">
              {fmtInt(column.castFailCount)}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="flex items-center md:h-(--control-h)">
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm md:min-h-0">
          <input
            type="checkbox"
            className="size-4 accent-[var(--color-primary)]"
            checked={draft.hidden}
            disabled={disabled}
            onChange={(e) => onChange({ ...draft, hidden: e.target.checked })}
          />
          <IconEyeOff size={16} stroke={1.5} aria-hidden className="text-muted-foreground" />
          Sembunyikan
          <span className="sr-only"> kolom {column.pos}</span>
        </label>
      </div>
    </li>
  );
}
