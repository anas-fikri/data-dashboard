"use client";

import { IconTrash, IconVideo } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, DIALOG_CTA } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { FocusNotice } from "@/components/ui/focus-notice";
import type { GuideVideoView } from "@/features/guides/videos";
import { UploadError, api, formatBytes } from "@/features/uploads/client";
import { GuideVideoPlayer } from "./video-player";
import { VideoUpload } from "./video-upload";

/**
 * Bagian "Video panduan" di editor artikel (T-021): daftar video siap (pemutar + ukuran + hapus) dan
 * form unggah. Hapus lewat dialog konfirmasi; fokus kembali ke tombol Hapus bila batal, ke pesan
 * hasil bila terhapus.
 */
export function GuideVideos({
  articleId,
  videos,
}: {
  articleId: string;
  videos: GuideVideoView[];
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<GuideVideoView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/guides/videos/${deleting.id}`, "DELETE", null);
      trigger.current = null;
      setDeleted(`Video “${deleting.title}” dihapus.`);
      setDeleting(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof UploadError ? e.message : "Terjadi gangguan. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="guide-videos-title" className="flex flex-col gap-4">
      <h2 id="guide-videos-title" className="text-lg font-semibold">
        Video panduan
      </h2>
      {deleted ? <FocusNotice tone="success">{deleted}</FocusNotice> : null}
      {videos.length ? (
        <ul className="grid gap-4 md:grid-cols-2" aria-label="Video artikel ini">
          {videos.map((v) => (
            <li key={v.id} className="flex flex-col gap-2 rounded-lg border p-3">
              <GuideVideoPlayer video={v} preload="metadata" />
              <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                <span>{formatBytes(v.sizeBytes)}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  leadingIcon={<IconTrash aria-hidden />}
                  onClick={(e) => {
                    trigger.current = e.currentTarget;
                    setError(null);
                    setDeleting(v);
                  }}
                >
                  Hapus<span className="sr-only"> video {v.title}</span>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<IconVideo />}
          title="Belum ada video"
          description="Rekaman layar singkat membantu pengguna mengikuti langkah di artikel ini."
        />
      )}
      <VideoUpload articleId={articleId} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && !busy && setDeleting(null)}
        title="Hapus video?"
        description={
          <>
            Video <strong>{deleting?.title}</strong> dan posternya dihapus permanen.
          </>
        }
        busy={busy}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          trigger.current?.focus(); // terhapus: FocusNotice yang memegang fokus
        }}
        action={
          <Button
            variant="destructive"
            pending={busy}
            className={DIALOG_CTA}
            onClick={() => void remove()}
          >
            Hapus
          </Button>
        }
      >
        {error ? <FocusNotice tone="error">{error}</FocusNotice> : null}
      </ConfirmDialog>
    </section>
  );
}
