"use client";

import { IconInfoCircle, IconRestore, IconTrash, IconUpload } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, use, useCallback, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { FocusNotice } from "@/components/ui/focus-notice";
import { removePeriodAction, restorePeriodAction } from "@/features/versions/actions";
import { sheetChange } from "@/features/versions/period-sheet-change";
import { UploadingInTab } from "./dataset-activity";
import { VersionConfirm } from "./version-history-confirm";

/*
 * Aksi kartu Periode (T-056): "Unggah ulang" (panel unggah dengan periode terisi), "Hapus" (versi
 * PERIOD_REMOVE) dan "Pulihkan" (versi PERIOD_RESTORE). Selama dataset sibuk (versi non-terminal di
 * server, atau unggahan sedang ditransfer di tab ini) aksi tidak ditawarkan dan satu kalimat
 * menjelaskannya; server tetap menolak DATASET_BUSY sebagai penjaga balapan.
 */

const NotifyContext = createContext<(text: string) => void>(() => {});

/** Hasil hapus/pulihkan di atas daftar: diumumkan dan menerima fokus (tetap ada setelah refresh). */
export function PeriodFeedback({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<{ id: number; text: string } | null>(null);
  const notify = useCallback(
    (text: string) => setNotice((prev) => ({ id: (prev?.id ?? 0) + 1, text })),
    [],
  );
  return (
    <NotifyContext value={notify}>
      {notice ? (
        <div data-testid="period-result">
          <FocusNotice key={notice.id}>
            <span className="[overflow-wrap:anywhere]">{notice.text}</span>
          </FocusNotice>
        </div>
      ) : null}
      {children}
    </NotifyContext>
  );
}

/** Dataset sibuk (server) atau unggahan sedang ditransfer di tab ini. */
function useBusy(busy: boolean): boolean {
  return busy || use(UploadingInTab);
}

export function PeriodBusyNote({ busy }: { busy: boolean }) {
  if (!useBusy(busy)) return null;
  return (
    <p className="flex items-start gap-1.5 text-sm text-muted-foreground" data-testid="period-busy">
      <IconInfoCircle size={20} stroke={1.5} aria-hidden className="shrink-0" />
      Unggah ulang, hapus, dan pulihkan periode tersedia lagi setelah unggahan yang sedang berjalan
      selesai diproses, diterapkan, atau dibatalkan.
    </p>
  );
}

/** Tombol baris: 44px dan selebar kartu di ponsel, ringkas mulai 768. */
const ROW_CTA = "h-(--control-h-lg) w-full md:h-(--control-h-sm) md:w-auto";

export function PeriodReupload({
  href,
  label,
  busy,
}: {
  href: string;
  label: string;
  busy: boolean;
}) {
  if (useBusy(busy)) return null;
  return (
    <Button asChild variant="outline" size="sm" className={ROW_CTA}>
      <Link href={href} scroll={false} data-testid="period-reupload">
        <IconUpload aria-hidden />
        Unggah ulang<span className="sr-only"> {label}</span>
      </Link>
    </Button>
  );
}

const fmt = (n: number) => n.toLocaleString("id-ID");

export function PeriodRemove({
  datasetId,
  baseVersionId,
  periodKey,
  label,
  rows,
  sheetCount,
  busy,
}: {
  datasetId: string;
  baseVersionId: string;
  periodKey: string;
  label: string;
  rows: number;
  sheetCount: number;
  busy: boolean;
}) {
  const router = useRouter();
  const notify = use(NotifyContext);
  if (useBusy(busy)) return null;
  return (
    <VersionConfirm
      label={
        <>
          Hapus<span className="sr-only"> {label}</span>
        </>
      }
      icon={<IconTrash aria-hidden />}
      testId="period-remove"
      title={`Hapus ${label}?`}
      description={
        <>
          {label} ({fmt(rows)} baris{sheetCount > 1 ? ` di ${fmt(sheetCount)} sheet` : ""}) dilepas
          dari data aktif dan dashboard; periode lain tidak berubah. Data tidak dihapus di tempat:
          versi baru dibuat, jadi {label} bisa dipulihkan atau versi sekarang diaktifkan lagi selama
          masih tersimpan.
        </>
      }
      confirmLabel={`Hapus ${label}`}
      destructive
      run={() => removePeriodAction(datasetId, { periodKey, baseVersionId })}
      onDone={() => {
        notify(
          `${label} dihapus dari data aktif. Periode lain tidak berubah; ${label} bisa dipulihkan selama versi sebelumnya masih tersimpan.`,
        );
        router.refresh();
      }}
    />
  );
}

export function PeriodRestore({
  datasetId,
  baseVersionId,
  periodKey,
  label,
  sourceVersionId,
  sourceTitle,
  rows,
  sheets,
  replaces,
  busy,
}: {
  datasetId: string;
  baseVersionId: string;
  periodKey: string;
  label: string;
  sourceVersionId: string;
  sourceTitle: string;
  rows: number;
  /** Baris periode ini per sheet aktif sebelum → sesudah (null = tidak ada). */
  sheets: { name: string; before: number | null; after: number | null }[];
  /** Periode ada di data aktif dengan isi lain (diganti), bukan dikembalikan. */
  replaces: boolean;
  busy: boolean;
}) {
  const router = useRouter();
  const notify = use(NotifyContext);
  if (useBusy(busy)) return null;
  return (
    <VersionConfirm
      label={
        <>
          Pulihkan<span className="sr-only"> {label}</span>
        </>
      }
      icon={<IconRestore aria-hidden />}
      testId="period-restore"
      title={`Pulihkan ${label}?`}
      description={
        <>
          Isi {label} dari versi “{sourceTitle}” ({fmt(rows)} baris){" "}
          {replaces ? "menggantikan isi periode itu di data aktif" : "dikembalikan ke data aktif"};
          periode lain tidak berubah. Versi baru dibuat dan bisa dibatalkan lewat riwayat versi.
          <span className="mt-3 block font-medium text-foreground">Baris {label} per sheet:</span>
          <span className="mt-1 block" data-testid="period-restore-sheets">
            {sheets.map((s) => (
              <span
                key={s.name}
                className="block tabular-nums [overflow-wrap:anywhere]"
                data-testid="period-restore-sheet"
              >
                {s.name}: {sheetChange(s)}
              </span>
            ))}
          </span>
        </>
      }
      confirmLabel={`Pulihkan ${label}`}
      run={() => restorePeriodAction(datasetId, { periodKey, baseVersionId, sourceVersionId })}
      onDone={() => {
        notify(`${label} dipulihkan. Periode lain tidak berubah.`);
        router.refresh();
      }}
    />
  );
}
