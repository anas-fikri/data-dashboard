"use client";

import { IconAlertTriangle, IconCopy, IconLoader2, IconRefresh, IconX } from "@tabler/icons-react";
import { Dialog } from "radix-ui";
import { useEffect, useState } from "react";
import { TYPE_LABEL } from "@/components/schema/labels";
import { Button } from "@/components/ui/button";
import type { NumberFormat } from "@/features/widgets/spec";
import { excelValue, writeClipboard, type DecimalSep } from "./grid-copy";
import { fetchCell, type CellInfo, type Fetch } from "./grid-fetch";
import { colLetter, displayCell, fmtInt, type GridColumn } from "./grid-model";

/*
 * Panel "Isi sel" (T-045 AC1, F2/Enter pada sel): isi penuh dari GET /api/sheets/:id/cell (≤ 32.767
 * karakter), nilai asli + "Tidak terbaca sebagai <tipe>" bila sel gagal dibaca sebagai tipenya, dan
 * sumbernya "file · baris N · periode". Dimuat lazy (chunk terpisah dari chunk grid). Dialog Radix:
 * fokus terkunci, Escape menutup, fokus kembali ke sel asal (returnFocus). Ponsel: lembar dari bawah.
 */
export interface CellTarget {
  sheetId: string;
  versionId: string;
  column: GridColumn;
  /** Identitas baris (`_row`) dan nomor baris di tampilan. */
  row: number;
  n: number;
  format?: NumberFormat;
  returnFocus: () => boolean;
}

/** "maret-2026.xlsx · baris 1.234 · Maret 2026" (periode hanya bila ada). */
export function sourceText(s: CellInfo["source"]): string {
  return [s.fileName ?? "File sumber tidak diketahui", `baris ${fmtInt(s.srcRow)}`, s.period]
    .filter(Boolean)
    .join(" · ");
}

export default function GridCellPanel({
  target,
  decimal,
  onClose,
  onAnnounce,
}: {
  target: CellTarget | null;
  decimal: DecimalSep;
  onClose: () => void;
  onAnnounce: (text: string) => void;
}) {
  // Saat menutup, `target` sudah null sebelum Radix memanggil onCloseAutoFocus: simpan yang terakhir.
  const [last, setLast] = useState<CellTarget | null>(target);
  if (target && target !== last) setLast(target);
  const t = target ?? last;
  return (
    <Dialog.Root open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay/40" />
        <Dialog.Content
          data-testid="grid-cell-panel"
          aria-describedby={undefined}
          onCloseAutoFocus={(e) => {
            if (last?.returnFocus()) e.preventDefault();
          }}
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-lg border bg-card shadow-lg md:top-1/2 md:bottom-auto md:-translate-y-1/2 md:rounded-lg"
        >
          {t ? (
            <>
              <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
                <Dialog.Title className="min-w-0 truncate text-base font-semibold">
                  Isi sel {colLetter(t.column.pos)}
                  {fmtInt(t.n)}: {t.column.name}
                </Dialog.Title>
                <Dialog.Close asChild>
                  <Button size="icon-lg" variant="ghost" aria-label="Tutup Isi sel">
                    <IconX aria-hidden />
                  </Button>
                </Dialog.Close>
              </div>
              <CellBody
                key={`${t.row}:${t.column.pos}`}
                target={t}
                decimal={decimal}
                onAnnounce={onAnnounce}
              />
            </>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function CellBody({
  target,
  decimal,
  onAnnounce,
}: {
  target: CellTarget;
  decimal: DecimalSep;
  onAnnounce: (text: string) => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [res, setRes] = useState<{ attempt: number; r: Fetch<CellInfo> } | null>(null);
  const { sheetId, versionId, row, column } = target;

  useEffect(() => {
    const ctl = new AbortController();
    void fetchCell(sheetId, { versionId, row, pos: column.pos }, ctl.signal).then((r) => {
      if (r && !ctl.signal.aborted) setRes({ attempt, r });
    });
    return () => ctl.abort();
  }, [sheetId, versionId, row, column.pos, attempt]);

  const r = res && res.attempt === attempt ? res.r : null;
  if (!r) {
    return (
      <p className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground" role="status">
        <IconLoader2 size={20} stroke={1.5} aria-hidden className="motion-safe:animate-spin" />
        Memuat isi sel…
      </p>
    );
  }
  if (!r.ok) {
    return (
      <div className="flex flex-col gap-3 px-4 py-4" role="alert">
        <p className="flex items-start gap-2 text-sm">
          <IconAlertTriangle size={20} stroke={1.5} aria-hidden className="mt-px shrink-0" />
          {r.message}
        </p>
        {r.reload ? null : (
          <Button
            variant="outline"
            className="h-(--control-h-lg) self-start md:h-(--control-h)"
            onClick={() => setAttempt((n) => n + 1)}
          >
            <IconRefresh aria-hidden />
            Coba lagi
          </Button>
        )}
      </div>
    );
  }

  const cell = r.data;
  const shown = cell.castFailed
    ? null
    : (displayCell(cell.value, column.type, target.format) ?? null);
  const copyText = cell.castFailed
    ? excelValue(cell.raw, "text", decimal)
    : excelValue(cell.value, column.type, decimal);
  const copy = () =>
    writeClipboard(copyText).then(
      () => onAnnounce("Isi sel disalin"),
      () => onAnnounce("Gagal menyalin. Izinkan akses papan klip lalu coba lagi."),
    );
  const label = TYPE_LABEL[column.type].toLowerCase();

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
        {cell.castFailed ? (
          <div
            className="flex flex-col gap-2 rounded-md border border-warning/50 bg-warning/15 px-3 py-2"
            data-testid="grid-cell-castfail"
          >
            <p className="flex items-start gap-2 text-sm font-medium">
              <IconAlertTriangle size={20} stroke={1.5} aria-hidden className="mt-px shrink-0" />
              Tidak terbaca sebagai {label}
            </p>
            <p className="text-sm text-muted-foreground">Nilai asli di file:</p>
            <p className="text-sm break-words whitespace-pre-wrap" data-testid="grid-cell-raw">
              {cell.raw}
            </p>
          </div>
        ) : shown === null ? (
          <p className="text-sm text-muted-foreground italic" data-testid="grid-cell-value">
            (kosong)
          </p>
        ) : (
          <p
            className="text-sm break-words whitespace-pre-wrap tabular-nums"
            data-testid="grid-cell-value"
          >
            {shown}
          </p>
        )}
        {column.type === "text" && typeof cell.value === "string" ? (
          <p className="text-xs text-muted-foreground">{fmtInt(cell.value.length)} karakter</p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Sumber: </span>
          <span data-testid="grid-cell-source">{sourceText(cell.source)}</span>
        </p>
      </div>
      <div className="flex flex-col gap-2 border-t px-4 py-3 md:flex-row-reverse">
        <Button
          className="h-(--control-h-lg) w-full md:h-(--control-h) md:w-auto"
          leadingIcon={<IconCopy aria-hidden />}
          data-testid="grid-cell-copy"
          onClick={() => void copy()}
          disabled={copyText === ""}
        >
          Salin isi
        </Button>
      </div>
    </>
  );
}
