"use client";

import { IconAlertTriangle } from "@tabler/icons-react";
import Link from "next/link";
import { Dialog } from "radix-ui";
import { Fragment, type ReactNode } from "react";
import { FILTER_SETTINGS_ID } from "@/components/dashboards/filters/filter-bar";
import { CROSS_FILTER_LABEL } from "@/components/dashboards/filters/filter-model";
import { EDITOR_WARNING, FILTER_WARNING } from "./share-model";

/*
 * Dua peringatan wajib dialog share (T-016, AC6 + catatan review T-012). Wilayahnya selalu terpasang
 * dan sopan (aria-live) sehingga peringatan editor yang muncul saat peran "Bisa mengedit widget"
 * dipilih ikut dibacakan. Saat kosong tingginya nol (bukan display:none) agar wilayahnya tetap ada di
 * pohon aksesibilitas; margin negatif menetralkan gap form (review T-016 R3-UI-1). Pengumuman bisa
 * hilang (Select Radix menyembunyikan dialog selama daftarnya terbuka), jadi peringatan editor juga
 * diberi id untuk aria-describedby Select peran dan tombol "Bagikan" (`editorId`). Teks memakai warna
 * latar depan penuh di atas latar peringatan (kontras).
 * Daftar kolom memuat kolom filter DAN kolom kategori grafik yang menyaring silang, jadi sarannya
 * menyebut keduanya — sakelar filter silang dengan label aslinya (review T-016 R2-UI-3). Tautan ke
 * pengaturan kolom filter ditandai FILTER_LINK_ATTR: dialog memindah fokus ke bagian itu, bukan ke
 * tombol "Bagikan" (R2-UI-6).
 */
export const FILTER_LINK_ATTR = "data-filter-settings-link";

function Warning({ id, testId, children }: { id?: string; testId: string; children: ReactNode }) {
  return (
    <div
      id={id}
      data-testid={testId}
      className="flex items-start gap-2 rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-sm text-foreground"
    >
      <IconAlertTriangle
        size={20}
        stroke={1.5}
        aria-hidden
        className="mt-px shrink-0 text-warning"
      />
      <div className="min-w-0 [overflow-wrap:anywhere]">{children}</div>
    </div>
  );
}

export function ShareWarnings({
  dashboardId,
  editor,
  editorId,
  filterColumns,
}: {
  dashboardId: string;
  editor: boolean;
  /** id peringatan editor (rujukan aria-describedby kontrol tambah orang). */
  editorId?: string;
  filterColumns: readonly string[];
}) {
  return (
    <div aria-live="polite" className="flex flex-col gap-2 empty:-mt-3">
      {editor ? (
        <Warning id={editorId} testId="share-warning-editor">
          {EDITOR_WARNING}
        </Warning>
      ) : null}
      {filterColumns.length ? (
        <Warning testId="share-warning-filters">
          <p>{FILTER_WARNING}</p>
          <p className="mt-1">
            Kolom:{" "}
            {filterColumns.map((name, i) => (
              <Fragment key={name}>
                {i ? ", " : null}
                <bdi className="font-medium">{name}</bdi>
              </Fragment>
            ))}
            .
          </p>
          <p className="mt-1">
            Sebelum berbagi, ganti nama kolomnya di skema, hapus kolom filternya di{" "}
            <Dialog.Close asChild>
              <Link
                href={`/dashboards/${dashboardId}?mode=edit#${FILTER_SETTINGS_ID}`}
                className="font-medium underline underline-offset-4"
                {...{ [FILTER_LINK_ATTR]: "" }}
              >
                pengaturan dashboard (mode edit)
              </Link>
            </Dialog.Close>
            , atau matikan “{CROSS_FILTER_LABEL}” di pengaturan grafik yang kategorinya memakai
            kolom itu.
          </p>
        </Warning>
      ) : null}
    </div>
  );
}
