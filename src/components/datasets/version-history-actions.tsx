"use client";

import { IconInfoCircle, IconRestore, IconTrash } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { createContext, use, useCallback, useState, type ReactNode } from "react";
import { FocusNotice } from "@/components/ui/focus-notice";
import { activateVersionAction, discardVersionAction } from "@/features/versions/actions";
import { UploadingInTab } from "./dataset-activity";
import { VersionConfirm } from "./version-history-confirm";
import { BUSY_TEXT, keepNotice, shownBusy, type ActivationBusy } from "./version-history-status";

const NotifyContext = createContext<(versionId: string, fileName: string) => void>(() => {});

/**
 * Satu tempat untuk hasil aktivasi di atas daftar versi: diumumkan (role status) dan menerima fokus.
 * State klien bertahan saat router.refresh(), jadi pemberitahuan tetap terlihat setelah daftar
 * dirender ulang; key baru = mount ulang = fokus dan pengumuman lagi untuk aktivasi berikutnya.
 * Bila versi aktif kemudian berganti ke versi lain, pemberitahuan dibuang agar tidak menyebut versi
 * yang sudah tidak aktif (reset saat prop berubah, tanpa efek).
 */
export function VersionFeedback({
  activeVersionId,
  children,
}: {
  activeVersionId: string | null;
  children: ReactNode;
}) {
  const [notice, setNotice] = useState<{ id: number; versionId: string; fileName: string } | null>(
    null,
  );
  const [seenActive, setSeenActive] = useState(activeVersionId);
  if (seenActive !== activeVersionId) {
    setSeenActive(activeVersionId);
    setNotice((prev) => keepNotice(prev, activeVersionId));
  }
  const notify = useCallback(
    (versionId: string, fileName: string) =>
      setNotice((prev) => ({ id: (prev?.id ?? 0) + 1, versionId, fileName })),
    [],
  );
  return (
    <NotifyContext value={notify}>
      {notice ? (
        <div data-testid="version-result">
          <FocusNotice key={notice.id}>
            <span className="[overflow-wrap:anywhere]">
              Versi “{notice.fileName}” aktif. Dashboard memakai data ini sekarang.
            </span>
          </FocusNotice>
        </div>
      ) : null}
      {children}
    </NotifyContext>
  );
}

/** Satu kalimat alasan "Aktifkan" tidak ditawarkan (server didahulukan, lalu unggahan di tab ini). */
export function VersionBusyNote({ busy }: { busy: ActivationBusy | null }) {
  const kind = shownBusy(busy, use(UploadingInTab));
  if (!kind) return null;
  return (
    <p
      className="flex items-start gap-1.5 text-sm text-muted-foreground"
      data-testid="version-busy"
    >
      <IconInfoCircle size={20} stroke={1.5} aria-hidden className="shrink-0" />
      {BUSY_TEXT[kind]}
    </p>
  );
}

/**
 * "Aktifkan" pada versi siap yang tidak aktif (rollback atau maju lagi), khusus pemilik. Disembunyikan
 * selama unggahan di tab ini sedang ditransfer (aktivasi pasti DATASET_BUSY).
 */
export function VersionActivate({
  datasetId,
  versionId,
  fileName,
}: {
  datasetId: string;
  versionId: string;
  fileName: string;
}) {
  const router = useRouter();
  const notify = use(NotifyContext);
  if (use(UploadingInTab)) return null;
  return (
    <VersionConfirm
      label={
        <>
          Aktifkan<span className="sr-only"> versi “{fileName}”</span>
        </>
      }
      icon={<IconRestore aria-hidden />}
      testId="version-activate"
      title={`Aktifkan versi “${fileName}”?`}
      description="Semua dashboard dataset ini akan memakai data versi ini. Versi aktif sekarang tetap tersimpan dan bisa diaktifkan lagi."
      confirmLabel="Aktifkan"
      run={() => activateVersionAction(datasetId, versionId)}
      onDone={(name) => {
        notify(versionId, name);
        router.refresh();
      }}
    />
  );
}

/**
 * "Batalkan unggahan" pada unggahan periode yang menunggu konfirmasi (T-052): versinya dibuang, data
 * aktif tidak berubah, dan dataset terbuka lagi untuk unggahan berikutnya. Layar tinjauan = T-054.
 */
export function VersionCancelPending({
  datasetId,
  versionId,
  fileName,
}: {
  datasetId: string;
  versionId: string;
  fileName: string;
}) {
  const router = useRouter();
  return (
    <VersionConfirm
      label={
        <>
          Batalkan unggahan<span className="sr-only"> “{fileName}”</span>
        </>
      }
      icon={<IconTrash aria-hidden />}
      testId="version-cancel-pending"
      title={`Batalkan unggahan “${fileName}”?`}
      description="File ini tidak dipakai dan dibuang; data aktif sekarang tetap dipakai dashboard. Anda bisa mengunggahnya lagi."
      confirmLabel="Batalkan unggahan"
      destructive
      run={() => discardVersionAction(datasetId, versionId)}
      onDone={() => router.refresh()}
    />
  );
}
