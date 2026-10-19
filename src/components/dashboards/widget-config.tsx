"use client";

import { IconAlertCircle } from "@tabler/icons-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { configVersion } from "@/components/widgets/body-state";
import type { WidgetView } from "@/features/dashboards/service";
import { parseWidgetConfig, type WidgetConfig, type WidgetType } from "@/features/widgets/spec";
import { Choice, ColumnChoice, FormatFields } from "./config-fields";
import { useFocusAfterRender } from "./config-focus";
import { PivotFields } from "./pivot-config";
import { duplicateField } from "./pivot-config-model";
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
  panelSaveStatus,
  sortOptions,
  withDimension,
  withoutMissingColumns,
  type SaveStatus,
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
const EMPTY: WidgetConfig = { type: "empty", spec: {} };

export function WidgetConfigForm({
  widget,
  sources,
  datasetId,
  saveError,
  onSave,
}: {
  widget: WidgetView;
  sources: Source[];
  /** null = bukan pemilik (editor, T-016): halaman dataset bukan miliknya, jadi tanpa tautan ke sana. */
  datasetId: string | null;
  /** Alasan simpanan widget ini yang gagal, dari editor (ada sampai simpanan widget ini berhasil). */
  saveError?: string;
  onSave: (type: WidgetType, spec: unknown) => Promise<boolean>;
}) {
  const parsed = parseWidgetConfig(widget.type, widget.spec);
  const [draft, setDraft] = useState<WidgetConfig>(parsed.ok ? parsed.config : EMPTY);
  // reloads: simpanan terakhir mengubah data widget (bukan hanya sakelar filter silang, yang tidak
  // memuat ulang) — teks status tidak menjanjikan "memuat data terbaru" yang tidak terjadi.
  const [saveState, setStatus] = useState<{ status: SaveStatus; reloads: boolean }>({
    status: "idle",
    reloads: true,
  });
  const status = panelSaveStatus(saveState.status, saveError);
  const { reloads } = saveState;
  const [retargeted, setRetargeted] = useState(widget.retargeted === true);
  // Spec tampilan widget retargeted belum tersimpan: simpanan pertama selalu memuat ulang kartu.
  const savedVersion = useRef(
    widget.retargeted ? "" : configVersion(parsed.ok ? parsed.config : EMPTY),
  );
  const memory = useRef<Partial<Record<WidgetType, WidgetConfig>>>({});
  // Draf terbaru untuk callback tertunda (mis. cek "Maks." saat blur) — closure render lama bisa
  // menimpa ketukan yang terjadi sebelum callback itu berjalan (R9-1).
  const latestDraft = useRef(draft);
  // Nomor simpanan terbaru: hasil simpanan lama tidak menimpa status simpanan yang sedang berjalan.
  const saveSeq = useRef(0);
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
    const mine = ++saveSeq.current;
    setStatus({ status: "saving", reloads: true });
    void save.current(next.type, next.spec).then((ok) => {
      const reloads = version !== savedVersion.current;
      if (ok) {
        savedVersion.current = version;
        // Spec tersimpan kini di sheet aktif (sumber panel hanya sheet versi aktif).
        setRetargeted(false);
      }
      if (mine !== saveSeq.current) return;
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
    latestDraft.current = next;
    // Draf baru menggantikan simpanan yang masih tertunda (itu bukan lagi isi panel); draf yang belum
    // bisa disimpan tidak menyimpan apa pun.
    clearTimeout(timer.current);
    pending.current = null;
    if (next.type === "empty" || missingColumns(next, sources).length) return;
    // Sheet spec tidak ada di data aktif (server menolaknya) atau semua kolomnya disembunyikan:
    // tunggu sheet lain dipilih.
    if (!sources.some((s) => s.id === next.spec.sheetId && s.columns.length)) return;
    // Kolom nilai spec lama yang tidak cocok (mis. maks. tanggal di grafik): server menolaknya.
    if (measureMismatch(next, sources)) return;
    if (!parseWidgetConfig(next.type, next.spec).ok) return;
    pending.current = next;
    timer.current = setTimeout(flush, SAVE_DELAY_MS);
  };

  const switchType = (type: Exclude<WidgetType, "empty">) => {
    memory.current[draft.type] = draft;
    const kept = memory.current[type];
    // Aturan sheet sama dengan commit(): sheet hilang atau tanpa kolom terlihat → pilihan bawaan.
    const usable =
      kept &&
      kept.type !== "empty" &&
      sources.some((s) => s.id === kept.spec.sheetId && s.columns.length);
    if (!usable) return commit(defaultConfig(type, sources, draft));
    // Yang diingat berisi nilai yang tidak cocok (spec lama): pilih ulang nilainya saja, sisanya tetap.
    commit(measureMismatch(kept, sources) ? defaultConfig(type, sources, kept) : kept);
  };

  if (!sources.some((s) => s.columns.length)) {
    return (
      <p className="rounded-md bg-muted px-3 py-2 text-sm">
        Dataset ini belum punya data yang siap dipakai.{" "}
        {datasetId ? (
          <>
            <Link
              href={`/datasets/${datasetId}`}
              className="font-medium underline underline-offset-4"
            >
              Unggah atau periksa data
            </Link>
            .
          </>
        ) : (
          "Data dataset diatur oleh pemiliknya."
        )}
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
  // Pivot dengan isian dobel ditolak server: isian itu sendiri memberi tahu alasannya.
  const pivotDup = draft.type === "pivot" && duplicateField(draft.spec) !== null;
  const unsaved = noColumns || missing.length > 0 || measureMismatch(draft, sources) || pivotDup;
  // Baris status berisi alasan gagal simpan (draf yang belum bisa disimpan didahulukan).
  const saveFailed = status === "error" && !unsaved;
  // Kolom yang perlu diganti punya peringatannya sendiri (MissingNotice); simpanan pengganti juga
  // memindahkan spec ke sheet aktif.
  // Prop ikut menentukan: kirim ulang dari toolbar yang berhasil menghapus tanda di kartu.
  const retargetedOnly = retargeted && widget.retargeted === true && !unsaved && !!sheet;

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
          ) : draft.type === "pivot" ? (
            <PivotFields
              spec={draft.spec}
              columns={cols}
              onChange={(spec) => commit({ type: "pivot", spec })}
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
                    onCommit={(topN) => {
                      const field = draft.type;
                      const cur = latestDraft.current;
                      if (cur.type === field) {
                        commit({ ...cur, spec: { ...cur.spec, topN } } as WidgetConfig);
                        return;
                      }
                      const kept = memory.current[field];
                      if (kept && kept.type === field) {
                        memory.current[field] = {
                          ...kept,
                          spec: { ...kept.spec, topN },
                        } as WidgetConfig;
                      }
                    }}
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
            // Gagal simpan: menempel di bawah area gulir panel/lembar, terlihat dari isian mana pun.
            // Bayangan sewarna kartu menutup padding bawah panel (isi tidak mengintip di bawahnya).
            className={
              saveFailed
                ? "sticky bottom-0 flex items-start gap-1.5 bg-card py-2 text-xs text-destructive shadow-[0_--spacing(4)_0_var(--color-card)]"
                : "text-xs text-muted-foreground"
            }
            aria-live="polite"
            data-testid="config-status"
            data-state={status}
          >
            {saveFailed ? (
              <IconAlertCircle size={16} stroke={1.5} aria-hidden className="shrink-0" />
            ) : null}
            {/* Draf yang belum bisa disimpan didahulukan dari hasil simpanan draf sebelumnya. */}
            {status === "saving"
              ? "Menyimpan…"
              : noColumns
                ? noSheet
                  ? "Belum tersimpan — pilih sheet."
                  : "Belum tersimpan — pilih sheet lain."
                : pivotDup
                  ? "Belum tersimpan — perbaiki isian yang ditandai."
                  : unsaved
                    ? "Belum tersimpan — pilih kolom pengganti."
                    : saveFailed
                      ? `Belum tersimpan — ${saveError || "coba ubah lagi."}`
                      : status === "saved"
                        ? reloads
                          ? "Tersimpan. Widget memuat data terbaru."
                          : "Tersimpan."
                        : retargetedOnly
                          ? "Belum tersimpan — pilih “Pakai sheet ini” di atas."
                          : "Perubahan tersimpan otomatis."}
          </p>
        </>
      )}
    </div>
  );
}
