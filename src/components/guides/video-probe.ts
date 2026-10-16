import { POSTER_MAX_BYTES } from "@/features/guides/media";

/*
 * Durasi dan poster PNG video panduan diambil di browser dari file lokal (T-021, D12): <video> dari
 * object URL → loadedmetadata (durasi) → lompat ke detik 1 (atau tengah video pendek) → canvas → PNG.
 * Gagal (codec tidak didukung browser, waktu habis) → null; unggahan tetap jalan tanpa durasi/poster.
 */

const TIMEOUT_MS = 15_000;
const POSTER_WIDTHS = [1280, 640];

function once(el: HTMLVideoElement, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = (ok: boolean) => {
      clearTimeout(timer);
      el.removeEventListener(event, onOk);
      el.removeEventListener("error", onErr);
      if (ok) resolve();
      else reject(new Error(`video ${event} gagal`));
    };
    const onOk = () => done(true);
    const onErr = () => done(false);
    const timer = setTimeout(() => done(false), TIMEOUT_MS);
    el.addEventListener(event, onOk);
    el.addEventListener("error", onErr);
  });
}

function toPng(video: HTMLVideoElement, width: number): Promise<Blob | null> {
  const scale = Math.min(1, width / video.videoWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

export async function probeVideo(
  file: File,
): Promise<{ durationSec: number | null; poster: Blob | null }> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  let durationSec: number | null = null;
  let poster: Blob | null = null;
  try {
    await once(video, "loadedmetadata");
    if (video.duration === Infinity) {
      // Rekaman MediaRecorder (webm) tanpa durasi di header: lompat jauh agar browser menghitungnya.
      video.currentTime = Number.MAX_SAFE_INTEGER;
      await once(video, "seeked");
    }
    durationSec = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
    video.currentTime = Math.min(1, (durationSec ?? 0) / 2);
    await once(video, "seeked");
    if (video.videoWidth > 0) {
      for (const w of POSTER_WIDTHS) {
        const png = await toPng(video, w);
        if (png && png.size <= POSTER_MAX_BYTES) {
          poster = png;
          break;
        }
      }
    }
  } catch {
    // Codec/format tidak bisa dibaca browser ini: lanjut tanpa durasi/poster yang belum didapat.
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
  return { durationSec, poster };
}
