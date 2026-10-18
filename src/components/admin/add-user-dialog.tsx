"use client";

import { IconMailForward, IconUserPlus } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { DIALOG_CTA } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { FocusNotice } from "@/components/ui/focus-notice";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { createUserAction } from "@/features/admin/actions";
import type { CreatedUser } from "@/features/admin/types";
import { USER_NAME_MAX } from "@/lib/text";
import { adminErrorText, NETWORK_ERROR } from "./admin-messages";

/**
 * Tambah pengguna (T-c7wf): email + nama opsional + peran → Server Action yang mengirim undangan buat
 * password. Hasil tampil di dialog yang sama (menerima fokus) agar admin bisa langsung menambah lagi;
 * daftar di belakangnya di-refresh.
 */
export function AddUserDialog() {
  const router = useRouter();
  const emailRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedUser | null>(null);
  const [pending, start] = useTransition();

  function clear() {
    setEmail("");
    setName("");
    setIsAdmin(false);
    setEmailError(null);
    setError(null);
    setCreated(null);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!email.trim()) {
      setEmailError("Isi email pengguna.");
      emailRef.current?.focus();
      return;
    }
    setEmailError(null);
    setError(null);
    start(async () => {
      const res = await createUserAction(email, name, isAdmin).catch(() => null);
      if (!res || !res.ok) {
        setError(res ? adminErrorText(res.code, res.message) : NETWORK_ERROR);
        return;
      }
      setCreated(res.data);
      router.refresh();
    });
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (pending) return;
        setOpen(o);
        if (!o) clear();
      }}
    >
      <Dialog.Trigger asChild>
        <Button
          leadingIcon={<IconUserPlus aria-hidden />}
          className="h-(--control-h-lg) w-full md:h-(--control-h) md:w-auto"
        >
          Tambah pengguna
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay/50" />
        <Dialog.Content
          data-testid="add-user-dialog"
          className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border bg-card p-6 shadow-lg"
        >
          <Dialog.Title className="text-lg font-semibold">
            {created ? "Pengguna ditambahkan" : "Tambah pengguna"}
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted-foreground">
            Pengguna menerima email berisi tautan untuk membuat password (berlaku 72 jam).
          </Dialog.Description>
          {created ? (
            <div className="mt-4 flex flex-col gap-4">
              <FocusNotice tone={created.inviteSent ? "success" : "error"}>
                <span className="[overflow-wrap:anywhere]">
                  {created.inviteSent
                    ? `Undangan terkirim ke ${created.email}.`
                    : `Akun ${created.email} dibuat, tetapi email undangan gagal terkirim. Minta ia membuka “Lupa password?” di halaman masuk untuk membuat password.`}
                </span>
              </FocusNotice>
              <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
                <Button
                  variant="outline"
                  className={DIALOG_CTA}
                  onClick={() => {
                    clear();
                    requestAnimationFrame(() => emailRef.current?.focus());
                  }}
                >
                  Tambah lagi
                </Button>
                <Dialog.Close asChild>
                  <Button className={DIALOG_CTA}>Selesai</Button>
                </Dialog.Close>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-4 flex flex-col gap-4" noValidate>
              {error ? <FocusNotice tone="error">{error}</FocusNotice> : null}
              <Field id="add-user-email" label="Email" required error={emailError ?? undefined}>
                <Input
                  ref={emailRef}
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Field
                id="add-user-name"
                label="Nama"
                hint="Opsional. Pengguna bisa mengubahnya nanti."
              >
                <Input
                  autoComplete="off"
                  maxLength={USER_NAME_MAX}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <div className="flex items-center justify-between gap-4">
                <label htmlFor="add-user-admin" className="text-sm">
                  <span className="block font-medium">Jadikan admin</span>
                  <span className="block text-muted-foreground">
                    Bisa mengelola semua pengguna.
                  </span>
                </label>
                <Switch id="add-user-admin" checked={isAdmin} onCheckedChange={setIsAdmin} />
              </div>
              <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
                <Dialog.Close asChild>
                  <Button variant="outline" disabled={pending} className={DIALOG_CTA}>
                    Batal
                  </Button>
                </Dialog.Close>
                <Button
                  type="submit"
                  pending={pending}
                  leadingIcon={<IconMailForward aria-hidden />}
                  className={DIALOG_CTA}
                >
                  Tambah &amp; kirim undangan
                </Button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
