"use client";

import { IconRefresh } from "@tabler/icons-react";
import { useTransition } from "react";
import { AdminCrumb } from "@/components/admin/admin-crumb";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

/** Daftar pengguna gagal dimuat (mis. database tidak terjangkau). Detail galat hanya di log server. */
export default function AdminUsersError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={<AdminCrumb />} title="Pengguna" />
      <FormAlert tone="error">
        <span className="block">
          Daftar pengguna gagal dimuat. Coba lagi sebentar lagi; bila tetap gagal, hubungi tim TI.
        </span>
        <Button
          size="sm"
          variant="outline"
          className="mt-2 h-(--control-h-lg) md:h-(--control-h-sm)"
          pending={pending}
          leadingIcon={<IconRefresh aria-hidden />}
          onClick={() => start(() => retry())}
        >
          Coba lagi
        </Button>
      </FormAlert>
    </div>
  );
}
