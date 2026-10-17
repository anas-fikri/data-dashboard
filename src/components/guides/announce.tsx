"use client";

import { useEffect, useState } from "react";

/**
 * Wilayah status tersembunyi yang mengumumkan `message` ke pembaca layar (T-exfc). Teks yang sudah ada
 * saat halaman dimuat tidak diumumkan (cari = GET form → muat halaman penuh), jadi wilayah dirender
 * kosong dan diisi sesaat setelah tampil; pesan berubah (navigasi lunak) → diumumkan lagi. Teks yang
 * terlihat tetap dirender server di tempatnya.
 */
export function Announce({ message }: { message: string }) {
  const [text, setText] = useState("");
  useEffect(() => {
    // Jeda singkat: wilayah kosong harus sudah masuk pohon aksesibilitas sebelum diisi.
    const t = setTimeout(() => setText(message), 150);
    return () => clearTimeout(t);
  }, [message]);
  return (
    <p role="status" className="sr-only" data-testid="guide-search-announce">
      {text}
    </p>
  );
}
