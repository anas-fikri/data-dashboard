"use client";

import { IconTableOptions } from "@tabler/icons-react";
import { useLayoutEffect, useRef } from "react";
import { PIVOT_CROSS_FILTER_LABEL } from "./filters/filter-model";
import {
  PIVOT_COLUMNS_SHOWN,
  PIVOT_ROWS_SHOWN,
  isCalcValue,
  type PivotSpec,
} from "@/features/widgets/spec";
import { CalcField } from "./calc-editor";
import { Choice } from "./config-fields";
import { MeasureFields } from "./config-sections";
import { AddButton, DimensionField, RemoveButton, ToggleField } from "./pivot-config-fields";
import { PivotSavedFilters } from "./pivot-saved-filters";
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
import { CHART_SORT_ORDER, measureText, sortLabel, type SourceColumn } from "./widget-config-model";

/*
 * Bagian panel untuk widget pivot (T-tcjp), disusun seperti cara orang membaca PivotTable Excel:
 * ringkasan kalimat bentuk tabelnya dulu, lalu Baris (+ rincian opsional), "Pisahkan per" (opsional,
 * mis. per bulan → satu kolom per periode di kiri kolom Total), Nilai (1–3), urutan, Total, Subtotal.
 * Perubahan langsung tersimpan dan widget di kanvas memuat ulang (pratinjau sungguhan).
 */
export function PivotFields({
  dashboardId,
  spec,
  columns,
  onChange,
}: {
  dashboardId: string;
  spec: PivotSpec;
  columns: SourceColumn[];
  onChange: (spec: PivotSpec) => void;
}) {
  const set = (patch: Partial<PivotSpec>) => onChange({ ...spec, ...patch });
  const name = (pos: number | undefined) => columns.find((c) => c.pos === pos)?.name ?? "kolom";
  const valueLabel = (m: PivotSpec["values"][number]) =>
    isCalcValue(m) ? m.label : measureText(m, name);
  const dup = duplicateField(spec);
  const [row0, row1] = spec.rows;
  const rowType = columns.find((c) => c.pos === row0?.column)?.type;
  const { column: split, ...withoutSplit } = spec;
  const { filters: _f, ...withoutFilters } = spec;
  const { crossFilter: _c, ...withoutCross } = spec;
  // Fokus setelah kartu nilai berganti/hilang (T-069): kontrol yang dilepas tidak boleh meninggalkan
  // fokus di <body> (FocusScope panel menariknya ke kontainer). Urutan target per kartu.
  const valuesRef = useRef<HTMLFieldSetElement>(null);
  const focusCard = useRef<{ index: number; targets: string[] } | null>(null);
  useLayoutEffect(() => {
    const f = focusCard.current;
    if (!f) return;
    focusCard.current = null;
    const card = valuesRef.current?.querySelector(`[data-value-card="${f.index}"]`);
    for (const sel of f.targets) {
      const el = card?.querySelector<HTMLElement>(sel);
      if (el) return el.focus();
    }
  });
  const FIRST_CONTROL = ["[data-testid=calc-edit]", "[role=combobox]"];

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
            remove={{
              label: "Hapus pemisah kolom",
              onRemove: () =>
                // Tanpa pemisah "% dari total baris" selalu 100%: kembali ke nilai biasa.
                onChange({
                  ...withoutSplit,
                  values: spec.values.map(({ showAs, ...v }) =>
                    showAs === "pct_row" ? v : { ...v, ...(showAs ? { showAs } : {}) },
                  ),
                }),
            }}
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

      <fieldset ref={valuesRef} className="flex min-w-0 flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">Nilai</legend>
        {spec.values.map((m, i) => (
          <div
            key={i}
            data-value-card={i}
            className="flex min-w-0 flex-col gap-2 rounded-md border p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">Nilai {i + 1}</span>
              {spec.values.length > 1 ? (
                <RemoveButton
                  label={`Hapus nilai ${i + 1}`}
                  onClick={() => {
                    // Kartu berikutnya menempati posisi ini (atau kartu sebelumnya bila terakhir).
                    focusCard.current = {
                      index: Math.min(i, spec.values.length - 2),
                      targets: ['[aria-label^="Hapus nilai"]', ...FIRST_CONTROL],
                    };
                    set({ values: spec.values.filter((_, j) => j !== i) });
                  }}
                />
              ) : null}
            </div>
            {isCalcValue(m) ? (
              <CalcField
                dashboardId={dashboardId}
                sheetId={spec.sheetId}
                type="pivot"
                columns={columns}
                widgetFormat={spec.format}
                value={m}
                split={!!split}
                axis={name((split ?? row1 ?? row0)?.column)}
                onSave={(next) => set({ values: spec.values.map((x, j) => (j === i ? next : x)) })}
                // Satu-satunya nilai: tidak bisa dihapus, tetapi bisa kembali ke ukuran biasa.
                onRemove={
                  spec.values.length === 1
                    ? () => {
                        // Kartu ini kini berisi ukuran biasa: fokus ke pilihan "Hitung".
                        focusCard.current = { index: 0, targets: FIRST_CONTROL };
                        set({ values: [defaultMeasureFor({ ...spec, values: [] }, columns)] });
                      }
                    : undefined
                }
                removeLabel="Ganti dengan ukuran biasa"
              />
            ) : (
              <MeasureFields
                type="pivot"
                label="Hitung"
                axis={name((split ?? row1 ?? row0)?.column)}
                split={!!split}
                columns={columns}
                measure={m}
                onChange={(next) =>
                  set({ values: spec.values.map((x, j) => (j === i ? next : x)) })
                }
              />
            )}
          </div>
        ))}
        {canAddValue(spec) ? (
          <div className="flex min-w-0 flex-col gap-2 md:flex-row md:flex-wrap md:items-start">
            <AddButton
              onClick={() => set({ values: [...spec.values, defaultMeasureFor(spec, columns)] })}
            >
              Tambah nilai
            </AddButton>
            <CalcField
              dashboardId={dashboardId}
              sheetId={spec.sheetId}
              type="pivot"
              columns={columns}
              widgetFormat={spec.format}
              onSave={(v) => {
                // Fokus ke "Ubah rumus" kartu baru (tombol tambah bisa hilang saat nilai penuh).
                focusCard.current = { index: spec.values.length, targets: FIRST_CONTROL };
                set({ values: [...spec.values, v] });
              }}
            />
          </div>
        ) : null}
      </fieldset>

      <PivotSavedFilters
        dashboardId={dashboardId}
        spec={spec}
        columns={columns}
        onChange={(filters) => onChange(filters ? { ...spec, filters } : withoutFilters)}
      />

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
      <ToggleField
        label={PIVOT_CROSS_FILTER_LABEL}
        hint="Label baris atau kolom yang dipilih jadi filter untuk semua widget lain di dashboard ini."
        checked={spec.crossFilter === true}
        onChange={(on) => onChange(on ? { ...withoutCross, crossFilter: true } : withoutCross)}
        testId="widget-crossfilter-switch"
      />
    </div>
  );
}
