"use client";

import { IconAlertTriangle, IconArrowRight, IconCheck, IconCircleOff } from "@tabler/icons-react";
import { TYPE_LABEL } from "@/components/schema/labels";
import { Badge } from "@/components/ui/badge";
import type { PickOption } from "./mapping-model";
import { MappingPicker } from "./mapping-picker";
import type { MappingActiveColumn } from "./mapping-types";

/** Status baris: ikon + teks (tidak hanya warna). */
function RowStatus({ value }: { value: number | null | undefined }) {
  if (value === undefined) {
    return (
      <Badge tone="warning" icon={<IconAlertTriangle />}>
        Belum dipilih
      </Badge>
    );
  }
  return value === null ? (
    <Badge tone="neutral" icon={<IconCircleOff />}>
      Dikosongkan
    </Badge>
  ) : (
    <Badge tone="success" icon={<IconCheck />}>
      Dipetakan
    </Badge>
  );
}

/*
 * Satu kolom aktif yang tidak ditemukan di file baru: kartu kolom aktif → pilihan kolom file baru.
 * Tata letak mengikuti lebar kartu sheet (container query): bertumpuk di kartu sempit, tiga kolom
 * (aktif · panah · pilihan) mulai @2xl.
 */
export function MappingMissingRow({
  id,
  column,
  options,
  value,
  error,
  disabled,
  onChange,
}: {
  id: string;
  column: MappingActiveColumn;
  options: PickOption[];
  value: number | null | undefined;
  error: string | null;
  disabled: boolean;
  onChange: (next: number | null) => void;
}) {
  const errorId = `${id}-err`;
  return (
    <li
      data-testid="mapping-missing-row"
      data-active-pos={column.pos}
      data-state={value === undefined ? "open" : value === null ? "null" : "mapped"}
      className="flex flex-col gap-3 border-b px-5 py-4 last:border-b-0 @2xl:grid @2xl:grid-cols-[minmax(0,1fr)_1.25rem_minmax(0,1.2fr)] @2xl:items-start @2xl:gap-4"
    >
      <div className="flex min-w-0 flex-col items-start gap-1.5">
        <p className="w-full min-w-0">
          <span className="block truncate font-medium" title={column.name}>
            {column.name}
          </span>
          <span className="block truncate text-xs text-muted-foreground" title={column.original}>
            Kolom aktif {column.pos} · {TYPE_LABEL[column.type]}
            {column.original && column.original !== column.name
              ? ` · asli: “${column.original}”`
              : ""}
          </span>
        </p>
        <RowStatus value={value} />
      </div>
      <IconArrowRight
        size={20}
        stroke={1.5}
        aria-hidden
        className="hidden text-muted-foreground @2xl:mt-7 @2xl:block"
      />
      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
          Kolom file baru<span className="sr-only"> untuk “{column.name}”</span>
        </label>
        <MappingPicker
          id={id}
          options={options}
          value={value}
          invalid={error !== null}
          describedBy={error ? errorId : undefined}
          disabled={disabled}
          onChange={onChange}
        />
        {options.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Semua kolom file baru sudah cocok dengan kolom lain; kolom ini hanya bisa dikosongkan.
          </p>
        ) : null}
        {error ? (
          <p id={errorId} className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </li>
  );
}
