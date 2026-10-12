"use client";

import {
  IconArrowBackUp,
  IconCheck,
  IconCloudCheck,
  IconCloudUpload,
  IconCloudX,
  IconPlus,
  IconRefresh,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import type { SaveState } from "./use-dashboard-editor";

/*
 * Toolbar mode edit: tambah widget (aksi utama), urungkan satu langkah, status simpan otomatis
 * (diumumkan sopan ke pembaca layar), dan selesai (menyimpan dulu sebelum kembali ke mode lihat).
 */
const UNDO_LABEL = {
  layout: "Urungkan pindah/ubah ukuran",
  add: "Urungkan tambah widget",
  delete: "Urungkan hapus widget",
} as const;

export function CanvasToolbar({
  save,
  undoKind,
  adding,
  finishing,
  onAdd,
  onUndo,
  onRetry,
  onReload,
  onDone,
}: {
  save: SaveState;
  undoKind: keyof typeof UNDO_LABEL | null;
  adding: boolean;
  finishing: boolean;
  onAdd: () => void;
  onUndo: () => void;
  onRetry: () => void;
  onReload: () => void;
  onDone: () => void;
}) {
  const phone = "h-(--control-h-lg) w-full md:h-(--control-h) md:w-auto";
  return (
    <div
      className="flex flex-col gap-3 rounded-lg border bg-card p-3 md:flex-row md:items-center"
      data-testid="canvas-toolbar"
    >
      <div className="flex flex-col gap-2 md:flex-row">
        <Button
          className={phone}
          pending={adding}
          leadingIcon={<IconPlus aria-hidden />}
          onClick={onAdd}
        >
          Tambah widget
        </Button>
        <Button
          variant="outline"
          className={phone}
          disabled={!undoKind}
          leadingIcon={<IconArrowBackUp aria-hidden />}
          onClick={onUndo}
        >
          {undoKind ? UNDO_LABEL[undoKind] : "Urungkan"}
        </Button>
      </div>

      <p
        role="status"
        aria-live="polite"
        data-testid="save-state"
        data-state={save}
        className="flex items-center gap-2 text-sm text-muted-foreground md:ml-auto"
      >
        {save === "saved" ? (
          <>
            <IconCloudCheck size={18} stroke={1.5} aria-hidden className="text-success" />
            Semua perubahan tersimpan
          </>
        ) : save === "error" ? (
          <>
            <IconCloudX size={18} stroke={1.5} aria-hidden className="text-destructive" />
            <span className="text-foreground">Belum tersimpan.</span>
            <Button size="sm" variant="link" className="h-auto p-0" onClick={onRetry}>
              Coba lagi
            </Button>
          </>
        ) : save === "stale" ? (
          <>
            <IconCloudX size={18} stroke={1.5} aria-hidden className="text-destructive" />
            <span className="text-foreground">Diubah di tab lain.</span>
            <Button
              size="sm"
              variant="link"
              className="h-auto p-0"
              leadingIcon={<IconRefresh aria-hidden />}
              onClick={onReload}
            >
              Muat ulang
            </Button>
          </>
        ) : (
          <>
            <IconCloudUpload size={18} stroke={1.5} aria-hidden className="text-primary" />
            Menyimpan…
          </>
        )}
      </p>

      <Button
        variant="outline"
        className={phone}
        pending={finishing}
        leadingIcon={<IconCheck aria-hidden />}
        onClick={onDone}
      >
        Selesai
      </Button>
    </div>
  );
}
