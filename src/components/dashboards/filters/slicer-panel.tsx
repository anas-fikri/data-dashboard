"use client";

import { IconAlertTriangle, IconLoader2, IconRefresh, IconSearch } from "@tabler/icons-react";
import { useId, useRef, useState } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ColumnType } from "@/features/ingest/infer";
import type { DashFilter, FilterColumnView, FilterValue } from "./filter-model";
import { slicerModel } from "./slicer-model";
import { SlicerOption } from "./slicer-option";
import { useFilterValues, VALUES_MAX } from "./use-filter-values";

/*
 * Isi slicer (T-012, popover dan lembar ponsel): cari di server, maks. 1.000 nilai, mode pilih /
 * kecualikan (slicer-model.ts; mode "Pilih semua" diingat pemanggil). "Pilih semua" / "Hapus
 * pilihan" dan centang terakhir mode kecualikan memakai aria-disabled (fokus tidak jatuh ke <body>,
 * alasannya terhubung lewat aria-describedby); hasilnya diumumkan lewat status. Galat yang tidak pulih
 * dengan mengulang (kolom filter sudah diubah pemilik, sesi berakhir) memberi "Muat ulang" halaman,
 * bukan "Coba lagi" (review T-016 R4-CC-1).
 */
const num = (n: number) => n.toLocaleString("id-ID");
const LINK =
  "h-(--control-h-lg) px-0 md:h-(--control-h-sm) aria-disabled:cursor-not-allowed aria-disabled:no-underline aria-disabled:opacity-50";

interface Selection {
  value: DashFilter | undefined;
  onChange: (f: DashFilter | null) => void;
  /** "Pilih semua" tanpa filter (semua tercentang) — disimpan di luar panel agar bertahan. */
  allMode: boolean;
  onAllMode: (on: boolean) => void;
}

export function SlicerPanel({
  dashboardId,
  column,
  ...selection
}: { dashboardId: string; column: FilterColumnView } & Selection) {
  const [query, setQuery] = useState("");
  const values = useFilterValues(dashboardId, column, query);
  return (
    <SlicerBody
      name={column.column}
      type={column.type}
      query={query}
      onQuery={setQuery}
      values={values}
      truncatedNote={
        values.data?.q
          ? `Menampilkan ${num(VALUES_MAX)} nilai pertama yang cocok — ketik lebih lengkap untuk mempersempit.`
          : `Menampilkan ${num(VALUES_MAX)} nilai pertama — ketik untuk mencari.`
      }
      {...selection}
    />
  );
}

/** Nilai yang termuat untuk satu kata cari; sumbernya pemanggil (server, atau daftar lokal pivot). */
export interface SlicerValues {
  loading: boolean;
  data: { values: FilterValue[]; truncated: boolean; q: string } | null;
  error: string | null;
  /** Galat ini butuh muat ulang halaman, bukan coba lagi. */
  reload: boolean;
  /** Daftar lengkap terakhir (tanpa kata cari, tidak terpotong); null = tidak diketahui. */
  full: FilterValue[] | null;
  retry: () => void;
}

/** Isi slicer tanpa sumber data: cari, status, Pilih semua / Hapus pilihan, daftar centang. */
export function SlicerBody({
  name,
  type,
  text,
  query,
  onQuery,
  values,
  truncatedNote,
  value,
  onChange,
  allMode,
  onAllMode,
}: {
  name: string;
  type: ColumnType;
  /** Teks tampil nilai (bawaan: menurut tipe kolom), mis. "Mar 2026" untuk awal periode pivot. */
  text?: (v: FilterValue) => string;
  query: string;
  onQuery: (q: string) => void;
  values: SlicerValues;
  truncatedNote: string;
} & Selection) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const { loading, data, error, reload, full, retry } = values;
  const results = data?.values ?? [];
  const m = slicerModel({
    column: name,
    value,
    allMode,
    results,
    truncated: !!data?.truncated,
    searching: !!data?.q,
    fullList: full,
  });
  const list = [...m.pinned, ...results];
  const all = m.selectAll;

  const status = loading
    ? "Memuat nilai…"
    : !data
      ? ""
      : results.length === 0
        ? data.q
          ? `Tidak ada nilai yang cocok dengan “${data.q}”.`
          : "Kolom ini belum berisi nilai."
        : `${num(results.length)}${data.truncated ? "+" : ""} nilai${data.q ? ` cocok dengan “${data.q}”` : ""}. ${m.summary}`;
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
          onChange={(e) => onQuery(e.target.value)}
          maxLength={100}
          autoComplete="off"
          placeholder="Cari nilai…"
          aria-label={`Cari nilai ${name}`}
          aria-describedby={`${id}-status`}
          data-testid="filter-slicer-search"
          className="h-(--control-h-lg) pl-10 md:h-(--control-h)"
        />
      </div>
      <p id={`${id}-status`} role="status" className="text-xs text-muted-foreground">
        {status}
        {/* Alasan kunci terlihat sekali (paragraf -min di bawah); di status hanya untuk pembaca layar. */}
        {m.minOne && !loading && results.length ? (
          <span className="sr-only"> {m.minOne}</span>
        ) : null}
      </p>
      {data?.truncated ? (
        <p
          className="flex items-start gap-1.5 rounded-md border border-warning/50 bg-warning/10 px-2 py-1.5 text-xs"
          data-testid="filter-slicer-warning"
        >
          <IconAlertTriangle size={16} stroke={1.5} aria-hidden className="mt-px shrink-0" />
          {truncatedNote}
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
            data-testid="filter-slicer-retry"
            onClick={() => {
              if (reload) return window.location.reload();
              input.current?.focus();
              retry();
            }}
          >
            {reload ? "Muat ulang" : "Coba lagi"}
          </Button>
        </FormAlert>
      ) : null}
      {list.length > 0 ? (
        <>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <Button
              size="sm"
              variant="link"
              className={LINK}
              aria-disabled={all.off || !!all.blocked || undefined}
              aria-describedby={all.blocked ? `${id}-blocked` : undefined}
              data-testid="filter-slicer-select-all"
              onClick={() => {
                if (all.off || all.blocked) return;
                onAllMode(all.allMode);
                onChange(all.next);
              }}
            >
              {all.label}
            </Button>
            <Button
              size="sm"
              variant="link"
              className={LINK}
              aria-disabled={m.cleared || undefined}
              data-testid="filter-slicer-clear"
              onClick={() => {
                if (m.cleared) return;
                onAllMode(false);
                onChange(null);
              }}
            >
              Hapus pilihan
            </Button>
          </div>
          {all.blocked || m.full ? (
            <p id={`${id}-blocked`} className="text-xs text-muted-foreground">
              {[all.blocked, m.full && m.fullText].filter(Boolean).join(" ")}
            </p>
          ) : null}
          {m.minOne ? (
            <p id={`${id}-min`} className="text-xs text-muted-foreground">
              {m.minOne}
            </p>
          ) : null}
          <div
            role="group"
            aria-label={`Nilai ${name}`}
            aria-busy={loading || undefined}
            className="max-h-64 min-h-0 overflow-y-auto rounded-md border p-1"
          >
            {list.map((v, i) => (
              <SlicerOption
                key={`${i < m.pinned.length ? "p" : "r"}:${JSON.stringify(v)}`}
                value={v}
                type={type}
                {...(text ? { text: text(v) } : {})}
                on={m.isOn(v)}
                locked={m.locked(v)}
                last={m.lastKept(v)}
                reasonId={`${id}-min`}
                onToggle={() => {
                  onAllMode(m.exclude);
                  onChange(m.toggle(v));
                }}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
