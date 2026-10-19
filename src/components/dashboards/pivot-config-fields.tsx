"use client";

import { IconPlus, IconX } from "@tabler/icons-react";
import { useId, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { PivotSpec } from "@/features/widgets/spec";
import { Choice, ColumnChoice } from "./config-fields";
import { dimensionFor } from "./pivot-config-model";
import { GRAIN_LABEL, isTemporal, type SourceColumn } from "./widget-config-model";

/*
 * Kontrol kecil panel pivot (T-tcjp): kolom + rentang waktu (tanggal), tombol tambah/hapus berlabel
 * jelas, dan sakelar berpenjelasan. Ukuran sentuh 44 px di ponsel seperti kontrol panel lain.
 */
type Dimension = PivotSpec["rows"][number];

const ICON_BUTTON = "size-(--control-h-lg) shrink-0 md:size-(--control-h)";

export function DimensionField({
  label,
  value,
  columns,
  onChange,
  remove,
  error,
  testId,
}: {
  label: string;
  value: Dimension;
  columns: SourceColumn[];
  onChange: (d: Dimension) => void;
  /** Tombol hapus (isian opsional), dengan label aksesibel yang menyebut isiannya. */
  remove?: { label: string; onRemove: () => void };
  error?: string;
  testId?: string;
}) {
  const col = columns.find((c) => c.pos === value.column);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 items-end gap-2">
        <div className="min-w-0 flex-1">
          <ColumnChoice
            label={label}
            testId={testId}
            value={value.column}
            columns={columns}
            onChange={(pos) => {
              const c = columns.find((x) => x.pos === pos);
              if (c) onChange(dimensionFor(c));
            }}
          />
        </div>
        {remove ? <RemoveButton label={remove.label} onClick={remove.onRemove} /> : null}
      </div>
      {col && isTemporal(col.type) ? (
        <Choice
          label="Rentang waktu"
          value={value.timeGrain ?? "none"}
          options={[
            ...Object.entries(GRAIN_LABEL).map(([v, l]) => ({ value: v, label: l })),
            { value: "none", label: "Per tanggal persis" },
          ]}
          onChange={(g) =>
            onChange(
              g === "none"
                ? { column: value.column }
                : { column: value.column, timeGrain: g as Dimension["timeGrain"] },
            )
          }
        />
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function AddButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-(--control-h-lg) w-full md:h-(--control-h-sm) md:w-auto md:self-start"
      leadingIcon={<IconPlus aria-hidden />}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

export function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={ICON_BUTTON}
      aria-label={label}
      onClick={onClick}
    >
      <IconX aria-hidden />
    </Button>
  );
}

export function ToggleField({
  label,
  hint,
  checked,
  onChange,
  testId,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (on: boolean) => void;
  testId?: string;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5 pt-2.5 md:pt-0.5">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        aria-describedby={`${id}-hint`}
        data-testid={testId}
      />
    </div>
  );
}
