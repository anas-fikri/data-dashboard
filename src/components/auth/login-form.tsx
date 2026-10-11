"use client";

import { IconLogin } from "@tabler/icons-react";
import Link from "next/link";
import { useActionState } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { loginAction, type FormState } from "@/features/auth/actions";

interface LoginFormProps {
  next: string;
  /** Pesan konteks dari query (?verified=1, ?reason=expired). */
  notice?: { tone: "success" | "error"; text: string } | null;
}

export function LoginForm({ next, notice }: LoginFormProps) {
  const [state, action, pending] = useActionState<FormState, FormData>(loginAction, {
    status: "idle",
  });
  const error = state.status === "error" ? state : null;

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      {notice ? <FormAlert tone={notice.tone}>{notice.text}</FormAlert> : null}
      {error ? (
        <FormAlert tone="error">
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
      <Field id="email" label="Email perusahaan" required>
        <Input name="email" type="email" autoComplete="email" inputMode="email" required />
      </Field>
      <Field id="password" label="Password" required>
        <Input name="password" type="password" autoComplete="current-password" required />
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
