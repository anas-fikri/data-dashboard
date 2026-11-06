"use client";

import { IconAlertTriangle, IconRefresh, IconTableOptions } from "@tabler/icons-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { PivotView } from "@/components/widgets/pivot-view";
import { fetchWidget, type WidgetData } from "@/components/widgets/widget-query";
import {
  PIVOT_COLUMNS_SHOWN,
  PIVOT_ROWS_SHOWN,
  type NumberFormat,
  type PivotSpec,
} from "@/features/widgets/spec";

/*
 * Pratinjau tabel pivot penuh di editor pivot tersimpan (T-c6z4), seperti PivotTable Excel yang
 * tersusun saat field diatur: tabel yang sama dengan widget pivot di dashboard (PivotView →
 * PivotTableMarkup, batas tampilan 200 baris × 40 kolom, total/subtotal, field terhitung, "Tampilkan
 * nilai sebagai", Saring, Top N) lewat mode pemilik /api/query { datasetId, pivot } — server tetap
 * penentu akses (pemilik dataset saja) dan validasi spec. Setiap perubahan definisi memuat ulang setelah
 * jeda singkat; permintaan lama dibatalkan. Selama memuat, tabel lama tetap tampil redup dengan garis
 * progres (tanpa kedip); galat tidak menampilkan tabel lama (angkanya milik definisi lain).
 */
export const PREVIEW_DELAY_MS = 400;

const TRANSIENT = new Set([
  "QUERY_BUSY",
  "QUERY_TIMEOUT",
  "OFFLINE",
  "UNAVAILABLE",
  "QUERY_FAILED",
  "NOT_READY",
  "RATE_LIMITED",
]);

/** Tabel hasil + format angka definisi yang menghasilkannya. */
type Shown = { data: WidgetData; format: NumberFormat };

type Answer =
  { ok: true; data: WidgetData } | { ok: false; code: string; message: string; status: number };

type PreviewState =
  | { status: "idle" }
  | { status: "loading"; shown?: Shown }
  | { status: "ok"; shown: Shown }
  | { status: "error"; code: string; message: string };

/** Hasil pratinjau untuk spec ini; null = definisi belum lengkap (tanpa query). */
function usePivotPreview(datasetId: string, spec: PivotSpec | null) {
  const key = spec ? JSON.stringify({ datasetId, pivot: spec }) : "";
  const [attempt, setAttempt] = useState(0);
  const [res, setRes] = useState<{
    key: string;
    attempt: number;
    answer: Answer;
    /** Tabel terakhir yang berhasil (ditampilkan redup selama definisi baru dimuat). */
    last?: Shown;
  } | null>(null);

  useEffect(() => {
    if (!key) return;
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      const body = JSON.parse(key) as { datasetId: string; pivot: PivotSpec };
      fetchWidget(body, ctl.signal).then(
        (answer) => {
          if (ctl.signal.aborted) return;
          setRes((prev) => ({
            key,
            attempt,
            answer,
            last: answer.ok ? { data: answer.data, format: body.pivot.format } : prev?.last,
          }));
        },
        () => {},
      );
    }, PREVIEW_DELAY_MS);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [key, attempt]);

  let state: PreviewState;
  if (!key) state = { status: "idle" };
  else if (res && res.key === key && res.attempt === attempt) {
    state = res.answer.ok
      ? { status: "ok", shown: res.last! }
      : { status: "error", code: res.answer.code, message: res.answer.message };
  } else state = { status: "loading", shown: res?.last };
  return { state, retry: () => setAttempt((a) => a + 1) };
}

export function SavedPivotPreview({
  datasetId,
  spec,
  label,
}: {
  datasetId: string;
  /** null = definisi belum lengkap/ditandai galat: tidak ada query, hanya petunjuk. */
  spec: PivotSpec | null;
  /** Nama wilayah tabel untuk pembaca layar. */
  label: string;
}) {
  const { state, retry } = usePivotPreview(datasetId, spec);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const shown = state.status === "ok" || state.status === "loading" ? state.shown : undefined;
  const pivot = shown?.data.pivot;
  const loading = state.status === "loading";

  let body: ReactNode;
  if (state.status === "idle") {
    body = (
      <Notice icon={<IconTableOptions size={20} stroke={1.5} aria-hidden />}>
        Lengkapi pengaturan pivot untuk melihat pratinjau tabelnya.
      </Notice>
    );
  } else if (state.status === "error") {
    body = (
      <Notice
        icon={<IconAlertTriangle size={20} stroke={1.5} aria-hidden className="text-destructive" />}
        testId="saved-pivot-preview-error"
      >
        <span>{state.message}</span>
        {TRANSIENT.has(state.code) ? (
          <Button
            type="button"
            variant="outline"
            className="h-(--control-h-lg) w-full md:h-(--control-h) md:w-auto"
            leadingIcon={<IconRefresh aria-hidden />}
            // Tombol hilang begitu memuat ulang: fokus pindah ke judul pratinjau, bukan ke <body>.
            onClick={() => {
              titleRef.current?.focus();
              retry();
            }}
          >
            Coba lagi
          </Button>
        ) : null}
      </Notice>
    );
  } else if (!shown || !pivot) {
    body = (
      <div className="flex flex-1 flex-col gap-2 p-4" aria-hidden>
        <div className="h-4 w-1/3 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        <div className="min-h-24 flex-1 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      </div>
    );
  } else {
    body = (
      <div
        className={
          loading
            ? "flex min-h-0 flex-1 flex-col opacity-60 transition-opacity motion-reduce:transition-none"
            : "flex min-h-0 flex-1 flex-col"
        }
      >
        <PivotView data={pivot} format={shown.format} label={label} />
      </div>
    );
  }

  return (
    <section
      className="flex min-w-0 flex-col gap-2"
      aria-labelledby="saved-pivot-preview-title"
      data-testid="saved-pivot-preview"
      data-state={state.status}
    >
      <div className="flex min-h-6 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2
          id="saved-pivot-preview-title"
          ref={titleRef}
          tabIndex={-1}
          className="text-sm font-medium focus-visible:outline-none"
        >
          Pratinjau tabel
        </h2>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {loading
            ? "Memperbarui pratinjau…"
            : state.status === "ok"
              ? "Sesuai pengaturan saat ini"
              : ""}
        </p>
      </div>
      <div
        className="relative flex max-h-[min(32rem,calc(100dvh-var(--topbar-h)-8rem))] min-h-32 flex-col overflow-hidden rounded-md border bg-card"
        aria-busy={loading || undefined}
      >
        {loading && pivot ? (
          <div
            role="progressbar"
            aria-label="Memperbarui pratinjau tabel"
            className="absolute inset-x-0 top-0 z-30 h-0.5 animate-pulse bg-primary motion-reduce:animate-none forced-colors:bg-[Highlight] forced-colors:forced-color-adjust-none"
          />
        ) : null}
        {body}
      </div>
      <p className="text-xs text-muted-foreground">
        Tampil sama dengan widget pivot di dashboard: paling banyak {PIVOT_ROWS_SHOWN} baris ×{" "}
        {PIVOT_COLUMNS_SHOWN} kolom, dihitung dari data aktif dataset ini.
      </p>
    </section>
  );
}

function Notice({
  icon,
  children,
  testId,
}: {
  icon: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-6 text-center text-sm text-muted-foreground"
      data-testid={testId}
    >
      {icon}
      {children}
    </div>
  );
}
