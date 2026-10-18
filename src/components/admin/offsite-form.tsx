"use client";

import { IconDeviceFloppy, IconPlugConnected } from "@tabler/icons-react";
import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { FocusNotice } from "@/components/ui/focus-notice";
import { saveOffsiteAction, testOffsiteAction } from "@/features/backup/actions";
import type {
  BackupResult,
  OffsiteField,
  OffsiteInput,
  OffsiteView,
} from "@/features/backup/types";
import { OffsiteFields, offsiteFieldId as id } from "./offsite-fields";

const NETWORK = "Tidak bisa menghubungi server aplikasi. Periksa koneksi, lalu coba lagi.";
const CTA = "h-(--control-h-lg) w-full md:h-(--control-h) md:w-auto";

/**
 * Target salinan backup off-VM (S3) untuk Admin › Backup (T-7psf). "Tes koneksi" memakai isian saat ini
 * (belum perlu disimpan); secret tersimpan tidak pernah dikirim ke browser — kolom kosong = tetap.
 */
export function OffsiteForm({ initial }: { initial: OffsiteView | null }) {
  const [values, setValues] = useState<OffsiteInput>({
    enabled: initial?.enabled ?? true,
    endpoint: initial?.endpoint ?? "",
    bucket: initial?.bucket ?? "",
    prefix: initial?.prefix ?? "data-dashboard",
    region: initial?.region ?? "",
    accessKeyId: initial?.accessKeyId ?? "",
    secretAccessKey: "",
  });
  const [hasSecret, setHasSecret] = useState(initial?.hasSecret ?? false);
  const [fieldError, setFieldError] = useState<{ field: OffsiteField; message: string } | null>(
    null,
  );
  const [notice, setNotice] = useState<{
    tone: "success" | "error";
    text: string;
    n: number;
  } | null>(null);
  const [busy, setBusy] = useState<"test" | "save" | null>(null);
  const [, start] = useTransition();

  const set = <K extends OffsiteField>(k: K, v: OffsiteInput[K]) =>
    setValues((s) => ({ ...s, [k]: v }));
  const errorFor = (f: OffsiteField) => (fieldError?.field === f ? fieldError.message : undefined);
  const say = (tone: "success" | "error", text: string) =>
    setNotice((p) => ({ tone, text, n: (p?.n ?? 0) + 1 }));

  function finish<T>(res: BackupResult<T> | null, ok: (data: T) => string) {
    setBusy(null);
    if (!res) return say("error", NETWORK);
    if (res.ok) return say("success", ok(res.data));
    if (res.field) {
      setFieldError({ field: res.field, message: res.message });
      setNotice(null);
      document.getElementById(id(res.field))?.focus();
      return;
    }
    say("error", res.message);
  }

  function run(kind: "test" | "save") {
    setFieldError(null);
    setBusy(kind);
    const input = { ...values };
    start(async () => {
      if (kind === "test") {
        const res = await testOffsiteAction(input).catch(() => null);
        finish(
          res,
          () =>
            "Koneksi berhasil: server aplikasi bisa menulis, membaca, dan menghapus di target ini.",
        );
        return;
      }
      const res = await saveOffsiteAction(input).catch(() => null);
      finish(res, (data) => {
        setHasSecret(data.hasSecret);
        set("secretAccessKey", "");
        return data.enabled
          ? "Tersimpan. Backup berikutnya dan kirim ulang tiap 30 menit memakai target ini."
          : "Tersimpan. Salinan off-VM nonaktif: backup hanya tersimpan di server aplikasi.";
      });
    });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    run("save");
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4" data-testid="offsite-form">
      {notice ? (
        <FocusNotice key={notice.n} tone={notice.tone}>
          {notice.text}
        </FocusNotice>
      ) : null}
      <OffsiteFields values={values} onChange={set} errorFor={errorFor} hasSecret={hasSecret} />
      <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
        <Button
          type="button"
          variant="outline"
          pending={busy === "test"}
          disabled={busy !== null}
          leadingIcon={<IconPlugConnected aria-hidden />}
          className={CTA}
          onClick={() => run("test")}
        >
          Tes koneksi
        </Button>
        <Button
          type="submit"
          pending={busy === "save"}
          disabled={busy !== null}
          leadingIcon={<IconDeviceFloppy aria-hidden />}
          className={CTA}
        >
          Simpan
        </Button>
      </div>
    </form>
  );
}
