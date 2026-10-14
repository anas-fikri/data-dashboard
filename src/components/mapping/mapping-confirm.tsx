"use client";

import { IconDeviceFloppy } from "@tabler/icons-react";
import { fmtInt } from "@/components/schema/labels";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, DIALOG_CTA } from "@/components/ui/confirm-dialog";
import type { nullChoices } from "./mapping-model";

const SHOWN = 8;

/** Daftar nama ringkas: paling banyak 8, sisanya dihitung. */
function Names({ label, names }: { label: string; names: string[] }) {
  const rest = names.length - SHOWN;
  return (
    <div className="text-sm">
      <p className="font-medium">{label}</p>
      <ul className="mt-1 list-disc pl-5 [overflow-wrap:anywhere]">
        {names.slice(0, SHOWN).map((n, i) => (
          <li key={i}>{n}</li>
        ))}
        {rest > 0 ? <li className="text-muted-foreground">dan {fmtInt(rest)} lainnya</li> : null}
      </ul>
    </div>
  );
}

/**
 * Konfirmasi sebelum menyimpan pemetaan yang mengosongkan kolom atau tidak lagi memakai sheet:
 * akibatnya disebut dengan bahasa sehari-hari. Fokus awal di Batal (bawaan ConfirmDialog).
 */
export function MappingConfirm({
  open,
  choices,
  multiSheet,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  choices: ReturnType<typeof nullChoices>;
  multiSheet: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { columns, droppedSheets } = choices;
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
      title={
        columns.length > 0
          ? `Kosongkan ${fmtInt(columns.length)} kolom?`
          : `Tidak memakai ${fmtInt(droppedSheets.length)} sheet lagi?`
      }
      description="Kolom yang dikosongkan tetap ada di skema tanpa nilai, jadi widget yang memakainya menampilkan nilai kosong, bukan galat. Versi baru aktif setelah pemetaan selesai diterapkan."
      data-testid="mapping-confirm"
      action={
        <Button
          className={DIALOG_CTA}
          leadingIcon={<IconDeviceFloppy aria-hidden />}
          onClick={onConfirm}
        >
          Simpan &amp; aktifkan
        </Button>
      }
    >
      {columns.length > 0 ? (
        <Names
          label="Dikosongkan"
          names={columns.map((c) => (multiSheet ? `${c.name} (sheet “${c.sheet}”)` : c.name))}
        />
      ) : null}
      {droppedSheets.length > 0 ? (
        <Names
          label="Sheet tidak dipakai lagi (widget-nya tidak menampilkan data)"
          names={droppedSheets.map((s) => `Sheet “${s}”`)}
        />
      ) : null}
    </ConfirmDialog>
  );
}
