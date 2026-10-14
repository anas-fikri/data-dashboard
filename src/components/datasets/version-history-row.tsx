/* eslint-disable jsx-a11y/no-interactive-element-to-noninteractive-role --
   peran eksplisit (row/cell) menjaga semantik tabel saat display diubah ke block/flex untuk
   tampilan kartu; Safari/VoiceOver membuang semantik tabel tanpa ini (pola users-table.tsx). */
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconCircleCheckFilled,
  IconFileOff,
  IconLoader2,
  IconPlayerPause,
  IconRoute,
} from "@tabler/icons-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { formatBytes } from "@/features/uploads/client";
import type { VersionRow } from "@/features/versions/types";
import { cn } from "@/lib/utils";
import { VersionActivate } from "./version-history-actions";
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
  processing: <IconLoader2 className="motion-safe:animate-spin" />,
  uploading: <IconPlayerPause />,
};

/*
 * Sel tabel ≥ @3xl; di bawahnya baris menjadi kartu (flex-wrap): nama file, status (+ alasan), waktu
 * dan ukuran, lalu tombol aksi selebar kartu di ponsel. Pola users-table.tsx (T-019).
 */
const CELL = "block @3xl:table-cell @3xl:px-3 @3xl:py-2.5 @3xl:align-top";

export function VersionHistoryRow({
  datasetId,
  v,
  busy,
}: {
  datasetId: string;
  v: VersionRow;
  /** Ada versi yang sedang diunggah/diproses/menunggu pemetaan: aktivasi pasti DATASET_BUSY. */
  busy: boolean;
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
          !canActivate && "hidden @3xl:table-cell",
        )}
      >
        {canActivate ? (
          <VersionActivate datasetId={datasetId} versionId={v.id} fileName={name} />
        ) : null}
      </td>
    </tr>
  );
}
