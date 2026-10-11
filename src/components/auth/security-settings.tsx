"use client";

import { IconDeviceFloppy, IconLogout } from "@tabler/icons-react";
import { useActionState, useRef, useTransition } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { useFocusOnError } from "@/components/auth/use-focus-on-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { changePasswordAction, logoutAction } from "@/features/auth/actions";
import type { FormState } from "@/features/auth/form-state";

/** Ganti password (wajib password lama) dan keluar dari semua perangkat. */
export function SecuritySettings() {
  const [state, action, pending] = useActionState<FormState, FormData>(changePasswordAction, {
    status: "idle",
  });
  const currentRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const alertRef = useFocusOnError(state, { current: currentRef, password: passwordRef });
  const [signingOut, startSignOut] = useTransition();
  const error = state.status === "error" ? state : null;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Ganti password</CardTitle>
          <CardDescription>
            Perangkat lain yang sedang masuk akan dikeluarkan. Perangkat ini tetap masuk.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={action} className="flex max-w-md flex-col gap-4" noValidate>
            {state.status === "success" ? (
              <FormAlert tone="success">
                Password diganti. Perangkat lain sudah dikeluarkan.
              </FormAlert>
            ) : null}
            {error && !error.field ? (
              <FormAlert tone="error" ref={alertRef}>
                {error.message}
              </FormAlert>
            ) : null}
            <Field
              id="current"
              label="Password saat ini"
              required
              error={error?.field === "current" ? error.message : undefined}
            >
              <PasswordInput ref={currentRef} name="current" autoComplete="current-password" />
            </Field>
            <Field
              id="password"
              label="Password baru"
              hint="12 sampai 128 karakter."
              required
              error={error?.field === "password" ? error.message : undefined}
            >
              <PasswordInput
                ref={passwordRef}
                name="password"
                autoComplete="new-password"
                maxLength={128}
              />
            </Field>
            <Button
              type="submit"
              pending={pending}
              leadingIcon={<IconDeviceFloppy aria-hidden />}
              className="w-full sm:w-auto sm:self-start"
            >
              Simpan password
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Keluar dari semua perangkat</CardTitle>
          <CardDescription>
            Gunakan bila Anda lupa keluar di komputer lain atau curiga akun dipakai orang lain.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            pending={signingOut}
            leadingIcon={<IconLogout aria-hidden />}
            className="w-full sm:w-auto"
            onClick={() => startSignOut(() => logoutAction())}
            data-testid="logout-everywhere"
          >
            Keluar dari semua perangkat
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
