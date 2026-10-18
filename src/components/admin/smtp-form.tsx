"use client";

import { IconDeviceFloppy, IconMailForward } from "@tabler/icons-react";
import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FocusNotice } from "@/components/ui/focus-notice";
import { Input } from "@/components/ui/input";
import { saveSmtpAction, testSmtpAction } from "@/features/smtp/actions";
import type { SmtpField, SmtpInput, SmtpResult, SmtpView } from "@/features/smtp/types";
import { SmtpFields, smtpFieldId as id } from "./smtp-fields";

const NETWORK = "Tidak bisa menghubungi server aplikasi. Periksa koneksi, lalu coba lagi.";
const CTA = "h-(--control-h-lg) w-full md:h-(--control-h) md:w-auto";

/**
 * Pengaturan SMTP (Admin › Email, T-byys). "Kirim email uji" memakai isian saat ini (belum perlu disimpan);
 * password yang berlaku tidak pernah dikirim ke browser — kolom kosong = tetap.
 */
export function SmtpForm({ initial, adminEmail }: { initial: SmtpView; adminEmail: string }) {
  const [values, setValues] = useState<SmtpInput>({
    host: initial.host,
    port: String(initial.port),
    security: initial.security,
    username: initial.username,
    password: "",
    fromAddress: initial.fromAddress,
    fromName: initial.fromName,
  });
  const [testTo, setTestTo] = useState(adminEmail);
  const [hasPassword, setHasPassword] = useState(initial.hasPassword);
  const [fieldError, setFieldError] = useState<{ field: SmtpField; message: string } | null>(null);
  const [notice, setNotice] = useState<{
    tone: "success" | "error";
    text: string;
    n: number;
  } | null>(null);
  const [busy, setBusy] = useState<"test" | "save" | null>(null);
  const [, start] = useTransition();

  const set = <K extends keyof SmtpInput>(k: K, v: SmtpInput[K]) =>
    setValues((s) => ({ ...s, [k]: v }));
  const errorFor = (f: SmtpField) => (fieldError?.field === f ? fieldError.message : undefined);
  const say = (tone: "success" | "error", text: string) =>
    setNotice((p) => ({ tone, text, n: (p?.n ?? 0) + 1 }));

  function finish<T>(res: SmtpResult<T> | null, ok: (data: T) => string) {
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
        const res = await testSmtpAction(input, testTo).catch(() => null);
        finish(
          res,
          (d) => `Email uji terkirim ke ${d.to}. Periksa kotak masuk (atau folder spam).`,
        );
        return;
      }
      const res = await saveSmtpAction(input).catch(() => null);
      finish(res, (data) => {
        setHasPassword(data.hasPassword);
        set("password", "");
        return "Tersimpan. Email aplikasi dan notifikasi backup berikutnya memakai pengaturan ini.";
      });
    });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    run("save");
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4" data-testid="smtp-form">
      {notice ? (
        <FocusNotice key={notice.n} tone={notice.tone}>
          {notice.text}
        </FocusNotice>
      ) : null}
      <SmtpFields values={values} onChange={set} errorFor={errorFor} hasPassword={hasPassword} />
      <div className="flex flex-col gap-4 rounded-lg border p-4 md:flex-row md:items-end">
        <Field
          id={id("testTo")}
          label="Kirim email uji ke"
          error={errorFor("testTo")}
          className="md:flex-1"
        >
          <Input
            type="email"
            inputMode="email"
            autoComplete="off"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
          />
        </Field>
        <Button
          type="button"
          variant="outline"
          pending={busy === "test"}
          disabled={busy !== null}
          leadingIcon={<IconMailForward aria-hidden />}
          className={CTA}
          onClick={() => run("test")}
        >
          Kirim email uji
        </Button>
      </div>
      <div className="flex flex-col gap-2 md:flex-row md:justify-end">
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
