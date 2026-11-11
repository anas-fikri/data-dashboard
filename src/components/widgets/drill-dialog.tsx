"use client";

import { IconFilter, IconFilterOff, IconRefresh, IconX } from "@tabler/icons-react";
import { Dialog } from "radix-ui";
import { useEffect, useRef, useState } from "react";
import { useWidgetFilters } from "@/components/dashboards/filters/filter-context";
import { Button } from "@/components/ui/button";
import { useDashboardColors } from "@/components/widgets/dashboard-colors";
import type { WidgetConfig } from "@/features/widgets/spec";
import { AbsentNote } from "./absent-note";
import { configVersion, requestFilters, withChangeCheck } from "./body-state";
import { SkippedNote } from "./skipped-note";
import { TableView, type TableSort } from "./table-view";
import { useWidgetQuery, type WidgetRequest } from "./widget-query";

/*
 * Klik-tembus grafik (T-d5ev): klik kategori → dialog tabel baris data kategori itu. Data lewat jalur
 * widget /api/query { widgetId, drill: { value }, page, sort, dashboardFilters } — server membangun
 * klausa kategori dari dimensi widget sendiri dan hanya membaca kolom detail widget (D6), jadi viewer
 * tidak pernah mengirim kolom/spec. Dibuka dari tombol "Lihat baris data" kategori terpilih (klik grafik tetap
 * filter silang, v1.15.1) atau langsung dari klik bila filter silang widget mati; tombol "Lepas saringan ini" /
 * "Saring dashboard dengan ini" di sini. Filter dashboard berubah selama terbuka → halaman pertama.
 */
type TableConfig = Extract<WidgetConfig, { type: "table" }>;

export interface DrillTarget {
  /** Nilai mentah kategori (null = kosong) — sama dengan nilai filter silang klik itu. */
  value: string | number | boolean | null;
  /** Label kategori seperti di grafik ("Okt 2026", "(kosong)"). */
  label: string;
  /** Elemen yang membuka dialog (tombol kategori): fokus kembali ke sana saat ditutup. */
  opener?: HTMLElement | null;
}

export function DrillDialog({
  widgetId,
  widgetVersion,
  config,
  title,
  dimensionLabel,
  blankOf,
  target,
  onClose,
  cross,
  fallbackFocus,
}: {
  widgetId: string;
  widgetVersion?: string;
  config: TableConfig;
  title: string;
  dimensionLabel: string;
  /** Ukuran Jumlah kosong (T-bwza): server hanya membuka baris yang kolom ukurannya kosong. */
  blankOf?: string;
  target: DrillTarget | null;
  onClose: () => void;
  /** Filter silang kategori ini (widget dengan filter silang aktif); pressed = sedang menyaring. */
  cross?: { pressed: boolean; toggle: () => void };
  /** Sasaran fokus bila pembukanya hilang saat ditutup (mis. tombol lenyap setelah "Lepas saringan ini"). */
  fallbackFocus?: () => HTMLElement | null;
}) {
  const heading = target ? `${dimensionLabel}: ${target.label}` : "";
  // Dialog terkendali tanpa Dialog.Trigger: Radix tidak tahu pembukanya, jadi fokus dikembalikan sendiri
  // ke tombol kategori (klik grafik di kanvas: tanpa pembuka → perilaku bawaan).
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (target) opener.current = target.opener ?? null;
  }, [target]);
  return (
    <Dialog.Root open={!!target} onOpenChange={(open) => (open ? null : onClose())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay/50" />
        <Dialog.Content
          data-testid="drill-dialog"
          onCloseAutoFocus={(e) => {
            const el = opener.current;
            opener.current = null;
            const to = el?.isConnected ? el : fallbackFocus?.();
            if (to?.isConnected) {
              e.preventDefault();
              to.focus();
            }
          }}
          className="fixed inset-0 z-50 flex flex-col bg-card text-card-foreground md:inset-4 md:rounded-lg md:border md:shadow-lg"
        >
          <div className="flex items-center gap-2 border-b px-3 py-2 md:px-4">
            <Dialog.Title
              className="min-w-0 flex-1 truncate text-base font-semibold"
              title={heading}
            >
              {heading}
            </Dialog.Title>
            {cross ? (
              <Button
                variant="outline"
                className="h-(--control-h-lg) md:h-(--control-h)"
                data-testid="drill-cross"
                onClick={() => {
                  cross.toggle();
                  onClose();
                }}
              >
                {cross.pressed ? <IconFilterOff aria-hidden /> : <IconFilter aria-hidden />}
                <span className="max-md:sr-only">
                  {cross.pressed ? "Lepas saringan ini" : "Saring dashboard dengan ini"}
                </span>
              </Button>
            ) : null}
            <Dialog.Close asChild>
              <Button size="icon-lg" variant="ghost" aria-label="Tutup baris detail">
                <IconX aria-hidden />
              </Button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="border-b px-3 py-1 text-xs text-muted-foreground md:px-4">
            Baris data {title ? `“${title}”` : "widget ini"} untuk kategori ini
            {blankOf ? ` yang dihitung “${blankOf}” (kolomnya kosong)` : ""}, dengan filter
            dashboard yang sedang berlaku.
          </Dialog.Description>
          {target ? (
            <DrillRows
              key={JSON.stringify(target.value)}
              widgetId={widgetId}
              widgetVersion={widgetVersion}
              config={config}
              label={`Baris detail ${heading}`}
              value={target.value}
            />
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DrillRows({
  widgetId,
  widgetVersion,
  config,
  label,
  value,
}: {
  widgetId: string;
  widgetVersion?: string;
  config: TableConfig;
  label: string;
  value: DrillTarget["value"];
}) {
  const dashColors = useDashboardColors();
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<TableSort>(null);
  const cross = useWidgetFilters(widgetId);
  const request: WidgetRequest = {
    widgetId,
    drill: { value },
    page,
    ...(sort ? { sort } : {}),
    ...(cross.filters.length ? { dashboardFilters: cross.filters } : {}),
  };
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
          colors={dashColors}
          sort={sort}
          busy={busy}
          sheet
          label={label}
          onSort={(s) => {
            setSort(s);
            setPage(0);
          }}
          onPage={setPage}
        />
      ) : state.status !== "error" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2 p-4" aria-busy="true">
          <span className="sr-only">Memuat baris detail…</span>
          <div className="h-4 w-1/3 animate-pulse rounded bg-muted motion-reduce:animate-none" />
          <div className="min-h-0 flex-1 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        </div>
      ) : null}
      {data ? (
        <>
          <AbsentNote names={data.absent} />
          <SkippedNote names={data.skippedFilters} />
        </>
      ) : null}
    </div>
  );
}
