"use client";

import { useEffect, useState } from "react";
import type { FilterValue } from "@/components/dashboards/filters/filter-model";
import { valueText } from "@/components/dashboards/filters/filter-text";
import { SlicerBody, type SlicerValues } from "@/components/dashboards/filters/slicer-panel";
import {
  PIVOT_FILTERS_MAX,
  PIVOT_FILTER_VALUES_MAX,
  type PivotSavedFilter,
  type PivotSpec,
} from "@/features/widgets/spec";
import { searchOptions } from "@/lib/search";
import { ColumnChoice } from "./config-fields";
import { AddButton, RemoveButton } from "./pivot-config-fields";
import { scopeKey, scopeOf, type QueryScope } from "./query-scope";
import type { SourceColumn } from "./widget-config-model";

/*
 * Bagian "Saring" pengaturan pivot (T-f4a7), seperti area Filters PivotTable Excel: maks. 3 kolom, tiap
 * kolom dengan nilai yang dihitung (centang + cari; "Pilih semua" lalu lepas = semua kecuali). Pivot
 * hanya menghitung baris yang cocok semua saringan; tersimpan di pengaturan widget (pembaca melihatnya
 * di catatan bawah tabel). Nilai dari data sheet ini lewat query editor (/api/query { dashboardId,
 * spec } atau, di editor pivot tersimpan, { datasetId, spec }, maks. 500, dicari di browser). Kolom tanpa nilai tercentang hanya draf di panel (spec butuh
 * ≥ 1 nilai), jadi pivot tidak berubah sampai ada nilai yang dipilih.
 */
type Loaded = { values: FilterValue[]; truncated: boolean };

export function PivotSavedFilters({
  scope,
  spec,
  columns,
  onChange,
}: {
  scope: QueryScope;
  spec: PivotSpec;
  columns: SourceColumn[];
  onChange: (filters: PivotSavedFilter[] | undefined) => void;
}) {
  const saved = spec.filters ?? [];
  const [drafts, setDrafts] = useState<number[]>([]);
  const rows = [
    ...saved.map((f) => f.column),
    ...drafts.filter((c) => !saved.some((f) => f.column === c)),
  ];
  const free = (keep?: number) => columns.filter((c) => c.pos === keep || !rows.includes(c.pos));
  const write = (next: PivotSavedFilter[]) => onChange(next.length ? next : undefined);
  // Lepas saringan tersimpan kolom ini; draf (belum tersimpan) tidak memicu simpanan kosong.
  const drop = (col: number) => {
    if (saved.some((f) => f.column === col)) write(saved.filter((f) => f.column !== col));
  };
  const keepDraft = (col: number, next = col) =>
    setDrafts((d) => [...d.filter((x) => x !== col), next]);

  return (
    <fieldset className="flex min-w-0 flex-col gap-3" data-testid="pivot-saved-filters">
      <legend className="mb-1 text-sm font-medium">Saring (opsional)</legend>
      {rows.map((col, i) => (
        <SavedFilterRow
          key={col}
          index={i}
          scope={scope}
          sheetId={spec.sheetId}
          column={col}
          filter={saved.find((f) => f.column === col)}
          columns={free(col)}
          onColumn={(next) => {
            drop(col);
            keepDraft(col, next);
          }}
          onFilter={(f) => {
            if (!f) {
              drop(col);
              return keepDraft(col);
            }
            write(
              saved.some((x) => x.column === col)
                ? saved.map((x) => (x.column === col ? f : x))
                : [...saved, f],
            );
          }}
          onRemove={() => {
            drop(col);
            setDrafts((d) => d.filter((x) => x !== col));
          }}
        />
      ))}
      {rows.length < PIVOT_FILTERS_MAX && free().length ? (
        <AddButton onClick={() => setDrafts((d) => [...d, free()[0]!.pos])}>
          Tambah saringan
        </AddButton>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Pivot hanya menghitung baris yang cocok. Pembaca bisa menyaring lagi lewat menu di kepala
        tabel tanpa mengubah pengaturan ini.
      </p>
    </fieldset>
  );
}

function SavedFilterRow({
  index,
  scope,
  sheetId,
  column,
  filter,
  columns,
  onColumn,
  onFilter,
  onRemove,
}: {
  index: number;
  scope: QueryScope;
  sheetId: string;
  column: number;
  filter: PivotSavedFilter | undefined;
  columns: SourceColumn[];
  onColumn: (pos: number) => void;
  onFilter: (f: PivotSavedFilter | null) => void;
  onRemove: () => void;
}) {
  const col = columns.find((c) => c.pos === column);
  const [query, setQuery] = useState("");
  const [allMode, setAllMode] = useState(false);
  const loaded = useColumnValues(scope, sheetId, col?.name);
  const all = loaded.data?.values ?? [];
  const q = query.trim();
  const type = col?.type ?? "text";
  const shown = q
    ? searchOptions(
        all.map((v) => ({ label: valueText(v, type), v })),
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
    <div
      className="flex min-w-0 flex-col gap-2 rounded-md border p-3"
      data-testid="pivot-saved-filter"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">Saringan {index + 1}</span>
        <RemoveButton label={`Hapus saringan ${index + 1}`} onClick={onRemove} />
      </div>
      <ColumnChoice
        label="Kolom"
        testId={`pivot-saved-column-${index}`}
        value={column}
        columns={columns}
        onChange={onColumn}
      />
      {col ? (
        <SlicerBody
          name={col.name}
          type={col.type}
          query={query}
          onQuery={setQuery}
          values={values}
          truncatedNote={`Menampilkan ${PIVOT_FILTER_VALUES_MAX.toLocaleString("id-ID")} nilai pertama — ketik untuk mencari di antaranya.`}
          value={filter ? { column: col.name, op: filter.op, values: filter.values } : undefined}
          onChange={(f) =>
            onFilter(
              f && (f.op === "in" || f.op === "not_in")
                ? { column, op: f.op, values: f.values }
                : null,
            )
          }
          allMode={allMode}
          onAllMode={setAllMode}
        />
      ) : null}
      {col && !filter ? (
        <p className="text-xs text-muted-foreground">
          Centang nilai yang dihitung; selama belum ada yang dicentang, saringan ini belum berlaku.
        </p>
      ) : null}
    </div>
  );
}

/** Nilai unik satu kolom sheet untuk editor (query pratinjau dashboard), urut naik. */
function useColumnValues(scope: QueryScope, sheetId: string, column: string | undefined) {
  const [attempt, setAttempt] = useState(0);
  const key = column ? JSON.stringify([scopeKey(scope), sheetId, column, attempt]) : "";
  const [res, setRes] = useState<{ key: string; data: Loaded | null; error: string | null }>({
    key: "",
    data: null,
    error: null,
  });
  useEffect(() => {
    if (!key) return;
    const [d, s, c] = JSON.parse(key) as [string, string, string];
    const ctl = new AbortController();
    const spec = {
      sheetId: s,
      dimensions: [{ column: c }],
      measures: [{ agg: "count" }],
      sort: [{ by: "d0", dir: "asc" }],
      limit: PIVOT_FILTER_VALUES_MAX + 1,
    };
    fetch("/api/query", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...scopeOf(d), spec }),
      signal: ctl.signal,
    })
      .then((r) => r.json().catch(() => null))
      .then(
        (j: { ok?: boolean; rows?: unknown[][]; message?: string } | null) => {
          if (ctl.signal.aborted) return;
          if (j?.ok && Array.isArray(j.rows)) {
            const vs = j.rows.map((r) => r[0] as FilterValue);
            const data = {
              values: vs.slice(0, PIVOT_FILTER_VALUES_MAX),
              truncated: vs.length > PIVOT_FILTER_VALUES_MAX,
            };
            return setRes({ key, data, error: null });
          }
          setRes({
            key,
            data: null,
            error: j?.message ?? "Nilai kolom belum bisa dimuat. Coba lagi.",
          });
        },
        () => {
          if (ctl.signal.aborted) return;
          setRes({
            key,
            data: null,
            error: "Tidak bisa menghubungi server. Periksa koneksi lalu coba lagi.",
          });
        },
      );
    return () => ctl.abort();
  }, [key]);
  return {
    loading: !!key && res.key !== key,
    data: res.key === key ? res.data : null,
    error: res.key === key ? res.error : null,
    retry: () => setAttempt((n) => n + 1),
  };
}
