"use client";

import { IconFileSpreadsheet, IconInfoCircle, IconUpload, IconX } from "@tabler/icons-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  SHEET_SELECT_MAX,
  SHEETS_REQUIRED,
  SHEETS_TOO_MANY,
  defaultSelection,
  selectable,
  sheetNote,
} from "@/features/uploads/sheet-selection";
import type { XlsxSheetInfo } from "@/features/uploads/xlsx-sheets";

/*
 * Pemilih sheet yang diimpor saat unggah xlsx (T-85tb; pola UploadPeriodPicker): checkbox per sheet +
 * "Pilih semua" (tri-state), hitungan terpilih, saran hanya memilih sheet berisi data. Belum ada yang
 * dikirim ke server sampai "Unggah file".
 */
export function UploadSheetPicker({
  fileName,
  sheets,
  activeSheets,
  onSubmit,
  onCancel,
}: {
  fileName: string;
  sheets: XlsxSheetInfo[];
  /** Nama sheet data aktif (penggantian data): sheet yang cocok dicentang bawaan. */
  activeSheets: string[];
  onSubmit: (picked: Set<string>) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [picked, setPicked] = useState(() => new Set(defaultSelection(sheets, activeSheets)));
  const [error, setError] = useState<string | null>(null);
  const allRef = useRef<HTMLInputElement>(null);
  const options = sheets.filter(selectable);
  const count = options.filter((s) => picked.has(s.name)).length;
  const all = count === options.length;
  // Sheet data aktif yang ada di file tapi tidak dipilih → alur pemetaan setelah diproses.
  const missing = activeSheets.filter((n) => options.some((o) => o.name === n) && !picked.has(n));

  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = count > 0 && !all;
  }, [count, all]);
  useEffect(() => {
    allRef.current?.focus();
  }, []);

  const toggle = (name: string, on: boolean) => {
    setPicked((cur) => {
      const next = new Set(cur);
      if (on) next.add(name);
      else next.delete(name);
      return next;
    });
    setError(null);
  };
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <form
      className="flex flex-col gap-3 rounded-md border p-3"
      data-testid="upload-sheet-picker"
      aria-labelledby={`${id}-title`}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (count === 0 || count > SHEET_SELECT_MAX) {
          setError(count === 0 ? SHEETS_REQUIRED : SHEETS_TOO_MANY);
          return;
        }
        onSubmit(picked);
      }}
    >
      <div className="flex items-start gap-3">
        <IconFileSpreadsheet
          size={20}
          stroke={1.5}
          aria-hidden
          className="mt-0.5 shrink-0 text-muted-foreground"
        />
        <p className="min-w-0 flex-1 text-sm">
          <span id={`${id}-title`} className="block font-medium">
            Sheet yang diimpor
          </span>
          <span className="block [overflow-wrap:anywhere] text-muted-foreground">{fileName}</span>
        </p>
      </div>
      <p id={hintId} className="flex items-start gap-2 text-sm text-muted-foreground">
        <IconInfoCircle size={20} stroke={1.5} aria-hidden className="mt-0.5 shrink-0" />
        <span>
          Disarankan hanya memilih sheet berisi data. Sheet ringkasan, pivot, atau grafik tidak
          perlu diimpor.
        </span>
      </p>
      <fieldset
        className="flex flex-col gap-1"
        aria-describedby={error ? `${errorId} ${hintId}` : hintId}
      >
        <legend className="sr-only">Sheet yang diimpor</legend>
        <label className="flex min-h-11 items-center gap-2 border-b pb-1 text-sm font-medium sm:min-h-8">
          <input
            ref={allRef}
            type="checkbox"
            className="size-4 shrink-0 accent-[var(--color-primary)]"
            checked={all}
            onChange={(e) => {
              setPicked(e.target.checked ? new Set(options.map((s) => s.name)) : new Set());
              setError(null);
            }}
            data-testid="upload-sheet-all"
          />
          Pilih semua
        </label>
        <ul className="flex max-h-72 flex-col overflow-y-auto">
          {sheets.map((s, i) => {
            const note = sheetNote(s);
            const can = selectable(s);
            return (
              <li key={`${i}-${s.name}`}>
                <label
                  className={`flex min-h-11 items-center gap-2 text-sm sm:min-h-8 ${can ? "" : "text-muted-foreground"}`}
                >
                  <input
                    type="checkbox"
                    className="size-4 shrink-0 accent-[var(--color-primary)]"
                    checked={can && picked.has(s.name)}
                    disabled={!can}
                    onChange={(e) => toggle(s.name, e.target.checked)}
                    data-testid="upload-sheet-option"
                  />
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    {s.name || "(tanpa nama)"}
                  </span>
                  {note ? <span className="shrink-0 text-muted-foreground">· {note}</span> : null}
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>
      <p
        className="text-sm text-muted-foreground"
        aria-live="polite"
        data-testid="upload-sheet-count"
      >
        {`${count.toLocaleString("id-ID")} dari ${options.length.toLocaleString("id-ID")} sheet dipilih`}
      </p>
      {missing.length && count > 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="upload-sheet-missing">
          {`Sheet data aktif yang tidak dipilih (${missing.join(", ")}) perlu dipetakan atau dilepas setelah file diproses.`}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-11 w-full sm:h-(--control-h-sm) sm:w-auto"
          leadingIcon={<IconX aria-hidden />}
          onClick={onCancel}
        >
          Batal
        </Button>
        <Button
          type="submit"
          size="sm"
          className="h-11 w-full sm:h-(--control-h-sm) sm:w-auto"
          leadingIcon={<IconUpload aria-hidden />}
          data-testid="upload-sheet-submit"
        >
          Unggah file
        </Button>
      </div>
    </form>
  );
}
