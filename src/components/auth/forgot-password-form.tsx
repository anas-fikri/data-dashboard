"use client";

import { IconMailForward } from "@tabler/icons-react";
import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
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

/** Minta tautan atur ulang password. Respons selalu netral (tidak membocorkan email terdaftar). */
export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(requestResetAction, {
    status: "idle",
  });
  const emailRef = useRef<HTMLInputElement>(null);
  const alertRef = useFocusOnError(state, { email: emailRef });
  const headingRef = useRef<HTMLHeadingElement>(null);
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
        <FormAlert tone="success">
          Buka email dari Data Dashboard dan klik <strong>Atur ulang password</strong>. Tidak ada di
          inbox? Periksa folder spam, atau minta lagi beberapa menit kemudian.
        </FormAlert>
      </AuthCard>
    );
  }

  const error = state.status === "error" ? state : null;
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
