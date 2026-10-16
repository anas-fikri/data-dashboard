"use client";

import {
  IconArrowDown,
  IconArrowUp,
  IconEye,
  IconEyeOff,
  IconPencil,
  IconTrash,
} from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  deleteGuideAction,
  moveGuideAction,
  setGuideStatusAction,
  type GuideActionResult,
} from "@/features/guides/actions";
import type { GuideContextValue, GuideRoleValue } from "@/features/guides/validation";
import { CONTEXT_LABEL, ROLE_LABEL } from "./labels";

export interface GuideRow {
  id: string;
  title: string;
  slug: string;
  role: GuideRoleValue;
  contextKey: GuideContextValue | null;
  status: "DRAFT" | "PUBLISHED";
}

/**
 * Daftar artikel di /admin/panduan (T-020): urutan tampil (naik/turun), terbitkan/tarik, hapus
 * (konfirmasi). Galat aksi tampil di atas daftar; halaman diperbarui dari server setelah berhasil.
 */
export function GuideList({ guides }: { guides: GuideRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<GuideRow | null>(null);

  async function run(key: string, act: () => Promise<GuideActionResult>) {
    setBusy(key);
    setError(null);
    let r: GuideActionResult;
    try {
      r = await act();
    } catch {
      r = { ok: false, code: "BUSY", message: "Koneksi terputus. Coba lagi." };
    }
    setBusy(null);
    if (!r.ok) {
      setError(r.message);
      return false;
    }
    router.refresh();
    return true;
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <FormAlert tone="error">{error}</FormAlert> : null}
      <ol aria-label="Artikel panduan" className="flex flex-col divide-y rounded-lg border bg-card">
        {guides.map((g, i) => (
          <li
            key={g.id}
            data-testid="guide-row"
            data-slug={g.slug}
            className="flex flex-col gap-3 p-4 md:flex-row md:items-center"
          >
            <div className="min-w-0 flex-1">
              <Link
                href={`/admin/panduan/${g.id}`}
                className="font-medium [overflow-wrap:anywhere] hover:underline"
              >
                {g.title}
              </Link>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge
                  tone={g.status === "PUBLISHED" ? "success" : "neutral"}
                  icon={g.status === "PUBLISHED" ? <IconEye /> : <IconEyeOff />}
                >
                  {g.status === "PUBLISHED" ? "Terbit" : "Draf"}
                </Badge>
                <span>{ROLE_LABEL[g.role]}</span>
                {g.contextKey ? <span>· Bantuan {CONTEXT_LABEL[g.contextKey]}</span> : null}
                <span className="font-mono">· /panduan/{g.slug}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                aria-label={`Naikkan ${g.title}`}
                title="Naikkan"
                disabled={i === 0 || !!busy}
                pending={busy === `up:${g.id}`}
                onClick={() => void run(`up:${g.id}`, () => moveGuideAction(g.id, "up"))}
              >
                <IconArrowUp aria-hidden />
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label={`Turunkan ${g.title}`}
                title="Turunkan"
                disabled={i === guides.length - 1 || !!busy}
                pending={busy === `down:${g.id}`}
                onClick={() => void run(`down:${g.id}`, () => moveGuideAction(g.id, "down"))}
              >
                <IconArrowDown aria-hidden />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!!busy}
                pending={busy === `status:${g.id}`}
                leadingIcon={
                  g.status === "PUBLISHED" ? <IconEyeOff aria-hidden /> : <IconEye aria-hidden />
                }
                onClick={() =>
                  void run(`status:${g.id}`, () =>
                    setGuideStatusAction(g.id, g.status !== "PUBLISHED"),
                  )
                }
              >
                {g.status === "PUBLISHED" ? "Tarik" : "Terbitkan"}
                <span className="sr-only"> {g.title}</span>
              </Button>
              <Button
                asChild
                variant="ghost"
                size="icon"
                aria-label={`Ubah ${g.title}`}
                title="Ubah"
              >
                <Link href={`/admin/panduan/${g.id}`}>
                  <IconPencil aria-hidden />
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Hapus ${g.title}`}
                title="Hapus"
                disabled={!!busy}
                onClick={() => setDeleting(g)}
              >
                <IconTrash aria-hidden />
              </Button>
            </div>
          </li>
        ))}
      </ol>
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && !busy && setDeleting(null)}
        title="Hapus artikel?"
        description={
          <>
            Artikel <strong>{deleting?.title}</strong> dihapus permanen dan hilang dari /panduan.
          </>
        }
        busy={!!busy}
        action={
          <Button
            variant="destructive"
            pending={busy === "delete"}
            onClick={async () => {
              if (deleting && (await run("delete", () => deleteGuideAction(deleting.id)))) {
                setDeleting(null);
              }
            }}
          >
            Hapus
          </Button>
        }
      />
    </div>
  );
}
