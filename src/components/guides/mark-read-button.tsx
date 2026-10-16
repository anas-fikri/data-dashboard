"use client";

import { IconCheck, IconCircleCheck } from "@tabler/icons-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { markGuideReadAction } from "@/features/guides/reader-actions";

/**
 * "Tandai sudah dibaca" (T-022). Setelah berhasil, tombol diganti status "Sudah dibaca" yang menerima
 * fokus (tombol yang ditekan hilang dari halaman); galat tampil dan difokus.
 */
export function MarkReadButton({ articleId, read }: { articleId: string; read: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const marked = useRef(false);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (read && marked.current) statusRef.current?.focus();
  }, [read]);
  useEffect(() => {
    if (error) alertRef.current?.focus();
  }, [error]);

  if (read) {
    return (
      <p
        ref={statusRef}
        role="status"
        tabIndex={-1}
        className="inline-flex min-h-(--control-h) items-center gap-1.5 text-sm font-medium text-success outline-none"
      >
        <IconCircleCheck size={20} stroke={1.5} aria-hidden />
        Sudah dibaca
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="outline"
        pending={pending}
        leadingIcon={<IconCheck aria-hidden />}
        className="h-(--control-h-lg) w-full md:h-(--control-h) md:w-auto"
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await markGuideReadAction(articleId).catch(() => null);
            if (r?.ok) marked.current = true;
            else setError(r?.message ?? "Koneksi terputus. Coba lagi.");
          })
        }
      >
        Tandai sudah dibaca
      </Button>
      {error ? (
        <FormAlert tone="error" ref={alertRef}>
          {error}
        </FormAlert>
      ) : null}
    </div>
  );
}
