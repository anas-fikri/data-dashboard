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
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, DIALOG_CTA } from "@/components/ui/confirm-dialog";
import { FocusNotice } from "@/components/ui/focus-notice";
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

/** Kontrol yang menerima fokus lagi setelah aksi: [id artikel, data-action]. */
type Target = [string, string];

/** Fokus ke kontrol target di barisnya; bila nonaktif, kontrol aktif lain di baris itu; lalu daftar. */
function focusTarget(list: HTMLElement | null, t: Target | null) {
  if (!list || !t) return;
  const row = list.querySelector(`[data-guide-id="${t[0]}"]`);
  const el = [
    row?.querySelector(`[data-action="${t[1]}"]`),
    ...(row?.querySelectorAll("[data-action]") ?? []),
  ].find((e): e is HTMLElement => e instanceof HTMLElement && !(e as HTMLButtonElement).disabled);
  (el ?? list).focus();
}

/**
 * Daftar artikel di /admin/panduan (T-020): urutan tampil (naik/turun), terbitkan/tarik, hapus
 * (konfirmasi). Selama aksi berjalan fokus ditahan di daftar (tombol yang ditekan jadi disabled), lalu
 * kembali ke tombol pemicunya — atau tombol lain di baris yang sama bila tombol itu kini nonaktif. Hasil
 * diumumkan sopan (aria-live); galat menerima fokus.
 */
export function GuideList({ guides }: { guides: GuideRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [deleting, setDeleting] = useState<GuideRow | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const returnTo = useRef<Target | null>(null);

  // Tahan fokus di daftar selama aksi; setelahnya (dan setelah urutan baru dimuat) kembalikan.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const a = document.activeElement;
    const lost =
      !a ||
      a === document.body ||
      a === list ||
      (list.contains(a) && (a as HTMLButtonElement).disabled === true);
    if (!lost) return;
    if (busy) list.focus();
    else focusTarget(list, returnTo.current);
  }, [busy, guides]);

  async function run(key: string, act: () => Promise<GuideActionResult>, done: string) {
    setBusy(key);
    setError(null);
    setAnnouncement("");
    let r: GuideActionResult;
    try {
      r = await act();
    } catch {
      r = { ok: false, code: "BUSY", message: "Koneksi terputus. Coba lagi." };
    }
    if (!r.ok) {
      // FocusNotice (efek anak, lebih dulu) mengambil fokus; target tetap untuk Batal di dialog.
      setBusy(null);
      setError(r.message);
      return false;
    }
    setBusy(null);
    setAnnouncement(done);
    router.refresh();
    return true;
  }

  function act(g: GuideRow, action: string, call: () => Promise<GuideActionResult>, done: string) {
    returnTo.current = [g.id, action];
    void run(`${action}:${g.id}`, call, done);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      {error && !deleting ? <FocusNotice tone="error">{error}</FocusNotice> : null}
      <ol
        ref={listRef}
        tabIndex={-1}
        aria-label="Artikel panduan"
        className="flex flex-col divide-y rounded-lg border bg-card outline-none"
      >
        {guides.map((g, i) => (
          <li
            key={g.id}
            data-testid="guide-row"
            data-guide-id={g.id}
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
                data-action="up"
                aria-label={`Naikkan ${g.title}`}
                title="Naikkan"
                disabled={i === 0 || !!busy}
                pending={busy === `up:${g.id}`}
                onClick={() =>
                  act(g, "up", () => moveGuideAction(g.id, "up"), `“${g.title}” kini urutan ${i}.`)
                }
              >
                <IconArrowUp aria-hidden />
              </Button>
              <Button
                variant="outline"
                size="icon"
                data-action="down"
                aria-label={`Turunkan ${g.title}`}
                title="Turunkan"
                disabled={i === guides.length - 1 || !!busy}
                pending={busy === `down:${g.id}`}
                onClick={() =>
                  act(
                    g,
                    "down",
                    () => moveGuideAction(g.id, "down"),
                    `“${g.title}” kini urutan ${i + 2}.`,
                  )
                }
              >
                <IconArrowDown aria-hidden />
              </Button>
              <Button
                variant="outline"
                size="sm"
                data-action="status"
                disabled={!!busy}
                pending={busy === `status:${g.id}`}
                leadingIcon={
                  g.status === "PUBLISHED" ? <IconEyeOff aria-hidden /> : <IconEye aria-hidden />
                }
                onClick={() =>
                  act(
                    g,
                    "status",
                    () => setGuideStatusAction(g.id, g.status !== "PUBLISHED"),
                    g.status === "PUBLISHED"
                      ? `“${g.title}” ditarik dari halaman Panduan.`
                      : `“${g.title}” diterbitkan.`,
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
                <Link href={`/admin/panduan/${g.id}`} data-action="edit">
                  <IconPencil aria-hidden />
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                data-action="delete"
                aria-label={`Hapus ${g.title}`}
                title="Hapus"
                disabled={!!busy}
                onClick={() => {
                  returnTo.current = [g.id, "delete"];
                  setDeleting(g);
                }}
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
        onCloseAutoFocus={(e) => {
          // Dialog dibuka tanpa Trigger: fokus kembali ke tombol Hapus (batal) atau baris tetangga.
          e.preventDefault();
          focusTarget(listRef.current, returnTo.current);
        }}
        action={
          <Button
            variant="destructive"
            pending={busy === "delete"}
            className={DIALOG_CTA}
            onClick={async () => {
              if (!deleting) return;
              const at = guides.findIndex((g) => g.id === deleting.id);
              const next = guides[at + 1] ?? guides[at - 1];
              const ok = await run(
                "delete",
                () => deleteGuideAction(deleting.id),
                `“${deleting.title}” dihapus.`,
              );
              if (ok) {
                returnTo.current = next ? [next.id, "edit"] : null;
                setDeleting(null);
              }
            }}
          >
            Hapus
          </Button>
        }
      >
        {error && deleting ? <FocusNotice tone="error">{error}</FocusNotice> : null}
      </ConfirmDialog>
    </div>
  );
}
