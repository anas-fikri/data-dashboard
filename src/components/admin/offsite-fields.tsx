"use client";

import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Switch } from "@/components/ui/switch";
import type { OffsiteField, OffsiteInput } from "@/features/backup/types";

export const offsiteFieldId = (f: OffsiteField) => `offsite-${f}`;

type TextField = Exclude<OffsiteField, "enabled">;

const FIELDS: {
  f: TextField;
  label: string;
  hint?: string;
  required?: boolean;
  wide?: boolean;
  placeholder?: string;
}[] = [
  {
    f: "endpoint",
    label: "Endpoint",
    required: true,
    wide: true,
    hint: "Alamat server S3 yang bisa dijangkau server aplikasi, mis. http://10.3.3.50:9000.",
  },
  {
    f: "bucket",
    label: "Bucket",
    required: true,
    hint: "Bucket khusus backup, bukan bucket aplikasi lain.",
  },
  { f: "prefix", label: "Folder", hint: "Opsional, mis. data-dashboard." },
  {
    f: "accessKeyId",
    label: "Access key",
    required: true,
    hint: "Kunci khusus backup yang hanya berhak di bucket ini — jangan kunci admin.",
  },
  { f: "secretAccessKey", label: "Secret key", required: true },
  { f: "region", label: "Region", hint: "Opsional, bawaan us-east-1.", placeholder: "us-east-1" },
];

interface OffsiteFieldsProps {
  values: OffsiteInput;
  onChange: <K extends OffsiteField>(field: K, value: OffsiteInput[K]) => void;
  errorFor: (field: OffsiteField) => string | undefined;
  /** Secret sudah tersimpan: kolom secret boleh kosong (= tetap). */
  hasSecret: boolean;
}

/** Kolom target off-VM (Admin › Backup, T-7psf); state dan kirim di OffsiteForm. */
export function OffsiteFields({ values, onChange, errorFor, hasSecret }: OffsiteFieldsProps) {
  return (
    <>
      <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
        <label htmlFor={offsiteFieldId("enabled")} className="text-sm">
          <span className="block font-medium">Aktifkan salinan off-VM</span>
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
        {FIELDS.map(({ f, label, hint, required, wide, placeholder }) => {
          const secret = f === "secretAccessKey";
          const props = {
            autoComplete: secret ? "new-password" : "off",
            value: values[f],
            placeholder,
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(f, e.target.value),
          };
          return (
            <Field
              key={f}
              id={offsiteFieldId(f)}
              label={label}
              required={secret ? !hasSecret : required}
              hint={
                secret && hasSecret
                  ? "Tersimpan. Kosongkan untuk tetap memakai secret yang ada."
                  : hint
              }
              error={errorFor(f)}
              className={wide ? "md:col-span-2" : undefined}
            >
              {secret ? (
                <PasswordInput {...props} />
              ) : (
                <Input {...props} inputMode={f === "endpoint" ? "url" : undefined} />
              )}
            </Field>
          );
        })}
      </div>
    </>
  );
}
