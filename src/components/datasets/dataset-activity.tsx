"use client";

import { createContext, use, useEffect, useState, type ReactNode } from "react";

/*
 * Aktivitas dataset di tab ini (T-013). UploadPanel mengabarkan "ada unggahan yang sedang
 * ditransfer" (berjalan/dijeda, versi UPLOADING sudah ada di server) tanpa router.refresh() di
 * tengah unggahan: refresh itu mengganti badge dan menghapus alert gagal di atas panel progres
 * sehingga panel bergeser. Riwayat versi memakainya untuk menyembunyikan "Aktifkan" dan menampilkan
 * kalimat sibuk. Server tetap menolak DATASET_BUSY sebagai penjaga balapan (tab lain, dsb.).
 */
export const UploadingInTab = createContext(false);
const SetUploadingInTab = createContext<(uploading: boolean) => void>(() => {});

/** Dipasang halaman profil dataset di sekitar kartu Data dan Riwayat versi. */
export function DatasetActivityProvider({ children }: { children: ReactNode }) {
  const [uploading, setUploading] = useState(false);
  return (
    <SetUploadingInTab value={setUploading}>
      <UploadingInTab value={uploading}>{children}</UploadingInTab>
    </SetUploadingInTab>
  );
}

/** Dipanggil UploadPanel: menerbitkan nilai terbaru; false lagi saat panel dilepas (unmount). */
export function usePublishUploading(uploading: boolean) {
  const publish = use(SetUploadingInTab);
  useEffect(() => {
    publish(uploading);
    return () => publish(false);
  }, [publish, uploading]);
}
