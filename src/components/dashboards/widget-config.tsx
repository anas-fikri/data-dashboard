"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { configVersion } from "@/components/widgets/body-state";
import type { WidgetView } from "@/features/dashboards/service";
import { parseWidgetConfig, type WidgetConfig, type WidgetType } from "@/features/widgets/spec";
import { Choice, ColumnChoice, FormatFields } from "./config-fields";
import { useFocusAfterRender } from "./config-focus";
import {
  CrossFilterField,
  FormatColumnsField,
  MeasureFields,
  MissingNotice,
  RetargetNotice,
  TableColumns,
  TopNField,
  TypeTiles,
} from "./config-sections";
import {
  GRAIN_LABEL,
  defaultConfig,
  isNumeric,
  isTemporal,
  measureMismatch,
  missingColumns,
  sortOptions,
  withDimension,
  withoutMissingColumns,
  type Source,
} from "./widget-config-model";

/*
 * Bagian "Data" di panel pengaturan widget (T-011): jenis tampilan, sheet, kolom, agregasi, urutan,
 * jumlah kategori, dan format angka. Perubahan yang valid tersimpan otomatis setelah jeda singkat dan
 * widget langsung memuat ulang datanya. Pilihan per jenis diingat selama panel terbuka — berpindah
 * jenis lalu kembali (mis. dengan panah keyboard) tidak menghapus pengaturan (review desain T-011 M3).
 * Kolom yang tidak lagi tersedia (disembunyikan, atau tidak ada di data terbaru — MISSING_COLUMN)
 * diberi tahu dan ditandai; tidak tersimpan sampai diganti. Kolom tabel dibuang saat user mengubah
 * sesuatu (M2). Widget yang sheet lamanya tidak ada lagi ditampilkan di satu-satunya sheet aktif
 * (retargeted): belum tersimpan sampai user memakainya — tidak disimpan otomatis saat panel dibuka,
 * rollback ke versi yang punya sheet lama masih bisa memulihkan spec tersimpan (R3-CC-2).
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
  // reloads: simpanan terakhir mengubah data widget (bukan hanya sakelar filter silang, yang tidak
  // memuat ulang) — teks status tidak menjanjikan "memuat data terbaru" yang tidak terjadi.
  const [saveState, setStatus] = useState<{ status: Status; reloads: boolean }>({
    status: "idle",
    reloads: true,
  });
  const { status, reloads } = saveState;
  const [retargeted, setRetargeted] = useState(widget.retargeted === true);
  // Spec tampilan widget retargeted belum tersimpan: simpanan pertama selalu memuat ulang kartu.
  const savedVersion = useRef(
    widget.retargeted ? "" : configVersion(parsed.ok ? parsed.config : EMPTY),
  );
  const memory = useRef<Partial<Record<WidgetType, WidgetConfig>>>({});
  const pending = useRef<WidgetConfig | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const save = useRef(onSave);
  const [statusRef, focusStatus] = useFocusAfterRender<HTMLParagraphElement>();
  const [columnsRef, focusColumns] = useFocusAfterRender<HTMLFieldSetElement>();
  useEffect(() => {
    save.current = onSave;
  });

  // Hanya memakai ref + setter stabil → identitas tetap; aman dipanggil saat unmount.
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const next = pending.current;
    pending.current = null;
    if (!next || next.type === "empty") return;
    const version = configVersion(next);
    setStatus({ status: "saving", reloads: true });
    void save.current(next.type, next.spec).then((ok) => {
      const reloads = version !== savedVersion.current;
      if (ok) {
        savedVersion.current = version;
        // Spec tersimpan kini di sheet aktif (sumber panel hanya sheet versi aktif).
        setRetargeted(false);
      }
      setStatus({ status: ok ? "saved" : "error", reloads });
    });
  }, [setStatus, setRetargeted]);
  // Panel ditutup sebelum jeda habis: perubahan terakhir tetap dikirim.
  useEffect(() => () => flush(), [flush]);

  const commit = (next: WidgetConfig | null) => {
    if (!next) return;
    // Kolom tabel yang tidak lagi tersedia dibuang begitu user mengubah sesuatu.
    if (next.type === "table") next = withoutMissingColumns(next, sources);
    setDraft(next);
    if (next.type === "empty" || missingColumns(next, sources).length) return;
    // Sheet spec tidak ada di data aktif: server menolaknya; tunggu sheet dipilih.
    if (!sources.some((s) => s.id === next.spec.sheetId)) return;
    // Kolom nilai spec lama yang tidak cocok (mis. maks. tanggal di grafik): server menolaknya.
    if (measureMismatch(next, sources)) return;
    if (!parseWidgetConfig(next.type, next.spec).ok) return;
    pending.current = next;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY_MS);
  };

  const switchType = (type: Exclude<WidgetType, "empty">) => {
    memory.current[draft.type] = draft;
    const kept = memory.current[type];
    const usable = kept && kept.type !== "empty" && sources.some((s) => s.id === kept.spec.sheetId);
    if (!usable) return commit(defaultConfig(type, sources, draft));
    // Yang diingat berisi nilai yang tidak cocok (spec lama): pilih ulang nilainya saja, sisanya tetap.
    commit(measureMismatch(kept, sources) ? defaultConfig(type, sources, kept) : kept);
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
  // Sheet lama widget tidak ada di versi aktif (dataset banyak sheet): pilih sheet dulu.
  const noSheet = draft.type !== "empty" && !sheet;
  // Sheet yang semua kolomnya disembunyikan tidak ditawarkan di pilihan sheet: beri alasannya sendiri.
  const sheetError = noSheet
    ? "Sheet lama widget ini tidak ada di data aktif — pilih sheet."
    : sheet && !sheet.columns.length
      ? "Semua kolom sheet ini disembunyikan di skema — pilih sheet lain."
      : undefined;
  // Tanpa sheet atau sheet tanpa kolom terlihat: tidak ada kolom pengganti yang bisa dipilih.
  const noColumns = noSheet || (!!sheet && !sheet.columns.length);
  const missing = noColumns ? [] : missingColumns(draft, sources);
  const unsaved = noColumns || missing.length > 0 || measureMismatch(draft, sources);
  // Kolom yang perlu diganti punya peringatannya sendiri (MissingNotice); simpanan pengganti juga
  // memindahkan spec ke sheet aktif.
  const retargetedOnly = retargeted && !unsaved && !!sheet;

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
            <MissingNotice
              missing={missing}
              all={draft.type === "table" && missing.length === draft.spec.columns.length}
              onFixTable={
                draft.type === "table"
                  ? () => {
                      // Tombol ini hilang setelah diklik: fokus pindah ke daftar kolom.
                      focusColumns();
                      commit(withoutMissingColumns(draft, sources, true));
                    }
                  : undefined
              }
            />
          ) : retargetedOnly ? (
            <RetargetNotice
              sheet={sheet.name}
              onUse={() => {
                // Simpan sekarang (tanpa jeda); fokus ke baris status setelah ia berbunyi "Menyimpan…".
                focusStatus();
                commit(draft);
                flush();
              }}
            />
          ) : null}

          {sources.length > 1 || noSheet ? (
            <Choice
              label="Sheet"
              value={draft.spec.sheetId}
              placeholder={sheetError ? "Pilih sheet" : undefined}
              invalidText={sheetError}
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

          {/* Tanpa sheet belum ada kolom untuk dipilih: bagian kolom/nilai muncul setelah sheet dipilih. */}
          {noColumns ? null : draft.type === "table" ? (
            <TableColumns
              ref={columnsRef}
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
                    onChange={(column) => commit(withDimension(draft, column, typeOf(column)))}
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
                    options={sortOptions(
                      draft.type,
                      typeOf(draft.spec.dimension.column),
                      draft.spec.sort,
                    )}
                    onChange={(sort) => commit({ ...draft, spec: { ...draft.spec, sort } })}
                  />
                  <TopNField
                    key={draft.type}
                    type={draft.type}
                    value={draft.spec.topN}
                    onCommit={(topN) => commit({ ...draft, spec: { ...draft.spec, topN } })}
                  />
                </div>
              ) : null}
              {draft.type !== "kpi" ? (
                <CrossFilterField
                  value={draft.spec.crossFilter !== false}
                  onChange={(on) => {
                    const { crossFilter: _, ...spec } = draft.spec;
                    commit({ ...draft, spec: on ? spec : { ...spec, crossFilter: false } });
                  }}
                />
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
          {draft.type === "table" && !noColumns && draft.spec.format.style !== "auto" ? (
            <FormatColumnsField
              columns={cols.filter((c) => draft.spec.columns.includes(c.pos) && isNumeric(c.type))}
              selected={draft.spec.formatColumns ?? draft.spec.columns}
              onChange={(formatColumns) =>
                commit({ ...draft, spec: { ...draft.spec, formatColumns } })
              }
            />
          ) : null}

          <p
            ref={statusRef}
            tabIndex={-1}
            className="text-xs text-muted-foreground"
            aria-live="polite"
            data-testid="config-status"
            data-state={status}
          >
            {status === "saving"
              ? "Menyimpan…"
              : status === "saved"
                ? reloads
                  ? "Tersimpan. Widget memuat data terbaru."
                  : "Tersimpan."
                : status === "error"
                  ? "Belum tersimpan — lihat pesan di atas kanvas."
                  : noColumns
                    ? noSheet
                      ? "Belum tersimpan — pilih sheet."
                      : "Belum tersimpan — pilih sheet lain."
                    : unsaved
                      ? "Belum tersimpan — pilih kolom pengganti."
                      : retargetedOnly
                        ? "Belum tersimpan — pilih “Pakai sheet ini” di atas."
                        : "Perubahan tersimpan otomatis."}
          </p>
        </>
      )}
    </div>
  );
}
