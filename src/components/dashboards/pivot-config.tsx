"use client";

import { IconTableOptions } from "@tabler/icons-react";
import { useLayoutEffect, useRef } from "react";
import { PIVOT_CROSS_FILTER_LABEL } from "./filters/filter-model";
import { formatNumber } from "@/features/widgets/format";
import {
  PIVOT_CELLS_MAX,
  PIVOT_COLUMNS_SHOWN,
  PIVOT_ROWS_MAX,
  PIVOT_OTHER_LABEL,
  PIVOT_ROWS_SHOWN,
  TOP_N_AXIS_TEXT,
  isCalcValue,
  pivotSubtotalLevels,
  pivotTopNAxisRow,
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
  toggleSubtotal,
  topNOptions,
  withRows,
  withTopN,
  withoutValue,
} from "./pivot-config-model";
import { CHART_SORT_ORDER, measureText, sortLabel, type SourceColumn } from "./widget-config-model";

/*
 * Bagian panel untuk widget pivot (T-tcjp), disusun seperti cara orang membaca PivotTable Excel:
 * ringkasan kalimat bentuk tabelnya dulu, lalu Baris (+ rincian opsional), "Pisahkan per" (opsional,
 * mis. per bulan → satu kolom per periode di kiri kolom Total), Nilai (1–8), urutan, Total, Subtotal
 * per level induk (T-070: baris 1–4).
 * Perubahan langsung tersimpan dan widget di kanvas memuat ulang (pratinjau sungguhan).
 */
/** Label pilihan baris per tingkat. */
const ROW_LABEL = ["Satu baris per", "Dirinci per", "Lalu dirinci per"];
const COUNT = { style: "number", decimals: 0 } as const;

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
  // Top N baris terdalam yang menjadi sumbu total berjalan/selisih (T-071): ditolak server.
  const axisTop = pivotTopNAxisRow(spec);
  const row0 = spec.rows[0];
  // Sumbu total berjalan/selisih tanpa pemisah: baris terdalam (T-070: hingga baris ke-4).
  const inner = spec.rows.at(-1);
  const subtotalLevels = pivotSubtotalLevels(spec);
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
        {spec.rows.map((d, i) => (
          <div key={i} className="flex min-w-0 flex-col gap-2">
            <DimensionField
              label={ROW_LABEL[i] ?? ROW_LABEL[ROW_LABEL.length - 1]!}
              testId={`pivot-row-${i}`}
              value={d}
              columns={columns}
              error={i > 0 && dup === `row${i}` ? DUPLICATE_TEXT : undefined}
              // Ganti kolom/rentang waktu: Top N field ini tetap.
              onChange={(next) =>
                set({
                  rows: spec.rows.map((x, j) =>
                    j === i ? { ...next, ...(x.topN ? { topN: x.topN } : {}) } : x,
                  ),
                })
              }
              remove={
                i > 0
                  ? {
                      label: i === 1 ? "Hapus rincian baris" : `Hapus rincian baris ke-${i}`,
                      onRemove: () =>
                        onChange(
                          withRows(
                            spec,
                            spec.rows.filter((_, j) => j !== i),
                          ),
                        ),
                    }
                  : undefined
              }
            />
            <TopNFields
              index={i}
              spec={spec}
              parent={i > 0 ? name(spec.rows[i - 1]!.column) : null}
              valueLabel={valueLabel}
              error={axisTop === i ? TOP_N_AXIS_TEXT : undefined}
              onChange={onChange}
            />
          </div>
        ))}
        {canAddRow(spec) && nextRowColumn(spec, columns) ? (
          <AddButton
            onClick={() =>
              onChange(withRows(spec, [...spec.rows, dimensionFor(nextRowColumn(spec, columns)!)]))
            }
          >
            {spec.rows.length === 1 ? "Rinci baris (mis. per layanan)" : "Rinci lagi"}
          </AddButton>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Maks. {PIVOT_ROWS_MAX} tingkat baris dan {PIVOT_ROWS_SHOWN} baris tampil; total tetap
          mencakup semua data.
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
          {PIVOT_COLUMNS_SHOWN} kolom tampil; dengan banyak baris dan nilai kolom tampil dikurangi
          agar tabel tetap ringan (maks. {formatNumber(PIVOT_CELLS_MAX, COUNT)} sel).
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
                    onChange(withoutValue(spec, i));
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
                axis={name((split ?? inner)?.column)}
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
                axis={name((split ?? inner)?.column)}
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
      {spec.rows.slice(0, -1).map((d, i) => (
        // Satu sakelar per level induk (T-070); level 1 tetap "pivot-subtotals".
        <ToggleField
          key={i}
          label={`Subtotal per ${name(d.column)}`}
          hint="Baris ringkasan di atas setiap kelompok."
          checked={subtotalLevels.includes(i + 1)}
          onChange={(on) => onChange(toggleSubtotal(spec, i + 1, on))}
          testId={i === 0 ? "pivot-subtotals" : `pivot-subtotals-${i + 1}`}
        />
      ))}
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

/**
 * Top N satu field baris (T-071): "Tampilkan" Semua / N teratas (per kelompok induk) dan "Menurut"
 * nilai mana (bila nilai > 1). Sisanya digabung ke "(Lainnya)" yang dihitung ulang dari data mentah.
 */
function TopNFields({
  index,
  spec,
  parent,
  valueLabel,
  error,
  onChange,
}: {
  index: number;
  spec: PivotSpec;
  /** Nama field induk (null = baris pertama: teratas di seluruh data). */
  parent: string | null;
  valueLabel: (m: PivotSpec["values"][number]) => string;
  error?: string;
  onChange: (spec: PivotSpec) => void;
}) {
  const top = spec.rows[index]!.topN;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
        <Choice
          label="Tampilkan"
          testId={`pivot-topn-${index}`}
          value={top ? String(top.n) : "all"}
          options={topNOptions(top?.n)}
          onChange={(v) => onChange(withTopN(spec, index, v === "all" ? undefined : Number(v)))}
        />
        {top && spec.values.length > 1 ? (
          <Choice
            label="Teratas menurut"
            testId={`pivot-topn-by-${index}`}
            value={String(top.by)}
            options={spec.values.map((v, j) => ({
              value: String(j),
              label: `Nilai ${j + 1}: ${valueLabel(v)}`,
            }))}
            onChange={(v) => onChange(withTopN(spec, index, top.n, Number(v)))}
          />
        ) : null}
      </div>
      {error ? (
        <p
          role="alert"
          className="text-xs text-destructive"
          data-testid={`pivot-topn-error-${index}`}
        >
          {error}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {top
            ? `${top.n} teratas ${parent ? `per ${parent}` : "dari seluruh data"} menurut nilai dasar; sisanya digabung ke ${PIVOT_OTHER_LABEL}. Subtotal dan total tetap mencakup semua.`
            : `Pilih N teratas untuk menggabungkan sisanya ke ${PIVOT_OTHER_LABEL}.`}
        </p>
      )}
    </div>
  );
}
