"use client";

import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Switch } from "@/components/ui/switch";
import type { OffsiteField, OffsiteInput } from "@/features/backup/types";

export const offsiteFieldId = (f: OffsiteField) => `offsite-${f}`;

type TextField = Exclude<OffsiteField, "enabled" | "hostKey">;

const FIELDS: { f: TextField; label: string; hint?: string; wide?: boolean }[] = [
  {
    f: "host",
    label: "Alamat NAS",
    hint: "Alamat IP atau nama NAS Synology yang bisa dijangkau server aplikasi, mis. 10.3.3.50.",
  },
  { f: "port", label: "Port SFTP", hint: "Bawaan 22." },
  {
    f: "username",
    label: "Username",
    hint: "Akun DSM khusus backup (bukan admin) yang hanya punya akses ke folder backup.",
  },
  { f: "password", label: "Password" },
  {
    f: "folder",
    label: "Folder tujuan",
    wide: true,
    hint: "Diawali nama shared folder, mis. /backup-data-dashboard. Buat dulu lewat File Station.",
  },
];

interface OffsiteFieldsProps {
  values: OffsiteInput;
  onChange: <K extends OffsiteField>(field: K, value: OffsiteInput[K]) => void;
  errorFor: (field: OffsiteField) => string | undefined;
  /** Password sudah tersimpan: kolom password boleh kosong (= tetap). */
  hasPassword: boolean;
}

/** Kolom target NAS Synology (Admin › Backup, T-y8qq); state dan kirim di OffsiteForm. */
export function OffsiteFields({ values, onChange, errorFor, hasPassword }: OffsiteFieldsProps) {
  return (
    <>
      <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
        <label htmlFor={offsiteFieldId("enabled")} className="text-sm">
          <span className="block font-medium">Aktifkan salinan ke NAS</span>
          <span className="block text-muted-foreground">
            Mati = backup hanya tersimpan di server aplikasi.
          </span>
        </label>
        <Switch
          id={offsiteFieldId("enabled")}
          checked={values.enabled}
          onCheckedChange={(v) => onChange("enabled", v)}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {FIELDS.map(({ f, label, hint, wide }) => {
          const secret = f === "password";
          const props = {
            autoComplete: secret ? "new-password" : "off",
            value: values[f],
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(f, e.target.value),
          };
          return (
            <Field
              key={f}
              id={offsiteFieldId(f)}
              label={label}
              required={secret ? !hasPassword : true}
              hint={
                secret && hasPassword
                  ? "Tersimpan. Kosongkan untuk tetap memakai password yang ada (NAS dan username sama)."
                  : hint
              }
              error={errorFor(f)}
              className={wide ? "md:col-span-2" : undefined}
            >
              {secret ? (
                <PasswordInput {...props} />
              ) : (
                <Input {...props} inputMode={f === "port" ? "numeric" : undefined} />
              )}
            </Field>
          );
        })}
      </div>
    </>
  );
}
