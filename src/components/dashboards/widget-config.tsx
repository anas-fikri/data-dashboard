"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { WidgetView } from "@/features/dashboards/service";
import { parseWidgetConfig, type WidgetConfig, type WidgetType } from "@/features/widgets/spec";
import { Choice, ColumnChoice, FormatFields } from "./config-fields";
import { MeasureFields, TableColumns, TopNField, TypeTiles } from "./config-sections";
import {
  CHART_SORT_ORDER,
  GRAIN_LABEL,
  defaultConfig,
  isNumeric,
  isTemporal,
  missingColumns,
  sortLabel,
  type Source,
} from "./widget-config-model";

/*
 * Bagian "Data" di panel pengaturan widget (T-011): jenis tampilan, sheet, kolom, agregasi, urutan,
 * jumlah kategori, dan format angka. Perubahan yang valid tersimpan otomatis setelah jeda singkat dan
 * widget langsung memuat ulang datanya. Pilihan per jenis diingat selama panel terbuka — berpindah
 * jenis lalu kembali (mis. dengan panah keyboard) tidak menghapus pengaturan (review desain T-011 M3).
 * Kolom yang tidak lagi tersedia diberi tahu dan dibuang saat user mengubah sesuatu (M2).
 */
const SAVE_DELAY_MS = 350;
type Status = "idle" | "saving" | "saved" | "error";
const EMPTY: WidgetConfig = { type: "empty", spec: {} };

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
  const parsed = parseWidgetConfig(widget.type, widget.spec);
  const [draft, setDraft] = useState<WidgetConfig>(parsed.ok ? parsed.config : EMPTY);
  const [status, setStatus] = useState<Status>("idle");
  const memory = useRef<Partial<Record<WidgetType, WidgetConfig>>>({});
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

  const commit = (next: WidgetConfig | null) => {
    if (!next) return;
    // Kolom tabel yang tidak lagi tersedia dibuang begitu user mengubah sesuatu.
    if (next.type === "table") {
      const gone = new Set(missingColumns(next, sources));
      const columns = next.spec.columns.filter((p) => !gone.has(p));
      if (columns.length && columns.length !== next.spec.columns.length) {
        next = {
          ...next,
          spec: {
            ...next.spec,
            columns,
            formatColumns: next.spec.formatColumns?.filter((p) => columns.includes(p)),
          },
        };
      }
    }
    setDraft(next);
    if (next.type === "empty" || missingColumns(next, sources).length) return;
    if (!parseWidgetConfig(next.type, next.spec).ok) return;
    pending.current = next;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY_MS);
  };

  const switchType = (type: Exclude<WidgetType, "empty">) => {
    memory.current[draft.type] = draft;
    const kept = memory.current[type];
    const usable = kept && kept.type !== "empty" && sources.some((s) => s.id === kept.spec.sheetId);
    commit(usable ? kept : defaultConfig(type, sources, draft));
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
  const typeOf = (pos: number | undefined) => cols.find((c) => c.pos === pos)?.type;
  const missing = missingColumns(draft, sources);

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="widget-config">
      <TypeTiles value={draft.type} onChange={switchType} />

      {draft.type === "empty" ? (
        <p className="text-sm text-muted-foreground">
          Pilih jenis tampilan untuk mulai menampilkan data.
        </p>
      ) : (
        <>
          {missing.length ? (
            <p
              role="status"
              className="rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-sm"
              data-testid="config-missing"
            >
              Sebagian kolom yang dipakai widget ini tidak tersedia lagi (disembunyikan atau dihapus
              di skema). Pilih kolom lain di bawah.
            </p>
          ) : null}

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
                )
              }
            />
          ) : null}

          {draft.type === "table" ? (
            <TableColumns
              columns={cols}
              selected={draft.spec.columns}
              onChange={(columns) =>
                commit({
                  ...draft,
                  spec: {
                    ...draft.spec,
                    columns,
                    formatColumns: draft.spec.formatColumns?.filter((p) => columns.includes(p)),
                  },
                })
              }
            />
          ) : (
            <>
              {draft.type !== "kpi" ? (
                <>
                  <ColumnChoice
                    label="Kelompokkan menurut"
                    testId="config-dimension"
                    value={draft.spec.dimension.column}
                    columns={cols}
                    onChange={(column) =>
                      commit({
                        ...draft,
                        spec: {
                          ...draft.spec,
                          dimension: isTemporal(typeOf(column) ?? "text")
                            ? { column, timeGrain: "month" }
                            : { column },
                        },
                      })
                    }
                  />
                  {isTemporal(typeOf(draft.spec.dimension.column) ?? "text") ? (
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

              <MeasureFields
                type={draft.type}
                columns={cols}
                measure={draft.spec.measure}
                onChange={(measure) =>
                  commit({ ...draft, spec: { ...draft.spec, measure } } as WidgetConfig)
                }
              />

              {draft.type !== "kpi" ? (
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_6rem] items-start gap-2">
                  <Choice
                    label="Urutan"
                    value={draft.spec.sort}
                    options={CHART_SORT_ORDER.map((value) => ({
                      value,
                      label: sortLabel(value, typeOf(draft.spec.dimension.column)),
                    }))}
                    onChange={(sort) => commit({ ...draft, spec: { ...draft.spec, sort } })}
                  />
                  <TopNField
                    key={`${draft.type}:${draft.spec.topN}`}
                    type={draft.type}
                    value={draft.spec.topN}
                    onCommit={(topN) => commit({ ...draft, spec: { ...draft.spec, topN } })}
                  />
                </div>
              ) : null}
            </>
          )}

          <FormatFields
            value={draft.spec.format}
            onChange={(format) => {
              // Tabel: format pilihan awalnya untuk semua kolom angka; user bisa mengecualikan.
              if (draft.type === "table" && format.style !== "auto" && !draft.spec.formatColumns) {
                const numeric = draft.spec.columns.filter((p) => isNumeric(typeOf(p) ?? "text"));
                return commit({
                  ...draft,
                  spec: { ...draft.spec, format, formatColumns: numeric },
                });
              }
              commit({ ...draft, spec: { ...draft.spec, format } } as WidgetConfig);
            }}
          />
          {draft.type === "table" && draft.spec.format.style !== "auto" ? (
            <FormatColumnsField
              columns={cols.filter((c) => draft.spec.columns.includes(c.pos) && isNumeric(c.type))}
              selected={draft.spec.formatColumns ?? draft.spec.columns}
              onChange={(formatColumns) =>
                commit({ ...draft, spec: { ...draft.spec, formatColumns } })
              }
            />
          ) : null}

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
                  : missing.length
                    ? "Belum tersimpan — pilih kolom pengganti."
                    : "Perubahan tersimpan otomatis."}
          </p>
        </>
      )}
    </div>
  );
}

/** Kolom angka tabel yang memakai format pilihan (selebihnya otomatis). */
function FormatColumnsField({
  columns,
  selected,
  onChange,
}: {
  columns: { pos: number; name: string }[];
  selected: number[];
  onChange: (next: number[]) => void;
}) {
  if (!columns.length) return null;
  return (
    <fieldset className="flex min-w-0 flex-col gap-1">
      <legend className="mb-1 text-sm font-medium">Pakai format ini untuk</legend>
      {columns.map((c) => (
        <label
          key={c.pos}
          className="flex min-h-11 min-w-0 items-center gap-2 rounded-sm px-2 text-sm hover:bg-accent md:min-h-9"
        >
          <input
            type="checkbox"
            className="size-4 shrink-0 accent-(--color-primary)"
            checked={selected.includes(c.pos)}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? [...selected.filter((p) => p !== c.pos), c.pos]
                  : selected.filter((p) => p !== c.pos),
              )
            }
          />
          <span className="min-w-0 truncate" title={c.name}>
            {c.name}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
