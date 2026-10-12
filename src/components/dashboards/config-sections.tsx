"use client";

import {
  IconChartBar,
  IconChartLine,
  IconChartPie,
  IconNumber123,
  IconTable,
} from "@tabler/icons-react";
import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import type { Agg } from "@/features/query/spec";
import {
  TABLE_COLUMNS_MAX,
  TOP_N_MAX,
  type ChartType,
  type WidgetType,
} from "@/features/widgets/spec";
import { Choice, ColumnChoice } from "./config-fields";
import {
  AGG_LABEL,
  TYPE_OPTIONS,
  aggOptions,
  columnsForAgg,
  type SourceColumn,
} from "./widget-config-model";

/*
 * Bagian-bagian panel konfigurasi widget (T-011). Fieldset diberi min-w-0: bawaan fieldset tidak mau
 * menyempit di bawah baris terpanjangnya, sehingga nama kolom panjang membuat panel bergulir ke
 * samping (review desain T-011 H5).
 */
const ICONS = {
  kpi: IconNumber123,
  bar: IconChartBar,
  line: IconChartLine,
  pie: IconChartPie,
  table: IconTable,
};

export function TypeTiles({
  value,
  onChange,
}: {
  value: WidgetType;
  onChange: (t: Exclude<WidgetType, "empty">) => void;
}) {
  const name = useId();
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">Jenis tampilan</legend>
      <div className="grid grid-cols-3 gap-2">
        {TYPE_OPTIONS.map(({ type, label }) => {
          const Icon = ICONS[type];
          return (
            <label
              key={type}
              className="flex min-h-11 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border px-1 py-2 text-xs has-checked:border-primary has-checked:bg-primary/10 has-checked:text-foreground has-focus-visible:ring-2 has-focus-visible:ring-ring"
            >
              <input
                type="radio"
                name={name}
                value={type}
                className="sr-only"
                checked={value === type}
                onChange={() => onChange(type)}
              />
              <Icon size={20} stroke={1.5} aria-hidden />
              {label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Kolom tabel: hanya kolom yang tampil di skema; jumlah dihitung dari yang benar-benar tersedia. */
export function TableColumns({
  columns,
  selected,
  onChange,
}: {
  columns: SourceColumn[];
  selected: number[];
  onChange: (next: number[]) => void;
}) {
  const visible = selected.filter((p) => columns.some((c) => c.pos === p));
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">
        Kolom ditampilkan{" "}
        <span className="font-normal text-muted-foreground">
          ({visible.length} dari maks. {TABLE_COLUMNS_MAX})
        </span>
      </legend>
      <div className="flex max-h-56 min-w-0 flex-col overflow-y-auto rounded-md border p-1">
        {columns.map((c) => {
          const on = visible.includes(c.pos);
          const last = on && visible.length === 1;
          const full = !on && visible.length >= TABLE_COLUMNS_MAX;
          return (
            <label
              key={c.pos}
              className="flex min-h-11 min-w-0 items-center gap-2 rounded-sm px-2 text-sm hover:bg-accent has-disabled:opacity-60 md:min-h-9"
            >
              <input
                type="checkbox"
                className="size-4 shrink-0 accent-(--color-primary)"
                checked={on}
                disabled={last || full}
                onChange={() =>
                  onChange(
                    on
                      ? visible.filter((p) => p !== c.pos)
                      : columns.map((x) => x.pos).filter((p) => p === c.pos || visible.includes(p)),
                  )
                }
              />
              <span className="min-w-0 truncate" title={c.name}>
                {c.name}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Agregasi + kolomnya. Pai hanya Total/Jumlah baris (bagian dari keseluruhan). */
export function MeasureFields({
  type,
  columns,
  measure,
  onChange,
}: {
  type: WidgetType;
  columns: SourceColumn[];
  measure: { agg: Agg; column?: number };
  onChange: (m: { agg: Agg; column?: number }) => void;
}) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-2">
      <Choice
        label="Nilai"
        testId="config-agg"
        value={measure.agg}
        options={aggOptions(type, columns).map((a) => ({ value: a, label: AGG_LABEL[a] }))}
        onChange={(agg) => {
          if (agg === "count") return onChange({ agg });
          const allowed = columnsForAgg(agg, columns);
          const keep = allowed.some((c) => c.pos === measure.column);
          onChange({ agg, column: keep ? measure.column! : allowed[0]!.pos });
        }}
      />
      {measure.agg !== "count" ? (
        <ColumnChoice
          label="dari kolom"
          testId="config-measure"
          value={measure.column}
          columns={columnsForAgg(measure.agg, columns)}
          onChange={(column) => onChange({ ...measure, column })}
        />
      ) : null}
      {type === "pie" ? (
        <p className="text-xs text-muted-foreground">
          Pai menampilkan bagian dari keseluruhan, jadi hanya untuk Total atau Jumlah baris.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Jumlah kategori/titik maksimal. Teks diketik bebas lalu diperiksa saat kolom ditinggalkan atau
 * Enter — tidak dijepit per ketukan (mengetik "20" tidak lagi tersimpan sebagai 50, review H7).
 */
export function TopNField({
  type,
  value,
  onCommit,
}: {
  type: ChartType;
  value: number;
  onCommit: (n: number) => void;
}) {
  const id = useId();
  const max = TOP_N_MAX[type];
  const [text, setText] = useState(String(value));
  const [error, setError] = useState<string | null>(null);
  const noun = type === "line" ? "titik" : "kategori";
  const check = () => {
    const n = Number(text.trim());
    if (!/^\d+$/.test(text.trim()) || n < 1 || n > max) {
      setError(`Isi angka 1–${max}.`);
      return;
    }
    setError(null);
    if (n !== value) onCommit(n);
  };
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        Maks.
      </label>
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        value={text}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-hint`}
        className="h-(--control-h-lg) md:h-(--control-h)"
        onChange={(e) => setText(e.target.value)}
        onBlur={check}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            check();
          }
        }}
      />
      <p
        id={`${id}-hint`}
        className={error ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
      >
        {error ?? (
          <>
            Jumlah {noun} maksimal{" "}
            <span className="whitespace-nowrap">(1–{max.toLocaleString("id-ID")})</span>.
          </>
        )}
      </p>
    </div>
  );
}
