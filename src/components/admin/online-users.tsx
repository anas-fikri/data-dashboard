"use client";

import { IconUsers } from "@tabler/icons-react";
import { useEffect, useId, useRef, useState } from "react";
import type { OnlineUser } from "@/features/presence/service";
import { usePolling } from "@/lib/hooks/use-polling";
import { EmailText } from "./email-text";

/*
 * "Sedang online" di Admin › Pengguna (T-h807): user yang aktif dalam 5 menit terakhir (tab aplikasi
 * terlihat), terbaru dulu — nama, email, kapan terakhir aktif, dan halaman terakhir. Polling 30 dtk (berhenti
 * saat tab tersembunyi — usePolling). Tidak bergantung pada monitor server. Jangkar #online (tautan kartu
 * Server): bagian ini difokus saat dibuka lewat hash.
 */
type Response = { ok: true; users: OnlineUser[]; now: string };

const TZ = "Asia/Jakarta";
const CLOCK = new Intl.DateTimeFormat("id-ID", { timeZone: TZ, timeStyle: "short" });

/** "baru saja", "3 menit lalu" (online ≤ 5 menit, jadi menit cukup). */
export function agoText(iso: string, now: number): string {
  const min = Math.floor(Math.max(0, now - Date.parse(iso)) / 60_000);
  return min < 1 ? "baru saja" : `${min} menit lalu`;
}

export function OnlineUsers() {
  const headingId = useId();
  const root = useRef<HTMLElement>(null);
  // 401/403/404 (sesi habis, akses admin dicabut) menghentikan polling: katakan, jangan diam (review #4).
  const [stopped, setStopped] = useState(false);
  const { data, error } = usePolling<Response>({
    url: "/api/presence",
    intervalMs: 30_000,
    initial: null,
    done: () => false,
    onStop: () => setStopped(true),
    immediate: true,
  });
  // "N menit lalu" dihitung terhadap jam server saat daftar dibaca (tanpa selisih jam klien).
  const now = data ? Date.parse(data.now) : 0;
  // Dibuka lewat #online — juga dari tautan kartu Server saat sudah di halaman ini (hashchange, review #5).
  useEffect(() => {
    const focus = () => {
      if (window.location.hash === "#online") root.current?.focus({ preventScroll: true });
    };
    focus();
    window.addEventListener("hashchange", focus);
    return () => window.removeEventListener("hashchange", focus);
  }, []);

  const users = data?.users ?? null;
  return (
    <section
      ref={root}
      id="online"
      tabIndex={-1}
      aria-labelledby={headingId}
      data-testid="online-users"
      className="flex scroll-mt-[calc(var(--topbar-h)+1rem)] flex-col gap-3 rounded-lg border bg-card p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="flex items-center gap-2 text-base font-semibold">
          <IconUsers size={18} stroke={1.75} aria-hidden className="text-muted-foreground" />
          Sedang online
          {users ? (
            <span className="font-normal text-muted-foreground" data-testid="online-count">
              ({users.length.toLocaleString("id-ID")})
            </span>
          ) : null}
        </h2>
        <p className="text-sm text-muted-foreground">
          Pengguna dengan tab aplikasi terbuka dan terlihat dalam 5 menit terakhir. Diperbarui
          otomatis.
        </p>
      </div>
      {stopped ? (
        <p className="text-sm" role="status" data-testid="online-stopped">
          Daftar tidak lagi diperbarui — sesi berakhir atau akses admin dicabut. Muat ulang halaman.
        </p>
      ) : null}
      {users === null ? (
        stopped ? null : (
          <p className="text-sm text-muted-foreground" role="status">
            {error ? "Daftar user online gagal dimuat. Mencoba lagi…" : "Memuat…"}
          </p>
        )
      ) : users.length === 0 ? (
        <p className="text-sm">Tidak ada pengguna yang sedang online.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" aria-label="Pengguna online">
          {users.map((u) => (
            <li
              key={u.id}
              className="flex min-w-0 flex-col gap-0.5 rounded-md border px-3 py-2 text-sm"
              data-testid="online-user"
            >
              <span className="font-medium [overflow-wrap:anywhere]">
                {u.name ?? <EmailText email={u.email} />}
              </span>
              {u.name ? (
                <span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                  <EmailText email={u.email} />
                </span>
              ) : null}
              <span className="truncate text-xs" title={u.page} data-testid="online-page">
                {u.page}
              </span>
              <span className="text-xs text-muted-foreground">
                Aktif {agoText(u.lastSeen, now)} ·{" "}
                <time dateTime={u.lastSeen}>
                  {CLOCK.format(new Date(u.lastSeen))}{" "}
                  <abbr title="Waktu Indonesia Barat">WIB</abbr>
                </time>
              </span>
            </li>
          ))}
        </ul>
      )}
      {users !== null && error && !stopped ? (
        <p className="text-xs text-muted-foreground" role="status">
          Gagal memperbarui daftar. Mencoba lagi…
        </p>
      ) : null}
    </section>
  );
}
