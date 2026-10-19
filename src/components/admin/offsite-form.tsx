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
import { OffsiteHostKey } from "./offsite-host-key";

const NETWORK = "Tidak bisa menghubungi server aplikasi. Periksa koneksi, lalu coba lagi.";
const CTA = "h-(--control-h-lg) w-full md:h-(--control-h) md:w-auto";

/**
 * Target salinan backup ke NAS Synology lewat SFTP (Admin › Backup, T-y8qq). "Tes koneksi" memakai isian
 * saat ini (belum perlu disimpan) dan mengambil kunci host NAS; password tersimpan tidak pernah dikirim ke
 * browser — kolom kosong = tetap.
 */
export function OffsiteForm({ initial }: { initial: OffsiteView | null }) {
  const [values, setValues] = useState<OffsiteInput>({
    enabled: initial?.enabled ?? true,
    host: initial?.host ?? "",
    port: String(initial?.port ?? 22),
    username: initial?.username ?? "",
    password: "",
    folder: initial?.folder ?? "",
    hostKey: initial?.hostKey ?? "",
  });
  const [fingerprint, setFingerprint] = useState(initial?.fingerprint ?? "");
  const [hasPassword, setHasPassword] = useState(initial?.hasPassword ?? false);
  // Kunci host yang tersimpan: password tersimpan hanya dipakai ulang selama kunci di form masih ini.
  const [savedKey, setSavedKey] = useState(initial?.hostKey ?? "");
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

  const set = <K extends OffsiteField>(k: K, v: OffsiteInput[K]) => {
    setValues((s) => ({ ...s, [k]: v, ...(k === "host" || k === "port" ? { hostKey: "" } : {}) }));
    // Kunci host terikat pada alamat + port: NAS lain harus dites (dan dicocokkan) ulang.
    if (k === "host" || k === "port") setFingerprint("");
  };
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
        finish(res, (data) => {
          setValues((s) => ({ ...s, hostKey: data.hostKey }));
          setFingerprint(data.fingerprint);
          return input.hostKey
            ? "Koneksi berhasil: server aplikasi bisa menulis, membaca, dan menghapus di folder NAS ini."
            : `Koneksi berhasil. Kunci host NAS dicatat (${data.fingerprint}) — tekan Simpan untuk memakainya.`;
        });
        return;
      }
      const res = await saveOffsiteAction(input).catch(() => null);
      finish(res, (data) => {
        setHasPassword(data.hasPassword);
        setSavedKey(data.hostKey);
        set("password", "");
        return data.enabled
          ? "Tersimpan. Backup berikutnya dan kirim ulang tiap 30 menit memakai NAS ini."
          : "Tersimpan. Salinan ke NAS nonaktif: backup hanya tersimpan di server aplikasi.";
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
      <OffsiteFields
        values={values}
        onChange={set}
        errorFor={errorFor}
        hasPassword={hasPassword && values.hostKey !== "" && values.hostKey === savedKey}
      />
      <OffsiteHostKey
        fingerprint={fingerprint}
        disabled={busy !== null}
        onForget={() => {
          setValues((s) => ({ ...s, hostKey: "" }));
          setFingerprint("");
          say(
            "success",
            "Kunci host dilupakan. Isi password, lalu tekan Tes koneksi untuk mengambil kunci baru.",
          );
        }}
      />
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
