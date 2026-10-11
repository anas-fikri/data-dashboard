"use client";

import { IconMailForward, IconMailOpened, IconUserPlus } from "@tabler/icons-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { FormAlert } from "@/components/auth/form-alert";
import { AUTH_INPUT } from "@/components/auth/login-form";
import { useFocusOnError } from "@/components/auth/use-focus-on-error";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { registerAction, resendVerificationAction } from "@/features/auth/actions";
import type { FormState } from "@/features/auth/form-state";

interface RegisterFormProps {
  allowedDomains: string[];
  /** Mode kirim ulang verifikasi (hanya email). */
  resend?: boolean;
}

/** Halaman daftar / kirim ulang lengkap dengan kartunya: judul berubah saat sukses. */
export function RegisterForm({ allowedDomains, resend = false }: RegisterFormProps) {
  // `round` me-mount ulang form untuk "Pakai email lain" tanpa setState di effect.
  const [round, setRound] = useState(0);
  return (
    <RegisterRound
      key={round}
      allowedDomains={allowedDomains}
      resend={resend}
      restarted={round > 0}
      onRestart={() => setRound((r) => r + 1)}
    />
  );
}

function RegisterRound({
  allowedDomains,
  resend,
  restarted,
  onRestart,
}: RegisterFormProps & { restarted: boolean; onRestart: () => void }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    resend ? resendVerificationAction : registerAction,
    { status: "idle" },
  );
  const emailRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const alertRef = useFocusOnError(state, {
    email: emailRef,
    name: nameRef,
    password: passwordRef,
  });
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Setelah "Pakai email lain" (remount), fokus kembali ke field email.
  useEffect(() => {
    if (restarted) emailRef.current?.focus();
  }, [restarted]);
  useEffect(() => {
    if (state.status === "success") {
      headingRef.current?.focus();
      document.title = "Periksa inbox Anda · Data Dashboard"; // judul tab mengikuti h1
    }
  }, [state.status]);

  const footer = (
    <>
      Sudah punya akun?{" "}
      <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
        Masuk
      </Link>
      {!resend ? (
        <>
          {" · "}
          <Link
            href="/register?resend=1"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Kirim ulang verifikasi
          </Link>
        </>
      ) : null}
    </>
  );

  if (state.status === "success") {
    return (
      <AuthCard
        title="Periksa inbox Anda"
        headingRef={headingRef}
        description={
          resend
            ? `Jika ${state.email || "email Anda"} terdaftar dan belum aktif, tautan aktivasi baru dikirim dan berlaku 24 jam.`
            : `Tautan aktivasi dikirim ke ${state.email || "email Anda"} dan berlaku 24 jam.`
        }
        footer={footer}
      >
        <div className="flex flex-col gap-3">
          <FormAlert tone="success">
            Buka email dari Data Dashboard, klik <strong>Aktifkan akun</strong>, lalu masukkan
            password yang Anda buat saat mendaftar. Tidak ada di inbox? Periksa folder spam.
          </FormAlert>
          <Button asChild variant="outline" size="lg" className="w-full">
            <Link href="/register?resend=1">
              <IconMailForward aria-hidden />
              Kirim ulang email
            </Link>
          </Button>
          <Button variant="ghost" size="lg" className="w-full" onClick={onRestart}>
            <IconMailOpened aria-hidden />
            Pakai email lain
          </Button>
        </div>
      </AuthCard>
    );
  }

  const error = state.status === "error" ? state : null;
  const domainHint =
    allowedDomains.length === 1
      ? `Hanya email @${allowedDomains[0]}.`
      : `Hanya email domain: ${allowedDomains.map((d) => `@${d}`).join(", ")}.`;

  return (
    <AuthCard
      title={resend ? "Kirim ulang verifikasi" : "Daftar"}
      description={
        resend
          ? "Masukkan email yang Anda daftarkan. Tautan aktivasi baru akan dikirim."
          : "Akun hanya untuk karyawan dengan email perusahaan."
      }
      footer={footer}
    >
      <form action={action} className="flex flex-col gap-4" noValidate>
        {error && !error.field ? (
          <FormAlert tone="error" ref={alertRef}>
            {error.message}
          </FormAlert>
        ) : null}
        <Field
          id="email"
          label="Email perusahaan"
          hint={domainHint}
          required
          error={error?.field === "email" ? error.message : undefined}
        >
          <Input
            ref={emailRef}
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            defaultValue={error?.values.email ?? ""}
            className={AUTH_INPUT}
          />
        </Field>
        {!resend ? (
          <>
            <Field id="name" label="Nama">
              <Input
                ref={nameRef}
                name="name"
                type="text"
                autoComplete="name"
                maxLength={80}
                defaultValue={error?.values.name ?? ""}
                className={AUTH_INPUT}
              />
            </Field>
            <Field
              id="password"
              label="Password"
              hint="12 sampai 128 karakter. Kalimat panjang lebih kuat daripada simbol acak."
              required
              error={error?.field === "password" ? error.message : undefined}
            >
              <PasswordInput
                ref={passwordRef}
                name="password"
                autoComplete="new-password"
                maxLength={128}
                className={AUTH_INPUT}
              />
            </Field>
          </>
        ) : null}
        <Button
          type="submit"
          pending={pending}
          leadingIcon={resend ? <IconMailForward aria-hidden /> : <IconUserPlus aria-hidden />}
          className="w-full"
          size="lg"
        >
          {resend ? "Kirim ulang email verifikasi" : "Daftar"}
        </Button>
      </form>
    </AuthCard>
  );
}
