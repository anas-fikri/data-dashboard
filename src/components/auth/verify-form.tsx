"use client";

import { IconCircleCheck } from "@tabler/icons-react";
import { useActionState, useRef } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { AUTH_INPUT } from "@/components/auth/login-form";
import { useFocusOnError } from "@/components/auth/use-focus-on-error";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { verifyEmailAction } from "@/features/auth/actions";
import type { FormState } from "@/features/auth/form-state";

/**
 * Konfirmasi aktivasi (POST) dengan password yang dibuat saat mendaftar: hanya pendaftar
 * asli yang bisa mengaktifkan, meski tautan dibuka orang lain atau pemindai email.
 */
export function VerifyForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(verifyEmailAction, {
    status: "idle",
  });
  const passwordRef = useRef<HTMLInputElement>(null);
  const alertRef = useFocusOnError(state, {});
  const error = state.status === "error" ? state : null;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="token" value={token} />
      {error ? (
        <FormAlert tone="error" ref={alertRef}>
          {error.code === "INVALID_CREDENTIALS"
            ? "Password tidak cocok dengan pendaftaran untuk tautan ini. Gunakan tautan dari email pendaftaran Anda yang terbaru."
            : error.message}
        </FormAlert>
      ) : null}
      <Field
        id="password"
        label="Password yang Anda buat saat mendaftar"
        hint="Memastikan hanya Anda yang mengaktifkan akun ini."
        required
      >
        <PasswordInput
          ref={passwordRef}
          name="password"
          autoComplete="current-password"
          className={AUTH_INPUT}
        />
      </Field>
      <Button
        type="submit"
        size="lg"
        className="w-full"
        pending={pending}
        leadingIcon={<IconCircleCheck aria-hidden />}
      >
        Aktifkan akun
      </Button>
    </form>
  );
}
