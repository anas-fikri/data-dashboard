"use client";

import { IconBan, IconUserMinus } from "@tabler/icons-react";
import { useId, useRef, useState } from "react";
import { EmailText } from "@/components/admin/email-text";
import { FormAlert } from "@/components/auth/form-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, DIALOG_CTA } from "@/components/ui/confirm-dialog";
import type { ShareGrantView, ShareRole } from "@/features/sharing/types";
import { RoleSelect } from "./role-select";

interface ShareGrantsProps {
  grants: ShareGrantView[];
  orgShared: boolean;
  /** Kunci aksi yang berjalan (lihat useShareState); semua kontrol dikunci selama ada aksi. */
  busy: string | null;
  /** Galat ganti peran (tampil di bawah daftar). */
  error: string | null;
  /** Galat cabut akses (tampil di dalam konfirmasi yang tetap terbuka). */
  revokeError: string | null;
  onRole: (grant: ShareGrantView, role: ShareRole) => void;
  onRevoke: (grant: ShareGrantView) => Promise<boolean>;
  onRevokeCancel: () => void;
}

/**
 * Daftar orang dengan akses (T-016): email lebih dulu (identitas), nama kedua; peran lewat Select
 * kustom; "Cabut" lewat konfirmasi. Setelah dicabut fokus pindah ke judul daftar (barisnya hilang);
 * batal → kembali ke tombol "Cabut" baris itu. Ponsel: kontrol bertumpuk selebar layar.
 */
export function ShareGrants({
  grants,
  orgShared,
  busy,
  error,
  revokeError,
  onRole,
  onRevoke,
  onRevokeCancel,
}: ShareGrantsProps) {
  const id = useId();
  const [revoking, setRevoking] = useState<ShareGrantView | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const lastRevoke = useRef<string | null>(null);
  const revokeBusy = revoking ? busy === `revoke:${revoking.userId}` : false;

  return (
    <section aria-labelledby={`${id}-h`} className="flex flex-col gap-2">
      <h3 id={`${id}-h`} ref={heading} tabIndex={-1} className="text-sm font-semibold outline-none">
        Orang dengan akses{grants.length ? ` (${grants.length})` : ""}
      </h3>
      {grants.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Belum ada orang yang diberi akses.
          {orgShared ? " Semua pengguna aktif tetap bisa melihat lewat berbagi organisasi." : ""}
        </p>
      ) : (
        <ul ref={list} className="flex flex-col divide-y rounded-md border">
          {grants.map((g) => (
            <li
              key={g.userId}
              data-testid="share-grant"
              data-user-id={g.userId}
              aria-busy={busy === `role:${g.userId}` || undefined}
              className="flex flex-col gap-2 px-3 py-3"
            >
              <div className="min-w-0 text-sm">
                <p className="font-medium [overflow-wrap:anywhere]">
                  <EmailText email={g.email} />
                </p>
                {g.name ? (
                  <p className="truncate text-muted-foreground" title={g.name}>
                    <bdi>{g.name}</bdi>
                  </p>
                ) : null}
                {g.active ? null : (
                  <Badge tone="destructive" icon={<IconBan />} className="mt-1">
                    Nonaktif
                  </Badge>
                )}
              </div>
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <RoleSelect
                  value={g.role}
                  onChange={(role) => role !== g.role && onRole(g, role)}
                  disabled={busy !== null}
                  aria-label={`Peran ${g.email}`}
                  data-testid="share-grant-role"
                  className="md:w-56"
                />
                <Button
                  variant="outline"
                  disabled={busy !== null}
                  leadingIcon={<IconUserMinus aria-hidden />}
                  aria-label={`Cabut akses ${g.email}`}
                  data-testid="share-revoke"
                  className="h-(--control-h-lg) w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive md:h-(--control-h) md:w-auto"
                  onClick={() => {
                    lastRevoke.current = g.userId;
                    setRevoking(g);
                  }}
                >
                  Cabut
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {error ? <FormAlert tone="error">{error}</FormAlert> : null}

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (open || revokeBusy) return;
          setRevoking(null);
          onRevokeCancel();
        }}
        title="Cabut akses?"
        description={
          revoking ? (
            <>
              <strong className="font-medium text-foreground [overflow-wrap:anywhere]">
                <EmailText email={revoking.email} />
              </strong>{" "}
              tidak bisa membuka dashboard ini lagi mulai muatan data berikutnya
              {orgShared ? ", kecuali tetap melihat lewat berbagi organisasi" : ""}.
            </>
          ) : (
            ""
          )
        }
        busy={revokeBusy}
        data-testid="share-revoke-confirm"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          const row = list.current?.querySelector<HTMLElement>(
            `[data-user-id="${lastRevoke.current}"] [data-testid=share-revoke]`,
          );
          (row ?? heading.current)?.focus();
        }}
        action={
          <Button
            variant="destructive"
            pending={revokeBusy}
            leadingIcon={<IconUserMinus aria-hidden />}
            className={DIALOG_CTA}
            onClick={async () => {
              if (revoking && (await onRevoke(revoking))) setRevoking(null);
            }}
          >
            Cabut akses
          </Button>
        }
      >
        {revokeError ? <FormAlert tone="error">{revokeError}</FormAlert> : null}
      </ConfirmDialog>
    </section>
  );
}
