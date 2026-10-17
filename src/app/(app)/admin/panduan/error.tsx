"use client";

import { AdminCrumb } from "@/components/admin/admin-crumb";
import { GuideError } from "@/components/guides/guide-error";

/** Halaman admin panduan (daftar, baru, ubah) gagal dimuat, mis. database tidak terjangkau (T-0vjt). */
export default function AdminGuidesError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <GuideError eyebrow={<AdminCrumb />} title="Panduan" what="Artikel panduan" retry={retry} />
  );
}
