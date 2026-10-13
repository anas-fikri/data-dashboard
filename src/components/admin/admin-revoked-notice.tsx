"use client";

import { useEffect } from "react";
import { FocusNotice } from "@/components/ui/focus-notice";

/**
 * Pemberitahuan sekali tampil setelah admin mencabut aksesnya sendiri (?notice=admin-dicabut).
 * Parameter dihapus dari URL lewat history API (terintegrasi dengan router Next, tanpa memuat ulang
 * halaman), jadi pemberitahuan dan fokusnya tetap, tetapi muat ulang/bookmark tidak menampilkannya lagi.
 */
export function AdminRevokedNotice() {
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("notice");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);
  return (
    <div data-testid="admin-revoked-notice">
      <FocusNotice>Akses admin Anda sudah dicabut.</FocusNotice>
    </div>
  );
}
