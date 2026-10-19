"use client";

import { IconTableOptions } from "@tabler/icons-react";
import { PIVOT_COLUMNS_SHOWN, PIVOT_ROWS_SHOWN, type PivotSpec } from "@/features/widgets/spec";
import { Choice } from "./config-fields";
import { MeasureFields } from "./config-sections";
import { AddButton, DimensionField, RemoveButton, ToggleField } from "./pivot-config-fields";
import {
  DUPLICATE_TEXT,
  canAddRow,
  canAddValue,
  defaultMeasureFor,
  dimensionFor,
  duplicateField,
  nextRowColumn,
  pivotSummary,
  splitColumn,
} from "./pivot-config-model";
import {
  AGG_LABEL,
  CHART_SORT_ORDER,
  COUNT_FILLED_LABEL,
  sortLabel,
  type SourceColumn,
} from "./widget-config-model";

/*
 * Bagian panel untuk widget pivot (T-tcjp), disusun seperti cara orang membaca PivotTable Excel:
 * ringkasan kalimat bentuk tabelnya dulu, lalu Baris (+ rincian opsional), "Pisahkan per" (opsional,
 * mis. per bulan → satu kolom per periode di kiri kolom Total), Nilai (1–3), urutan, Total, Subtotal.
 * Perubahan langsung tersimpan dan widget di kanvas memuat ulang (pratinjau sungguhan).
 */
export function PivotFields({
  spec,
  columns,
  onChange,
}: {
  spec: PivotSpec;
  columns: SourceColumn[];
  onChange: (spec: PivotSpec) => void;
}) {
  const set = (patch: Partial<PivotSpec>) => onChange({ ...spec, ...patch });
  const name = (pos: number | undefined) => columns.find((c) => c.pos === pos)?.name ?? "kolom";
  const valueLabel = (m: PivotSpec["values"][number]) =>
    m.agg === "count"
      ? m.column === undefined
        ? AGG_LABEL.count
        : `${COUNT_FILLED_LABEL} ${name(m.column)}`
      : `${AGG_LABEL[m.agg]} ${name(m.column)}`;
  const dup = duplicateField(spec);
  const [row0, row1] = spec.rows;
  const rowType = columns.find((c) => c.pos === row0?.column)?.type;
  const { column: split, ...withoutSplit } = spec;

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="pivot-config">
      <p className="flex gap-2 rounded-md bg-muted px-3 py-2 text-sm" data-testid="pivot-summary">
        <IconTableOptions size={20} stroke={1.5} aria-hidden className="mt-0.5 shrink-0" />
        <span>
          {pivotSummary(spec, columns, valueLabel).map((p, i) =>
            p.strong ? <strong key={i}>{p.text}</strong> : p.text,
          )}
        </span>
      </p>

      <fieldset className="flex min-w-0 flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">Baris</legend>
        <DimensionField
          label="Satu baris per"
          testId="pivot-row-0"
          value={row0!}
          columns={columns}
          onChange={(d) => set({ rows: [d, ...spec.rows.slice(1)] })}
        />
        {row1 ? (
          <DimensionField
            label="Dirinci per"
            testId="pivot-row-1"
            value={row1}
            columns={columns}
            error={dup === "row1" ? DUPLICATE_TEXT : undefined}
            onChange={(d) => set({ rows: [row0!, d] })}
            remove={{ label: "Hapus rincian baris", onRemove: () => set({ rows: [row0!] }) }}
          />
        ) : canAddRow(spec) && nextRowColumn(spec, columns) ? (
          <AddButton
            onClick={() => set({ rows: [row0!, dimensionFor(nextRowColumn(spec, columns)!)] })}
          >
            Rinci baris (mis. per layanan)
          </AddButton>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Maks. {PIVOT_ROWS_SHOWN} baris tampil; total tetap mencakup semua data.
        </p>
      </fieldset>

      <fieldset className="flex min-w-0 flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">Pisahkan per (opsional)</legend>
        {split ? (
          <DimensionField
            label="Satu kolom per"
            testId="pivot-column"
            value={split}
            columns={columns}
            error={dup === "column" ? DUPLICATE_TEXT : undefined}
            onChange={(column) => set({ column })}
            remove={{ label: "Hapus pemisah kolom", onRemove: () => onChange(withoutSplit) }}
          />
        ) : splitColumn(spec, columns) ? (
          <AddButton onClick={() => set({ column: dimensionFor(splitColumn(spec, columns)!) })}>
            Pisahkan per periode atau kategori
          </AddButton>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Satu kolom tabel untuk setiap nilai, mis. per bulan, di kiri kolom Total. Maks.{" "}
          {PIVOT_COLUMNS_SHOWN} kolom tampil.
        </p>
      </fieldset>

      <fieldset className="flex min-w-0 flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">Nilai</legend>
        {spec.values.map((m, i) => (
          <div key={i} className="flex min-w-0 flex-col gap-2 rounded-md border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">Nilai {i + 1}</span>
              {spec.values.length > 1 ? (
                <RemoveButton
                  label={`Hapus nilai ${i + 1}`}
                  onClick={() => set({ values: spec.values.filter((_, j) => j !== i) })}
                />
              ) : null}
            </div>
            <MeasureFields
              type="pivot"
              label="Hitung"
              columns={columns}
              measure={m}
              onChange={(next) => set({ values: spec.values.map((x, j) => (j === i ? next : x)) })}
            />
          </div>
        ))}
        {canAddValue(spec) ? (
          <AddButton
            onClick={() => set({ values: [...spec.values, defaultMeasureFor(spec, columns)] })}
          >
            Tambah nilai
          </AddButton>
        ) : null}
      </fieldset>

      <Choice
        label="Urutan baris"
        testId="pivot-sort"
        value={spec.sort}
        options={CHART_SORT_ORDER.map((s) => ({
          value: s,
          label:
            s === "value_desc" || s === "value_asc"
              ? `${sortLabel(s, rowType)} (Nilai 1)`
              : sortLabel(s, rowType),
        }))}
        onChange={(sort) => set({ sort })}
      />
      <ToggleField
        label="Tampilkan total"
        hint={
          split ? "Kolom Total di kanan dan baris Total di bawah." : "Baris Total di bawah tabel."
        }
        checked={spec.totals}
        onChange={(totals) => set({ totals })}
        testId="pivot-totals"
      />
      {row1 ? (
        <ToggleField
          label={`Subtotal per ${name(row0?.column)}`}
          hint="Baris ringkasan di atas setiap kelompok."
          checked={spec.subtotals}
          onChange={(subtotals) => set({ subtotals })}
          testId="pivot-subtotals"
        />
      ) : null}
    </div>
  );
}
