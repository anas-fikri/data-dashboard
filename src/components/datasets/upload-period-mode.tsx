"use client";

import Link from "next/link";
import { useId } from "react";
import type { PeriodUploadMode } from "@/components/datasets/upload-panel-state";

/*
 * Cara unggahan periode memperlakukan periode yang sudah ada (v1.20, T-rbrb, ADR-0011). Perbarui
 * berdasarkan kunci hanya bisa dipilih bila ada kolom kunci (Pengaturan periode).
 */

const OPTIONS: { value: PeriodUploadMode; label: string; hint: string }[] = [
  {
    value: "UPSERT",
    label: "Perbarui berdasarkan kunci",
    hint: "Baris yang kuncinya sudah ada dikoreksi (pindah periode bila tanggalnya berubah), baris baru ditambahkan, baris lama lainnya tetap.",
  },
  {
    value: "APPEND",
    label: "Tambah baris",
    hint: "Semua baris file ditambahkan ke periodenya; baris lama tetap. File yang sama dua kali menggandakan baris.",
  },
  {
    value: "REPLACE",
    label: "Ganti periode",
    hint: "Periode yang ada di file diganti utuh oleh isi file (wajib ditinjau).",
  },
];

export function UploadPeriodMode({
  value,
  onChange,
  keys,
  setupHref,
}: {
  value: PeriodUploadMode;
  onChange: (v: PeriodUploadMode) => void;
  keys: { sheet: string; columns: string[] }[];
  setupHref: string | null;
}) {
  const uid = useId();
  const keyText = keys
    .map((k) => (keys.length > 1 ? `${k.sheet}: ${k.columns.join(" + ")}` : k.columns.join(" + ")))
    .join("; ");
  return (
    <fieldset
      className="flex flex-col gap-2 rounded-md border p-3"
      data-testid="upload-period-mode"
    >
      <legend className="px-1 text-sm font-medium">Bila periode di file sudah ada</legend>
      {OPTIONS.map((o) => {
        const disabled = o.value === "UPSERT" && !keys.length;
        const id = `${uid}-${o.value}`;
        return (
          <div key={o.value} className="flex items-start gap-2">
            <input
              type="radio"
              id={id}
              name={`${uid}-mode`}
              className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)] max-sm:mt-3.5"
              checked={value === o.value}
              disabled={disabled}
              onChange={() => onChange(o.value)}
              aria-describedby={`${id}-hint`}
              data-testid={`upload-period-mode-${o.value.toLowerCase()}`}
            />
            <div className="flex min-w-0 flex-col">
              <label
                htmlFor={id}
                className={`flex min-h-11 items-center text-sm font-medium sm:min-h-0 ${disabled ? "text-muted-foreground" : ""}`}
              >
                {o.label}
              </label>
              <p
                id={`${id}-hint`}
                className="text-sm text-muted-foreground [overflow-wrap:anywhere]"
              >
                {o.hint}
                {o.value === "UPSERT" ? (
                  keys.length ? (
                    ` Kunci: ${keyText}.`
                  ) : (
                    <>
                      {" "}
                      Belum ada kolom kunci
                      {setupHref ? (
                        <>
                          {" — "}
                          <Link
                            href={setupHref}
                            className="font-medium text-primary underline-offset-4 hover:underline"
                          >
                            atur di Pengaturan periode
                          </Link>
                        </>
                      ) : null}
                      .
                    </>
                  )
                ) : null}
              </p>
            </div>
          </div>
        );
      })}
    </fieldset>
  );
}
