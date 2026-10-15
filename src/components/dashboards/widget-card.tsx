"use client";

import { IconAdjustmentsHorizontal, IconChartBar, IconGripVertical } from "@tabler/icons-react";
import { forwardRef, useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { configVersion, type BodyState } from "@/components/widgets/body-state";
import { StaleLabel } from "@/components/widgets/stale-label";
import { WidgetBody } from "@/components/widgets/widget-body";
import type { WidgetRequest } from "@/components/widgets/widget-query";
import type { WidgetView } from "@/features/dashboards/service";
import { cn } from "@/lib/utils";
import {
  CardTitle,
  DataToggleButton,
  HEAD_BUTTON,
  HeadExport,
  NARROW_VIEW,
} from "./widget-card-head";
import { cardConfig, chartOf, toggleMode } from "./widget-card-model";

/*
 * Satu widget di kanvas. Mode lihat: hanya isi. Mode edit: seluruh kepala kartu jadi pegangan seret
 * (layar lebar; tombol di dalamnya tidak memulai seret) dan satu tombol pengaturan — hapus ada di panel
 * agar kartu sempit tetap muat dan tidak ada hapus sekali ketuk. forwardRef + sisa props:
 * react-grid-layout menempelkan style, kelas, dan handler ke anak langsung.
 *
 * Kepala semua kartu setinggi satu tombol (judul ber-line-height tombol) agar judul sebaris rata;
 * "Memperbarui…" di samping judul saat angka dari filter lama masih tampil (stale-label.tsx). Kartu
 * adalah container. Mode lihat < 9rem (2 kolom di 1024; grafik < 9,5rem / < 11rem sentuh —
 * NARROW_VIEW): padding kepala dirapatkan dan judul dua baris kecil, bukan 4–5 huruf di samping tombol
 * data (di kartu < 140 px grafik diganti daftar peringkat, jadi tabel satu-satunya jalan ke baris yang
 * tidak muat). Mode edit: judul tetap terlihat (terpotong, lengkap di title); yang disembunyikan dulu:
 * - tombol ekspor (T-017; juga mode lihat) lalu tombol data — batasnya di widget-card-head.tsx;
 * - ikon pegangan dengan mouse: < 10rem (seluruh kepala tetap pegangan, kursor "grab");
 * - sentuh (ikon pegangan satu-satunya pegangan, 44 px): < 10rem judul pindah ke baris sendiri di
 *   atas pegangan + pengaturan; < 6,5rem ikon pegangan hilang (geser lewat tombol di panel);
 * - < 8rem padding kepala dirapatkan; < 5rem judul hanya untuk pembaca layar.
 */
export const DRAG_HANDLE = "widget-drag-handle";
/** Pegangan seret di layar sentuh: hanya ikon ini (44 px), agar menggeser kepala kartu tetap scroll. */
export const GRIP_HANDLE = "widget-grip";
export const SETTINGS_ATTR = "data-widget-settings";

type Body = { version: string; state: BodyState; stale: boolean }; // status isi per versi spec
type Props = React.HTMLAttributes<HTMLDivElement> & {
  widget: WidgetView;
  editing: boolean;
  draggable: boolean;
  selected: boolean;
  onSettings?: () => void;
};

export const WidgetCard = forwardRef<HTMLDivElement, Props>(function WidgetCard(
  { widget, editing, draggable, selected, onSettings, className, children, ...rest },
  ref,
) {
  const title = widget.title || "Widget tanpa judul";
  const handle = editing && draggable;
  const config = cardConfig(widget.type, widget.spec);
  const chart = config ? chartOf(config.type) : null;
  // Nilai grafik sebagai tabel: tombol di kepala kartu (tidak ikut terpotong di kartu pendek/sempit).
  const [showData, setShowData] = useState(false);
  // Spec baru dianggap memuat sampai isinya melapor (dipanggil hanya saat statusnya berubah).
  const [body, setBody] = useState<Body | null>(null);
  const onState = useCallback(
    (version: string, state: BodyState, stale: boolean) => setBody({ version, state, stale }),
    [],
  );
  // Body query isi kartu (filter + urutan tabel): ekspor membacanya saat dimulai, tanpa render ulang.
  const request = useRef<WidgetRequest | null>(null);
  const onRequest = useCallback((r: WidgetRequest) => void (request.current = r), []);
  const current = config && body?.version === configVersion(config) ? body : null;
  const status = current?.state ?? "loading";
  const mode = chart ? toggleMode(status) : null;
  return (
    <div
      ref={ref}
      data-testid="widget"
      data-widget-id={widget.id}
      className={cn(
        "@container flex md:scroll-mt-[calc(var(--topbar-h)+0.5rem)] flex-col overflow-hidden rounded-lg border bg-card text-card-foreground shadow-xs",
        selected && "ring-2 ring-primary",
        className,
      )}
      {...rest}
    >
      <div
        className={cn(
          "flex items-center gap-1 border-b px-2 py-1.5",
          !editing && NARROW_VIEW.head[chart ? "chart" : "plain"],
          editing && [
            "@max-[8rem]:px-1",
            "@max-[10rem]:any-pointer-coarse:flex-wrap @max-[10rem]:any-pointer-coarse:gap-y-0",
          ],
          handle && [DRAG_HANDLE, "cursor-grab active:cursor-grabbing"],
        )}
      >
        {handle ? (
          <span
            className={cn(
              GRIP_HANDLE,
              "flex size-8 shrink-0 touch-none items-center justify-center text-muted-foreground any-pointer-coarse:size-11",
              "@max-[6.5rem]:hidden @max-[10rem]:not-any-pointer-coarse:hidden",
            )}
            title="Seret kepala kartu untuk memindahkan"
            aria-hidden
          >
            <IconGripVertical size={18} stroke={1.5} />
          </span>
        ) : null}
        <CardTitle title={title} placeholder={!widget.title} editing={editing} chart={!!chart} />
        <StaleLabel stale={!!current?.stale} title={title} />
        {chart && mode ? (
          <DataToggleButton
            chart={chart}
            mode={mode}
            pressed={showData}
            title={title}
            editing={editing}
            onToggle={() => setShowData((s) => !s)}
          />
        ) : null}
        {config ? (
          <HeadExport
            widgetId={widget.id}
            type={config.type}
            title={title}
            editing={editing}
            request={request}
          />
        ) : null}
        {editing ? (
          <Button
            size="icon-sm"
            variant="ghost"
            className={cn("ml-auto", HEAD_BUTTON)}
            aria-label={`Pengaturan ${title}`}
            title={`Pengaturan ${title}`}
            aria-pressed={selected}
            {...{ [SETTINGS_ATTR]: "" }}
            onClick={onSettings}
          >
            <IconAdjustmentsHorizontal aria-hidden />
          </Button>
        ) : null}
      </div>
      {config ? (
        <WidgetBody
          // Widget yang dialihkan ke sheet aktif (T-013): spec tampilan sama sebelum/sesudah disimpan,
          // jadi kunci ini yang memicu query ulang setelah "Pakai sheet ini".
          key={widget.retargeted ? "retargeted" : "stored"}
          widgetId={widget.id}
          widgetVersion={widget.version}
          config={config}
          title={widget.title}
          editing={editing}
          resizable={handle}
          showData={showData}
          onState={onState}
          onRequest={onRequest}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-4 text-center">
          <IconChartBar
            size={28}
            stroke={1.5}
            aria-hidden
            className="shrink-0 text-muted-foreground"
          />
          <p className="text-sm text-muted-foreground @max-[9rem]:hidden">
            {editing
              ? "Widget kosong. Pilih jenis tampilan dan datanya lewat tombol pengaturan."
              : "Widget ini belum berisi data."}
          </p>
        </div>
      )}
      {children}
    </div>
  );
});
