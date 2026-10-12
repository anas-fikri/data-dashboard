"use client";

import {
  IconChartBar,
  IconChartLine,
  IconChartPie,
  IconNumber123,
  IconTable,
} from "@tabler/icons-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  TABLE_COLUMNS_MAX,
  TOP_N_MAX,
  parseWidgetConfig,
  type WidgetConfig,
  type WidgetType,
} from "@/features/widgets/spec";
import type { WidgetView } from "@/features/dashboards/service";
import { Choice, ColumnChoice, FormatFields } from "./config-fields";
import {
  AGG_LABEL,
  AGG_ORDER,
  GRAIN_LABEL,
  SORT_LABEL,
  TYPE_OPTIONS,
  columnsForAgg,
  defaultConfig,
  isTemporal,
  type Source,
} from "./widget-config-model";

/*
 * Bagian "Data" di panel pengaturan widget (T-011): jenis tampilan, sheet, kolom, agregasi, urutan,
 * jumlah kategori, dan format angka. Setiap perubahan yang valid tersimpan otomatis (jeda singkat) dan
 * widget langsung memuat ulang datanya; pilihan awal diisi otomatis agar hasil langsung terlihat.
 */
const ICONS = {
  kpi: IconNumber123,
  bar: IconChartBar,
  line: IconChartLine,
  pie: IconChartPie,
  table: IconTable,
};
const SAVE_DELAY_MS = 350;
type Status = "idle" | "saving" | "saved" | "error";

export function WidgetConfigForm({
  widget,
  sources,
  datasetId,
  onSave,
}: {
  widget: WidgetView;
  sources: Source[];
  datasetId: string;
  onSave: (type: WidgetType, spec: unknown) => Promise<boolean>;
}) {
  const id = useId();
  const parsed = parseWidgetConfig(widget.type, widget.spec);
  const [draft, setDraft] = useState<WidgetConfig>(
    parsed.ok ? parsed.config : { type: "empty", spec: {} },
  );
  const [status, setStatus] = useState<Status>("idle");
  const pending = useRef<WidgetConfig | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const save = useRef(onSave);
  useEffect(() => {
    save.current = onSave;
  });

  // Hanya memakai ref + setter stabil → identitas tetap; aman dipanggil saat unmount.
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const next = pending.current;
    pending.current = null;
    if (!next || next.type === "empty") return;
    setStatus("saving");
    void save.current(next.type, next.spec).then((ok) => setStatus(ok ? "saved" : "error"));
  }, []);
  // Panel ditutup sebelum jeda habis: perubahan terakhir tetap dikirim.
  useEffect(() => () => flush(), [flush]);

  const commit = (next: WidgetConfig | null, delay = SAVE_DELAY_MS) => {
    if (!next) return;
    setDraft(next);
    if (next.type === "empty" || !parseWidgetConfig(next.type, next.spec).ok) return;
    pending.current = next;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, delay);
  };

  if (!sources.some((s) => s.columns.length)) {
    return (
      <p className="rounded-md bg-muted px-3 py-2 text-sm">
        Dataset ini belum punya data yang siap dipakai.{" "}
        <Link href={`/datasets/${datasetId}`} className="font-medium underline underline-offset-4">
          Unggah atau periksa data
        </Link>
        .
      </p>
    );
  }

  const sheet =
    draft.type === "empty" ? undefined : sources.find((s) => s.id === draft.spec.sheetId);
  const cols = sheet?.columns ?? [];
  const byPos = (pos: number) => cols.find((c) => c.pos === pos);

  return (
    <div className="flex flex-col gap-4" data-testid="widget-config">
      <fieldset className="flex flex-col gap-2">
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
                  name={`${id}-type`}
                  value={type}
                  className="sr-only"
                  checked={draft.type === type}
                  onChange={() => commit(defaultConfig(type, sources, draft), 0)}
                />
                <Icon size={20} stroke={1.5} aria-hidden />
                {label}
              </label>
            );
          })}
        </div>
      </fieldset>

      {draft.type === "empty" ? (
        <p className="text-sm text-muted-foreground">
          Pilih jenis tampilan untuk mulai menampilkan data.
        </p>
      ) : (
        <>
          {sources.length > 1 ? (
            <Choice
              label="Sheet"
              value={draft.spec.sheetId}
              options={sources
                .filter((s) => s.columns.length)
                .map((s) => ({ value: s.id, label: s.name }))}
              onChange={(sheetId) =>
                commit(
                  defaultConfig(
                    draft.type as Exclude<WidgetType, "empty">,
                    sources,
                    draft,
                    sheetId,
                  ),
                  0,
                )
              }
            />
          ) : null}

          {draft.type === "table" ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">
                Kolom ditampilkan{" "}
                <span className="font-normal text-muted-foreground">
                  ({draft.spec.columns.length} dari maks. {TABLE_COLUMNS_MAX})
                </span>
              </legend>
              <div className="flex max-h-56 flex-col overflow-y-auto rounded-md border p-1">
                {cols.map((c) => {
                  const on = draft.spec.columns.includes(c.pos);
                  const last = on && draft.spec.columns.length === 1;
                  const full = !on && draft.spec.columns.length >= TABLE_COLUMNS_MAX;
                  return (
                    <label
                      key={c.pos}
                      className="flex min-h-10 items-center gap-2 rounded-sm px-2 text-sm hover:bg-accent has-disabled:opacity-60"
                    >
                      <input
                        type="checkbox"
                        className="size-4 accent-(--color-primary)"
                        checked={on}
                        disabled={last || full}
                        onChange={() =>
                          commit({
                            ...draft,
                            spec: {
                              ...draft.spec,
                              columns: on
                                ? draft.spec.columns.filter((p) => p !== c.pos)
                                : cols
                                    .map((x) => x.pos)
                                    .filter((p) => p === c.pos || draft.spec.columns.includes(p)),
                            },
                          })
                        }
                      />
                      <span className="min-w-0 truncate">{c.name}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ) : (
            <>
              {draft.type !== "kpi" ? (
                <>
                  <ColumnChoice
                    label="Kelompokkan menurut"
                    testId="config-dimension"
                    value={draft.spec.dimension.column}
                    columns={cols}
                    onChange={(column) => {
                      const temporal = isTemporal(byPos(column)?.type ?? "text");
                      commit({
                        ...draft,
                        spec: {
                          ...draft.spec,
                          dimension: temporal ? { column, timeGrain: "month" } : { column },
                        },
                      });
                    }}
                  />
                  {isTemporal(byPos(draft.spec.dimension.column)?.type ?? "text") ? (
                    <Choice
                      label="Rentang waktu"
                      value={draft.spec.dimension.timeGrain ?? "none"}
                      options={[
                        ...Object.entries(GRAIN_LABEL).map(([value, label]) => ({ value, label })),
                        { value: "none", label: "Per tanggal persis" },
                      ]}
                      onChange={(g) =>
                        commit({
                          ...draft,
                          spec: {
                            ...draft.spec,
                            dimension:
                              g === "none"
                                ? { column: draft.spec.dimension.column }
                                : {
                                    column: draft.spec.dimension.column,
                                    timeGrain: g as keyof typeof GRAIN_LABEL,
                                  },
                          },
                        })
                      }
                    />
                  ) : null}
                </>
              ) : null}

              <div className="grid grid-cols-1 gap-2">
                <Choice
                  label="Nilai"
                  testId="config-agg"
                  value={draft.spec.measure.agg}
                  options={AGG_ORDER.filter(
                    (a) => a === "count" || columnsForAgg(a, cols).length,
                  ).map((a) => ({
                    value: a,
                    label: AGG_LABEL[a],
                  }))}
                  onChange={(agg) => {
                    const allowed = columnsForAgg(agg, cols);
                    const keep = allowed.some((c) => c.pos === draft.spec.measure.column);
                    const measure =
                      agg === "count"
                        ? { agg }
                        : { agg, column: keep ? draft.spec.measure.column! : allowed[0]!.pos };
                    commit({ ...draft, spec: { ...draft.spec, measure } } as WidgetConfig);
                  }}
                />
                {draft.spec.measure.agg !== "count" ? (
                  <ColumnChoice
                    label="dari kolom"
                    testId="config-measure"
                    value={draft.spec.measure.column ?? 0}
                    columns={columnsForAgg(draft.spec.measure.agg, cols)}
                    onChange={(column) =>
                      commit({
                        ...draft,
                        spec: { ...draft.spec, measure: { ...draft.spec.measure, column } },
                      } as WidgetConfig)
                    }
                  />
                ) : null}
              </div>

              {draft.type !== "kpi" ? (
                <div className="grid grid-cols-[1fr_6rem] items-end gap-2">
                  <Choice
                    label="Urutan"
                    value={draft.spec.sort}
                    options={Object.entries(SORT_LABEL).map(([value, label]) => ({
                      value: value as keyof typeof SORT_LABEL,
                      label,
                    }))}
                    onChange={(sort) => commit({ ...draft, spec: { ...draft.spec, sort } })}
                  />
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={`${id}-top`} className="text-sm font-medium">
                      Maks.
                    </label>
                    <Input
                      id={`${id}-top`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={TOP_N_MAX[draft.type]}
                      value={draft.spec.topN}
                      aria-describedby={`${id}-top-hint`}
                      className="h-(--control-h-lg) md:h-(--control-h)"
                      onChange={(e) => {
                        const n = Math.trunc(Number(e.target.value));
                        if (Number.isFinite(n))
                          commit(
                            {
                              ...draft,
                              spec: {
                                ...draft.spec,
                                topN: Math.min(Math.max(n, 1), TOP_N_MAX[draft.type as "bar"]),
                              },
                            },
                            600,
                          );
                      }}
                    />
                  </div>
                  <p id={`${id}-top-hint`} className="col-span-2 text-xs text-muted-foreground">
                    Jumlah kategori maksimal yang ditampilkan (1–{TOP_N_MAX[draft.type]}).
                  </p>
                </div>
              ) : null}
            </>
          )}

          <FormatFields
            value={draft.spec.format}
            onChange={(format) =>
              commit({ ...draft, spec: { ...draft.spec, format } } as WidgetConfig)
            }
          />
          <p
            className="text-xs text-muted-foreground"
            aria-live="polite"
            data-testid="config-status"
            data-state={status}
          >
            {status === "saving"
              ? "Menyimpan…"
              : status === "saved"
                ? "Tersimpan. Widget memuat data terbaru."
                : status === "error"
                  ? "Belum tersimpan — lihat pesan di atas kanvas."
                  : "Perubahan tersimpan otomatis."}
          </p>
        </>
      )}
    </div>
  );
}
