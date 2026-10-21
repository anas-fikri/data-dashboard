"use client";

import { IconAlertCircle, IconPencil, IconTableShare, IconUnlink } from "@tabler/icons-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  effectiveConfig,
  isBoundType,
  type BoundType,
  type ChartDisplay,
  type KpiDisplay,
  type PivotDisplay,
  type TableDisplay,
} from "@/features/widgets/bound";
import {
  isCalcValue,
  pivotSubtotalLevels,
  type ChartSort,
  type NumberFormat,
} from "@/features/widgets/spec";
import {
  defaultDisplay,
  dimensionOptions,
  valueOptions,
  type SavedPivotOption,
} from "./bound-config-model";
import { Choice, FormatFields } from "./config-fields";
import { CrossFilterField, TopNField, TypeTiles } from "./config-sections";
import { PIVOT_CROSS_FILTER_LABEL } from "./filters/filter-model";
import { ToggleField } from "./pivot-config-fields";
import { pivotSummary } from "./pivot-config-model";
import {
  CHART_SORT_ORDER,
  measureText,
  sortLabel,
  sortOptions,
  type Source,
} from "./widget-config-model";

/*
 * Panel widget yang memakai pivot tersimpan sebagai sumber (T-074, rencana G-7 §3.3). Definisi (sheet,
 * baris, kolom pemisah, nilai, Saring, Top N) dibaca dari pivot tersimpan dan hanya ditampilkan
 * (baca-saja); widget hanya mengatur TAMPILAN per jenis: pivot (urut, total, subtotal, filter silang),
 * grafik (dimensi = baris pertama/kolom pemisah, satu nilai, urut, N teratas), KPI (satu nilai), tabel
 * (urut, total), plus format. Setiap simpanan membawa savedPivotId — ikatan tidak pernah lepas diam-diam
 * (review T-073 L4); lepas hanya lewat "Lepas dari sumber". Tampilan diperiksa dengan effectiveConfig
 * yang sama dengan server sebelum disimpan otomatis.
 */
const SAVE_DELAY_MS = 350;

type Draft = { savedPivotId: string; type: BoundType; display: unknown };

export function BoundConfigForm({
  initial,
  savedPivots,
  sources,
  datasetId,
  saveError,
  bound,
  onSave,
  onDetach,
  onCancel,
  flushRef,
}: {
  /** Ikatan tersimpan (atau yang sedang dikirim); null = baru memilih pivot tersimpan. */
  initial: { savedPivotId: string; type: string; display: unknown } | null;
  /** Jenis widget sekarang (dipakai sebagai jenis awal saat baru memilih). */
  bound: { currentType: string; bound: boolean };
  savedPivots: SavedPivotOption[];
  sources: Source[];
  /** Pemilik dataset: tautan ke halaman ubah pivot tersimpan. null = editor (baca-saja). */
  datasetId: string | null;
  saveError?: string;
  onSave: (type: BoundType, display: unknown, savedPivotId: string) => Promise<boolean>;
  /** Lepas dari sumber (dialog konfirmasi di pemanggil). */
  onDetach: () => void;
  /** Batal memilih pivot tersimpan (widget belum pernah terikat). */
  onCancel: () => void;
  /** Pemanggil bisa mengirim simpanan tertunda sekarang (mis. sebelum dialog Lepas dari sumber). */
  flushRef?: React.MutableRefObject<(() => void) | null>;
}) {
  const startType: BoundType = isBoundType(initial?.type)
    ? initial.type
    : isBoundType(bound.currentType)
      ? bound.currentType
      : "pivot";
  const [draft, setDraft] = useState<Draft | null>(
    initial
      ? { savedPivotId: initial.savedPivotId, type: startType, display: initial.display }
      : null,
  );
  const [pickedType, setPickedType] = useState<BoundType>(startType);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const memory = useRef<Partial<Record<BoundType, unknown>>>({});
  const pending = useRef<Draft | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const save = useRef(onSave);
  const seq = useRef(0);
  useEffect(() => {
    save.current = onSave;
  });

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const next = pending.current;
    pending.current = null;
    if (!next) return;
    const mine = ++seq.current;
    setStatus("saving");
    void save.current(next.type, next.display, next.savedPivotId).then((ok) => {
      if (mine === seq.current) setStatus(ok ? "saved" : "error");
    });
  }, []);
  // Panel ditutup sebelum jeda habis: perubahan terakhir tetap dikirim.
  useEffect(() => () => flush(), [flush]);
  useEffect(() => {
    if (!flushRef) return;
    flushRef.current = flush;
    return () => {
      flushRef.current = null;
    };
  }, [flush, flushRef]);

  const pivotOf = (id: string | undefined) => savedPivots.find((p) => p.id === id);
  const current = pivotOf(draft?.savedPivotId);
  const check = draft && current ? effectiveConfig(draft.type, draft.display, current.spec) : null;

  const commit = (next: Draft) => {
    setDraft(next);
    clearTimeout(timer.current);
    pending.current = null;
    const p = pivotOf(next.savedPivotId);
    if (!p || !effectiveConfig(next.type, next.display, p.spec).ok) return;
    pending.current = next;
    timer.current = setTimeout(flush, SAVE_DELAY_MS);
  };

  const pick = (savedPivotId: string) => {
    const p = pivotOf(savedPivotId);
    if (!p) return;
    const type = draft?.type ?? pickedType;
    const format = (draft?.display as { format?: unknown } | undefined)?.format;
    memory.current = {};
    commit({
      savedPivotId,
      type,
      display: defaultDisplay(type, p.spec, format) ?? defaultDisplay(type, p.spec),
    });
  };

  const switchType = (type: BoundType) => {
    if (!draft) return setPickedType(type);
    if (!current) return;
    memory.current[draft.type] = draft.display;
    const kept = memory.current[type];
    const format = (draft.display as { format?: unknown } | null)?.format;
    const display =
      kept && effectiveConfig(type, kept, current.spec).ok
        ? kept
        : defaultDisplay(type, current.spec, format);
    commit({ ...draft, type, display });
  };

  const sheet = current ? sources.find((s) => s.id === current.spec.sheetId) : undefined;
  const cols = sheet?.columns ?? [];
  const name = (pos: number) => cols.find((c) => c.pos === pos)?.name ?? "kolom";
  const set = (patch: Record<string, unknown>) => {
    if (!draft) return;
    commit({ ...draft, display: { ...(draft.display as object), ...patch } });
  };
  const display = (draft?.display ?? {}) as Record<string, unknown>;
  const format: NumberFormat = (display.format as NumberFormat | undefined) ??
    current?.spec.format ?? { style: "auto", decimals: 0 };
  const noValue = draft !== null && current !== undefined && draft.display === null;

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="bound-config">
      <Choice
        label="Pivot tersimpan yang dipakai"
        testId="bound-pivot"
        placeholder="Pilih pivot tersimpan"
        value={draft?.savedPivotId ?? ""}
        invalidText={
          draft && !current
            ? "Pivot tersimpan ini tidak ada lagi di daftar. Muat ulang halaman atau pilih yang lain."
            : undefined
        }
        blankOk={!draft}
        options={savedPivots.map((p) => ({ value: p.id, label: p.name }))}
        onChange={pick}
      />

      {draft && current ? (
        <section
          aria-label="Definisi pivot tersimpan"
          className="flex min-w-0 flex-col gap-2 rounded-md border bg-muted/40 p-3 text-sm"
          data-testid="bound-source"
        >
          <p className="flex min-w-0 gap-2">
            <IconTableShare size={20} stroke={1.5} aria-hidden className="mt-0.5 shrink-0" />
            <span className="min-w-0 [overflow-wrap:anywhere]">
              Bersumber dari pivot tersimpan <strong>{current.name}</strong>
              {sheet ? ` (sheet ${sheet.name})` : ""}.
            </span>
          </p>
          <p className="text-muted-foreground [overflow-wrap:anywhere]" data-testid="bound-summary">
            {sheet
              ? pivotSummary(current.spec, cols, (m) =>
                  isCalcValue(m) ? m.label : measureText(m, name),
                ).map((p, i) => (p.strong ? <strong key={i}>{p.text}</strong> : p.text))
              : "Sheet pivot tersimpan ini tidak ada di data aktif."}
          </p>
          <p className="text-xs text-muted-foreground">
            {current.canEdit
              ? "Definisi diatur di halaman pivot tersimpan; perubahan di sana berlaku di semua widget yang memakainya."
              : "Definisi hanya bisa diubah pemilik dataset (baca-saja)."}
          </p>
          <div className="flex flex-col gap-2 md:flex-row md:flex-wrap">
            {current.canEdit && datasetId ? (
              <Button
                asChild
                variant="outline"
                className="h-(--control-h-lg) w-full md:h-(--control-h) md:w-auto"
              >
                <Link
                  href={`/datasets/${datasetId}/pivot-tersimpan/${current.id}`}
                  data-testid="bound-edit-source"
                >
                  <IconPencil aria-hidden />
                  Ubah pivot tersimpan
                </Link>
              </Button>
            ) : null}
            {bound.bound ? (
              <Button
                variant="outline"
                className="h-(--control-h-lg) w-full md:h-(--control-h) md:w-auto"
                leadingIcon={<IconUnlink aria-hidden />}
                data-testid="bound-detach"
                onClick={() => {
                  flush();
                  onDetach();
                }}
              >
                Lepas dari sumber
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}

      {!bound.bound ? (
        <Button
          variant="ghost"
          className="h-(--control-h-lg) w-full md:h-(--control-h) md:w-auto md:self-start"
          onClick={() => {
            clearTimeout(timer.current);
            pending.current = null;
            onCancel();
          }}
        >
          Batal, tetap pakai sheet langsung
        </Button>
      ) : null}

      <TypeTiles value={draft?.type ?? pickedType} onChange={switchType} />

      {!draft ? (
        <p className="text-sm text-muted-foreground">
          Pilih pivot tersimpan untuk mulai menampilkan datanya.
        </p>
      ) : !current ? null : (
        <>
          {noValue ? (
            <p role="alert" className="text-sm text-destructive" data-testid="bound-invalid">
              Pivot tersimpan ini tidak punya nilai yang bisa ditampilkan sebagai jenis ini. Pilih
              jenis lain.
            </p>
          ) : null}
          {draft.type === "pivot" || draft.type === "table" ? (
            <PivotTableDisplay
              type={draft.type}
              display={display as PivotDisplay | TableDisplay}
              rowNames={current.spec.rows.map((r) => name(r.column))}
              rowType={cols.find((c) => c.pos === current.spec.rows[0]?.column)?.type}
              split={!!current.spec.column}
              levels={
                draft.type === "pivot"
                  ? pivotSubtotalLevels({
                      ...current.spec,
                      subtotals: (display as PivotDisplay).subtotals,
                      subtotalLevels: (display as PivotDisplay).subtotalLevels,
                    })
                  : []
              }
              set={set}
              setDisplay={(d) => commit({ ...draft, display: d })}
            />
          ) : draft.type === "kpi" ? (
            <Choice
              label="Nilai"
              testId="bound-value"
              value={String((display as KpiDisplay).value ?? "")}
              options={valueOptions(current.spec, cols)}
              onChange={(v) => set({ value: Number(v) })}
            />
          ) : noValue ? null : (
            <>
              <Choice
                label="Kelompokkan menurut"
                testId="bound-dimension"
                value={(display as ChartDisplay).dimension}
                options={dimensionOptions(current.spec, cols)}
                onChange={(dimension) => set({ dimension })}
              />
              <Choice
                label="Nilai"
                testId="bound-value"
                value={String((display as ChartDisplay).value)}
                options={valueOptions(current.spec, cols)}
                onChange={(v) => set({ value: Number(v) })}
              />
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_6rem] items-start gap-2">
                <Choice
                  label="Urutan"
                  value={(display as ChartDisplay).sort}
                  options={sortOptions(
                    draft.type,
                    cols.find(
                      (c) =>
                        c.pos ===
                        ((display as ChartDisplay).dimension === "column"
                          ? current.spec.column?.column
                          : current.spec.rows[0]?.column),
                    )?.type,
                    (display as ChartDisplay).sort,
                  )}
                  onChange={(sort) => set({ sort })}
                />
                <TopNField
                  key={draft.type}
                  type={draft.type}
                  value={(display as ChartDisplay).topN}
                  onCommit={(topN) => set({ topN })}
                />
              </div>
              <CrossFilterField
                value={(display as ChartDisplay).crossFilter !== false}
                onChange={(on) => set({ crossFilter: on ? undefined : false })}
              />
            </>
          )}

          {noValue ? null : <FormatFields value={format} onChange={(f) => set({ format: f })} />}

          {check && !check.ok && !noValue ? (
            <p
              role="alert"
              className="flex items-start gap-1.5 text-sm text-destructive"
              data-testid="bound-invalid"
            >
              <IconAlertCircle size={20} stroke={1.5} aria-hidden className="shrink-0" />
              <span className="min-w-0">{check.message}</span>
            </p>
          ) : null}

          <p
            className={
              status === "error" ? "text-xs text-destructive" : "text-xs text-muted-foreground"
            }
            aria-live="polite"
            data-testid="config-status"
            data-state={status}
          >
            {status === "saving"
              ? "Menyimpan…"
              : check && !check.ok
                ? "Belum tersimpan — perbaiki pilihan yang ditandai."
                : status === "error"
                  ? `Belum tersimpan — ${saveError || "coba ubah lagi."}`
                  : status === "saved"
                    ? "Tersimpan. Widget memuat data terbaru."
                    : "Perubahan tersimpan otomatis."}
          </p>
        </>
      )}
    </div>
  );
}

/** Tampilan pivot/tabel terikat: urutan baris, total, subtotal per level (pivot), filter silang. */
function PivotTableDisplay({
  type,
  display,
  rowNames,
  rowType,
  split,
  levels,
  set,
  setDisplay,
}: {
  type: "pivot" | "table";
  display: PivotDisplay | TableDisplay;
  rowNames: string[];
  rowType: Parameters<typeof sortLabel>[1];
  split: boolean;
  levels: number[];
  set: (patch: Record<string, unknown>) => void;
  setDisplay: (d: unknown) => void;
}) {
  const pivot = type === "pivot" ? (display as PivotDisplay) : null;
  return (
    <>
      <Choice
        label="Urutan baris"
        testId="bound-sort"
        value={display.sort}
        options={CHART_SORT_ORDER.map((s: ChartSort) => ({
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
          split && pivot
            ? "Kolom Total di kanan dan baris Total di bawah."
            : "Baris Total di bawah tabel."
        }
        checked={display.totals}
        onChange={(totals) => set({ totals })}
        testId="bound-totals"
      />
      {pivot
        ? rowNames.slice(0, -1).map((n, i) => (
            <ToggleField
              key={i}
              label={`Subtotal per ${n}`}
              hint="Baris ringkasan di atas setiap kelompok."
              checked={levels.includes(i + 1)}
              onChange={(on) => {
                const next = new Set(levels);
                if (on) next.add(i + 1);
                else next.delete(i + 1);
                const list = [...next].sort((a, b) => a - b);
                const { subtotalLevels: _l, ...rest } = pivot;
                setDisplay(
                  list.length === 0
                    ? { ...rest, subtotals: false }
                    : list.length === rowNames.length - 1
                      ? { ...rest, subtotals: true }
                      : { ...rest, subtotals: true, subtotalLevels: list },
                );
              }}
              testId={i === 0 ? "bound-subtotals" : `bound-subtotals-${i + 1}`}
            />
          ))
        : null}
      {pivot ? (
        <ToggleField
          label={PIVOT_CROSS_FILTER_LABEL}
          hint="Label baris atau kolom yang dipilih jadi filter untuk semua widget lain di dashboard ini."
          checked={pivot.crossFilter === true}
          onChange={(on) => set({ crossFilter: on ? true : undefined })}
          testId="widget-crossfilter-switch"
        />
      ) : null}
    </>
  );
}
