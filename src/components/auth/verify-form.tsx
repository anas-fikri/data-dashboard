"use client";

import { IconCircleCheck } from "@tabler/icons-react";
import { useActionState } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { verifyEmailAction, type FormState } from "@/features/auth/actions";

/** Tombol konfirmasi aktivasi (POST). Token hanya dipakai saat tombol ditekan. */
export function VerifyForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(verifyEmailAction, {
    status: "idle",
  });
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      {state.status === "error" ? <FormAlert tone="error">{state.message}</FormAlert> : null}
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
