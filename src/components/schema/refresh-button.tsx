"use client";

import { IconRefresh } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";

/** Muat ulang data halaman dari server (tanpa memuat ulang seluruh browser). */
export function RefreshButton({ label = "Muat ulang" }: { label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      className="h-(--control-h-lg) w-full md:h-(--control-h) md:w-auto"
      pending={pending}
      leadingIcon={<IconRefresh aria-hidden />}
      onClick={() => start(() => router.refresh())}
    >
      {label}
    </Button>
  );
}
