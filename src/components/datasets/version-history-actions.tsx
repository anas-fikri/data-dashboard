"use client";

import { IconRestore } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { createContext, use, useCallback, useState, type ReactNode } from "react";
import { FocusNotice } from "@/components/ui/focus-notice";
import { activateVersionAction } from "@/features/versions/actions";
import { VersionConfirm } from "./version-history-confirm";

const NotifyContext = createContext<(fileName: string) => void>(() => {});

/**
 * Satu tempat untuk hasil aktivasi di atas daftar versi: diumumkan (role status) dan menerima fokus.
 * State klien bertahan saat router.refresh(), jadi pemberitahuan tetap terlihat setelah daftar
 * dirender ulang; key baru = mount ulang = fokus dan pengumuman lagi untuk aktivasi berikutnya.
 */
export function VersionFeedback({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<{ id: number; fileName: string } | null>(null);
  const notify = useCallback(
    (fileName: string) => setNotice((prev) => ({ id: (prev?.id ?? 0) + 1, fileName })),
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

/** "Aktifkan" pada versi siap yang tidak aktif (rollback atau maju lagi), khusus pemilik. */
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
        notify(name);
        router.refresh();
      }}
    />
  );
}
