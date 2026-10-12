"use client";

import { IconChevronDown, IconHeading } from "@tabler/icons-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SheetPreview } from "@/features/ingest/preview";
import { cn } from "@/lib/utils";
import { HeaderPreviewList } from "./header-preview-list";
import { fmtInt } from "./labels";
import { useRecast } from "./use-recast";

/*
 * Pilih ulang baris judul kolom (T-008 AC 3) dari pratinjau baris mentah awal. Baris di atas judul
 * (judul laporan, keterangan) tidak masuk data; nama dan tipe semua kolom dideteksi ulang dari baris
 * yang dipilih tanpa membaca file asli lagi.
 */
const MAX_ROW = 1_048_576;

export function HeaderRowPicker({
  headerRow,
  preview,
}: {
  headerRow: number;
  preview: SheetPreview | null;
}) {
  const { busy, submit, local } = useRecast();
  const [open, setOpen] = useState(false);
  const [row, setRow] = useState(String(headerRow));
  const [error, setError] = useState<string | null>(null);
  const panelId = useId();
  const n = Number(row);
  const valid = Number.isInteger(n) && n >= 1 && n <= MAX_ROW;

  async function onApply(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) {
      setError(`Isi nomor baris 1–${fmtInt(MAX_ROW)}.`);
      document.getElementById(`${panelId}-num`)?.focus();
      return;
    }
    await submit({ headerRow: n }, { kind: "header", row: n });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2 text-sm">
          <IconHeading
            size={20}
            stroke={1.5}
            aria-hidden
            className="mt-px shrink-0 text-muted-foreground"
          />
          <span>
            Judul kolom diambil dari <span className="font-medium">baris {fmtInt(headerRow)}</span>;
            data dimulai setelah baris itu.
          </span>
        </p>
        <Button
          variant="outline"
          size="sm"
          aria-expanded={open}
          aria-controls={panelId}
          className="w-full sm:w-auto"
          trailingIcon={
            <IconChevronDown
              aria-hidden
              className={cn("transition-transform", open && "rotate-180")}
            />
          }
          onClick={() => setOpen((o) => !o)}
          disabled={busy && !open}
        >
          Ganti baris judul
        </Button>
      </div>

      {open ? (
        <form
          id={panelId}
          onSubmit={onApply}
          className="flex flex-col gap-3"
          aria-label="Ganti baris judul"
        >
          <p className="rounded-md bg-warning/15 px-3 py-2 text-sm">
            Nama, tipe, dan pengaturan semua kolom akan dideteksi ulang dari baris yang dipilih.
            Perubahan kolom yang belum disimpan ikut dibuang.
          </p>
          {preview && preview.rows.length > 0 ? (
            <HeaderPreviewList
              preview={preview}
              headerRow={headerRow}
              selected={n}
              name={`${panelId}-row`}
              disabled={busy}
              onSelect={(r) => {
                setRow(String(r));
                setError(null);
              }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Pratinjau baris tidak tersedia untuk data ini; ketik nomor barisnya.
            </p>
          )}
          <div className="flex flex-col gap-1 sm:w-56">
            <label htmlFor={`${panelId}-num`} className="text-sm font-medium">
              Nomor baris judul
            </label>
            <Input
              id={`${panelId}-num`}
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_ROW}
              value={row}
              disabled={busy}
              invalid={Boolean(error)}
              aria-describedby={error ? `${panelId}-err` : undefined}
              onChange={(e) => {
                setRow(e.target.value);
                setError(null);
              }}
            />
            {error ? (
              <p id={`${panelId}-err`} className="text-xs text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Batal
            </Button>
            <Button
              type="submit"
              className="w-full sm:w-auto"
              disabled={busy || n === headerRow}
              pending={local.phase === "submitting"}
            >
              {valid && n !== headerRow
                ? `Pakai baris ${fmtInt(n)} sebagai judul`
                : "Pilih baris lain"}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
