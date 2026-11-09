"use client";

import { IconDeviceFloppy, IconRestore } from "@tabler/icons-react";
import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FocusNotice } from "@/components/ui/focus-notice";
import { Input } from "@/components/ui/input";
import { resetRetentionAction, saveRetentionAction } from "@/features/backup/actions";
import { RETENTION_LIMITS } from "@/features/backup/display";
import type {
  BackupRetention,
  RetentionField,
  RetentionInput,
  RetentionView,
} from "@/features/backup/types";
import { formatSize, formatWib } from "./backup-format";

const NETWORK = "Tidak bisa menghubungi server aplikasi. Periksa koneksi, lalu coba lagi.";
const CTA = "h-(--control-h-lg) w-full md:h-(--control-h) md:w-auto";
const id = (f: RetentionField) => `retention-${f}`;
/** Nilai awal bila status backup belum ada sama sekali (sama dengan saran runbook). */
const DEFAULTS = { localDays: 7, remoteDays: 30 };

/** Perkiraan kasar ruang: hari × ukuran arsip terakhir (arsip harian berukuran hampir sama). */
function estimate(days: string, last: number | null): string | null {
  const n = Number(days);
  if (!last || !Number.isInteger(n) || n <= 0) return null;
  return `± ${formatSize(n * last)} (${n} × arsip terakhir ${formatSize(last)})`;
}

/**
 * Lama simpan arsip backup di server dan di NAS (Admin › Backup, T-tsvf), menggantikan
 * BACKUP_LOCAL_RETENTION_DAYS/BACKUP_RETENTION_DAYS di .env.prod; diterapkan service backup ± 1 menit.
 */
export function RetentionForm({
  saved,
  effective,
  lastSizeBytes,
  nasActive,
}: {
  saved: RetentionView | null;
  effective: BackupRetention | null;
  lastSizeBytes: number | null;
  nasActive: boolean;
}) {
  const start0 = saved ?? effective ?? DEFAULTS;
  const [values, setValues] = useState<RetentionInput>({
    localDays: String(start0.localDays),
    remoteDays: String(start0.remoteDays),
  });
  const [hasSaved, setHasSaved] = useState(saved !== null);
  const [fieldError, setFieldError] = useState<{ field: RetentionField; message: string } | null>(
    null,
  );
  const [notice, setNotice] = useState<{
    tone: "success" | "error";
    text: string;
    n: number;
  } | null>(null);
  const [busy, setBusy] = useState<"save" | "reset" | null>(null);
  const [, start] = useTransition();

  const say = (tone: "success" | "error", text: string) =>
    setNotice((p) => ({ tone, text, n: (p?.n ?? 0) + 1 }));
  const errorFor = (f: RetentionField) =>
    fieldError?.field === f ? fieldError.message : undefined;

  function save(e: FormEvent) {
    e.preventDefault();
    setFieldError(null);
    setBusy("save");
    const input = { ...values };
    start(async () => {
      const r = await saveRetentionAction(input).catch(() => null);
      setBusy(null);
      if (!r) return say("error", NETWORK);
      if (!r.ok) {
        if (r.field) {
          setFieldError({ field: r.field, message: r.message });
          setNotice(null);
          document.getElementById(id(r.field))?.focus();
          return;
        }
        return say("error", r.message);
      }
      setHasSaved(true);
      say(
        "success",
        `Tersimpan: server ${r.data.localDays} hari, NAS ${r.data.remoteDays} hari. Service backup menerapkannya dalam ± 1 menit.`,
      );
    });
  }

  function reset() {
    setFieldError(null);
    setBusy("reset");
    start(async () => {
      const r = await resetRetentionAction().catch(() => null);
      setBusy(null);
      if (!r) return say("error", NETWORK);
      if (!r.ok) return say("error", r.message);
      setHasSaved(false);
      say(
        "success",
        "Kembali ke bawaan server (.env.prod). Nilai yang berlaku tampil di sini setelah diterapkan service backup (± 1 menit, muat ulang halaman).",
      );
    });
  }

  const fields: { f: RetentionField; label: string; hint: string }[] = [
    {
      f: "localDays",
      label: "Lama simpan di server (hari)",
      hint: nasActive
        ? `Arsip yang sudah tersalin ke NAS dihapus dari server setelah ini, agar disk server hemat. Arsip yang belum tersalin tetap disimpan sampai lewat lama simpan NAS. ${RETENTION_LIMITS.localDays.min}–${RETENTION_LIMITS.localDays.max} hari.`
        : `Salinan ke NAS belum aktif: arsip di server dihapus setelah ini, jadi pakai nilai yang cukup panjang. ${RETENTION_LIMITS.localDays.min}–${RETENTION_LIMITS.localDays.max} hari.`,
    },
    {
      f: "remoteDays",
      label: "Lama simpan di NAS (hari)",
      hint: `Arsip di NAS yang lebih tua dari ini dihapus otomatis. ${RETENTION_LIMITS.remoteDays.min}–${RETENTION_LIMITS.remoteDays.max} hari.`,
    },
  ];

  return (
    <form onSubmit={save} noValidate className="flex flex-col gap-4" data-testid="retention-form">
      {notice ? (
        <FocusNotice key={notice.n} tone={notice.tone}>
          {notice.text}
        </FocusNotice>
      ) : null}
      <p className="text-sm text-muted-foreground" data-testid="retention-effective">
        {effective
          ? `Berlaku di backup terakhir: server ${effective.localDays} hari, NAS ${effective.remoteDays} hari (${effective.source === "app" ? "diatur di halaman ini" : "bawaan server"}).`
          : "Nilai yang berlaku tampil setelah backup harian atau kirim ulang berikutnya."}
        {saved ? ` Terakhir diubah ${formatWib(saved.updatedAt)} oleh ${saved.updatedBy}.` : null}
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {fields.map(({ f, label, hint }) => {
          const est = estimate(values[f], lastSizeBytes);
          return (
            <Field
              key={f}
              id={id(f)}
              label={label}
              required
              hint={est ? `${hint} Perkiraan ruang: ${est}.` : hint}
              error={errorFor(f)}
            >
              <Input
                inputMode="numeric"
                autoComplete="off"
                value={values[f]}
                onChange={(e) => {
                  setValues((s) => ({ ...s, [f]: e.target.value }));
                  // Pesan galat kolom ini hilang begitu diubah; petunjuk + perkiraan ruang tampil lagi.
                  if (fieldError?.field === f) setFieldError(null);
                }}
              />
            </Field>
          );
        })}
      </div>
      <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
        {hasSaved ? (
          <Button
            type="button"
            variant="outline"
            pending={busy === "reset"}
            disabled={busy !== null}
            leadingIcon={<IconRestore aria-hidden />}
            className={CTA}
            onClick={reset}
          >
            Pakai bawaan server
          </Button>
        ) : null}
        <Button
          type="submit"
          pending={busy === "save"}
          disabled={busy !== null}
          leadingIcon={<IconDeviceFloppy aria-hidden />}
          className={CTA}
        >
          Simpan lama simpan
        </Button>
      </div>
    </form>
  );
}
