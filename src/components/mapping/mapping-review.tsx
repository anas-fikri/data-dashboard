"use client";

import {
  IconAdjustmentsHorizontal,
  IconAlertTriangle,
  IconDeviceFloppy,
} from "@tabler/icons-react";
import { useEffect, useRef } from "react";
import { fmtInt, fmtPct } from "@/components/schema/labels";
import { Button } from "@/components/ui/button";
import type { MappingReviewIssue } from "./mapping-types";

const SMALL_CTA = "h-(--control-h-lg) w-full sm:w-auto md:h-(--control-h-sm)";

/**
 * Tahap tinjau (T-014): job sudah mencoba menerapkan pemetaan, tetapi di beberapa kolom kurang dari
 * 98 % nilai cocok dengan tipenya. Belum ada yang disimpan. Dua jalan: ubah tipe kolomnya (tombol
 * memfokuskan pemicu tipe baris terkait) lalu simpan lagi, atau simpan keputusan yang sama dengan
 * persetujuan bahwa nilai yang tidak cocok dikosongkan. `live` = hasil simpan barusan (judul menerima
 * fokus); tanpa `live` = hasil terakhir dari server saat halaman dibuka (tanpa simpan langsung, karena
 * keputusan di halaman ini belum tentu sama).
 */
export function MappingReview({
  issues,
  targets,
  showSheet,
  live,
  canAcknowledge,
  disabled,
  onAcknowledge,
}: {
  issues: MappingReviewIssue[];
  /** Id pemicu tipe per isu (urutan sama); null = tipenya tidak bisa diubah di halaman ini. */
  targets: (string | null)[];
  /** Sebut nama sheet (workbook); CSV hanya punya satu sheet bernama otomatis. */
  showSheet: boolean;
  live: boolean;
  /** Keputusan masih sama dengan yang ditinjau job: boleh disimpan dengan persetujuan. */
  canAcknowledge: boolean;
  disabled: boolean;
  onAcknowledge: () => void;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (live) titleRef.current?.focus();
  }, [live]);

  const n = fmtInt(issues.length);
  return (
    <section
      aria-labelledby="mapping-review-title"
      data-testid="mapping-review"
      data-live={live || undefined}
      className="flex flex-col gap-3 rounded-lg border border-warning/60 bg-warning/10 p-4 text-sm"
    >
      <h2
        id="mapping-review-title"
        ref={titleRef}
        tabIndex={-1}
        className="flex items-start gap-2 text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <IconAlertTriangle size={20} stroke={1.5} aria-hidden className="mt-0.5 shrink-0" />
        Periksa nilai yang tidak cocok
      </h2>
      <p>
        {live ? "Pemetaan belum disimpan" : "Pemetaan terakhir belum disimpan"}: di {n} kolom,
        banyak nilai tidak cocok dengan tipenya. Nilai yang tidak cocok akan dikosongkan.
      </p>
      <ul className="flex flex-col divide-y rounded-md border bg-background">
        {issues.map((issue, i) => {
          const target = targets[i] ?? null;
          return (
            <li
              key={`${issue.sheet}\u0000${issue.column}`}
              data-testid="mapping-review-issue"
              className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            >
              <p className="min-w-0 [overflow-wrap:anywhere]">
                Kolom “<span className="font-medium">{issue.column}</span>” (file: “{issue.header}”
                {showSheet ? `, sheet “${issue.sheet}”` : ""}): hanya{" "}
                <span className="font-medium tabular-nums">{fmtPct(issue.pct)}</span> nilai cocok
                dengan {issue.typeLabel}
              </p>
              {target ? (
                <Button
                  size="sm"
                  variant="outline"
                  className={`${SMALL_CTA} shrink-0`}
                  leadingIcon={<IconAdjustmentsHorizontal aria-hidden />}
                  onClick={() => document.getElementById(target)?.focus()}
                >
                  Ubah tipe<span className="sr-only"> untuk “{issue.column}”</span>
                </Button>
              ) : (
                <span className="shrink-0 text-xs text-muted-foreground">
                  Ubah dari halaman Skema setelah versi aktif.
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {live && canAcknowledge ? (
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-4">
          {/* Teks utama, bukan muted: latar peringatan menurunkan kontras muted di bawah 4,5:1. */}
          <p>Ubah tipe kolomnya (mis. ke Teks) lalu simpan lagi, atau simpan apa adanya.</p>
          <Button
            data-testid="mapping-acknowledge"
            disabled={disabled}
            leadingIcon={<IconDeviceFloppy aria-hidden />}
            className="h-(--control-h-lg) w-full shrink-0 md:h-(--control-h) md:w-auto"
            onClick={onAcknowledge}
          >
            Simpan dan kosongkan nilai yang tidak cocok
          </Button>
        </div>
      ) : (
        <p>
          {live
            ? "Pilihan berubah sejak diperiksa. Simpan lagi untuk memeriksa ulang."
            : "Buat lagi pilihan kolomnya lalu simpan; ubah tipe kolom yang tercantum bila perlu."}
        </p>
      )}
    </section>
  );
}
