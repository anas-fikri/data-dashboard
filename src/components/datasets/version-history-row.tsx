/* eslint-disable jsx-a11y/no-interactive-element-to-noninteractive-role --
   peran eksplisit (row/cell) menjaga semantik tabel saat display diubah ke block/flex untuk
   tampilan kartu; Safari/VoiceOver membuang semantik tabel tanpa ini (pola users-table.tsx). */
import {
  IconAlertTriangle,
  IconCalendarStats,
  IconChecklist,
  IconCircleCheck,
  IconCircleCheckFilled,
  IconFileOff,
  IconLoader2,
  IconPlayerPause,
  IconRoute,
} from "@tabler/icons-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/features/uploads/client";
import type { VersionRow } from "@/features/versions/types";
import { cn } from "@/lib/utils";
import { VersionActivate, VersionCancelPending } from "./version-history-actions";
import {
  formatJakarta,
  versionStatusView,
  versionTime,
  type VersionKind,
} from "./version-history-status";

/** Ikon status (dekoratif; teks pil sudah menyebut status). Aktif = ikon terisi (state terpilih). */
const ICONS: Record<VersionKind, ReactNode> = {
  active: <IconCircleCheckFilled />,
  ready: <IconCircleCheck />,
  failed: <IconAlertTriangle />,
  mapping: <IconRoute />,
  confirm: <IconChecklist />,
  processing: <IconLoader2 className="motion-safe:animate-spin" />,
  uploading: <IconPlayerPause />,
};

/*
 * Sel tabel ≥ @3xl; di bawahnya baris menjadi kartu (flex-wrap): nama file, status (+ alasan), waktu
 * dan ukuran, lalu tombol aksi selebar kartu di ponsel. Pola users-table.tsx (T-019).
 */
const CELL = "block @3xl:table-cell @3xl:px-3 @3xl:py-2.5 @3xl:align-top";

/*
 * Sama dengan ROW_CTA (44px dan selebar kartu di ponsel). Ditulis ulang di sini: nilai yang diekspor
 * modul "use client" terbaca sebagai referensi klien di komponen server, bukan string kelas.
 */
const ROW_LINK = "h-(--control-h-lg) w-full md:h-(--control-h-sm) md:w-auto";

/** Aksi baris versi yang menunggu pemetaan (T-014): petakan, atau status saat sedang diterapkan. */
function MappingAction({
  datasetId,
  name,
  applying,
}: {
  datasetId: string;
  name: string;
  applying: boolean;
}) {
  if (applying) {
    return (
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground @3xl:h-(--control-h-sm) @3xl:whitespace-nowrap">
        <IconLoader2
          size={16}
          stroke={1.5}
          aria-hidden
          className="shrink-0 motion-safe:animate-spin"
        />
        Menerapkan pemetaan…
      </span>
    );
  }
  return (
    <Button asChild variant="outline" size="sm" className={ROW_LINK}>
      <Link href={`/datasets/${datasetId}/pemetaan`} data-testid="version-map">
        <IconRoute aria-hidden />
        Petakan kolom<span className="sr-only"> versi “{name}”</span>
      </Link>
    </Button>
  );
}

export function VersionHistoryRow({
  datasetId,
  v,
  busy,
  mappingApplying,
}: {
  datasetId: string;
  v: VersionRow;
  /** Ada versi yang sedang diunggah/diproses/menunggu pemetaan: aktivasi pasti DATASET_BUSY. */
  busy: boolean;
  /** Pemetaan versi yang menunggu sedang diterapkan (T-014). */
  mappingApplying: boolean;
}) {
  const canActivate = v.canActivate && !busy;
  const status = versionStatusView(v);
  const time = versionTime(v);
  const name = v.fileName ?? "Tanpa nama file";
  return (
    <tr
      role="row"
      data-testid="version-row"
      data-version-id={v.id}
      data-status={v.status}
      data-active={v.active ? "true" : "false"}
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b px-5 py-3 last:border-b-0 @3xl:table-row @3xl:p-0"
    >
      <td role="cell" className={cn(CELL, "min-w-0 basis-full @3xl:w-full @3xl:max-w-0 @3xl:pl-5")}>
        <span className="block truncate font-medium" title={name}>
          {name}
        </span>
        {v.sourceDeleted ? (
          <span
            className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"
            data-testid="version-source-deleted"
          >
            <IconFileOff size={16} stroke={1.5} aria-hidden className="shrink-0" />
            File asli sudah dihapus
          </span>
        ) : null}
        {v.note ? (
          <span
            className="mt-0.5 flex items-start gap-1 text-xs text-muted-foreground [overflow-wrap:anywhere]"
            data-testid="version-note"
          >
            <IconCalendarStats size={16} stroke={1.5} aria-hidden className="shrink-0" />
            {v.note}
          </span>
        ) : null}
      </td>
      {/* Lebar minimum hanya bila ada alasan: kolom tabel berbagi lebar, jadi satu baris beralasan
          sudah melebarkan seluruh kolom; tanpa alasan kolom selebar pil dan nama file tidak terpotong. */}
      <td role="cell" className={cn(CELL, v.message && "basis-full @3xl:min-w-64")}>
        <Badge tone={status.tone} icon={ICONS[status.kind]}>
          {status.label}
        </Badge>
        {v.message ? (
          <span
            className="mt-1 block text-sm text-muted-foreground [overflow-wrap:anywhere]"
            data-testid="version-message"
          >
            {v.message}
          </span>
        ) : null}
      </td>
      <td
        role="cell"
        className={cn(CELL, "text-sm text-muted-foreground @3xl:w-px @3xl:whitespace-nowrap")}
      >
        <span className={cn(time.verb === "Diproses" && "@3xl:sr-only")}>{time.verb} </span>
        <time dateTime={time.iso} className="whitespace-nowrap">
          {formatJakarta(time.iso)}
        </time>
      </td>
      <td
        role="cell"
        className={cn(
          CELL,
          "whitespace-nowrap text-sm text-muted-foreground tabular-nums @3xl:w-px @3xl:text-right",
        )}
      >
        {v.sizeBytes !== null ? (
          formatBytes(v.sizeBytes)
        ) : (
          <>
            <span aria-hidden>—</span>
            <span className="sr-only">Ukuran tidak diketahui</span>
          </>
        )}
      </td>
      <td
        role="cell"
        className={cn(
          CELL,
          "order-last basis-full md:ms-auto md:basis-auto @3xl:w-px @3xl:py-1.5 @3xl:pr-5",
          // Sel kosong (tidak bisa diaktifkan, atau "Aktifkan" disembunyikan selama unggahan di tab
          // ini) tidak memakan baris kartu; di tabel tetap sel agar garis baris utuh.
          "empty:hidden @3xl:empty:table-cell",
        )}
      >
        {canActivate ? (
          <VersionActivate
            datasetId={datasetId}
            versionId={v.id}
            fileName={name}
            warning={v.rollbackWarning ?? null}
          />
        ) : v.canDiscard && v.status === "AWAITING_CONFIRM" ? (
          <span className="flex flex-col gap-2 md:flex-row">
            <Button asChild size="sm" className={ROW_LINK}>
              <Link href={`/datasets/${datasetId}/tinjau/${v.id}`} data-testid="version-review">
                <IconChecklist aria-hidden />
                Tinjau perubahan<span className="sr-only"> “{name}”</span>
              </Link>
            </Button>
            <VersionCancelPending datasetId={datasetId} versionId={v.id} fileName={name} />
          </span>
        ) : v.canDiscard ? (
          <MappingAction datasetId={datasetId} name={name} applying={mappingApplying} />
        ) : null}
      </td>
    </tr>
  );
}
