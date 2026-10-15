"use client";

import { IconBan, IconPencil, IconUserMinus } from "@tabler/icons-react";
import { useId, useRef, useState } from "react";
import { EmailText } from "@/components/admin/email-text";
import { FormAlert } from "@/components/auth/form-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, DIALOG_CTA } from "@/components/ui/confirm-dialog";
import type { ShareGrantView, ShareRole } from "@/features/sharing/types";
import { RoleSelect } from "./role-select";
import { EDITOR_WARNING, roleChangeStep } from "./share-model";

/**
 * Galat ganti peran baris terakhir bisa jatuh di bawah area gulir dialog (tertutup kaki "Selesai"):
 * saat dipasang digulir seperlunya saja ('nearest'), fokus tetap di Select (review T-016 R3-UI-3).
 * Tingkat modul = callback ref stabil: React 19 memanggil ulang ref inline di setiap render, yang akan
 * menarik area gulir kembali ke galat setiap kali dialog dirender ulang.
 */
export const revealRowError = (el: HTMLElement | null) => el?.scrollIntoView({ block: "nearest" });

/**
 * Fokus setelah konfirmasi di atas daftar tertutup: kontrol baris itu bila masih aktif. Selama aksinya
 * berjalan kontrol itu disabled → fokus ke kotak dialog share (bukan <body>); panel memulihkannya ke
 * kontrol baris setelah aksi selesai (review T-016 R5-UI-3).
 */
export function focusRowControl(list: HTMLElement | null, selector: string) {
  const el = list?.querySelector<HTMLButtonElement>(selector);
  if (el && !el.disabled) el.focus();
  else list?.closest<HTMLElement>('[role="dialog"]')?.focus();
}

/** Isi konfirmasi "Jadikan editor?": siapa, apa yang bisa dilakukannya, dan peringatan editor (AC6). */
export function PromoteDescription({ email }: { email: string }) {
  return (
    <>
      <strong className="font-medium text-foreground [overflow-wrap:anywhere]">
        <EmailText email={email} />
      </strong>{" "}
      bisa menambah, mengubah, dan menghapus widget serta mengatur tata letak dashboard ini.{" "}
      <span data-testid="share-promote-warning" className="font-medium text-foreground">
        {EDITOR_WARNING}
      </span>
    </>
  );
}

interface ShareGrantsProps {
  grants: ShareGrantView[];
  orgShared: boolean;
  /** Kunci aksi yang berjalan (lihat useShareState); semua kontrol dikunci selama ada aksi. */
  busy: string | null;
  /** Galat ganti peran: di baris `errorUserId` (tepat di bawah Select-nya), atau di bawah daftar. */
  error: string | null;
  /** Baris yang ganti perannya gagal (null / barisnya sudah tidak ada → di bawah daftar). */
  errorUserId?: string | null;
  /** Galat cabut akses (tampil di dalam konfirmasi yang tetap terbuka). */
  revokeError: string | null;
  onRole: (grant: ShareGrantView, role: ShareRole) => void;
  onRevoke: (grant: ShareGrantView) => Promise<boolean>;
  onRevokeCancel: () => void;
}

/**
 * Daftar orang dengan akses (T-016): email lebih dulu (identitas), nama kedua — keduanya membungkus
 * utuh, tanpa tooltip title yang tidak terjangkau layar sentuh (R5-UI-4); peran lewat Select
 * kustom; "Cabut" lewat konfirmasi. Setelah dicabut fokus pindah ke judul daftar (barisnya hilang);
 * batal → kembali ke tombol "Cabut" baris itu. Ponsel: kontrol bertumpuk selebar layar. Ganti peran
 * gagal: Select kembali ke peran tersimpan dan alasannya tampil di baris itu (bukan di bawah daftar
 * yang bisa di luar layar), terhubung ke Select lewat aria-describedby — fokus tetap di Select.
 * Naik ke "Bisa mengedit widget" lewat konfirmasi yang memuat peringatan editor (R3-UI-2); Select
 * tetap di peran tersimpan sampai dikonfirmasi, lalu fokus kembali ke Select baris itu.
 */
export function ShareGrants({
  grants,
  orgShared,
  busy,
  error,
  errorUserId = null,
  revokeError,
  onRole,
  onRevoke,
  onRevokeCancel,
}: ShareGrantsProps) {
  const id = useId();
  const [revoking, setRevoking] = useState<ShareGrantView | null>(null);
  const [promoting, setPromoting] = useState<ShareGrantView | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const lastRevoke = useRef<string | null>(null);
  const lastPromote = useRef<string | null>(null);
  const revokeBusy = revoking ? busy === `revoke:${revoking.userId}` : false;
  const rowError = (userId: string) => (error && errorUserId === userId ? error : null);
  const errorInRow = grants.some((g) => rowError(g.userId));

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
                  <p className="text-muted-foreground [overflow-wrap:anywhere]">
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
                  onChange={(role) => {
                    const step = roleChangeStep(g.role, role);
                    if (step === "save") onRole(g, role);
                    if (step !== "confirm") return;
                    lastPromote.current = g.userId;
                    setPromoting(g);
                  }}
                  disabled={busy !== null}
                  aria-label={`Peran ${g.email}`}
                  aria-describedby={rowError(g.userId) ? `${id}-err-${g.userId}` : undefined}
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
              {rowError(g.userId) ? (
                <div
                  ref={revealRowError}
                  id={`${id}-err-${g.userId}`}
                  data-testid="share-grant-error"
                >
                  <FormAlert tone="error">{rowError(g.userId)}</FormAlert>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {error && !errorInRow ? <FormAlert tone="error">{error}</FormAlert> : null}

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

      <ConfirmDialog
        open={promoting !== null}
        onOpenChange={(open) => {
          if (!open) setPromoting(null);
        }}
        title="Jadikan editor?"
        description={promoting ? <PromoteDescription email={promoting.email} /> : ""}
        data-testid="share-promote-confirm"
        onCloseAutoFocus={(e) => {
          // Kembali ke Select baris itu (sedang disimpan dan disabled → kotak dialog, lalu panel).
          e.preventDefault();
          focusRowControl(
            list.current,
            `[data-user-id="${lastPromote.current}"] [data-testid=share-grant-role]`,
          );
        }}
        action={
          <Button
            leadingIcon={<IconPencil aria-hidden />}
            className={DIALOG_CTA}
            data-testid="share-promote"
            onClick={() => {
              if (promoting) onRole(promoting, "EDITOR");
              setPromoting(null);
            }}
          >
            Jadikan editor
          </Button>
        }
      />
    </section>
  );
}
