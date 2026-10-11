"use client";

import { IconMailForward, IconUserPlus } from "@tabler/icons-react";
import { useActionState } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { registerAction, resendVerificationAction, type FormState } from "@/features/auth/actions";

interface RegisterFormProps {
  allowedDomains: string[];
  /** Mode kirim ulang verifikasi (hanya email). */
  resend?: boolean;
}

export function RegisterForm({ allowedDomains, resend = false }: RegisterFormProps) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    resend ? resendVerificationAction : registerAction,
    { status: "idle" },
  );

  if (state.status === "success") {
    return (
      <FormAlert tone="success">
        <p className="font-medium">Periksa inbox {state.email || "Anda"}.</p>
        <p className="mt-1">
          Jika email terdaftar dengan domain yang diizinkan, tautan aktivasi sudah dikirim dan
          berlaku 24 jam. Belum menerima? Periksa folder spam atau kirim ulang dari halaman ini.
        </p>
      </FormAlert>
    );
  }

  const error = state.status === "error" ? state : null;
  const domainHint =
    allowedDomains.length === 1
      ? `Hanya email @${allowedDomains[0]}.`
      : `Hanya email domain: ${allowedDomains.map((d) => `@${d}`).join(", ")}.`;

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {error ? <FormAlert tone="error">{error.message}</FormAlert> : null}
      <Field id="email" label="Email perusahaan" hint={domainHint} required>
        <Input name="email" type="email" autoComplete="email" inputMode="email" required />
      </Field>
      {!resend ? (
        <>
          <Field id="name" label="Nama">
            <Input name="name" type="text" autoComplete="name" maxLength={80} />
          </Field>
          <Field
            id="password"
            label="Password"
            hint="12 sampai 128 karakter. Kalimat panjang lebih kuat daripada simbol acak."
            required
          >
            <Input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
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
  );
}
