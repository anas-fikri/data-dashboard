"use client";

import { useEffect, useRef, useState } from "react";
import { formatDuration } from "@/features/guides/media";
import type { GuideVideoView } from "@/features/guides/videos";

/** Presigned berlaku 1 jam: diperbarui saat diputar/dilompati setelah 55 menit (T-z5nq). */
const REFRESH_AFTER_MS = 55 * 60 * 1000;
const ERROR_REFRESH_GAP_MS = 5 * 60 * 1000;

/**
 * Pemutar video panduan (T-021): <video> bawaan (kontrol keyboard), poster PNG, sumber presigned 1 jam;
 * storage menjawab Range dengan 206 sehingga melompat tidak mengunduh seluruh file. Rasio 16:9 dipesan
 * sebelum video dimuat (tanpa pergeseran tata letak). Halaman yang dibiarkan terbuka > 1 jam: sumber
 * baru diambil dari /api/guides/videos/<id>/sumber saat diputar, dilompati, atau gagal dimuat, lalu
 * posisi dan status putar dipulihkan — tanpa memuat ulang halaman (T-z5nq).
 */
export function GuideVideoPlayer({
  video,
  preload = "none",
}: {
  video: Pick<
    GuideVideoView,
    "id" | "issuedAt" | "title" | "durationSec" | "src" | "poster" | "captionVersion"
  >;
  /** "none" di halaman Panduan (banyak video), "metadata" di editor. */
  preload?: "none" | "metadata";
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [media, setMedia] = useState({ src: video.src, poster: video.poster });
  // Waktu tanda tangan dari server: halaman dari cache router tetap diperbarui tepat waktu.
  const issuedAt = useRef(video.issuedAt);
  const busy = useRef(false);
  const wantsPlay = useRef(false);
  const lastErrorRefresh = useRef(0);
  const resume = useRef<{ time: number; play: boolean } | null>(null);

  useEffect(() => {
    // preload="none" tidak memuat sumber baru sampai diputar: lanjutkan putar agar metadata dimuat.
    if (resume.current?.play) void ref.current?.play().catch(() => {});
  }, [media.src]);

  const stale = () => Date.now() - issuedAt.current > REFRESH_AFTER_MS;

  async function refresh(play: boolean) {
    const el = ref.current;
    if (!el || busy.current) return;
    busy.current = true;
    try {
      const r = await fetch(`/api/guides/videos/${video.id}/sumber`, { cache: "no-store" });
      const body = (r.ok ? await r.json() : null) as {
        ok?: boolean;
        src?: string;
        poster?: string | null;
      } | null;
      if (!body?.ok || !body.src) return;
      resume.current = { time: el.currentTime, play };
      issuedAt.current = Date.now();
      setMedia({ src: body.src, poster: body.poster ?? null });
    } catch {
      // Jaringan putus: galat bawaan pemutar tetap terlihat; dicoba lagi pada aksi berikutnya.
    } finally {
      busy.current = false;
    }
  }

  return (
    <figure
      className="flex min-w-0 flex-col gap-2"
      data-testid="guide-video"
      data-video-id={video.id}
    >
      {/* Video bernarasi: takarir WebVTT (T-j9j6), tombol takarir dari kontrol bawaan. Rekaman layar
          tanpa suara: alternatif teksnya isi artikel (WCAG 1.2.1). */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={ref}
        controls
        playsInline
        preload={preload}
        poster={media.poster ?? undefined}
        src={media.src}
        aria-label={video.title}
        className="aspect-video w-full rounded-md border bg-muted"
        onPlay={(e) => {
          wantsPlay.current = true;
          if (!stale()) return;
          e.currentTarget.pause();
          void refresh(true);
        }}
        onPause={() => {
          if (!busy.current) wantsPlay.current = false;
        }}
        onSeeking={(e) => {
          if (stale()) void refresh(!e.currentTarget.paused || wantsPlay.current);
        }}
        onError={() => {
          // URL kedaluwarsa (403) → ambil ulang paling sering sekali per 5 menit, agar galat lain
          // (format, file rusak di tengah) tidak memicu putaran ambil-ulang tanpa akhir.
          if (Date.now() - lastErrorRefresh.current < ERROR_REFRESH_GAP_MS) return;
          lastErrorRefresh.current = Date.now();
          void refresh(wantsPlay.current);
        }}
        onLoadedMetadata={(e) => {
          const r = resume.current;
          if (!r) return;
          resume.current = null;
          e.currentTarget.currentTime = r.time;
          if (r.play) void e.currentTarget.play().catch(() => {});
        }}
      >
        {video.captionVersion !== null ? (
          <track
            key={video.captionVersion}
            kind="captions"
            src={`/api/guides/videos/${video.id}/takarir?v=${video.captionVersion}`}
            srcLang="id"
            label="Bahasa Indonesia"
          />
        ) : null}
        Browser ini tidak dapat memutar video ini.
      </video>
      <figcaption className="text-sm [overflow-wrap:anywhere]">
        <span className="font-medium">{video.title}</span>
        {video.durationSec ? (
          <span className="text-muted-foreground"> · {formatDuration(video.durationSec)}</span>
        ) : null}
      </figcaption>
    </figure>
  );
}
