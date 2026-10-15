"use client";

import {
  IconArrowBackUp,
  IconCheck,
  IconCloudCheck,
  IconCloudUpload,
  IconCloudX,
  IconPlus,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { isFrozen, type SaveState } from "./use-dashboard-editor";

/*
 * Toolbar mode edit: tambah widget (aksi utama), urungkan satu langkah, status simpan otomatis
 * (diumumkan sopan ke pembaca layar), dan selesai (menyimpan dulu sebelum kembali ke mode lihat).
 * 768–1279 px: status turun ke baris sendiri agar tombol tidak meluber. Setelah STALE (diubah di
 * tab/perangkat lain) atau akses edit berubah (T-016) tambah dan urungkan dinonaktifkan; tombol muat
 * ulang ada di peringatan kanvas.
 */
const UNDO_LABEL = {
  layout: "Urungkan perubahan tata letak",
  add: "Urungkan tambah widget",
  delete: "Urungkan hapus widget",
} as const;
export const UNDO_ATTR = "data-canvas-undo";
const icon = "shrink-0";

export function CanvasToolbar({
  save,
  undoKind,
  adding,
  finishing,
  onAdd,
  onUndo,
  onRetry,
  onDone,
}: {
  save: SaveState;
  undoKind: keyof typeof UNDO_LABEL | null;
  adding: boolean;
  finishing: boolean;
  onAdd: () => void;
  onUndo: () => void;
  onRetry: () => void;
  onDone: () => void;
}) {
  const phone = "h-(--control-h-lg) w-full md:h-(--control-h) md:w-auto";
  const frozen = isFrozen(save);
  return (
    <div
      className="flex flex-col gap-3 rounded-lg border bg-card p-3 md:flex-row md:flex-wrap md:items-center"
      data-testid="canvas-toolbar"
    >
      <div className="flex flex-col gap-2 md:flex-row">
        <Button
          className={phone}
          pending={adding}
          disabled={frozen}
          leadingIcon={<IconPlus aria-hidden />}
          onClick={onAdd}
        >
          Tambah widget
        </Button>
        <Button
          variant="outline"
          className={phone}
          disabled={!undoKind || frozen}
          leadingIcon={<IconArrowBackUp aria-hidden />}
          onClick={onUndo}
          {...{ [UNDO_ATTR]: "" }}
        >
          {undoKind ? UNDO_LABEL[undoKind] : "Urungkan"}
        </Button>
      </div>

      <p
        role="status"
        aria-live="polite"
        data-testid="save-state"
        data-state={save}
        className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground md:order-last md:basis-full xl:order-none xl:ml-auto xl:basis-auto"
      >
        {save === "saved" ? (
          <>
            <IconCloudCheck size={18} stroke={1.5} aria-hidden className={`${icon} text-success`} />
            Semua perubahan tersimpan
          </>
        ) : save === "error" ? (
          <>
            <IconCloudX size={18} stroke={1.5} aria-hidden className={`${icon} text-destructive`} />
            <span className="text-foreground">Belum tersimpan.</span>
            <Button size="sm" variant="link" className="h-auto p-0" onClick={onRetry}>
              Coba lagi
            </Button>
          </>
        ) : frozen ? (
          <>
            <IconCloudX size={18} stroke={1.5} aria-hidden className={`${icon} text-destructive`} />
            <span className="text-foreground">
              {save === "denied" ? "Akses edit berubah." : "Diubah di tab atau perangkat lain."}
            </span>
          </>
        ) : (
          <>
            <IconCloudUpload
              size={18}
              stroke={1.5}
              aria-hidden
              className={`${icon} text-primary`}
            />
            Menyimpan…
          </>
        )}
      </p>

      <Button
        variant="outline"
        className={`${phone} md:ml-auto xl:ml-0`}
        pending={finishing}
        leadingIcon={<IconCheck aria-hidden />}
        onClick={onDone}
      >
        Selesai
      </Button>
    </div>
  );
}
