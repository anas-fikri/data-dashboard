"use client";

import { IconBadgeCc } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { captionProblem } from "@/features/guides/media";
import type { GuideVideoView } from "@/features/guides/videos";
import { cn } from "@/lib/utils";

/**
 * Tambah/ganti takarir WebVTT satu video di editor (T-j9j6): pra-cek .vtt ≤ 200 KB di browser, server
 * memeriksa ulang signature + UTF-8. Hasil diumumkan di baris status di bawah tombol.
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
      <Button
        variant="ghost"
        size="sm"
        className="h-(--control-h-lg) self-start md:h-(--control-h-sm)"
        leadingIcon={<IconBadgeCc aria-hidden />}
        disabled={busy}
        aria-describedby={hintId}
        onClick={() => inputRef.current?.click()}
      >
        {busy
          ? "Mengunggah takarir…"
          : video.captionVersion !== null
            ? "Ganti takarir"
            : "Tambah takarir"}
        <span className="sr-only"> video {video.title}</span>
      </Button>
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
    </div>
  );
}
