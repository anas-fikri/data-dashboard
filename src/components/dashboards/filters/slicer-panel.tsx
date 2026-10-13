"use client";

import { IconAlertTriangle, IconLoader2, IconRefresh, IconSearch } from "@tabler/icons-react";
import { useId, useRef, useState } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SELECTED_MAX, type FilterColumnView, type FilterValue } from "./filter-model";
import { valueText } from "./filter-text";
import { useFilterValues, VALUES_MAX } from "./use-filter-values";

/*
 * Isi slicer (T-012): cari di server (jeda 250 ms), daftar centang maks. 1.000 nilai unik (urut
 * seperti Excel, "(Kosong)" dulu), peringatan bila nilai lebih banyak dari yang tampil, "Pilih semua
 * hasil" / "Hapus pilihan", maks. 500 nilai terpilih. Pilihan langsung berlaku. Nilai terpilih yang
 * tidak ada di daftar pertama (mis. dari URL) ditaruh paling atas agar tetap bisa dilepas. Dipakai di
 * popover (layar lebar) dan di lembar filter ponsel.
 */
const num = (n: number) => n.toLocaleString("id-ID");

export function SlicerPanel({
  dashboardId,
  column,
  selected,
  onChange,
}: {
  dashboardId: string;
  column: FilterColumnView;
  selected: FilterValue[];
  onChange: (next: FilterValue[]) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const { loading, data, error, retry } = useFilterValues(dashboardId, column, query);
  const results = data?.values ?? [];
  const isOn = (v: FilterValue) => selected.some((s) => s === v);
  const pinned = !query.trim() ? selected.filter((v) => !results.some((r) => r === v)) : [];
  const list = [...pinned, ...results];
  const full = selected.length >= SELECTED_MAX;
  const addable = results.filter((v) => !isOn(v));

  const status = !data
    ? loading
      ? "Memuat nilai…"
      : ""
    : results.length === 0
      ? data.q
        ? `Tidak ada nilai yang cocok dengan “${data.q}”.`
        : "Kolom ini belum berisi nilai."
      : `${num(results.length)}${data.truncated ? "+" : ""} nilai${data.q ? ` cocok dengan “${data.q}”` : ""}. ${num(selected.length)} dipilih.`;
  const Icon = loading ? IconLoader2 : IconSearch;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="relative">
        <Icon
          size={20}
          stroke={1.5}
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground",
            loading && "motion-safe:animate-spin",
          )}
        />
        <Input
          ref={input}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={100}
          autoComplete="off"
          placeholder="Cari nilai…"
          aria-label={`Cari nilai ${column.column}`}
          aria-describedby={`${id}-status`}
          data-testid="filter-slicer-search"
          className="h-(--control-h-lg) pl-10 md:h-(--control-h)"
        />
      </div>
      <p id={`${id}-status`} role="status" className="text-xs text-muted-foreground">
        {status}
      </p>
      {data?.truncated ? (
        <p
          className="flex items-start gap-1.5 rounded-md border border-warning/50 bg-warning/10 px-2 py-1.5 text-xs"
          data-testid="filter-slicer-warning"
        >
          <IconAlertTriangle size={16} stroke={1.5} aria-hidden className="mt-px shrink-0" />
          {data.q
            ? `Menampilkan ${num(VALUES_MAX)} nilai pertama yang cocok — ketik lebih lengkap untuk mempersempit.`
            : `Menampilkan ${num(VALUES_MAX)} nilai pertama — ketik untuk mencari.`}
        </p>
      ) : null}
      {error ? (
        <FormAlert tone="error">
          <span className="block">{error}</span>
          <Button
            size="sm"
            variant="outline"
            className="mt-2 h-(--control-h-lg) md:h-(--control-h-sm)"
            leadingIcon={<IconRefresh aria-hidden />}
            onClick={() => {
              input.current?.focus();
              retry();
            }}
          >
            Coba lagi
          </Button>
        </FormAlert>
      ) : null}
      {list.length > 0 ? (
        <>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <Button
              size="sm"
              variant="link"
              className="h-(--control-h-lg) px-0 md:h-(--control-h-sm)"
              disabled={!addable.length || full}
              onClick={() => onChange([...selected, ...addable].slice(0, SELECTED_MAX))}
            >
              Pilih semua hasil
            </Button>
            <Button
              size="sm"
              variant="link"
              className="h-(--control-h-lg) px-0 md:h-(--control-h-sm)"
              disabled={!selected.length}
              onClick={() => onChange([])}
            >
              Hapus pilihan
            </Button>
          </div>
          {full ? (
            <p className="text-xs text-muted-foreground" role="status">
              Maksimal {num(SELECTED_MAX)} nilai dipilih. Lepas sebagian untuk memilih nilai lain.
            </p>
          ) : null}
          <div
            role="group"
            aria-label={`Nilai ${column.column}`}
            aria-busy={loading || undefined}
            className={cn(
              "max-h-64 min-h-0 overflow-y-auto rounded-md border p-1",
              loading && "opacity-60",
            )}
          >
            {list.map((v, i) => {
              const on = isOn(v);
              const text = valueText(v, column.type);
              return (
                <label
                  key={`${i < pinned.length ? "p" : "r"}:${JSON.stringify(v)}`}
                  data-testid="filter-slicer-option"
                  data-value={v === null ? "" : String(v)}
                  className="flex min-h-11 min-w-0 cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-sm hover:bg-accent has-disabled:cursor-not-allowed has-disabled:opacity-60 md:min-h-9"
                >
                  <input
                    type="checkbox"
                    className="size-4 shrink-0 accent-(--color-primary)"
                    checked={on}
                    disabled={!on && full}
                    onChange={() =>
                      onChange(on ? selected.filter((s) => s !== v) : [...selected, v])
                    }
                  />
                  <span
                    className={cn(
                      "line-clamp-2 min-w-0 break-words [overflow-wrap:anywhere]",
                      v === null && "italic",
                    )}
                    title={text}
                  >
                    {text}
                  </span>
                </label>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}
