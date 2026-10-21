"use client";

import { IconDeviceFloppy, IconRefresh } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { impactText } from "@/components/dashboards/bound-config-model";
import { Choice } from "@/components/dashboards/config-fields";
import { PivotFields } from "@/components/dashboards/pivot-config";
import { duplicateField } from "@/components/dashboards/pivot-config-model";
import {
  defaultConfig,
  missingColumns,
  missingNotice,
  type Source,
} from "@/components/dashboards/widget-config-model";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, DIALOG_CTA } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { createSavedPivotAction, updateSavedPivotAction } from "@/features/saved-pivots/actions";
import {
  parseWidgetConfig,
  pivotTopNAxisRow,
  type PivotSpec,
  type WidgetConfig,
} from "@/features/widgets/spec";

/*
 * Editor pivot tersimpan (T-074, rencana G-7 §3.3) di halaman dataset (pemilik saja): nama + penyusun
 * pivot yang sama dengan panel widget (baris, kolom pemisah, nilai + field terhitung + "Tampilkan nilai
 * sebagai", Saring, Top N). Pratinjau: kalimat ringkasan bentuk tabel, nilai contoh field terhitung,
 * dan nilai kolom Saring lewat query pemilik { datasetId, spec } (D6 tidak berubah). Simpan perubahan
 * pivot yang dipakai widget meminta konfirmasi "Perubahan berlaku di N widget pada M dashboard";
 * revisi basi (tab lain menyimpan dulu) → CONFLICT dengan "Muat ulang", tanpa menimpa.
 */
const EMPTY: WidgetConfig = { type: "empty", spec: {} };

export interface SavedPivotEditorInitial {
  id: string;
  name: string;
  spec: PivotSpec;
  revision: number;
  usage: { widgets: number; dashboards: number } | null;
}

export function SavedPivotEditor({
  datasetId,
  sources,
  initial,
}: {
  datasetId: string;
  sources: Source[];
  /** null = buat baru. */
  initial: SavedPivotEditorInitial | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [spec, setSpec] = useState<PivotSpec | null>(() => {
    if (initial) return initial.spec;
    const c = defaultConfig("pivot", sources, EMPTY);
    return c?.type === "pivot" ? c.spec : null;
  });
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState(false);
  // "Muat ulang" setelah konflik membuang suntingan di halaman ini: dikonfirmasi dulu (review T-074 #4).
  const [reloadAsk, setReloadAsk] = useState(false);
  const [error, setError] = useState<{
    message: string;
    field?: "name" | "spec";
    reload?: boolean;
  } | null>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const back = `/datasets/${datasetId}#pivot-tersimpan`;

  if (!spec) {
    return (
      <p className="rounded-md bg-muted px-3 py-2 text-sm">
        Dataset ini belum punya sheet dengan kolom yang bisa dipakai.
      </p>
    );
  }

  const sheet = sources.find((s) => s.id === spec.sheetId);
  const cols = sheet?.columns ?? [];
  const missing = sheet ? missingColumns({ type: "pivot", spec }, sources) : [];
  const blocked =
    !sheet ||
    missing.length > 0 ||
    duplicateField(spec) !== null ||
    pivotTopNAxisRow(spec) !== null ||
    !parseWidgetConfig("pivot", spec).ok;
  const impact = initial ? impactText(initial.usage) : null;
  const dirty = initial
    ? name !== initial.name || JSON.stringify(spec) !== JSON.stringify(initial.spec)
    : true;

  const fail = (e: NonNullable<typeof error>) => {
    setError(e);
    // Pesan level form: fokus ke sana agar langsung terbaca (galat nama punya Field sendiri).
    if (e.field !== "name") requestAnimationFrame(() => alertRef.current?.focus());
  };

  async function save() {
    setPending(true);
    setError(null);
    const r = initial
      ? await updateSavedPivotAction(initial.id, {
          name,
          spec,
          baseRevision: initial.revision,
        })
      : await createSavedPivotAction(datasetId, { name, spec });
    setPending(false);
    setConfirm(false);
    if (!r.ok) {
      return fail({
        message: r.message,
        field: r.field,
        reload: r.code === "CONFLICT" || r.code === "STALE",
      });
    }
    router.push(`/datasets/${datasetId}?pivot=${initial ? "diubah" : "dibuat"}#pivot-tersimpan`);
  }

  return (
    <form
      className="flex min-w-0 flex-col gap-5"
      noValidate
      data-testid="saved-pivot-editor"
      onSubmit={(e) => {
        e.preventDefault();
        if (blocked || pending) return;
        if (impact) setConfirm(true);
        else void save();
      }}
    >
      {error && error.field !== "name" ? (
        <FormAlert tone="error" ref={alertRef}>
          <span className="flex flex-col gap-2">
            <span>{error.message}</span>
            {error.reload ? (
              <Button
                type="button"
                variant="outline"
                className="h-(--control-h-lg) w-full md:h-(--control-h) md:w-auto md:self-start"
                leadingIcon={<IconRefresh aria-hidden />}
                data-testid="saved-pivot-reload"
                onClick={() => (dirty ? setReloadAsk(true) : window.location.reload())}
              >
                Muat ulang
              </Button>
            ) : null}
          </span>
        </FormAlert>
      ) : null}

      <Field
        id="saved-pivot-name"
        label="Nama"
        required
        hint="Unik di dataset ini, mis. “Laba per wilayah”."
        error={error?.field === "name" ? error.message : undefined}
      >
        <Input
          value={name}
          maxLength={80}
          autoComplete="off"
          className="h-(--control-h-lg) md:h-(--control-h)"
          onChange={(e) => setName(e.target.value)}
        />
      </Field>

      {impact ? (
        <p className="rounded-md bg-muted px-3 py-2 text-sm" data-testid="saved-pivot-impact">
          Dipakai {initial!.usage!.widgets} widget di {initial!.usage!.dashboards} dashboard:
          perubahan langsung berlaku di semuanya.
        </p>
      ) : null}

      {sources.length > 1 || !sheet ? (
        <Choice
          label="Sheet"
          value={sheet ? spec.sheetId : ""}
          placeholder="Pilih sheet"
          invalidText={sheet ? undefined : "Sheet pivot ini tidak ada di data aktif — pilih sheet."}
          options={sources
            .filter((s) => s.columns.length)
            .map((s) => ({ value: s.id, label: s.name }))}
          onChange={(sheetId) => {
            const c = defaultConfig("pivot", sources, { type: "pivot", spec }, sheetId);
            if (c?.type === "pivot") setSpec(c.spec);
          }}
        />
      ) : null}

      {missing.length ? (
        <p
          role="status"
          className="rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-sm"
          data-testid="config-missing"
        >
          {missingNotice(missing).replace("widget ini", "pivot ini")} Pilih kolom lain di bawah.
        </p>
      ) : null}

      {sheet ? (
        <PivotFields scope={{ datasetId }} spec={spec} columns={cols} onChange={setSpec} />
      ) : null}

      <div className="flex flex-col-reverse gap-2 border-t pt-4 md:flex-row md:justify-end">
        <Button
          type="button"
          variant="outline"
          className="h-(--control-h-lg) w-full md:h-(--control-h) md:w-auto"
          onClick={() => router.push(back)}
        >
          Batal
        </Button>
        <Button
          type="submit"
          pending={pending && !confirm}
          disabled={blocked}
          leadingIcon={<IconDeviceFloppy aria-hidden />}
          className="h-(--control-h-lg) w-full md:h-(--control-h) md:w-auto"
          data-testid="saved-pivot-save"
        >
          {initial ? "Simpan perubahan" : "Simpan pivot tersimpan"}
        </Button>
      </div>
      {blocked && sheet ? (
        <p className="text-xs text-muted-foreground md:text-right" aria-live="polite">
          Perbaiki isian yang ditandai sebelum menyimpan.
        </p>
      ) : null}

      <ConfirmDialog
        open={confirm}
        onOpenChange={(o) => !pending && setConfirm(o)}
        title="Simpan perubahan pivot tersimpan?"
        description={impact ?? ""}
        busy={pending}
        data-testid="saved-pivot-confirm"
        action={
          <Button
            className={DIALOG_CTA}
            pending={pending}
            leadingIcon={<IconDeviceFloppy aria-hidden />}
            onClick={() => void save()}
          >
            Simpan
          </Button>
        }
      />
      <ConfirmDialog
        open={reloadAsk}
        onOpenChange={setReloadAsk}
        title="Buang perubahan yang belum disimpan?"
        description="Muat ulang menampilkan versi terbaru pivot tersimpan ini. Perubahan Anda di halaman ini akan hilang — catat dulu bila masih diperlukan."
        data-testid="saved-pivot-reload-confirm"
        action={
          <Button
            variant="destructive"
            className={DIALOG_CTA}
            leadingIcon={<IconRefresh aria-hidden />}
            onClick={() => window.location.reload()}
          >
            Buang dan muat ulang
          </Button>
        }
      />
    </form>
  );
}
