"use client";

import { IconRefresh } from "@tabler/icons-react";
import { useTransition, type ReactNode } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

/**
 * Galat segmen panduan (error.tsx /panduan dan /admin/panduan, T-0vjt), mis. database tidak terjangkau:
 * judul halaman tetap tampil di dalam shell (bukan galat global), pesan tanpa detail (detail hanya di
 * log server), dan Coba lagi = retry Next (ambil ulang lalu render ulang segmen).
 */
export function GuideError({
  eyebrow,
  title,
  what,
  retry,
}: {
  eyebrow?: ReactNode;
  /** Judul halaman (h1) seperti saat berhasil dimuat. */
  title: string;
  /** Yang gagal dimuat, awal kalimat (mis. "Panduan"). */
  what: string;
  retry: () => void;
}) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={eyebrow} title={title} />
      <FormAlert tone="error">
        <span className="block">
          {what} gagal dimuat. Coba lagi sebentar lagi; bila tetap gagal, hubungi tim TI.
        </span>
        <Button
          size="sm"
          variant="outline"
          className="mt-2 h-(--control-h-lg) w-full md:h-(--control-h-sm) md:w-auto"
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
