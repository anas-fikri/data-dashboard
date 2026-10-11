"use client";

import { IconLogin } from "@tabler/icons-react";
import Link from "next/link";
import { useActionState, useRef } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { useFocusOnError } from "@/components/auth/use-focus-on-error";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { loginAction } from "@/features/auth/actions";
import type { FormState } from "@/features/auth/form-state";

/** Input auth: 44px di ponsel (sejajar tombol lg), 36px di desktop. */
export const AUTH_INPUT = "h-(--control-h-lg) md:h-(--control-h)";

interface LoginFormProps {
  next: string;
  /** Pesan konteks dari query (?verified=1, ?reason=expired|signed-out). */
  notice?: { tone: "success" | "error"; text: string } | null;
}

export function LoginForm({ next, notice }: LoginFormProps) {
  const [state, action, pending] = useActionState<FormState, FormData>(loginAction, {
    status: "idle",
  });
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const alertRef = useFocusOnError(state, { email: emailRef, password: passwordRef });
  const error = state.status === "error" ? state : null;

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      {notice && !error ? <FormAlert tone={notice.tone}>{notice.text}</FormAlert> : null}
      {error && !error.field ? (
        <FormAlert tone="error" ref={alertRef}>
          {error.message}
          {error.code === "EMAIL_NOT_VERIFIED" ? (
            <>
              {" "}
              <Link href="/register?resend=1" className="font-medium underline underline-offset-4">
                Kirim ulang email verifikasi
              </Link>
            </>
          ) : null}
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
      <Field
        id="password"
        label="Password"
        required
        error={error?.field === "password" ? error.message : undefined}
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
        pending={pending}
        leadingIcon={<IconLogin aria-hidden />}
        className="w-full"
        size="lg"
      >
        Masuk
      </Button>
    </form>
  );
}
