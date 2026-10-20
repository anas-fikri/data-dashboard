/* eslint-disable jsx-a11y/no-redundant-roles, jsx-a11y/no-interactive-element-to-noninteractive-role --
   peran eksplisit (table/rowgroup/row/cell) menjaga semantik tabel saat display diubah ke block/flex
   untuk tampilan kartu; Safari/VoiceOver membuang semantik tabel tanpa ini (pola version-history). */
import { IconHistory, IconInfoCircle } from "@tabler/icons-react";
import type { PeriodOverview } from "@/features/versions/period-manage";
import { LAST_PERIOD_MESSAGE } from "@/features/versions/period-manage-plan";
import { cn } from "@/lib/utils";
import {
  PeriodBusyNote,
  PeriodFeedback,
  PeriodRemove,
  PeriodReupload,
  PeriodRestore,
} from "./period-list-actions";
import { formatJakarta } from "./version-history-status";

/*
 * Daftar periode di kartu Periode (T-056, rencana G-6 §4.7): Periode | Baris per sheet | File |
 * Diunggah oleh | Tanggal | Aksi ("Unggah ulang" dengan periode terisi, "Hapus"), terbaru di atas;
 * lalu periode yang bisa dipulihkan dari versi lama yang masih tersimpan (atau penjelasan mengapa
 * tidak lagi bisa). Tabel bergantung LEBAR KONTAINER (≥ @3xl), di bawahnya tiap periode menjadi kartu.
 */

const TH = "px-3 py-2.5 text-left text-xs font-medium whitespace-nowrap text-muted-foreground";
const CELL = "block @3xl:table-cell @3xl:px-3 @3xl:py-2.5 @3xl:align-top";
/** Label kolom di tampilan kartu (tabel memakai thead). */
const CARD_LABEL = "text-xs text-muted-foreground @3xl:sr-only";
const fmt = (n: number) => n.toLocaleString("id-ID");

function Unknown({ what }: { what: string }) {
  return (
    <>
      <span aria-hidden>—</span>
      <span className="sr-only">{what} tidak diketahui</span>
    </>
  );
}

export function PeriodList({
  datasetId,
  overview,
  busy,
}: {
  datasetId: string;
  overview: PeriodOverview;
  /** Ada versi non-terminal di server: aksi pasti DATASET_BUSY. */
  busy: boolean;
}) {
  const { rows, candidates, baseVersionId } = overview;
  const single = rows.length <= 1;
  return (
    <div className="flex flex-col gap-4" data-testid="period-list">
      <PeriodFeedback>
        <PeriodBusyNote busy={busy} />
        <div className="@container -mx-5 border-y">
          <table role="table" className="block w-full text-sm @3xl:table @3xl:border-collapse">
            <caption className="sr-only">Periode di data aktif, terbaru di atas</caption>
            <thead
              role="rowgroup"
              className="sr-only @3xl:not-sr-only @3xl:table-header-group @3xl:border-b @3xl:bg-muted/50"
            >
              <tr role="row">
                <th role="columnheader" scope="col" className={cn(TH, "pl-5")}>
                  Periode
                </th>
                <th role="columnheader" scope="col" className={TH}>
                  Baris per sheet
                </th>
                <th role="columnheader" scope="col" className={TH}>
                  File
                </th>
                <th role="columnheader" scope="col" className={TH}>
                  Diunggah oleh
                </th>
                <th role="columnheader" scope="col" className={TH}>
                  Tanggal
                </th>
                <th role="columnheader" scope="col" className={cn(TH, "pr-5")}>
                  <span className="sr-only">Aksi</span>
                </th>
              </tr>
            </thead>
            <tbody role="rowgroup" className="block @3xl:table-row-group">
              {rows.map((r) => (
                <tr
                  key={r.key}
                  role="row"
                  data-testid="period-row"
                  data-period={r.key}
                  className="flex flex-wrap items-start gap-x-4 gap-y-2 border-b px-5 py-3 last:border-b-0 @3xl:table-row @3xl:p-0"
                >
                  <th
                    role="rowheader"
                    scope="row"
                    className={cn(CELL, "basis-full text-left font-medium @3xl:pl-5")}
                    data-testid="period-label"
                  >
                    {r.label}
                  </th>
                  <td role="cell" className={cn(CELL, "tabular-nums")} data-testid="period-rows">
                    <span className={cn(CARD_LABEL, "block")}>Baris per sheet</span>
                    {r.sheets.length === 1 ? (
                      fmt(r.rows)
                    ) : (
                      <ul className="flex flex-col">
                        {r.sheets.map((s) => (
                          <li key={s.name} className="whitespace-nowrap">
                            <span className="text-muted-foreground">{s.name}:</span> {fmt(s.rows)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td role="cell" className={cn(CELL, "min-w-0 @3xl:max-w-56")}>
                    <span className={cn(CARD_LABEL, "block")}>File</span>
                    {r.files.length ? (
                      <span className="block [overflow-wrap:anywhere]" data-testid="period-file">
                        {r.files.join(", ")}
                      </span>
                    ) : (
                      <Unknown what="File" />
                    )}
                  </td>
                  <td role="cell" className={CELL}>
                    <span className={cn(CARD_LABEL, "block")}>Diunggah oleh</span>
                    {r.uploadedBy.length ? (
                      <span
                        className="block [overflow-wrap:anywhere]"
                        data-testid="period-uploader"
                      >
                        {r.uploadedBy.join(", ")}
                      </span>
                    ) : (
                      <Unknown what="Pengunggah" />
                    )}
                  </td>
                  <td
                    role="cell"
                    className={cn(CELL, "text-muted-foreground @3xl:whitespace-nowrap")}
                  >
                    <span className={cn(CARD_LABEL, "block")}>Tanggal</span>
                    <time dateTime={r.uploadedAt}>{formatJakarta(r.uploadedAt)}</time>
                  </td>
                  <td
                    role="cell"
                    className={cn(
                      CELL,
                      "basis-full empty:hidden @3xl:w-px @3xl:py-1.5 @3xl:pr-5 @3xl:empty:table-cell",
                    )}
                  >
                    <span className="flex flex-col gap-2 md:flex-row @3xl:justify-end">
                      <PeriodReupload
                        href={`/datasets/${datasetId}?unggah=${r.start}#unggah`}
                        label={r.label}
                        busy={busy}
                      />
                      {single ? null : (
                        <PeriodRemove
                          datasetId={datasetId}
                          baseVersionId={baseVersionId}
                          periodKey={r.key}
                          label={r.label}
                          rows={r.rows}
                          sheetCount={r.sheets.length}
                          busy={busy}
                        />
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {single ? (
          <p
            className="flex items-start gap-1.5 text-sm text-muted-foreground"
            data-testid="period-last-note"
          >
            <IconInfoCircle size={20} stroke={1.5} aria-hidden className="shrink-0" />
            <span>
              {LAST_PERIOD_MESSAGE}{" "}
              <a
                href="#unggah"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Ke panel unggah
              </a>
            </span>
          </p>
        ) : null}

        {candidates.length ? (
          <section aria-labelledby="period-restore-title" className="flex flex-col gap-3">
            <div>
              <h3 id="period-restore-title" className="flex items-center gap-1.5 font-medium">
                <IconHistory size={20} stroke={1.5} aria-hidden />
                Pulihkan periode
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Periode yang dihapus, diganti, atau dilepas bisa dipulihkan selama versi lama yang
                memuatnya masih tersimpan.
              </p>
            </div>
            <ul
              className="flex flex-col divide-y rounded-md border"
              data-testid="period-restore-list"
            >
              {candidates.map((c) => (
                <li
                  key={c.key}
                  className="flex flex-col gap-2 p-3 text-sm md:flex-row md:items-center md:justify-between"
                  data-testid="period-candidate"
                  data-period={c.key}
                  data-available={c.source ? "true" : "false"}
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {c.label}{" "}
                      <span className="font-normal text-muted-foreground">
                        ·{" "}
                        {c.state === "MISSING"
                          ? "tidak ada di data aktif"
                          : "isi data aktif berbeda"}
                      </span>
                    </p>
                    {c.source ? (
                      <p className="text-muted-foreground [overflow-wrap:anywhere]">
                        Dari versi “{c.source.title ?? "tanpa nama"}” · {fmt(c.source.rows)} baris ·{" "}
                        <time dateTime={c.source.at}>{formatJakarta(c.source.at)}</time>
                      </p>
                    ) : (
                      <p className="text-muted-foreground" data-testid="period-candidate-why">
                        {c.unavailable}
                      </p>
                    )}
                  </div>
                  {c.source ? (
                    <PeriodRestore
                      datasetId={datasetId}
                      baseVersionId={baseVersionId}
                      periodKey={c.key}
                      label={c.label}
                      sourceVersionId={c.source.id}
                      sourceTitle={c.source.title ?? "tanpa nama"}
                      rows={c.source.rows}
                      sheets={c.source.sheets}
                      replaces={c.state === "CHANGED"}
                      busy={busy}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </PeriodFeedback>
    </div>
  );
}
