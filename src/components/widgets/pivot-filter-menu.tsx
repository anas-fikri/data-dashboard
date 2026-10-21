"use client";

import { IconFilter, IconFilterFilled } from "@tabler/icons-react";
import { Fragment, useEffect, useState } from "react";
import type { WidgetFilters } from "@/components/dashboards/filters/filter-context";
import {
  normName,
  type FilterValue,
  type PivotFieldRole,
  type PivotFilter,
} from "@/components/dashboards/filters/filter-model";
import { SlicerBody, type SlicerValues } from "@/components/dashboards/filters/slicer-panel";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ColumnType } from "@/features/ingest/infer";
import type { Grain } from "@/features/query/spec";
import { AUTO_FORMAT, formatCell } from "@/features/widgets/format";
import type { PivotField } from "@/features/widgets/pivot-table";
import { searchOptions } from "@/lib/search";
import { fetchWidget, type WidgetRequest } from "./widget-query";

/*
 * Menu saring field pivot (T-f4a7), seperti tombol filter Row/Column Labels PivotTable Excel: sel pojok
 * kepala pivot berisi satu tombol per field (kolom pemisah di atas, lalu baris "Cabang › Layanan").
 * Isinya slicer yang sama dengan bilah filter (cari, Pilih semua, centang); semua tercentang di awal
 * (tanpa saringan) dan melepas centang = "semua kecuali". Daftar nilai dari server (mode pivotValues:
 * filter dashboard + saringan field lain, tanpa saringan field ini), maks. 500, dicari di browser.
 * Saringan hanya berlaku untuk pivot ini dan ikut URL, ekspor, serta PDF.
 */
const VALUES_MAX = 500;
const num = (n: number) => n.toLocaleString("id-ID");
const ROLE_TEXT: Record<PivotFieldRole, string> = {
  row0: "baris",
  row1: "baris",
  row2: "baris",
  row3: "baris",
  column: "kolom",
};

type Edit = NonNullable<WidgetFilters["pivotEdit"]>;

/** Saringan milik field ini (peran + kolom + grain sama); saringan field yang sudah diganti bukan. */
const mine = (f: PivotFilter, field: PivotField) =>
  f.field === field.role && normName(f.column) === normName(field.label) && f.grain === field.grain;
type Loaded = { values: FilterValue[]; truncated: boolean };

export function PivotFieldFilters({
  fields,
  request,
  edit,
}: {
  fields: PivotField[];
  request: WidgetRequest;
  edit: Edit;
}) {
  // "Pilih semua" (semua tercentang tanpa saringan) per field; bawaan aktif seperti Excel.
  const [allMode, setAllMode] = useState<Partial<Record<PivotFieldRole, boolean>>>({});
  const menu = (f: PivotField) => (
    <FieldMenu
      key={f.role}
      field={f}
      request={request}
      edit={edit}
      allMode={allMode[f.role] ?? true}
      onAllMode={(on) => setAllMode((m) => ({ ...m, [f.role]: on }))}
    />
  );
  const col = fields.find((f) => f.role === "column");
  return (
    <span className="flex flex-col items-start gap-0.5">
      {col ? <span className="self-end">{menu(col)}</span> : null}
      <span className="flex flex-wrap items-center gap-x-0.5">
        {fields
          .filter((f) => f.role !== "column")
          .map((f, i) => (
            <Fragment key={f.role}>
              {i ? (
                <span aria-hidden className="text-muted-foreground">
                  ›
                </span>
              ) : null}
              {menu(f)}
            </Fragment>
          ))}
      </span>
    </span>
  );
}

interface MenuProps {
  field: PivotField;
  request: WidgetRequest;
  edit: Edit;
  allMode: boolean;
  onAllMode: (on: boolean) => void;
}

function FieldMenu(props: MenuProps) {
  const { field, edit } = props;
  const [open, setOpen] = useState(false);
  const own = edit.current.find((f) => mine(f, field));
  const summary = !own
    ? "semua"
    : own.op === "in"
      ? `${num(own.values.length)} dipilih`
      : `kecuali ${num(own.values.length)} nilai`;
  const Icon = own ? IconFilterFilled : IconFilter;
  const name = `Saring ${field.label} (${ROLE_TEXT[field.role]}): ${summary}`;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          data-testid="pivot-filter"
          data-field={field.role}
          data-active={own ? "" : undefined}
          aria-label={name}
          title={name}
          className="h-auto min-h-8 max-w-full gap-1 px-1 py-0.5 font-medium data-active:text-primary md:min-h-6"
        >
          <span className="min-w-0 truncate">{field.label}</span>
          <Icon size={16} stroke={1.5} aria-hidden className="shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent aria-label={`Saring ${field.label}`} className="w-80">
        <p className="truncate text-sm font-semibold" title={field.label}>
          Saring {field.label}
        </p>
        {open ? <FieldPanel {...props} /> : null}
      </PopoverContent>
    </Popover>
  );
}

function FieldPanel({ field, request, edit, allMode, onAllMode }: MenuProps) {
  const own = edit.current.find((f) => mine(f, field));
  const others = edit.current.filter((f) => f.field !== field.role);
  const loaded = usePivotValues({
    widgetId: request.widgetId,
    ...(request.dashboardFilters ? { dashboardFilters: request.dashboardFilters } : {}),
    ...(others.length ? { pivotFilters: others } : {}),
    pivotValues: field.role,
  });
  const [query, setQuery] = useState("");
  const text = (v: FilterValue) => formatCell(v, field.type, AUTO_FORMAT, field.grain);
  const all = loaded.data?.values ?? [];
  const q = query.trim();
  const shown = q
    ? searchOptions(
        all.map((v) => ({ label: text(v), v })),
        q,
      ).map((h) => h.option.v)
    : all;
  const truncated = !!loaded.data?.truncated;
  const values: SlicerValues = {
    loading: loaded.loading,
    data: loaded.data ? { values: shown, truncated, q } : null,
    error: loaded.error,
    reload: false,
    full: loaded.data && !truncated ? all : null,
    retry: loaded.retry,
  };
  return (
    <SlicerBody
      name={field.label}
      type={field.type as ColumnType}
      text={text}
      query={query}
      onQuery={setQuery}
      values={values}
      truncatedNote={`Menampilkan ${num(VALUES_MAX)} nilai pertama. Persempit dengan filter dashboard untuk melihat nilai lainnya.`}
      value={own ? { column: field.label, op: own.op, values: own.values } : undefined}
      onChange={(f) =>
        edit.set(
          field.role,
          f && (f.op === "in" || f.op === "not_in")
            ? {
                field: field.role,
                column: field.label,
                ...(field.grain ? { grain: field.grain as Grain } : {}),
                op: f.op,
                values: f.values,
              }
            : null,
        )
      }
      allMode={allMode}
      onAllMode={onAllMode}
    />
  );
}

/** Nilai unik satu field (mode pivotValues); daftar lama tetap tampil selama memuat ulang. */
function usePivotValues(body: WidgetRequest) {
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([body, attempt]);
  const [res, setRes] = useState<{ key: string; data: Loaded | null; error: string | null }>({
    key: "",
    data: null,
    error: null,
  });
  useEffect(() => {
    const ctl = new AbortController();
    const [req] = JSON.parse(key) as [WidgetRequest, number];
    fetchWidget(req, ctl.signal).then(
      (r) => {
        if (ctl.signal.aborted) return;
        setRes((prev) =>
          r.ok
            ? { key, data: r.data.pivotValues ?? { values: [], truncated: false }, error: null }
            : { key, data: prev.data, error: r.message },
        );
      },
      () => {},
    );
    return () => ctl.abort();
  }, [key]);
  return {
    loading: res.key !== key,
    data: res.data,
    error: res.key === key ? res.error : null,
    retry: () => setAttempt((n) => n + 1),
  };
}
