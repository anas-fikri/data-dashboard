import { formatDuration } from "@/features/guides/media";
import type { GuideVideoView } from "@/features/guides/videos";

/**
 * Pemutar video panduan (T-021): <video> bawaan (kontrol keyboard), poster PNG, sumber presigned 1 jam;
 * storage menjawab Range dengan 206 sehingga melompat tidak mengunduh seluruh file. Rasio 16:9 dipesan
 * sebelum video dimuat (tanpa pergeseran tata letak).
 */
export function GuideVideoPlayer({
  video,
  preload = "none",
}: {
  video: Pick<GuideVideoView, "id" | "title" | "durationSec" | "src" | "poster">;
  /** "none" di halaman Panduan (banyak video), "metadata" di editor. */
  preload?: "none" | "metadata";
}) {
  return (
    <figure
      className="flex min-w-0 flex-col gap-2"
      data-testid="guide-video"
      data-video-id={video.id}
    >
      {/* Rekaman layar tanpa suara: alternatif teksnya isi artikel (WCAG 1.2.1); takarir VTT untuk
          video bernarasi → task lanjutan. */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        controls
        playsInline
        preload={preload}
        poster={video.poster ?? undefined}
        src={video.src}
        aria-label={video.title}
        className="aspect-video w-full rounded-md border bg-muted"
      >
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
