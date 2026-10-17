"use client";

import { IconCircleCheck, IconLoader2, IconRefresh } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { IngestProgress as Progress } from "@/features/ingest/ingest";
import type { IngestStatus } from "@/features/schema/service";
import { usePolling } from "@/lib/hooks/use-polling";
import { cn } from "@/lib/utils";

/*
 * Progres ingest (T-008 AC 1): polling ≤ 5 detik selama versi menunggu/diproses; begitu selesai atau
 * gagal halaman dirender ulang dari server (badge, data aktif, pesan gagal). Angka baris tidak
 * diumumkan tiap tick ke pembaca layar — hanya pergantian tahap.
 */
const POLL_MS = 2_500;
const STEPS: { key: Progress["stage"]; label: string }[] = [
  { key: "unduh", label: "Menyiapkan file" },
  { key: "baca", label: "Membaca isi file" },
  { key: "simpan", label: "Menyimpan data" },
  { key: "tipe", label: "Mendeteksi tipe kolom" },
];
const ACTIVE = new Set(["UPLOADED", "INGESTING"]);
/** Ganti data (refresh) di-cast dengan skema aktif tanpa deteksi tipe (D4), jadi labelnya lain. */
const REFRESH_TYPE_LABEL = "Menerapkan skema aktif";
const fmt = (n: number) => n.toLocaleString("id-ID");

type Response = { ok: boolean; status: IngestStatus | null };

/** Posisi dari route progres (T-024 AC 2); tanpa posisi (Redis lambat, retry tertunda) teks umum. */
export function waitingText(position: number | undefined): string {
  if (!position) return "Menunggu giliran diproses. ";
  return position === 1
    ? "Menunggu giliran: antrean ke-1, diproses berikutnya. "
    : `Menunggu giliran: antrean ke-${fmt(position)}. `;
}

export function IngestProgress({
  datasetId,
  initial,
}: {
  datasetId: string;
  initial: IngestStatus;
}) {
  const router = useRouter();
  const { data, error, retry } = usePolling<Response>({
    url: `/api/datasets/${datasetId}/progress`,
    intervalMs: POLL_MS,
    initial: { ok: true, status: initial },
    done: (d) => !d.status || !ACTIVE.has(d.status.status),
    onDone: () => router.refresh(),
    // Dataset dihapus / sesi habis: render ulang (404 atau halaman login).
    onStop: () => router.refresh(),
  });
  const s = data?.status ?? initial;
  const p = s.progress;
  const step = p ? STEPS.findIndex((x) => x.key === p.stage) : -1;
  // `=== true`: progres tersimpan sebelum T-013 tidak punya field refresh.
  const refresh = p?.refresh === true;
  const labelOf = (x: (typeof STEPS)[number]) =>
    x.key === "tipe" && refresh ? REFRESH_TYPE_LABEL : x.label;
  const fraction = p?.stage === "baca" && p.fraction !== null ? p.fraction : null;
  const pct = fraction === null ? null : Math.round(Math.min(1, Math.max(0, fraction)) * 100);

  return (
    <div
      className="flex flex-col gap-3 rounded-md border bg-muted/40 p-3 text-sm"
      data-testid="dataset-processing"
    >
      <p className="flex items-start gap-3">
        <IconLoader2
          size={20}
          stroke={1.5}
          aria-hidden
          className="mt-0.5 shrink-0 text-primary motion-safe:animate-spin"
        />
        <span className="min-w-0">
          <span className="block break-words font-medium">
            {s.fileName ? `"${s.fileName}" sedang diproses` : "File sedang diproses"}
          </span>
          <span className="block text-muted-foreground">
            {s.status === "UPLOADED" ? waitingText(s.queue?.position) : null}
            Anda boleh menutup halaman ini. File baru bisa diunggah setelah proses selesai.
          </span>
        </span>
      </p>

      <ol className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4" aria-label="Tahap pemrosesan">
        {STEPS.map((x, i) => {
          const state = step < 0 ? "todo" : i < step ? "done" : i === step ? "now" : "todo";
          return (
            <li
              key={x.key}
              aria-current={state === "now" ? "step" : undefined}
              className={cn(
                "flex items-center gap-1.5",
                state === "todo" ? "text-muted-foreground" : "text-foreground",
                state === "now" && "font-medium",
              )}
            >
              {state === "done" ? (
                <IconCircleCheck
                  size={16}
                  stroke={2}
                  aria-hidden
                  className="shrink-0 text-success"
                />
              ) : (
                <span
                  aria-hidden
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    state === "now" ? "bg-primary" : "bg-muted-foreground/40",
                  )}
                />
              )}
              <span>{labelOf(x)}</span>
              {state === "done" ? <span className="sr-only">(selesai)</span> : null}
            </li>
          );
        })}
      </ol>

      {p?.sheetName ? (
        <div className="flex flex-col gap-1.5">
          <p className="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
            <span className="min-w-0 break-words">
              Sheet {p.sheet + 1}: <span className="font-medium">{p.sheetName}</span>
            </span>
            <span className="tabular-nums text-muted-foreground" data-testid="ingest-rows">
              {fmt(p.rows)}
              {p.rowsEstimate ? ` dari ± ${fmt(p.rowsEstimate)}` : ""} baris
            </span>
          </p>
          <div
            role="progressbar"
            aria-label={`Progres sheet ${p.sheetName}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct ?? undefined}
            aria-valuetext={pct === null ? "Sedang berjalan" : `${pct}%`}
            className="h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div
              className={cn(
                "h-full rounded-full bg-primary transition-[width] duration-500",
                pct === null && "w-full bg-primary/30 motion-safe:animate-pulse",
              )}
              style={pct === null ? undefined : { width: `${pct}%` }}
            />
          </div>
        </div>
      ) : null}

      {s.sheets.length > 0 ? (
        <ul className="flex flex-col gap-1 text-muted-foreground" aria-label="Sheet tersimpan">
          {s.sheets.map((sh) => (
            <li key={sh.index} className="flex items-start gap-1.5">
              <IconCircleCheck
                size={16}
                stroke={2}
                aria-hidden
                className="mt-0.5 shrink-0 text-success"
              />
              <span className="min-w-0 break-words">
                {sh.name}{" "}
                <span className="whitespace-nowrap tabular-nums">· {fmt(sh.rawRows)} baris</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="sr-only" aria-live="polite">
        {step >= 0 ? `Tahap: ${labelOf(STEPS[step]!)}` : ""}
      </p>
      {error ? (
        <p className="flex flex-wrap items-center gap-2 text-muted-foreground" role="status">
          Status terbaru belum bisa dimuat; mencoba lagi otomatis.
          <Button
            size="sm"
            variant="outline"
            leadingIcon={<IconRefresh aria-hidden />}
            onClick={retry}
          >
            Coba sekarang
          </Button>
        </p>
      ) : null}
    </div>
  );
}
