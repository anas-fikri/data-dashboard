"use client";

import { IconBadgeCc, IconTrash } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, DIALOG_CTA } from "@/components/ui/confirm-dialog";
import { FocusNotice } from "@/components/ui/focus-notice";
import { captionProblem } from "@/features/guides/media";
import type { GuideVideoView } from "@/features/guides/videos";
import { UploadError, api } from "@/features/uploads/client";
import { cn } from "@/lib/utils";

/**
 * Tambah/ganti/hapus takarir WebVTT satu video di editor (T-j9j6, T-qqbc): pra-cek .vtt ≤ 200 KB di
 * browser, server memeriksa ulang signature + UTF-8; hapus lewat dialog konfirmasi. Hasil diumumkan di
 * baris status di bawah tombol; sesudah hapus fokus kembali ke tombol tambah.
 */
export function CaptionUpload({
  video,
}: {
  video: Pick<GuideVideoView, "id" | "title" | "captionVersion">;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  /** n: kunci agar pesan yang sama (mis. file salah dua kali) dipasang ulang dan diumumkan lagi. */
  const [result, setResult] = useState<{ n: number; ok: boolean; text: string } | null>(null);
  const say = (ok: boolean, text: string) => setResult((r) => ({ n: (r?.n ?? 0) + 1, ok, text }));
  const hintId = `caption-hint-${video.id}`;
  const mainRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  /** Terhapus: tombol "Hapus takarir" hilang, jadi fokus pindah ke tombol tambah (batal = ke pembukanya). */
  const deleted = useRef(false);

  async function remove() {
    setBusy(true);
    setRemoveError(null);
    try {
      await api(`/api/guides/videos/${video.id}/takarir`, "DELETE", null);
      deleted.current = true;
      setConfirming(false);
      say(true, `Takarir video “${video.title}” dihapus.`);
      router.refresh();
    } catch (e) {
      // Gagal: dialog tetap terbuka dengan pesan yang difokus (pola hapus video).
      setRemoveError(e instanceof UploadError ? e.message : "Terjadi gangguan. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File) {
    const problem = captionProblem(file.name, file.size);
    if (problem) return say(false, problem.message);
    setBusy(true);
    try {
      const r = await fetch(`/api/guides/videos/${video.id}/takarir`, {
        method: "POST",
        headers: { "content-type": "text/vtt" },
        body: file,
      });
      const body = (await r.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (!r.ok || !body?.ok) return say(false, body?.message ?? "Terjadi gangguan. Coba lagi.");
      say(true, `Takarir video “${video.title}” tersimpan.`);
      router.refresh();
    } catch {
      say(false, "Koneksi terputus. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <input
        ref={inputRef}
        type="file"
        accept=".vtt,text/vtt"
        className="hidden"
        tabIndex={-1}
        aria-label={`Pilih file takarir video ${video.title}`}
        data-testid="caption-input"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (file) void upload(file);
        }}
      />
      <div className="flex flex-wrap gap-1">
        <Button
          ref={mainRef}
          variant="ghost"
          size="sm"
          className="h-(--control-h-lg) md:h-(--control-h-sm)"
          leadingIcon={<IconBadgeCc aria-hidden />}
          disabled={busy}
          aria-describedby={hintId}
          onClick={() => inputRef.current?.click()}
        >
          {busy && !confirming
            ? "Mengunggah takarir…"
            : video.captionVersion !== null
              ? "Ganti takarir"
              : "Tambah takarir"}
          <span className="sr-only"> video {video.title}</span>
        </Button>
        {video.captionVersion !== null ? (
          <Button
            ref={openerRef}
            variant="ghost"
            size="sm"
            className="h-(--control-h-lg) md:h-(--control-h-sm)"
            leadingIcon={<IconTrash aria-hidden />}
            disabled={busy}
            onClick={() => {
              deleted.current = false;
              setRemoveError(null);
              setConfirming(true);
            }}
          >
            Hapus takarir<span className="sr-only"> video {video.title}</span>
          </Button>
        ) : null}
      </div>
      <p id={hintId} className="text-xs text-muted-foreground">
        WebVTT (.vtt), maks. 200 KB
      </p>
      {/* Wilayah status selalu ada (bukan muncul bersama teksnya) agar pembaca layar mengumumkannya. */}
      <div role="status" data-testid="caption-status">
        {result ? (
          <p
            key={result.n}
            className={cn(
              "text-sm [overflow-wrap:anywhere]",
              result.ok ? "text-muted-foreground" : "text-destructive",
            )}
          >
            {result.text}
          </p>
        ) : null}
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={(o) => !o && !busy && setConfirming(false)}
        title="Hapus takarir?"
        description={
          <>
            Takarir video <strong>{video.title}</strong> dihapus; pemutar tidak lagi menampilkan
            tombol takarir. Takarir bisa ditambahkan lagi kapan saja.
          </>
        }
        busy={busy}
        onCloseAutoFocus={(e) => {
          // Dialog dibuka dari tombol biasa (bukan Trigger): fokus dikembalikan sendiri.
          e.preventDefault();
          (deleted.current ? mainRef : openerRef).current?.focus();
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
        {removeError ? <FocusNotice tone="error">{removeError}</FocusNotice> : null}
      </ConfirmDialog>
    </div>
  );
}
