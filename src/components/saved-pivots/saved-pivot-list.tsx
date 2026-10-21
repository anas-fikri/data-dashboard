"use client";

import { IconCopy, IconCursorText, IconPencil, IconRefresh, IconTrash } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { copyName, usageText } from "@/components/dashboards/bound-config-model";
import { formatJakarta } from "@/components/datasets/version-history-status";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, DIALOG_CTA } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  createSavedPivotAction,
  deleteSavedPivotAction,
  updateSavedPivotAction,
} from "@/features/saved-pivots/actions";
import type { InUseDashboard, SavedPivotView } from "@/features/saved-pivots/service";

/*
 * Daftar pivot tersimpan dataset (T-074 AC1) untuk pemilik: Nama | Sheet | Dipakai di | Diubah + aksi
 * Ubah, Ganti nama, Duplikat, Hapus. ≥ 768 px tabel biasa; di ponsel setiap baris menjadi kartu
 * bertumpuk (label kolom ikut tampil) agar tidak ada gulir horizontal di 360 px. Hapus pivot yang masih
 * dipakai tidak tersedia (aria-disabled, tetap bisa difokus) dan menjelaskan dashboard mana yang
 * memakainya; server tetap menolak IN_USE bila widget diikat bersamaan. Setiap aksi memuat ulang daftar
 * dari server (router.refresh); revisi yang dilihat ikut dikirim (CAS) → CONFLICT menawarkan muat ulang.
 */
type Row = Pick<SavedPivotView, "id" | "name" | "spec" | "revision" | "usage" | "updatedAt">;

type Pending = { kind: "rename"; row: Row } | { kind: "delete"; row: Row } | null;

const CELL = "block md:table-cell md:px-3 md:py-2 md:align-top";
const LABEL = "text-xs font-medium text-muted-foreground md:hidden";

export function SavedPivotList({
  datasetId,
  pivots,
  sheetNames,
}: {
  datasetId: string;
  pivots: Row[];
  /** Nama sheet per id (versi aktif); sheet yang tidak ada → "Tidak ada di data aktif". */
  sheetNames: Record<string, string>;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Pending>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    tone: "error" | "success";
    text: string;
    reload?: boolean;
  } | null>(null);
  const [blockedFor, setBlockedFor] = useState<string | null>(null);

  async function duplicate(row: Row) {
    setBusy(row.id);
    setMessage(null);
    const name = copyName(
      row.name,
      pivots.map((p) => p.name),
    );
    const r = await createSavedPivotAction(datasetId, { name, spec: row.spec });
    setBusy(null);
    if (!r.ok) return setMessage({ tone: "error", text: r.message });
    setMessage({ tone: "success", text: `Salinan “${name}” dibuat.` });
    router.refresh();
  }

  if (!pivots.length) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="saved-pivot-empty">
        Belum ada pivot tersimpan. Buat satu definisi pivot, lalu pakai di banyak widget dan
        dashboard: ubah sekali, semua ikut berubah.
      </p>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {message ? (
        <FormAlert tone={message.tone}>
          <span className="flex flex-col gap-2">
            <span>{message.text}</span>
            {message.reload ? (
              <Button
                variant="outline"
                className="h-(--control-h-lg) w-full md:h-(--control-h) md:w-auto md:self-start"
                leadingIcon={<IconRefresh aria-hidden />}
                onClick={() => {
                  setMessage(null);
                  router.refresh();
                }}
              >
                Muat ulang
              </Button>
            ) : null}
          </span>
        </FormAlert>
      ) : null}
      <table className="block w-full text-sm md:table" data-testid="saved-pivot-list">
        <caption className="sr-only">Pivot tersimpan dataset ini</caption>
        <thead className="sr-only md:not-sr-only md:table-header-group">
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th scope="col" className="md:px-3 md:py-2 md:font-medium">
              Nama
            </th>
            <th scope="col" className="md:px-3 md:py-2 md:font-medium">
              Sheet
            </th>
            <th scope="col" className="md:px-3 md:py-2 md:font-medium">
              Dipakai di
            </th>
            <th scope="col" className="md:px-3 md:py-2 md:font-medium">
              Diubah
            </th>
            <th scope="col" className="md:px-3 md:py-2 md:font-medium">
              <span className="sr-only">Aksi</span>
            </th>
          </tr>
        </thead>
        <tbody className="flex flex-col gap-3 md:table-row-group">
          {pivots.map((p) => {
            const used = (p.usage?.widgets ?? 0) > 0;
            const usedIn = p.usage?.usedIn ?? [];
            const sheet = sheetNames[p.spec.sheetId];
            return (
              <tr
                key={p.id}
                className="flex flex-col gap-2 rounded-md border p-3 md:table-row md:rounded-none md:border-0 md:border-b md:p-0"
                data-testid="saved-pivot-row"
                data-name={p.name}
              >
                <th scope="row" className={`${CELL} text-left font-medium`}>
                  <span className="[overflow-wrap:anywhere]">{p.name}</span>
                </th>
                <td className={CELL}>
                  <span className={LABEL}>Sheet: </span>
                  {sheet ?? <span className="text-muted-foreground">Tidak ada di data aktif</span>}
                </td>
                <td className={CELL} data-testid="saved-pivot-usage">
                  <span className={LABEL}>Dipakai di: </span>
                  {usageText(p.usage)}
                </td>
                <td className={`${CELL} tabular-nums`}>
                  <span className={LABEL}>Diubah: </span>
                  {formatJakarta(p.updatedAt)}
                </td>
                <td className={CELL}>
                  <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:justify-end">
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="h-(--control-h-lg) w-full md:h-(--control-h-sm) md:w-auto"
                    >
                      <Link
                        href={`/datasets/${datasetId}/pivot-tersimpan/${p.id}`}
                        aria-label={`Ubah ${p.name}`}
                      >
                        <IconPencil aria-hidden />
                        Ubah
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-(--control-h-lg) w-full md:h-(--control-h-sm) md:w-auto"
                      leadingIcon={<IconCursorText aria-hidden />}
                      aria-label={`Ganti nama ${p.name}`}
                      onClick={() => {
                        setMessage(null);
                        setDialog({ kind: "rename", row: p });
                      }}
                    >
                      Ganti nama
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-(--control-h-lg) w-full md:h-(--control-h-sm) md:w-auto"
                      leadingIcon={<IconCopy aria-hidden />}
                      pending={busy === p.id}
                      aria-label={`Duplikat ${p.name}`}
                      onClick={() => void duplicate(p)}
                    >
                      Duplikat
                    </Button>
                    <DeleteButton
                      row={p}
                      used={used}
                      usedIn={usedIn}
                      showReason={blockedFor === p.id}
                      onBlocked={() => setBlockedFor(p.id)}
                      onDelete={() => {
                        setMessage(null);
                        setDialog({ kind: "delete", row: p });
                      }}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {dialog?.kind === "rename" ? (
        <RenameDialog
          row={dialog.row}
          onClose={() => setDialog(null)}
          onDone={(m) => {
            setDialog(null);
            setMessage(m);
            router.refresh();
          }}
        />
      ) : null}
      {dialog?.kind === "delete" ? (
        <DeleteDialog
          row={dialog.row}
          onClose={() => setDialog(null)}
          onDone={(m) => {
            setDialog(null);
            setMessage(m);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

const dashboardList = (ds: InUseDashboard[]) => ds.map((d) => `“${d.name}”`).join(", ");

/** Hapus: nonaktif (tetap bisa difokus) bila dipakai; alasannya tampil di bawah tombol. */
function DeleteButton({
  row,
  used,
  usedIn,
  showReason,
  onBlocked,
  onDelete,
}: {
  row: Row;
  used: boolean;
  usedIn: InUseDashboard[];
  showReason: boolean;
  onBlocked: () => void;
  onDelete: () => void;
}) {
  const id = useId();
  const reason = used
    ? `Tidak bisa dihapus: masih dipakai ${row.usage!.widgets} widget di dashboard ${dashboardList(usedIn)}. Lepaskan widget itu dari sumber dulu.`
    : null;
  return (
    <div className="flex min-w-0 flex-col gap-1 md:items-end">
      <Button
        variant="outline"
        size="sm"
        className="h-(--control-h-lg) w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive aria-disabled:cursor-not-allowed aria-disabled:opacity-50 md:h-(--control-h-sm) md:w-auto"
        leadingIcon={<IconTrash aria-hidden />}
        aria-label={`Hapus ${row.name}`}
        aria-disabled={used || undefined}
        aria-describedby={used ? `${id}-reason` : undefined}
        title={reason ?? undefined}
        data-testid="saved-pivot-delete"
        onClick={() => (used ? onBlocked() : onDelete())}
      >
        Hapus
      </Button>
      {used ? (
        <p
          id={`${id}-reason`}
          className={
            showReason ? "max-w-xs text-xs text-muted-foreground md:text-right" : "sr-only"
          }
          role={showReason ? "status" : undefined}
          data-testid="saved-pivot-in-use"
        >
          {reason}
        </p>
      ) : null}
    </div>
  );
}

function RenameDialog({
  row,
  onClose,
  onDone,
}: {
  row: Row;
  onClose: () => void;
  onDone: (m: { tone: "error" | "success"; text: string; reload?: boolean }) => void;
}) {
  const [value, setValue] = useState(row.name);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    setPending(true);
    setError(null);
    const r = await updateSavedPivotAction(row.id, { name: value, baseRevision: row.revision });
    setPending(false);
    if (r.ok) return onDone({ tone: "success", text: "Nama pivot tersimpan diubah." });
    if (r.code === "CONFLICT") return onDone({ tone: "error", text: r.message, reload: true });
    setError(r.message);
  }
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && !pending && onClose()}
      title={`Ganti nama “${row.name}”`}
      description="Nama baru langsung tampil di panel widget yang memakainya."
      busy={pending}
      data-testid="saved-pivot-rename"
      action={
        <Button
          className={DIALOG_CTA}
          pending={pending}
          leadingIcon={<IconCursorText aria-hidden />}
          onClick={() => void submit()}
        >
          Simpan nama
        </Button>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        noValidate
      >
        <Field id="saved-pivot-rename-input" label="Nama baru" required error={error ?? undefined}>
          <Input
            value={value}
            maxLength={80}
            autoComplete="off"
            onChange={(e) => setValue(e.target.value)}
          />
        </Field>
      </form>
    </ConfirmDialog>
  );
}

function DeleteDialog({
  row,
  onClose,
  onDone,
}: {
  row: Row;
  onClose: () => void;
  onDone: (m: { tone: "error" | "success"; text: string; reload?: boolean }) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    setPending(true);
    setError(null);
    const r = await deleteSavedPivotAction(row.id, row.revision);
    setPending(false);
    if (r.ok) return onDone({ tone: "success", text: `Pivot tersimpan “${row.name}” dihapus.` });
    if (r.code === "CONFLICT" || r.code === "IN_USE") {
      return onDone({ tone: "error", text: r.message, reload: true });
    }
    setError(r.message);
  }
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && !pending && onClose()}
      title={`Hapus “${row.name}”?`}
      description="Pivot tersimpan ini tidak dipakai widget mana pun. Definisinya dihapus permanen."
      busy={pending}
      data-testid="saved-pivot-delete-dialog"
      action={
        <Button
          variant="destructive"
          className={DIALOG_CTA}
          pending={pending}
          leadingIcon={<IconTrash aria-hidden />}
          onClick={() => void submit()}
        >
          Hapus
        </Button>
      }
    >
      {error ? <FormAlert tone="error">{error}</FormAlert> : null}
    </ConfirmDialog>
  );
}
