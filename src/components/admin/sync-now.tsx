"use client";

import { IconCloudUpload } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { requestSyncAction, syncStateAction } from "@/features/backup/actions";
import type { SyncState } from "@/features/backup/types";
import { formatWibTime } from "./backup-format";

const POLL_MS = 10_000;
/** Berhenti memantau setelah ini (run panjang tetap selesai; muat ulang halaman menampilkan hasilnya). */
const POLL_MAX_MS = 60 * 60 * 1000;
const NETWORK = "Tidak bisa menghubungi server aplikasi. Periksa koneksi, lalu coba lagi.";

function describe(sync: SyncState): string | null {
  if (sync.running?.kind === "backup") {
    return `Backup harian sedang berjalan sejak ${formatWibTime(sync.running.since)}; arsipnya dikirim ke NAS setelah selesai.`;
  }
  if (sync.running)
    return `Sedang mengirim arsip ke NAS sejak ${formatWibTime(sync.running.since)}…`;
  if (sync.requested) {
    return "Permintaan terkirim. Service backup mulai mengirim dalam ± 1 menit (paling sering sekali per 5 menit).";
  }
  return null;
}

/**
 * "Kirim ulang sekarang" (T-tsvf): menulis permintaan untuk service backup, lalu memantau sampai permintaan
 * diambil dan run selesai — halaman dimuat ulang (data server) begitu selesai. Induk memberi `key` dari
 * status terakhir sehingga komponen mulai ulang dengan data baru setelah router.refresh().
 */
export function SyncNow({ initial }: { initial: SyncState }) {
  const router = useRouter();
  const [sync, setSync] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const busy = sync.requested || sync.running !== null;

  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    let alive = true;
    const timer = setInterval(async () => {
      if (Date.now() - started > POLL_MAX_MS) return clearInterval(timer);
      const r = await syncStateAction().catch(() => null);
      if (!alive || !r?.ok) return;
      setSync(r.data.sync);
      if (!r.data.sync.requested && !r.data.sync.running) router.refresh();
    }, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [busy, router]);

  function request() {
    setError(null);
    start(async () => {
      const r = await requestSyncAction().catch(() => null);
      if (!r) return setError(NETWORK);
      if (!r.ok) return setError(r.message);
      setSync(r.data);
    });
  }

  const text = describe(sync);
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <p className="text-sm text-muted-foreground" aria-live="polite" data-testid="sync-state">
        {error ? <span className="text-destructive">{error}</span> : text}
      </p>
      <Button
        type="button"
        variant="outline"
        pending={pending}
        disabled={pending || busy}
        leadingIcon={<IconCloudUpload aria-hidden />}
        className="h-(--control-h-lg) w-full shrink-0 md:h-(--control-h) md:w-auto"
        onClick={request}
      >
        Kirim ulang sekarang
      </Button>
    </div>
  );
}
