"use client";

import { IconLockCheck } from "@tabler/icons-react";
import { useActionState, useRef } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { AUTH_INPUT } from "@/components/auth/login-form";
import { useFocusOnError } from "@/components/auth/use-focus-on-error";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { resetPasswordAction } from "@/features/auth/actions";
import type { FormState } from "@/features/auth/form-state";

/** Form password baru (POST). Token dipakai hanya saat tombol ditekan. */
export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(resetPasswordAction, {
    status: "idle",
  });
  const passwordRef = useRef<HTMLInputElement>(null);
  const alertRef = useFocusOnError(state, { password: passwordRef });
  const error = state.status === "error" ? state : null;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="token" value={token} />
      {error && !error.field ? (
        <FormAlert tone="error" ref={alertRef}>
          {error.message}
        </FormAlert>
      ) : null}
      <Field
        id="password"
        label="Password baru"
        hint="12 sampai 128 karakter. Semua perangkat yang sedang masuk akan dikeluarkan."
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
      <Button
        type="submit"
        size="lg"
        className="w-full"
        pending={pending}
        leadingIcon={<IconLockCheck aria-hidden />}
      >
        Simpan password baru
      </Button>
    </form>
  );
}
