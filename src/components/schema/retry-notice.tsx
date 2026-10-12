"use client";

import { IconRefresh } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";

/** Pesan gagal memuat bagian halaman + tombol coba lagi (render ulang dari server). */
export function RetryNotice({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <FormAlert tone="error">
      <span className="block">{children}</span>
      <Button
        size="sm"
        variant="outline"
        className="mt-2"
        pending={pending}
        leadingIcon={<IconRefresh aria-hidden />}
        onClick={() => start(() => router.refresh())}
      >
        Coba lagi
      </Button>
    </FormAlert>
  );
}
