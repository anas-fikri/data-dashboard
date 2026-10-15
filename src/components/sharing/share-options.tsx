"use client";

import { EmailText } from "@/components/admin/email-text";
import type { ShareRole, ShareUserOption } from "@/features/sharing/types";
import { cn } from "@/lib/utils";
import { roleLabel } from "./share-model";

/**
 * Hasil pencarian pengguna sebagai grup radio (pola pemilih alih dataset T-019): baris = target sentuh
 * penuh, email lebih dulu dan utuh, nama kedua; pengguna yang sudah punya akses ditandai (memilihnya
 * lagi mengganti perannya). Satu area gulir: di layar pendek ikut tergulir bersama isi dialog.
 */
export function ShareOptions({
  name,
  labelledBy,
  items,
  selectedId,
  granted,
  disabled,
  loading,
  onSelect,
}: {
  /** name grup radio (unik per pemilih). */
  name: string;
  labelledBy: string;
  items: ShareUserOption[];
  selectedId: string | null;
  granted: ReadonlyMap<string, ShareRole>;
  disabled: boolean;
  /** Pencarian baru sedang berjalan: hasil lama diredupkan dan ditandai sibuk. */
  loading: boolean;
  onSelect: (user: ShareUserOption) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-busy={loading || undefined}
      className={cn(
        "rounded-md border [@media(min-width:48rem)_and_(min-height:48rem)]:max-h-60 [@media(min-width:48rem)_and_(min-height:48rem)]:overflow-y-auto",
        loading && "opacity-60",
      )}
    >
      {items.map((u) => {
        const has = granted.get(u.id);
        return (
          <label
            key={u.id}
            data-testid="share-option"
            data-user-id={u.id}
            data-email={u.email}
            className="flex min-h-11 cursor-pointer items-start gap-3 border-b px-3 py-2 text-sm last:border-b-0 hover:bg-accent/40 has-checked:bg-accent/60 md:min-h-9"
          >
            <input
              type="radio"
              name={name}
              value={u.id}
              checked={u.id === selectedId}
              onChange={() => onSelect(u)}
              disabled={disabled}
              className="mt-0.5 size-4 shrink-0 accent-primary"
            />
            <span className="min-w-0 flex-1">
              <span className="block font-medium [overflow-wrap:anywhere]">
                <EmailText email={u.email} />
              </span>
              {u.name ? (
                <span className="block truncate text-muted-foreground" title={u.name}>
                  <bdi>{u.name}</bdi>
                </span>
              ) : null}
              {has ? (
                <span className="block text-muted-foreground">
                  Sudah punya akses: {roleLabel(has)}
                </span>
              ) : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}
