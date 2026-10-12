"use client";

import { IconDeviceFloppy } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { fmtInt } from "./labels";

/** Bar simpan menempel di bawah editor selama ada perubahan yang belum disimpan. */
export function SaveBar({
  count,
  busy,
  pending,
  onReset,
}: {
  count: number;
  busy: boolean;
  pending: boolean;
  onReset: () => void;
}) {
  return (
    <div
      className="sticky bottom-0 z-10 flex flex-col gap-3 rounded-b-lg border-t bg-card/95 px-5 py-3 backdrop-blur md:flex-row md:items-center md:justify-between"
      data-testid="schema-save-bar"
    >
      <p className="text-sm">
        <span className="font-medium">{fmtInt(count)} kolom diubah</span>
        <span className="text-muted-foreground"> · belum disimpan</span>
      </p>
      <div className="flex flex-col-reverse gap-2 md:flex-row">
        <Button
          variant="outline"
          disabled={busy}
          className="h-11 md:h-(--control-h) w-full md:w-auto"
          onClick={onReset}
        >
          Buang perubahan
        </Button>
        <Button
          type="submit"
          disabled={busy}
          pending={pending}
          className="h-11 md:h-(--control-h) w-full md:w-auto"
          leadingIcon={<IconDeviceFloppy aria-hidden />}
        >
          Simpan perubahan
        </Button>
      </div>
    </div>
  );
}
