"use client";

import { IconBookmarkPlus, IconFileSpreadsheet, IconTableShare } from "@tabler/icons-react";
import Link from "next/link";
import { Dialog } from "radix-ui";
import { useId, useRef, useState } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, DIALOG_CTA } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { WidgetView } from "@/features/dashboards/service";
import { createSavedPivotAction } from "@/features/saved-pivots/actions";
import type { BoundType } from "@/features/widgets/bound";
import { parseWidgetConfig, type PivotSpec, type WidgetType } from "@/features/widgets/spec";
import { BoundConfigForm } from "./bound-config";
import { pivotDisplayOf, type SavedPivotOption } from "./bound-config-model";
import { WidgetConfigForm } from "./widget-config";
import type { Source } from "./widget-config-model";

/*
 * Bagian Data panel widget dengan pilihan "Sumber data" (T-074, rencana G-7 §3.3): sheet langsung
 * (form T-011 seperti biasa) atau pivot tersimpan dataset ini (BoundConfigForm, tampilan saja). Pindah
 * dari pivot tersimpan ke sheet langsung = "Lepas dari sumber" dengan konfirmasi (spec efektif disalin,
 * tampilan widget tidak berubah) — tidak pernah lewat simpanan biasa (review T-073 L4). Pemilik dataset
 * juga bisa menyimpan widget pivot mandiri sebagai pivot tersimpan baru yang langsung terikat. Editor
 * dashboard boleh memilih/mengganti sumber dan melihat definisinya, tetapi tidak membuat/mengubahnya
 * (server menolak NOT_FOUND). Viewer tidak pernah melihat panel ini (tanpa mode edit).
 */
export function WidgetSourceSection({
  dashboardId,
  widget,
  sources,
  datasetId,
  isOwner,
  saveError,
  savedPivots,
  onSave,
  onDetach,
  onCreated,
}: {
  dashboardId: string;
  /** Widget panel (sudah memuat simpanan yang belum terkirim, withUnsaved). */
  widget: WidgetView;
  sources: Source[];
  /** Dataset dashboard (untuk membuat pivot tersimpan dan tautan halaman pemilik). */
  datasetId: string;
  isOwner: boolean;
  saveError?: string;
  savedPivots: SavedPivotOption[];
  onSave: (type: string, spec: unknown, savedPivotId?: string) => Promise<boolean>;
  onDetach: () => Promise<{ filtersDropped: boolean } | null>;
  onCreated: (p: SavedPivotOption) => void;
}) {
  const name = useId();
  const source = widget.source;
  const [choosing, setChoosing] = useState(false);
  const [detachOpen, setDetachOpen] = useState(false);
  const [detaching, setDetaching] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Setelah lepas, tombolnya hilang bersama form terikat: fokus pindah ke pemberitahuan hasilnya.
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const detached = useRef(false);
  const mode = source || choosing ? "pivot" : "direct";
  const boundName =
    savedPivots.find((p) => p.id === source?.savedPivotId)?.name ?? source?.name ?? "";

  const pickMode = (next: "direct" | "pivot") => {
    if (next === mode) return;
    setNotice(null);
    if (next === "pivot") return setChoosing(true);
    // Terikat → sheet langsung hanya lewat "Lepas dari sumber" (konfirmasi).
    if (source) return setDetachOpen(true);
    setChoosing(false);
  };

  async function detach() {
    setDetaching(true);
    const r = await onDetach();
    setDetaching(false);
    setDetachOpen(false);
    if (!r) return;
    detached.current = true;
    setChoosing(false);
    setNotice(
      r.filtersDropped
        ? "Widget dilepas dari pivot tersimpan. Saring pivot tersimpan tidak ikut: grafik dan KPI mandiri tidak punya Saring — periksa nilainya."
        : "Widget dilepas dari pivot tersimpan dan kini diatur langsung dari sheet.",
    );
  }

  const parsedPivot = (() => {
    if (source || widget.type !== "pivot") return null;
    const p = parseWidgetConfig(widget.type, widget.spec);
    return p.ok && p.config.type === "pivot" ? p.config.spec : null;
  })();

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <fieldset className="flex min-w-0 flex-col gap-2" data-testid="widget-source">
        <legend className="mb-1 text-sm font-medium">Sumber data</legend>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { value: "direct", label: "Sheet langsung", Icon: IconFileSpreadsheet },
              { value: "pivot", label: "Pivot tersimpan", Icon: IconTableShare },
            ] as const
          ).map(({ value, label, Icon }) => (
            <label
              key={value}
              className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border px-2 py-2 text-sm has-checked:border-primary has-checked:bg-primary/10 has-focus-visible:ring-2 has-focus-visible:ring-ring"
            >
              <input
                type="radio"
                name={name}
                value={value}
                className="sr-only"
                checked={mode === value}
                onChange={() => pickMode(value)}
              />
              <Icon size={20} stroke={1.5} aria-hidden className="shrink-0" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {notice ? (
        <p
          ref={noticeRef}
          tabIndex={-1}
          role="status"
          className="rounded-md border bg-muted px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="widget-source-notice"
        >
          {notice}
        </p>
      ) : null}

      {mode === "pivot" ? (
        savedPivots.length === 0 && !source ? (
          <p className="rounded-md bg-muted px-3 py-2 text-sm" data-testid="bound-empty">
            Dataset ini belum punya pivot tersimpan.{" "}
            {isOwner ? (
              <Link
                href={`/datasets/${datasetId}/pivot-tersimpan/baru`}
                className="font-medium underline underline-offset-4"
              >
                Buat pivot tersimpan
              </Link>
            ) : (
              "Minta pemilik dataset membuatnya."
            )}
          </p>
        ) : (
          <BoundConfigForm
            // Tanpa key: baru memilih → terikat tetap satu form (status "Tersimpan" tidak hilang).
            initial={source ? { ...source } : null}
            bound={{ currentType: widget.type, bound: !!source }}
            savedPivots={savedPivots}
            sources={sources}
            datasetId={isOwner ? datasetId : null}
            saveError={saveError}
            onSave={(type: BoundType, display, id) => onSave(type, display, id)}
            onDetach={() => setDetachOpen(true)}
            onCancel={() => setChoosing(false)}
          />
        )
      ) : (
        <>
          <WidgetConfigForm
            dashboardId={dashboardId}
            widget={widget}
            saveError={saveError}
            sources={sources}
            datasetId={isOwner ? datasetId : null}
            onSave={(type: WidgetType, spec) => onSave(type, spec)}
          />
          {isOwner && parsedPivot ? (
            <SaveAsSavedPivot
              datasetId={datasetId}
              spec={parsedPivot}
              defaultName={widget.title}
              onCreated={async (p) => {
                onCreated(p);
                setNotice(null);
                await onSave("pivot", pivotDisplayOf(parsedPivot), p.id);
              }}
            />
          ) : null}
        </>
      )}

      <ConfirmDialog
        open={detachOpen}
        onOpenChange={(o) => !detaching && setDetachOpen(o)}
        title="Lepas dari pivot tersimpan?"
        description={
          <>
            Pengaturan saat ini disalin menjadi widget mandiri, jadi tampilannya tetap sama.
            Perubahan pivot tersimpan “{boundName}” berikutnya tidak lagi berlaku di widget ini.
          </>
        }
        busy={detaching}
        onCloseAutoFocus={(e) => {
          if (!detached.current) return;
          detached.current = false;
          e.preventDefault();
          noticeRef.current?.focus();
        }}
        data-testid="detach-dialog"
        action={
          <Button className={DIALOG_CTA} pending={detaching} onClick={() => void detach()}>
            Lepas dari sumber
          </Button>
        }
      />
    </div>
  );
}

/** "Simpan sebagai pivot tersimpan" (pemilik dataset): buat dari spec widget pivot ini lalu ikat. */
function SaveAsSavedPivot({
  datasetId,
  spec,
  defaultName,
  onCreated,
}: {
  datasetId: string;
  spec: PivotSpec;
  defaultName: string;
  onCreated: (p: SavedPivotOption) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const r = await createSavedPivotAction(datasetId, { name: value, spec });
    if (!r.ok) {
      setPending(false);
      return setError({ message: r.message, field: r.field });
    }
    await onCreated({
      id: r.data.id,
      name: value.trim(),
      spec,
      revision: r.data.revision,
      canEdit: true,
    });
    setPending(false);
    setOpen(false);
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (pending) return;
        setOpen(o);
        if (o) {
          setValue(defaultName);
          setError(null);
        }
      }}
    >
      <Dialog.Trigger asChild>
        <Button
          variant="outline"
          className="h-(--control-h-lg) w-full md:h-(--control-h)"
          leadingIcon={<IconBookmarkPlus aria-hidden />}
          data-testid="save-as-saved-pivot"
        >
          Simpan sebagai pivot tersimpan
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-6 shadow-lg">
          <Dialog.Title className="text-lg font-semibold">
            Simpan sebagai pivot tersimpan
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted-foreground">
            Definisi pivot ini disimpan di dataset agar bisa dipakai widget lain. Widget ini
            langsung memakainya; tampilannya tidak berubah.
          </Dialog.Description>
          <form onSubmit={submit} className="mt-4 flex flex-col gap-4" noValidate>
            {error && error.field !== "name" ? (
              <FormAlert tone="error">{error.message}</FormAlert>
            ) : null}
            <Field
              id="saved-pivot-name"
              label="Nama pivot tersimpan"
              required
              error={error?.field === "name" ? error.message : undefined}
            >
              <Input
                value={value}
                maxLength={80}
                autoComplete="off"
                onChange={(e) => setValue(e.target.value)}
              />
            </Field>
            <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
              <Dialog.Close asChild>
                <Button variant="outline" disabled={pending} className={DIALOG_CTA}>
                  Batal
                </Button>
              </Dialog.Close>
              <Button
                type="submit"
                pending={pending}
                leadingIcon={<IconBookmarkPlus aria-hidden />}
                className={DIALOG_CTA}
              >
                Simpan
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
