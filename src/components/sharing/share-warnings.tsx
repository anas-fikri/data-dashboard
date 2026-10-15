"use client";

import { IconAlertTriangle } from "@tabler/icons-react";
import Link from "next/link";
import { Dialog } from "radix-ui";
import { Fragment, type ReactNode } from "react";
import { FILTER_SETTINGS_ID } from "@/components/dashboards/filters/filter-bar";
import { EDITOR_WARNING, FILTER_WARNING } from "./share-model";

/*
 * Dua peringatan wajib dialog share (T-016, AC6 + catatan review T-012). Wilayahnya selalu terpasang
 * dan sopan (aria-live) sehingga peringatan editor yang muncul saat peran "Bisa mengedit widget"
 * dipilih ikut dibacakan. Teks memakai warna latar depan penuh di atas latar peringatan (kontras).
 */
function Warning({ testId, children }: { testId: string; children: ReactNode }) {
  return (
    <div
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
  filterColumns,
}: {
  dashboardId: string;
  editor: boolean;
  filterColumns: readonly string[];
}) {
  return (
    <div aria-live="polite" className="flex flex-col gap-2 empty:hidden">
      {editor ? <Warning testId="share-warning-editor">{EDITOR_WARNING}</Warning> : null}
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
            Sebelum berbagi, ganti nama kolomnya di skema atau hapus kolom filternya di{" "}
            <Dialog.Close asChild>
              <Link
                href={`/dashboards/${dashboardId}?mode=edit#${FILTER_SETTINGS_ID}`}
                className="font-medium underline underline-offset-4"
              >
                pengaturan dashboard (mode edit)
              </Link>
            </Dialog.Close>
            .
          </p>
        </Warning>
      ) : null}
    </div>
  );
}
