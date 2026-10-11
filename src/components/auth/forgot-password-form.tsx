"use client";

import { IconMailForward, IconMailOpened } from "@tabler/icons-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { FormAlert } from "@/components/auth/form-alert";
import { AUTH_INPUT } from "@/components/auth/login-form";
import { useFocusOnError } from "@/components/auth/use-focus-on-error";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { requestResetAction } from "@/features/auth/actions";
import type { FormState } from "@/features/auth/form-state";

const footer = (
  <>
    Ingat password?{" "}
    <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
      Masuk
    </Link>
  </>
);

interface ForgotPasswordFormProps {
  allowedDomains: string[];
}

/** Minta tautan atur ulang password. Respons selalu netral (tidak membocorkan email terdaftar). */
export function ForgotPasswordForm({ allowedDomains }: ForgotPasswordFormProps) {
  // `round` me-mount ulang form ("Pakai email lain") tanpa setState di effect.
  const [round, setRound] = useState(0);
  return (
    <ForgotRound
      key={round}
      allowedDomains={allowedDomains}
      restarted={round > 0}
      onRestart={() => setRound((r) => r + 1)}
    />
  );
}

function ForgotRound({
  allowedDomains,
  restarted,
  onRestart,
}: ForgotPasswordFormProps & { restarted: boolean; onRestart: () => void }) {
  const [state, action, pending] = useActionState<FormState, FormData>(requestResetAction, {
    status: "idle",
  });
  const emailRef = useRef<HTMLInputElement>(null);
  const alertRef = useFocusOnError(state, { email: emailRef });
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (restarted) emailRef.current?.focus();
  }, [restarted]);
  useEffect(() => {
    if (state.status !== "success") return;
    headingRef.current?.focus();
    const previous = document.title;
    document.title = "Periksa inbox Anda · Data Dashboard";
    return () => {
      document.title = previous;
    };
  }, [state.status]);

  if (state.status === "success") {
    return (
      <AuthCard
        title="Periksa inbox Anda"
        headingRef={headingRef}
        description={`Jika ${state.email} terdaftar dan aktif, tautan atur ulang password sudah dikirim dan berlaku 30 menit.`}
        footer={footer}
      >
        <div className="flex flex-col gap-3">
          <FormAlert tone="success">
            Buka email dari Data Dashboard dan klik <strong>Atur ulang password</strong>. Tidak ada
            di inbox? Periksa folder spam.
          </FormAlert>
          <form action={action}>
            <input type="hidden" name="email" value={state.email} />
            <Button
              type="submit"
              variant="outline"
              size="lg"
              className="w-full"
              pending={pending}
              leadingIcon={<IconMailForward aria-hidden />}
            >
              Kirim lagi
            </Button>
          </form>
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
      title="Lupa password"
      description="Masukkan email akun Anda. Kami kirim tautan untuk membuat password baru."
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
        <Button
          type="submit"
          size="lg"
          className="w-full"
          pending={pending}
          leadingIcon={<IconMailForward aria-hidden />}
        >
          Kirim tautan atur ulang
        </Button>
      </form>
    </AuthCard>
  );
}
