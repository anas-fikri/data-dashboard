"use client";

import { IconSparkles } from "@tabler/icons-react";
import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { WHATS_NEW_LATEST } from "@/features/whats-new/entries";

/*
 * "Yang baru" (v1.10.0): tombol di kepala halaman dengan titik penanda sampai halaman Yang baru versi
 * terbaru dibuka di browser ini (localStorage; tanpa penyimpanan → titik tetap tampil, tidak masalah).
 */
const KEY = "dd:whats-new-seen";
const EVENT = "dd:whats-new-seen";

function seenVersion(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

export function WhatsNewLink() {
  // Server dan render pertama: tanpa titik (tidak ada hydration mismatch); browser lalu membaca status.
  const unseen = useSyncExternalStore(
    subscribe,
    () => seenVersion() !== WHATS_NEW_LATEST,
    () => false,
  );
  return (
    <Button asChild variant="ghost" size="icon" className="relative">
      <Link
        href="/yang-baru"
        aria-label={unseen ? "Yang baru (ada pembaruan)" : "Yang baru"}
        data-testid="whats-new-link"
      >
        <IconSparkles aria-hidden />
        {unseen ? (
          <span
            aria-hidden
            data-testid="whats-new-dot"
            className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary ring-2 ring-background forced-colors:bg-[Highlight]"
          />
        ) : null}
      </Link>
    </Button>
  );
}

/** Dipasang di halaman Yang baru: versi terbaru dianggap sudah dibaca. */
export function MarkWhatsNewSeen() {
  useEffect(() => {
    try {
      localStorage.setItem(KEY, WHATS_NEW_LATEST);
    } catch {
      // Penyimpanan browser tidak tersedia: titik tetap tampil.
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return null;
}
