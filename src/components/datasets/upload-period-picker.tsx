"use client";

import { IconCalendarMonth, IconUpload, IconX } from "@tabler/icons-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { periodLabel, type PeriodGrain } from "@/features/ingest/period";
import {
  partsOf,
  startFromParts,
  yearOptions,
  type PeriodParts,
} from "@/features/uploads/period-label";

/*
 * Pemilih periode file untuk sheet bersumber label (T-053, rencana G-6 §4.4): pilihan sesuai satuan
 * dataset (bulan/kuartal + tahun, atau tahun saja), bukan teks bebas. Terisi dari nama file bila ada
 * tebakan yang jelas; tanpa tebakan kosong dan wajib diisi sebelum file diproses.
 */
export const MONTHS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

export const PERIOD_REQUIRED = "Pilih periode untuk file ini.";

export function UploadPeriodPicker({
  fileName,
  grain,
  guess,
  onSubmit,
  onCancel,
}: {
  fileName: string;
  grain: PeriodGrain;
  /** Awal periode tebakan dari nama file, atau null. */
  guess: string | null;
  onSubmit: (label: string) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [parts, setParts] = useState<PeriodParts>(() => partsOf(grain, guess));
  const [error, setError] = useState<string | null>(null);
  const firstRef = useRef<HTMLButtonElement>(null);
  const [years] = useState(() => yearOptions(new Date(), parts.year));

  // Fokus ke pilihan pertama: pemilik langsung bisa memeriksa/mengubah periode dengan keyboard.
  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  const start = startFromParts(grain, parts);
  const update = (p: Partial<PeriodParts>) => {
    setParts((cur) => ({ ...cur, ...p }));
    setError(null);
  };
  const submit = () => {
    if (!start) {
      setError(PERIOD_REQUIRED);
      return;
    }
    onSubmit(start);
  };
  const subLabel = grain === "QUARTER" ? "Kuartal" : "Bulan";
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = error ? `${errorId} ${hintId}` : hintId;

  return (
    <form
      className="flex flex-col gap-3 rounded-md border p-3"
      data-testid="upload-period-picker"
      aria-labelledby={`${id}-title`}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex items-start gap-3">
        <IconCalendarMonth
          size={20}
          stroke={1.5}
          aria-hidden
          className="mt-0.5 shrink-0 text-muted-foreground"
        />
        <p className="min-w-0 flex-1 text-sm">
          <span id={`${id}-title`} className="block font-medium">
            Periode file ini
          </span>
          <span className="block [overflow-wrap:anywhere] text-muted-foreground">{fileName}</span>
        </p>
      </div>
      <fieldset className="flex flex-col gap-3 sm:flex-row" aria-describedby={describedBy}>
        <legend className="sr-only">Periode file</legend>
        {grain !== "YEAR" ? (
          <div className="flex flex-col gap-1.5 sm:w-44">
            <label htmlFor={`${id}-sub`} className="text-sm font-medium">
              {subLabel}
            </label>
            <Select
              value={parts.sub === null ? "" : String(parts.sub)}
              onValueChange={(v) => update({ sub: Number(v) })}
            >
              <SelectTrigger
                ref={firstRef}
                id={`${id}-sub`}
                aria-invalid={error && parts.sub === null ? true : undefined}
                aria-required
                data-testid="upload-period-sub"
              >
                <SelectValue placeholder={`Pilih ${subLabel.toLowerCase()}`} />
              </SelectTrigger>
              <SelectContent>
                {grain === "QUARTER"
                  ? [1, 2, 3, 4].map((q) => (
                      <SelectItem key={q} value={String(q)}>
                        {`Kuartal ${q} (${MONTHS[(q - 1) * 3]!.slice(0, 3)}–${MONTHS[q * 3 - 1]!.slice(0, 3)})`}
                      </SelectItem>
                    ))
                  : MONTHS.map((m, i) => (
                      <SelectItem key={m} value={String(i + 1)}>
                        {m}
                      </SelectItem>
                    ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <div className="flex flex-col gap-1.5 sm:w-32">
          <label htmlFor={`${id}-year`} className="text-sm font-medium">
            Tahun
          </label>
          <Select
            value={parts.year === null ? "" : String(parts.year)}
            onValueChange={(v) => update({ year: Number(v) })}
          >
            <SelectTrigger
              ref={grain === "YEAR" ? firstRef : undefined}
              id={`${id}-year`}
              aria-invalid={error && parts.year === null ? true : undefined}
              aria-required
              data-testid="upload-period-year"
            >
              <SelectValue placeholder="Pilih tahun" />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {String(y)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </fieldset>
      <p id={hintId} className="text-sm text-muted-foreground" data-testid="upload-period-hint">
        {start
          ? `Isi file dicatat sebagai ${periodLabel(grain, start)}. ${guess ? "Diisi dari nama file; periksa sebelum memproses." : ""}`.trim()
          : "Nama file tidak menyebut periode yang jelas. Pilih periodenya sebelum memproses."}
      </p>
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
          data-testid="upload-period-submit"
        >
          Unggah file
        </Button>
      </div>
    </form>
  );
}
