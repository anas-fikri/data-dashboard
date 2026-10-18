"use client";

import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SmtpField, SmtpInput } from "@/features/smtp/types";
import type { SmtpSecurity } from "@/lib/smtp-settings";

export const smtpFieldId = (f: SmtpField) => `smtp-${f}`;

const SECURITY: { value: SmtpSecurity; label: string; port: string }[] = [
  { value: "ssl", label: "SSL/TLS (port 465)", port: "465" },
  { value: "starttls", label: "STARTTLS (port 587)", port: "587" },
  { value: "none", label: "Tanpa enkripsi (hanya jaringan internal)", port: "25" },
];
const STANDARD_PORTS = new Set(["25", "465", "587", "1465", "1587", "2526"]);

interface SmtpFieldsProps {
  values: SmtpInput;
  onChange: <K extends keyof SmtpInput>(field: K, value: SmtpInput[K]) => void;
  errorFor: (field: SmtpField) => string | undefined;
  /** Password sudah berlaku (aplikasi atau .env): kolom boleh kosong (= tetap). */
  hasPassword: boolean;
}

/** Kolom pengaturan SMTP (Admin › Email, T-byys); state dan kirim di SmtpForm. */
export function SmtpFields({ values, onChange, errorFor, hasPassword }: SmtpFieldsProps) {
  const text = (f: Exclude<keyof SmtpInput, "security" | "password">) => ({
    autoComplete: "off",
    value: values[f],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(f, e.target.value),
  });
  const securityError = errorFor("security");
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field
        id={smtpFieldId("host")}
        label="Server SMTP"
        required
        hint="Mis. mail.pcpexpress.com."
        error={errorFor("host")}
      >
        <Input {...text("host")} />
      </Field>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={smtpFieldId("security")} className="text-sm font-medium">
          Keamanan
        </label>
        <Select
          value={values.security}
          onValueChange={(v) => {
            const next = SECURITY.find((s) => s.value === v)!;
            onChange("security", next.value);
            // Port bawaan ikut berganti, kecuali admin memakai port khusus.
            if (STANDARD_PORTS.has(values.port.trim())) onChange("port", next.port);
          }}
        >
          <SelectTrigger
            id={smtpFieldId("security")}
            aria-invalid={securityError ? true : undefined}
            className="h-(--control-h-lg) md:h-(--control-h)"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SECURITY.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Field id={smtpFieldId("port")} label="Port" required error={errorFor("port")}>
        <Input {...text("port")} inputMode="numeric" />
      </Field>
      <Field
        id={smtpFieldId("username")}
        label="Username"
        hint="Biasanya alamat email lengkap akun pengirim."
        error={errorFor("username")}
      >
        <Input {...text("username")} />
      </Field>
      <Field
        id={smtpFieldId("password")}
        label="Password"
        hint={
          hasPassword
            ? "Tersimpan. Kosongkan untuk tetap memakai password yang ada (selama server dan akun sama)."
            : undefined
        }
        error={errorFor("password")}
      >
        <PasswordInput
          autoComplete="new-password"
          value={values.password}
          onChange={(e) => onChange("password", e.target.value)}
        />
      </Field>
      <Field
        id={smtpFieldId("fromAddress")}
        label="Email pengirim"
        required
        error={errorFor("fromAddress")}
      >
        <Input {...text("fromAddress")} type="email" inputMode="email" />
      </Field>
      <Field
        id={smtpFieldId("fromName")}
        label="Nama pengirim"
        hint="Mis. Data Dashboard."
        error={errorFor("fromName")}
      >
        <Input {...text("fromName")} />
      </Field>
    </div>
  );
}
