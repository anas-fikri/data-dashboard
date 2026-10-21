"use client";

import { IconArrowsMaximize, IconRefresh, IconTable, IconX } from "@tabler/icons-react";
import Link from "next/link";
import { Dialog } from "radix-ui";
import { useState } from "react";
import { useWidgetFilters } from "@/components/dashboards/filters/filter-context";
import { Button } from "@/components/ui/button";
import type { WidgetConfig } from "@/features/widgets/spec";
import { AbsentNote, IgnoredShowAsNote } from "./absent-note";
import { configVersion, requestFilters, widgetRequest, withChangeCheck } from "./body-state";
import { SkippedNote } from "./skipped-note";
import { TableView, type TableSort } from "./table-view";
import { useWidgetQuery, type WidgetRequest } from "./widget-query";

/*
 * "Perbesar" widget tabel (T-047, rencana G-6 §3.1): tabel layar penuh bergaya lembar kerja untuk semua
 * peran. Data tetap lewat jalur widget /api/query {widgetId, dashboardFilters, page, sort} — sama dengan
 * kartu — jadi viewer hanya melihat kolom widget (D6); tidak ada endpoint sheet dan tidak ada AG Grid
 * (chunk grid tidak boleh ikut rute dashboard). Pemilik/editor mendapat tautan "Buka di Lihat data"
 * (`dataHref`); viewer tidak. Dibuka dengan halaman/urutan kartu saat itu; filter dashboard berubah
 * selama terbuka → halaman pertama (pola WidgetBody).
 */
type TableConfig = Extract<WidgetConfig, { type: "table" }>;

interface Props {
  widgetId: string;
  widgetVersion?: string;
  config: TableConfig;
  title: string;
  /** Tautan Lihat data sheet widget ini; null untuk viewer. */
  dataHref: string | null;
  /** Body query kartu saat ini (halaman + urutan awal). */
  request: { readonly current: WidgetRequest | null };
  className?: string;
}

export function TableExpand({ request, className, ...props }: Props) {
  const [open, setOpen] = useState(false);
  const [initial, setInitial] = useState<{ page: number; sort: TableSort }>({
    page: 0,
    sort: null,
  });
  const label = props.title || "widget";
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button
          size="icon-sm"
          variant="ghost"
          className={className}
          aria-label={`Perbesar ${label}`}
          title="Perbesar"
          data-testid="widget-expand"
          data-head-control
          onClick={() =>
            setInitial({
              page: request.current?.page ?? 0,
              sort: request.current?.sort ?? null,
            })
          }
        >
          <IconArrowsMaximize aria-hidden />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay/50" />
        <Dialog.Content
          data-testid="widget-expanded"
          className="fixed inset-0 z-50 flex flex-col bg-card text-card-foreground md:inset-4 md:rounded-lg md:border md:shadow-lg"
        >
          <div className="flex items-center gap-2 border-b px-3 py-2 md:px-4">
            <Dialog.Title className="min-w-0 flex-1 truncate text-base font-semibold" title={label}>
              {label}
            </Dialog.Title>
            {props.dataHref ? (
              <Button asChild variant="outline" className="h-(--control-h-lg) md:h-(--control-h)">
                <Link href={props.dataHref} data-testid="widget-expand-data-link">
                  <IconTable aria-hidden />
                  <span className="max-md:sr-only">Buka di Lihat data</span>
                </Link>
              </Button>
            ) : null}
            <Dialog.Close asChild>
              <Button size="icon-lg" variant="ghost" aria-label="Tutup tampilan besar">
                <IconX aria-hidden />
              </Button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="border-b px-3 py-1 text-xs text-muted-foreground md:px-4">
            Tampilan baca-saja kolom tabel ini, dengan filter dashboard yang sedang berlaku.
          </Dialog.Description>
          <Expanded {...props} initial={initial} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Expanded({
  widgetId,
  widgetVersion,
  config,
  title,
  initial,
}: Omit<Props, "request" | "className" | "dataHref"> & {
  initial: { page: number; sort: TableSort };
}) {
  const [page, setPage] = useState(initial.page);
  const [sort, setSort] = useState<TableSort>(initial.sort);
  const cross = useWidgetFilters(widgetId);
  const request = widgetRequest(widgetId, "table", page, sort, cross.filters);
  const filterKey = requestFilters(request);
  const [seenFilters, setSeenFilters] = useState(filterKey);
  if (seenFilters !== filterKey) {
    setSeenFilters(filterKey);
    setPage(0);
  }
  const query = useWidgetQuery(request, configVersion(config));
  const state = withChangeCheck(query.state, widgetVersion ? [widgetVersion] : []);
  // Data lama hanya boleh tampil di bawah galat bila filternya sama (ganti halaman/urutan gagal).
  const data = state.data && state.filters === filterKey ? state.data : undefined;
  const busy = state.status === "loading";

  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-busy={busy || undefined}>
      {state.status === "error" ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 border-b px-3 py-2 text-sm text-destructive md:px-4"
        >
          <span className="min-w-0 flex-1">{state.message}</span>
          {state.code === "CHANGED" ? (
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
              <IconRefresh aria-hidden />
              Muat ulang
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={query.retry}>
              <IconRefresh aria-hidden />
              Coba lagi
            </Button>
          )}
        </div>
      ) : null}
      {data && !(state.status === "error" && state.code === "CHANGED") ? (
        <TableView
          data={data}
          positions={config.spec.columns}
          format={config.spec.format}
          formatColumns={config.spec.formatColumns}
          sort={sort}
          busy={busy}
          sheet
          label={/^tabel\b/i.test(title) ? title : `Tabel ${title || "widget"}`}
          onSort={(s) => {
            setSort(s);
            setPage(0);
          }}
          onPage={setPage}
        />
      ) : state.status !== "error" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2 p-4" aria-busy="true">
          <span className="sr-only">Memuat data tabel…</span>
          <div className="h-4 w-1/3 animate-pulse rounded bg-muted motion-reduce:animate-none" />
          <div className="min-h-0 flex-1 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        </div>
      ) : null}
      {data ? (
        <>
          <AbsentNote names={data.absent} />
          <IgnoredShowAsNote labels={data.ignoredShowAs} />
          <SkippedNote names={data.skippedFilters} />
        </>
      ) : null}
    </div>
  );
}
