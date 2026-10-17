"use client";

import { GuideError } from "@/components/guides/guide-error";

/** /panduan dan artikelnya gagal dimuat (mis. database tidak terjangkau), T-0vjt. */
export default function GuidesError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <GuideError title="Panduan penggunaan" what="Panduan" retry={retry} />;
}
