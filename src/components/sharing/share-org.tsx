"use client";

import { useId } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Switch } from "@/components/ui/switch";

/**
 * Berbagi ke seluruh organisasi (T-016): sakelar berlabel + penjelasan (hanya lihat, semua pengguna
 * aktif). Galat tampil tepat di bawahnya; sakelar tetap menunjukkan keadaan server terakhir.
 */
export function ShareOrg({
  on,
  disabled,
  error,
  onChange,
}: {
  on: boolean;
  disabled: boolean;
  error: string | null;
  onChange: (on: boolean, el: HTMLElement | null) => void;
}) {
  const id = useId();
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <label htmlFor={`${id}-org`} className="text-sm font-medium">
            Bagikan ke seluruh organisasi
          </label>
          <p id={`${id}-help`} className="text-sm text-muted-foreground">
            Semua pengguna aktif dapat melihat dashboard ini (hanya lihat).
          </p>
        </div>
        <Switch
          id={`${id}-org`}
          checked={on}
          disabled={disabled}
          aria-describedby={`${id}-help`}
          data-testid="share-org"
          onCheckedChange={(next) => onChange(next, document.getElementById(`${id}-org`))}
        />
      </div>
      {error ? <FormAlert tone="error">{error}</FormAlert> : null}
    </section>
  );
}
