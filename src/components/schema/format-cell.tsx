"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ColumnSchema, DateFormat, NumberLocale } from "@/features/ingest/infer";
import {
  DATE_FORMAT_LABEL,
  DATE_FORMATS,
  LOCALE_LABEL,
  needsDateFormat,
  needsLocale,
  type ColumnDraft,
} from "./labels";

const AUTO = "auto";

/**
 * Format sesuai tipe: tanggal → format tanggal, angka → penulisan angka, lainnya kosong. "Deteksi
 * otomatis" hanya bila kolom belum punya pilihan (worker memilih yang paling cocok).
 */
export function FormatCell({
  id,
  column,
  draft,
  disabled,
  onChange,
  label,
}: {
  id: string;
  column: ColumnSchema;
  draft: ColumnDraft;
  disabled: boolean;
  onChange: (next: ColumnDraft) => void;
  label: (text: string, htmlFor: string) => React.ReactNode;
}) {
  return (
    <div>
      {needsDateFormat(draft.type) ? (
        <>
          {label("Format tanggal", `${id}-fmt`)}
          <Select
            value={draft.dateFormat ?? AUTO}
            disabled={disabled}
            onValueChange={(v) =>
              onChange({ ...draft, dateFormat: v === AUTO ? undefined : (v as DateFormat) })
            }
          >
            <SelectTrigger id={`${id}-fmt`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {column.dateFormat === undefined ? (
                <SelectItem value={AUTO}>Deteksi otomatis</SelectItem>
              ) : null}
              {DATE_FORMATS.map((f) => (
                <SelectItem key={f} value={f}>
                  {DATE_FORMAT_LABEL[f]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      ) : needsLocale(draft.type) ? (
        <>
          {label("Penulisan angka", `${id}-loc`)}
          <Select
            value={draft.numberLocale ?? AUTO}
            disabled={disabled}
            onValueChange={(v) =>
              onChange({ ...draft, numberLocale: v === AUTO ? undefined : (v as NumberLocale) })
            }
          >
            <SelectTrigger id={`${id}-loc`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {column.numberLocale === undefined ? (
                <SelectItem value={AUTO}>Deteksi otomatis</SelectItem>
              ) : null}
              {(Object.keys(LOCALE_LABEL) as NumberLocale[]).map((l) => (
                <SelectItem key={l} value={l}>
                  {LOCALE_LABEL[l]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      ) : (
        <p
          className="hidden h-(--control-h) items-center text-sm text-muted-foreground @4xl:flex"
          aria-hidden
        >
          —
        </p>
      )}
    </div>
  );
}
