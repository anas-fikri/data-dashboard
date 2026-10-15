"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { listSharesAction } from "@/features/sharing/actions";
import type { ShareActionResult, ShareState } from "@/features/sharing/types";
import { shareErrorText } from "./share-model";

/*
 * Status dialog share (T-016): memuat daftar akses saat dialog dibuka (komponen ini hanya terpasang
 * selama dialog terbuka), lalu menjalankan satu aksi share sekaligus. Setiap aksi mengembalikan
 * keadaan share terbaru dari server — itu yang ditampilkan (tidak ada tebakan optimistis); aksi yang
 * ditolak NOT_FOUND memuat ulang daftarnya. Galat aksi diingat per bagian dialog (`at`) agar pesannya
 * tampil di dekat kontrol yang memicunya.
 */
export type ShareSection = "org" | "add" | "grants" | "revoke";
type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: ShareState };

export function useShareState(dashboardId: string) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  /** Kunci kontrol yang sedang berjalan (mis. "role:<userId>"); null = tidak ada aksi. */
  const [busy, setBusy] = useState<string | null>(null);
  /** Galat aksi terakhir; `key` = kontrol pemicunya (mis. "role:<userId>" → tampil di baris itu). */
  const [error, setError] = useState<{ at: ShareSection; key: string; message: string } | null>(
    null,
  );
  const [announcement, setAnnouncement] = useState("");
  /** Nomor muatan terakhir: jawaban basi (dialog ditutup / coba lagi lebih baru) dibuang. */
  const seq = useRef(0);
  const running = useRef(false);

  async function fetchState() {
    const n = ++seq.current;
    const r = await listSharesAction(dashboardId).catch(() => null);
    if (n !== seq.current) return;
    setLoad(
      r?.ok ? { status: "ready", data: r.data } : { status: "error", message: shareErrorText(r) },
    );
  }

  const initial = useEffectEvent(() => void fetchState());
  useEffect(() => {
    initial();
    const s = seq;
    return () => {
      s.current++;
    };
  }, []);

  return {
    load,
    busy,
    error,
    announcement,
    retry() {
      setLoad({ status: "loading" });
      void fetchState();
    },
    clearError: () => setError(null),
    /**
     * Jalankan satu aksi share. `key` menandai kontrol yang menunggu; selama berjalan kontrol lain
     * dikunci (tidak ada dua perubahan yang saling balap). Berhasil → keadaan baru + pengumuman.
     */
    async run(
      key: string,
      at: ShareSection,
      op: () => Promise<ShareActionResult<ShareState>>,
      done: (data: ShareState) => string,
    ): Promise<boolean> {
      // Ref, bukan state: dua klik sebelum render berikutnya tetap hanya menjalankan satu aksi.
      if (running.current) return false;
      running.current = true;
      setBusy(key);
      setError(null);
      const r = await op().catch(() => null);
      // NOT_FOUND: keadaan di dialog sudah usang (mis. orangnya dicabut di tab/perangkat lain) → daftar
      // dimuat ulang dulu, masih sibuk, agar galat tampil terhadap daftar terbaru dan fokus dipulihkan
      // setelah daftar itu tampil — tidak jatuh ke <body> saat barisnya hilang (review T-016 R5-DI-1).
      if (r && !r.ok && r.code === "NOT_FOUND") await fetchState();
      running.current = false;
      setBusy(null);
      if (r?.ok) {
        setLoad({ status: "ready", data: r.data });
        setAnnouncement(done(r.data));
        return true;
      }
      setError({ at, key, message: shareErrorText(r) });
      return false;
    },
  };
}
