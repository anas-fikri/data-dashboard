"use client";

import { IconAlertTriangle, IconCheck, IconKey, IconLoader2, IconX } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { SearchSelect } from "@/components/ui/search-select";
import { savePeriodKeysAction } from "@/features/versions/actions";
import type { PeriodKeyCheck, PeriodSetupView } from "@/features/versions/period-setup";

/*
 * Kolom kunci per sheet data (v1.20, T-rbrb, ADR-0011): dipakai unggahan "Perbarui berdasarkan kunci" —
 * baris file dengan kunci yang sudah ada menggantikan baris lamanya (di periode mana pun), kunci baru
 * ditambahkan. Setelah disimpan, keunikan kunci di data aktif dilaporkan (kunci dobel lama akan
 * digantikan oleh SATU baris file).
 */

const MAX = 5;
const CTA = "h-(--control-h-lg) w-full md:h-(--control-h) md:w-auto";
const fmt = (n: number) => n.toLocaleString("id-ID");

export function PeriodKeysForm({ view }: { view: PeriodSetupView }) {
  const router = useRouter();
  const uid = useId();
  const sheets = view.sheets.filter((s) => s.periodSource);
  const [keys, setKeys] = useState<Record<string, number[]>>(() =>
    Object.fromEntries(sheets.map((s) => [s.lineageId, s.keyColumns])),
  );
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [checks, setChecks] = useState<PeriodKeyCheck[] | null>(null);
  const edit = (lineageId: string, next: number[]) => {
    setKeys((k) => ({ ...k, [lineageId]: next }));
    setChecks(null);
    setError(null);
  };
  const save = () =>
    start(async () => {
      const r = await savePeriodKeysAction(view.datasetId, {
        sheets: sheets.map((s) => ({ lineageId: s.lineageId, columns: keys[s.lineageId] ?? [] })),
      });
      if (r.ok) {
        setChecks(r.data.checks);
        router.refresh();
      } else {
        setError(r.message);
      }
    });
  if (!sheets.length) return null;
  return (
    <div className="flex flex-col gap-6" data-testid="period-keys-form">
      {sheets.map((s) => {
        const chosen = keys[s.lineageId] ?? [];
        const name = (pos: number) => s.keyOptions.find((o) => o.pos === pos)?.name ?? `#${pos}`;
        const options = s.keyOptions
          .filter((o) => !chosen.includes(o.pos))
          .map((o) => ({ value: String(o.pos), label: o.name }));
        const fieldId = `${uid}-${s.lineageId}`;
        return (
          <fieldset
            key={s.lineageId}
            className="flex flex-col gap-2"
            data-testid="period-keys-sheet"
            data-sheet={s.name}
          >
            <legend className="text-sm font-medium [overflow-wrap:anywhere]">
              {sheets.length > 1 ? `Sheet “${s.name}”` : "Kolom kunci"}
            </legend>
            {chosen.length ? (
              <ul className="flex flex-wrap gap-2" aria-label={`Kolom kunci sheet ${s.name}`}>
                {chosen.map((pos) => (
                  <li
                    key={pos}
                    className="flex items-center gap-1 rounded-md border bg-muted/50 py-0.5 pr-0.5 pl-2 text-sm"
                    data-testid="period-key-chip"
                  >
                    <IconKey aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                    <span className="[overflow-wrap:anywhere]">{name(pos)}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-11 sm:size-7"
                      aria-label={`Hapus ${name(pos)} dari kolom kunci`}
                      onClick={() =>
                        edit(
                          s.lineageId,
                          chosen.filter((x) => x !== pos),
                        )
                      }
                    >
                      <IconX aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground" data-testid="period-keys-none">
                Belum ada kolom kunci — unggahan hanya bisa Ganti atau Tambah.
              </p>
            )}
            {chosen.length < MAX ? (
              <div className="flex flex-col gap-1 md:max-w-sm">
                <label htmlFor={fieldId} className="text-sm text-muted-foreground">
                  {chosen.length ? "Tambah kolom kunci (gabungan)" : "Pilih kolom kunci"}
                </label>
                <SearchSelect
                  id={fieldId}
                  label={`Kolom kunci sheet ${s.name}`}
                  value=""
                  options={options}
                  placeholder="Pilih kolom…"
                  onChange={(v) => edit(s.lineageId, [...chosen, Number(v)])}
                  data-testid="period-key-add"
                />
              </div>
            ) : null}
          </fieldset>
        );
      })}
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          className={CTA}
          onClick={save}
          disabled={pending}
          data-testid="period-keys-save"
        >
          {pending ? (
            <IconLoader2 aria-hidden className="motion-safe:animate-spin" />
          ) : (
            <IconCheck aria-hidden />
          )}
          Simpan kolom kunci
        </Button>
        <div
          aria-live="polite"
          className="flex flex-col gap-1 text-sm"
          data-testid="period-keys-result"
        >
          {error ? <p className="text-destructive">{error}</p> : null}
          {checks ? <p className="text-muted-foreground">Kolom kunci disimpan.</p> : null}
          {checks
            ?.filter((c) => c.duplicates || c.empty)
            .map((c) => (
              <p key={c.sheet} className="flex gap-1.5" data-testid="period-keys-warning">
                <IconAlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
                <span>
                  {sheets.length > 1 ? `Sheet “${c.sheet}”: ` : ""}
                  {c.duplicates
                    ? `${fmt(c.duplicates)} kunci muncul lebih dari sekali di data sekarang (mis. ${c.examples.join(", ")}). Unggahan Perbarui menggantikan semua baris lama berkunci sama dengan satu baris file — pastikan kolom ini memang unik.`
                    : ""}
                  {c.duplicates && c.empty ? " " : ""}
                  {c.empty
                    ? `${fmt(c.empty)} baris di data sekarang kolom kuncinya kosong; baris itu tidak pernah diperbarui.`
                    : ""}
                </span>
              </p>
            ))}
        </div>
      </div>
    </div>
  );
}
