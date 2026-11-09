import { IconAlertTriangle, IconCircleCheck, IconCircleX, IconCloudOff } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { archiveTime, errorHint, lowSpace } from "@/features/backup/display";
import type { BackupAlert, BackupState, BackupStatus, SyncState } from "@/features/backup/types";
import { formatSize, formatWib } from "./backup-format";
import { SyncNow } from "./sync-now";

const STATE: Record<
  BackupState,
  { tone: "success" | "warning" | "destructive" | "neutral"; label: string; icon: ReactNode }
> = {
  ok: { tone: "success", label: "Normal", icon: <IconCircleCheck /> },
  pending: { tone: "warning", label: "Salinan off-VM tertunda", icon: <IconAlertTriangle /> },
  failed: { tone: "destructive", label: "Gagal", icon: <IconCircleX /> },
  off: { tone: "neutral", label: "Hanya di server ini", icon: <IconCloudOff /> },
};

const when = formatWib;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

function Warn({ children }: { children: ReactNode }) {
  return (
    <span className="mt-1 flex items-start gap-1.5 font-medium">
      <IconAlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
      <span>{children}</span>
    </span>
  );
}

/**
 * Ringkasan status backup dari status.json service backup (T-7psf), plus jeda kirim ulang, ruang server/NAS,
 * penjelasan galat, dan "Kirim ulang sekarang" (T-tsvf).
 */
export function BackupStatusCard({
  status,
  alert,
  sync,
}: {
  status: BackupStatus | null;
  alert: BackupAlert | null;
  sync: SyncState;
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
  const hint = errorHint(status.error);
  const nas = status.nasSpace?.target === status.target ? status.nasSpace : null;
  const remote = status.remote?.target === status.target ? status.remote : null;
  const oldest = remote?.oldest ? when(archiveTime(remote.oldest)) : null;
  const delayed = status.pending > 0 && status.nextSyncAt;
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
            ? `${when(status.lastBackupAt)}${status.lastBackupOk === false ? " — gagal" : status.lastSizeBytes ? ` · ${formatSize(status.lastSizeBytes)}` : ""}`
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
            {delayed
              ? ` NAS menolak menyimpan ${status.syncFailures}× berturut-turut, jadi kirim ulang otomatis dijeda sampai ${when(status.nextSyncAt)}.`
              : " dikirim ulang otomatis tiap 30 menit."}
          </Row>
        ) : null}
        {status.error ? (
          <Row label="Galat terakhir">
            {hint ? <span className="mb-1 block">{hint}</span> : null}
            <code className="font-mono text-xs text-muted-foreground">{status.error}</code>
          </Row>
        ) : null}
        {status.disk ? (
          <Row label="Disk server (backup)">
            Sisa {formatSize(status.disk.freeBytes)} dari {formatSize(status.disk.totalBytes)}
            {status.localBytes !== null
              ? ` · arsip memakai ${formatSize(status.localBytes)} (${status.archives.length} arsip)`
              : null}
            {lowSpace(status.disk.freeBytes, status.lastSizeBytes) ? (
              <Warn>
                Kurang dari 2 × ukuran arsip terakhir — backup berikutnya bisa gagal. Perpendek lama
                simpan di server atau kosongkan disk.
              </Warn>
            ) : null}
          </Row>
        ) : null}
        {status.target ? (
          <Row label="Sisa ruang NAS">
            {nas ? (
              <>
                Sisa {formatSize(nas.freeBytes)} dari {formatSize(nas.totalBytes)} (dicek{" "}
                {when(nas.checkedAt)}). Kuota folder/akun di DSM bisa lebih kecil dan tidak terlihat
                dari sini.
                {lowSpace(nas.freeBytes, status.lastSizeBytes) ? (
                  <Warn>
                    Kurang dari 2 × ukuran arsip terakhir — minta admin NAS menambah ruang.
                  </Warn>
                ) : null}
              </>
            ) : (
              "Belum diketahui (NAS tidak melaporkan sisa ruang). Tes koneksi di bawah juga menampilkannya bila NAS mendukung."
            )}
          </Row>
        ) : null}
        {remote ? (
          <Row label="Arsip di NAS">
            {remote.count} arsip · {formatSize(remote.bytes)}
            {oldest ? ` · terlama ${oldest}` : ""} (dicek {when(remote.checkedAt)})
          </Row>
        ) : null}
      </dl>
      {status.target ? (
        <div className="mt-3 border-t pt-3">
          <SyncNow
            key={`${status.updatedAt}|${sync.requested}|${sync.running?.since ?? ""}`}
            initial={sync}
          />
        </div>
      ) : null}
    </section>
  );
}
