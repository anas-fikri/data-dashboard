import { IconAlertTriangle, IconCircleCheck, IconCircleX, IconCloudOff } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import type { BackupAlert, BackupState, BackupStatus } from "@/features/backup/types";
import { formatBytes } from "@/features/uploads/client";

const STATE: Record<
  BackupState,
  { tone: "success" | "warning" | "destructive" | "neutral"; label: string; icon: ReactNode }
> = {
  ok: { tone: "success", label: "Normal", icon: <IconCircleCheck /> },
  pending: { tone: "warning", label: "Salinan off-VM tertunda", icon: <IconAlertTriangle /> },
  failed: { tone: "destructive", label: "Gagal", icon: <IconCircleX /> },
  off: { tone: "neutral", label: "Hanya di server ini", icon: <IconCloudOff /> },
};

const when = (iso: string | null) =>
  iso
    ? `${new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" })} WIB`
    : null;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

/** Ringkasan status backup dari status.json service backup (T-7psf). */
export function BackupStatusCard({
  status,
  alert,
}: {
  status: BackupStatus | null;
  alert: BackupAlert | null;
}) {
  if (!status) {
    return (
      <section
        aria-labelledby="backup-status-heading"
        className="rounded-lg border bg-card p-5"
        data-testid="backup-status"
      >
        <h2 id="backup-status-heading" className="text-base font-semibold">
          Status backup
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Belum ada catatan backup. Status muncul setelah backup harian berikutnya (02.00 WIB).
        </p>
      </section>
    );
  }
  const s = STATE[status.state];
  return (
    <section
      aria-labelledby="backup-status-heading"
      className="rounded-lg border bg-card p-5"
      data-testid="backup-status"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="backup-status-heading" className="text-base font-semibold">
          Status backup
        </h2>
        <Badge tone={s.tone} icon={s.icon}>
          {s.label}
        </Badge>
      </div>
      {alert && alert.tone === "error" && status.state !== "failed" ? (
        <p className="mt-2 text-sm font-medium text-destructive">{alert.text}</p>
      ) : null}
      <dl className="mt-2 divide-y">
        <Row label="Backup terakhir">
          {status.lastBackupAt
            ? `${when(status.lastBackupAt)}${status.lastBackupOk === false ? " — gagal" : status.lastSizeBytes ? ` · ${formatBytes(status.lastSizeBytes)}` : ""}`
            : "Belum ada"}
        </Row>
        <Row label="Target off-VM">
          {status.target ?? "Belum diatur — backup hanya tersimpan di server aplikasi."}
        </Row>
        {status.target ? (
          <Row label="Terakhir tersalin">{when(status.lastOffsiteOkAt) ?? "Belum pernah"}</Row>
        ) : null}
        {status.pending > 0 ? (
          <Row label="Tertunda">
            {status.pending} arsip disimpan sementara di server sejak {when(status.pendingSince)};
            dikirim ulang otomatis tiap 30 menit.
          </Row>
        ) : null}
        {status.error ? (
          <Row label="Galat terakhir">
            <code className="font-mono text-xs">{status.error}</code>
          </Row>
        ) : null}
      </dl>
    </section>
  );
}
