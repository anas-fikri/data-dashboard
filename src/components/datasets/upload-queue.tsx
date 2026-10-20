"use client";

import {
  IconAlertTriangle,
  IconChecklist,
  IconCircleCheck,
  IconCircleMinus,
  IconCircleX,
  IconClock,
  IconFiles,
  IconLoader2,
  IconPlayerSkipForward,
  IconPlayerStop,
  IconRefresh,
  IconTrash,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import {
  forgetQueueUploader,
  queueUploader,
  useHydrated,
  useQueueUploads,
} from "@/components/datasets/upload-queue-store";
import { MONTHS } from "@/components/datasets/upload-period-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, DIALOG_CTA } from "@/components/ui/confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { periodLabel, type PeriodGrain } from "@/features/ingest/period";
import { UploadError, api, formatBytes } from "@/features/uploads/client";
import {
  guessPeriodFromName,
  partsOf,
  startFromParts,
  yearOptions,
} from "@/features/uploads/period-label";
import {
  createUploadQueueAction,
  dismissUploadQueueAction,
  stopUploadQueueAction,
} from "@/features/uploads/queue-actions";
import {
  TERMINAL_ITEM_STATES,
  orderQueueFiles,
  queueFilesProblem,
  queueSummaryText,
  type QueueItemView,
  type QueueTone,
  type QueueView,
} from "@/features/uploads/queue-plan";
import type { PeriodUploadContext } from "@/features/versions/period-upload";
import { usePolling } from "@/lib/hooks/use-polling";
import { cn } from "@/lib/utils";

/*
 * Antrean unggah banyak file periode (T-059, rencana G-6 §4.5 langkah 6).
 *  - UploadQueueDraft: daftar file terpilih dalam urutan proses (periode lama dulu), periode per file
 *    untuk sheet berlabel, lalu "Mulai antrean".
 *  - UploadQueuePanel: status server per file ("File 3 dari 12"), progres unggah tab ini, antrean
 *    berhenti saat file menunggu tinjauan/pemetaan dan lanjut sendiri setelah diputuskan, ringkasan
 *    (berhasil/gagal/dibatalkan) di akhir. Status dibaca ulang tiap 2,5 detik dari server, jadi tetap
 *    benar setelah muat ulang; file yang belum terunggah dipilih ulang atau dilewati.
 */

const POLL_MS = 2_500;
const control = "h-11 w-full sm:h-(--control-h-sm) sm:w-auto";
const fmt = (n: number) => n.toLocaleString("id-ID");

// ── Draf ─────────────────────────────────────────────────────────────────────────────────────────

interface DraftEntry {
  key: string;
  file: File;
  label: string | null;
}

const keyOf = (f: File) => `${f.name}\n${f.size}\n${f.lastModified}`;

export function UploadQueueDraft({
  datasetId,
  period,
  files,
  onCancel,
  onCreated,
}: {
  datasetId: string;
  period: PeriodUploadContext;
  files: File[];
  onCancel: () => void;
  onCreated: (queue: QueueView, files: File[]) => void;
}) {
  const router = useRouter();
  const titleId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const [entries, setEntries] = useState<DraftEntry[]>(() =>
    files.map((f) => ({
      key: keyOf(f),
      file: f,
      label: period.needsLabel ? guessPeriodFromName(f.name, period.grain) : null,
    })),
  );
  const [error, setError] = useState<{ message: string; stale: boolean } | null>(null);
  const [pending, startPending] = useTransition();
  const [refreshing, startRefresh] = useTransition();

  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const ordered = useMemo(
    () =>
      orderQueueFiles(
        entries.map((e) => ({
          ...e,
          name: e.file.name,
          size: e.file.size,
          lastModified: e.file.lastModified,
        })),
        period.grain,
      ),
    [entries, period.grain],
  );
  const missingLabels = period.needsLabel ? ordered.filter((e) => !e.label).length : 0;

  const submit = () => {
    const problem = queueFilesProblem(ordered, {
      grain: period.grain,
      needsLabel: period.needsLabel,
    });
    if (problem) {
      setError({ message: problem, stale: false });
      return;
    }
    setError(null);
    startPending(async () => {
      const r = await createUploadQueueAction(datasetId, {
        baseVersionId: period.baseVersionId,
        files: ordered.map((e) => ({
          name: e.name,
          size: e.size,
          lastModified: e.lastModified,
          label: e.label,
        })),
      });
      if (!r.ok) {
        setError({ message: r.message, stale: r.code === "STALE" });
        return;
      }
      onCreated(
        r.queue,
        ordered.map((e) => e.file),
      );
    });
  };

  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-md border p-3"
      data-testid="upload-queue-draft"
    >
      <div className="flex items-start gap-3">
        <IconFiles
          size={20}
          stroke={1.5}
          aria-hidden
          className="mt-0.5 shrink-0 text-muted-foreground"
        />
        <div className="min-w-0 flex-1 text-sm">
          <h3 id={titleId} ref={headingRef} tabIndex={-1} className="font-medium outline-none">
            Antrean {fmt(ordered.length)} file
          </h3>
          <p className="text-muted-foreground">
            File diproses satu per satu dalam urutan ini (periode lama dulu). Periode yang sudah ada
            diganti utuh; bila sebuah file perlu ditinjau, antrean berhenti sampai Anda memutuskan.
            {period.needsLabel ? " Pilih periode setiap file sebelum memulai." : ""}
          </p>
        </div>
      </div>

      {error ? (
        <FormAlert tone="error" ref={errorRef}>
          <span className="block">{error.message}</span>
          {error.stale ? (
            <Button
              size="sm"
              variant="outline"
              className={cn(control, "mt-2")}
              pending={refreshing}
              leadingIcon={<IconRefresh aria-hidden />}
              onClick={() => startRefresh(() => router.refresh())}
            >
              Muat ulang data
            </Button>
          ) : null}
        </FormAlert>
      ) : null}

      <ol
        className="flex flex-col divide-y rounded-md border"
        data-testid="upload-queue-draft-list"
      >
        {ordered.map((e, i) => (
          <li
            key={e.key}
            className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center"
            data-testid="upload-queue-draft-row"
          >
            <p className="flex min-w-0 flex-1 items-start gap-2 text-sm">
              <span className="w-6 shrink-0 text-right tabular-nums text-muted-foreground">
                {i + 1}.
              </span>
              <span className="min-w-0">
                <span className="block [overflow-wrap:anywhere] font-medium">{e.name}</span>
                <span className="block text-muted-foreground">
                  {formatBytes(e.size)}
                  {period.needsLabel && e.label ? ` · ${periodLabel(period.grain, e.label)}` : ""}
                </span>
              </span>
            </p>
            {period.needsLabel ? (
              <QueuePeriodSelects
                fileName={e.name}
                grain={period.grain}
                value={e.label}
                invalid={Boolean(error) && !e.label}
                onChange={(label) =>
                  setEntries((cur) => cur.map((x) => (x.key === e.key ? { ...x, label } : x)))
                }
              />
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-11 self-end sm:h-(--control-h-sm) sm:self-auto"
              aria-label={`Hapus “${e.name}” dari antrean`}
              leadingIcon={<IconTrash aria-hidden />}
              onClick={() => setEntries((cur) => cur.filter((x) => x.key !== e.key))}
            >
              <span className="sm:sr-only">Hapus</span>
            </Button>
          </li>
        ))}
      </ol>
      {missingLabels ? (
        <p className="text-sm text-muted-foreground" data-testid="upload-queue-missing-labels">
          {fmt(missingLabels)} file belum berperiode (nama file tidak menyebut periode yang jelas).
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={control}
          disabled={pending}
          leadingIcon={<IconX aria-hidden />}
          onClick={onCancel}
        >
          Batal
        </Button>
        <Button
          type="button"
          size="sm"
          className={control}
          pending={pending}
          leadingIcon={<IconUpload aria-hidden />}
          data-testid="upload-queue-start"
          onClick={submit}
        >
          Mulai antrean ({fmt(ordered.length)} file)
        </Button>
      </div>
    </section>
  );
}

/** Pemilih periode ringkas per file (bulan/kuartal + tahun, atau tahun saja). */
function QueuePeriodSelects({
  fileName,
  grain,
  value,
  invalid,
  onChange,
}: {
  fileName: string;
  grain: PeriodGrain;
  value: string | null;
  invalid: boolean;
  onChange: (label: string | null) => void;
}) {
  const id = useId();
  const [parts, setParts] = useState(() => partsOf(grain, value));
  const [years] = useState(() => yearOptions(new Date(), parts.year));
  const update = (p: Partial<typeof parts>) => {
    const next = { ...parts, ...p };
    setParts(next);
    onChange(startFromParts(grain, next));
  };
  const subLabel = grain === "QUARTER" ? "Kuartal" : "Bulan";
  return (
    <fieldset className="flex gap-2" data-testid="upload-queue-period">
      <legend className="sr-only">{`Periode “${fileName}”`}</legend>
      {grain !== "YEAR" ? (
        <div className="w-36">
          <label htmlFor={`${id}-sub`} className="sr-only">
            {`${subLabel} “${fileName}”`}
          </label>
          <Select
            value={parts.sub === null ? "" : String(parts.sub)}
            onValueChange={(v) => update({ sub: Number(v) })}
          >
            <SelectTrigger
              id={`${id}-sub`}
              aria-invalid={invalid && parts.sub === null ? true : undefined}
              aria-required
              data-testid="upload-queue-period-sub"
            >
              <SelectValue placeholder={subLabel} />
            </SelectTrigger>
            <SelectContent>
              {grain === "QUARTER"
                ? [1, 2, 3, 4].map((q) => (
                    <SelectItem key={q} value={String(q)}>
                      {`Kuartal ${q}`}
                    </SelectItem>
                  ))
                : MONTHS.map((m, i) => (
                    <SelectItem key={m} value={String(i + 1)}>
                      {m}
                    </SelectItem>
                  ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <div className="w-28">
        <label htmlFor={`${id}-year`} className="sr-only">
          {`Tahun “${fileName}”`}
        </label>
        <Select
          value={parts.year === null ? "" : String(parts.year)}
          onValueChange={(v) => update({ year: Number(v) })}
        >
          <SelectTrigger
            id={`${id}-year`}
            aria-invalid={invalid && parts.year === null ? true : undefined}
            aria-required
            data-testid="upload-queue-period-year"
          >
            <SelectValue placeholder="Tahun" />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {String(y)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </fieldset>
  );
}

// ── Panel antrean ────────────────────────────────────────────────────────────────────────────────

const TONE_BADGE: Record<QueueTone, "neutral" | "primary" | "success" | "warning" | "destructive"> =
  {
    muted: "neutral",
    progress: "primary",
    warning: "warning",
    success: "success",
    error: "destructive",
  };

function toneIcon(it: QueueItemView) {
  switch (it.tone) {
    case "success":
      return <IconCircleCheck />;
    case "error":
      return <IconCircleX />;
    case "warning":
      return <IconChecklist />;
    case "progress":
      return <IconLoader2 />;
    default:
      return it.state === "CANCELLED" ? <IconCircleMinus /> : <IconClock />;
  }
}

/** Sidik status server yang mengubah bagian lain halaman (progres ingest, tinjauan, riwayat). */
const signature = (q: QueueView | null) =>
  q ? `${q.status}|${q.items.map((i) => `${i.state}:${i.versionStatus ?? ""}`).join(",")}` : "none";

type QueueResponse = { ok: boolean; queue: QueueView | null };

export function UploadQueuePanel({
  datasetId,
  initial,
  maxBytes,
}: {
  datasetId: string;
  initial: QueueView;
  maxBytes: number;
}) {
  const router = useRouter();
  const titleId = useId();
  const reattachRef = useRef<HTMLInputElement>(null);
  const [stopOpen, setStopOpen] = useState(false);
  const [busy, startBusy] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [reattachNote, setReattachNote] = useState<string | null>(null);
  const [skipping, setSkipping] = useState<string | null>(null);
  const { data } = usePolling<QueueResponse>({
    url: `/api/datasets/${datasetId}/upload-queue`,
    intervalMs: POLL_MS,
    initial: { ok: true, queue: initial },
    done: (d) => !d.queue || d.queue.id !== initial.id || d.queue.status !== "OPEN",
    // Ringkasan yang sudah selesai saat dirender tidak perlu render ulang halaman.
    onDone: () => {
      if (initial.status === "OPEN") router.refresh();
    },
    onStop: () => router.refresh(),
  });
  const q = data?.queue && data.queue.id === initial.id ? data.queue : initial;
  const up = useQueueUploads(q.id);
  const hydrated = useHydrated();
  const open = q.status === "OPEN";

  // Status server baru → pengunggah tab ini tahu file mana yang masih perlu dikirim, dan bagian lain
  // halaman (progres ingest, kartu tinjauan, riwayat versi) dirender ulang.
  const sig = signature(q);
  const lastSig = useRef(sig);
  useEffect(() => {
    queueUploader(q.id).sync(q.items);
    if (lastSig.current !== sig) {
      lastSig.current = sig;
      router.refresh();
    }
  }, [q, sig, router]);
  useEffect(() => {
    if (!open || q.stopped) queueUploader(q.id).stop();
    if (!open) forgetQueueUploader(q.id);
  }, [open, q.stopped, q.id]);

  // Peringatan menutup tab selama tab ini masih mengirim file.
  useEffect(() => {
    if (!up.running) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [up.running]);

  const settled = q.counts.done + q.counts.failed + q.counts.cancelled;
  const pct = q.total ? Math.round((settled / q.total) * 100) : 0;
  const current = q.position ? q.items.find((i) => i.seq === q.position) : undefined;
  const uploading = up.current ? q.items.find((i) => i.id === up.current!.itemId) : undefined;
  // File yang belum terunggah dan tidak ada di tab ini (muat ulang/tab lain): pilih ulang atau lewati.
  const missing =
    hydrated && open && !q.stopped
      ? q.items.filter(
          (i) =>
            (i.state === "WAITING" || i.state === "UPLOADING") &&
            !up.attached.has(i.id) &&
            !up.sent.has(i.id),
        )
      : [];

  const headline = !open
    ? queueSummaryText(q)
    : q.held
      ? `File ${fmt(q.position ?? 0)} dari ${fmt(q.total)} menunggu ${q.held.kind === "confirm" ? "tinjauan" : "pemetaan kolom"} Anda — antrean berhenti sampai diputuskan.`
      : q.stopped
        ? "Antrean dihentikan: file yang sedang diproses diselesaikan dulu."
        : current
          ? `File ${fmt(current.seq)} dari ${fmt(q.total)}: ${current.statusText.toLowerCase()}.`
          : `${fmt(q.total)} file`;

  const stop = () =>
    startBusy(async () => {
      setActionError(null);
      queueUploader(q.id).stop();
      const r = await stopUploadQueueAction(datasetId, q.id);
      setStopOpen(false);
      if (!r.ok) setActionError(r.message);
      router.refresh();
    });
  const dismiss = () =>
    startBusy(async () => {
      const r = await dismissUploadQueueAction(datasetId, q.id);
      if (!r.ok) setActionError(r.message);
      router.refresh();
    });
  const skip = async (it: QueueItemView) => {
    setSkipping(it.id);
    setActionError(null);
    try {
      await api(`/api/upload-queue/items/${it.id}/skip`, "POST", {});
      router.refresh();
    } catch (e) {
      setActionError(e instanceof UploadError ? e.message : "Gagal melewati file. Coba lagi.");
    } finally {
      setSkipping(null);
    }
  };
  const reattach = (list: FileList | null) => {
    // Salin dulu: mengosongkan input juga mengosongkan FileList yang sama.
    const files = list ? [...list] : [];
    if (reattachRef.current) reattachRef.current.value = "";
    if (!files.length) return;
    const u = queueUploader(q.id);
    const unmatched = u.attach(q.items, files);
    setReattachNote(
      unmatched.length
        ? `${unmatched.length === files.length ? "Tidak ada file" : `${fmt(unmatched.length)} file`} yang cocok dengan antrean ini (nama, ukuran, dan waktu ubah harus sama): ${unmatched.join(", ")}.`
        : null,
    );
    u.start(maxBytes);
  };

  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-md border p-3"
      data-testid="upload-queue"
      data-status={q.status}
    >
      <div className="flex items-start gap-3">
        <IconFiles
          size={20}
          stroke={1.5}
          aria-hidden
          className="mt-0.5 shrink-0 text-muted-foreground"
        />
        <div className="min-w-0 flex-1 text-sm">
          <h3 id={titleId} className="font-medium">
            Antrean unggah
          </h3>
          {/* Satu wilayah live: posisi/tahan/selesai diumumkan saat berubah, bukan tiap progres. */}
          <p
            role="status"
            aria-live="polite"
            className="text-muted-foreground"
            data-testid="upload-queue-position"
          >
            {headline}
          </p>
          {uploading && open ? (
            <p className="text-muted-foreground" data-testid="upload-queue-uploading">
              Mengunggah file {fmt(uploading.seq)} dari {fmt(q.total)} dari tab ini — biarkan tab
              terbuka sampai semua file terunggah; setelah itu antrean tetap berjalan walau tab
              ditutup.
            </p>
          ) : null}
        </div>
        <span className="text-sm font-medium tabular-nums" aria-hidden>
          {fmt(settled)}/{fmt(q.total)}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="File antrean selesai"
        aria-valuemin={0}
        aria-valuemax={q.total}
        aria-valuenow={settled}
        aria-valuetext={`${fmt(settled)} dari ${fmt(q.total)} file selesai`}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary motion-safe:transition-[width] motion-safe:duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      {open && q.held?.kind === "confirm" ? (
        <div
          className="flex flex-col gap-3 rounded-md border border-warning/50 bg-warning/15 p-3 text-sm md:flex-row md:items-center md:justify-between"
          data-testid="upload-queue-held"
        >
          <p className="flex min-w-0 items-start gap-2">
            <IconChecklist size={20} stroke={1.5} aria-hidden className="mt-px shrink-0" />
            <span className="[overflow-wrap:anywhere]">
              “{q.held.name}” menunggu konfirmasi: tinjau periode yang akan ditambah, diganti, atau
              dilepas. Antrean lanjut sendiri setelah Anda menerapkan atau membatalkannya.
            </span>
          </p>
          <Button
            asChild
            className="h-(--control-h-lg) w-full shrink-0 md:h-(--control-h) md:w-auto"
          >
            <Link href={`/datasets/${datasetId}/tinjau/${q.held.versionId}`}>
              <IconChecklist aria-hidden />
              Tinjau perubahan
            </Link>
          </Button>
        </div>
      ) : null}
      {open && q.held?.kind === "mapping" ? (
        <p className="flex items-start gap-2 text-sm" data-testid="upload-queue-held">
          <IconAlertTriangle size={20} stroke={1.5} aria-hidden className="mt-px shrink-0" />
          <span className="[overflow-wrap:anywhere]">
            “{q.held.name}” menunggu pemetaan kolom (lihat pemberitahuan di atas). Antrean lanjut
            sendiri setelah pemetaan diterapkan atau versinya dibuang.
          </span>
        </p>
      ) : null}

      {up.error ? (
        <FormAlert tone="error">
          <span className="block">
            Unggahan “{q.items.find((i) => i.id === up.error!.itemId)?.name ?? "file"}” terhenti:{" "}
            {up.error.message}
          </span>
          <Button
            size="sm"
            variant="outline"
            className={cn(control, "mt-2")}
            leadingIcon={<IconRefresh aria-hidden />}
            onClick={() => queueUploader(q.id).start(maxBytes)}
          >
            Coba lagi
          </Button>
        </FormAlert>
      ) : null}
      {actionError ? <FormAlert tone="error">{actionError}</FormAlert> : null}

      {missing.length ? (
        <div
          className="flex flex-col gap-2 rounded-md border bg-muted/40 p-3 text-sm"
          data-testid="upload-queue-missing"
        >
          <p>
            {fmt(missing.length)} file belum terunggah dan tidak tersedia di tab ini (halaman dimuat
            ulang atau ditutup). Pilih ulang file-file itu untuk melanjutkan, atau lewati file yang
            tidak ada lagi. File yang sudah terunggah tetap diproses.
          </p>
          {reattachNote ? <p className="text-muted-foreground">{reattachNote}</p> : null}
          <input
            ref={reattachRef}
            type="file"
            multiple
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="hidden"
            tabIndex={-1}
            aria-label="Pilih ulang file antrean"
            data-testid="upload-queue-reattach-input"
            onChange={(e) => reattach(e.target.files)}
          />
          <Button
            size="sm"
            variant="outline"
            className={cn(control, "sm:self-start")}
            leadingIcon={<IconUpload aria-hidden />}
            onClick={() => reattachRef.current?.click()}
          >
            Pilih ulang file
          </Button>
        </div>
      ) : null}

      <ol className="flex flex-col divide-y rounded-md border" data-testid="upload-queue-list">
        {q.items.map((it) => {
          const sending = up.current?.itemId === it.id && !TERMINAL_ITEM_STATES.has(it.state);
          const sendPct =
            sending && up.current!.total > 0
              ? Math.floor((up.current!.loaded / up.current!.total) * 100)
              : 0;
          const canSkip =
            open &&
            !q.stopped &&
            !sending &&
            (it.state === "WAITING" || it.state === "UPLOADING" || it.state === "QUEUED");
          return (
            <li
              key={it.id}
              className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center"
              data-testid="upload-queue-item"
              data-state={it.state}
              data-seq={it.seq}
              aria-current={open && it.seq === q.position ? "step" : undefined}
            >
              <div className="flex min-w-0 flex-1 items-start gap-2 text-sm">
                <span className="w-6 shrink-0 text-right tabular-nums text-muted-foreground">
                  {it.seq}.
                </span>
                <div className="min-w-0 flex-1">
                  <p className="[overflow-wrap:anywhere] font-medium">{it.name}</p>
                  <p className="text-muted-foreground">
                    {formatBytes(it.size)}
                    {it.label && q.grain ? ` · ${periodLabel(q.grain, it.label)}` : ""}
                  </p>
                  {sending ? (
                    <p
                      className="text-muted-foreground tabular-nums"
                      data-testid="upload-queue-sending"
                    >
                      {up.current!.phase === "checking"
                        ? "Memeriksa file…"
                        : up.current!.phase === "finishing"
                          ? "Memeriksa file di server…"
                          : `Mengunggah ${sendPct}%`}
                    </p>
                  ) : null}
                  {it.message ? (
                    <p
                      className={cn(
                        "[overflow-wrap:anywhere]",
                        it.state === "FAILED" ? "text-destructive" : "text-muted-foreground",
                      )}
                      data-testid="upload-queue-message"
                    >
                      {it.message}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <Badge
                  tone={TONE_BADGE[sending ? "progress" : it.tone]}
                  icon={sending ? <IconUpload /> : toneIcon(it)}
                >
                  <span data-testid="upload-queue-status">
                    {sending ? "Sedang diunggah" : it.statusText}
                  </span>
                </Badge>
                {canSkip ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-11 sm:h-(--control-h-sm)"
                    pending={skipping === it.id}
                    aria-label={`Lewati “${it.name}”`}
                    leadingIcon={<IconPlayerSkipForward aria-hidden />}
                    onClick={() => void skip(it)}
                  >
                    <span aria-hidden>Lewati</span>
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        {open && !q.stopped ? (
          <Button
            size="sm"
            variant="ghost"
            className={control}
            leadingIcon={<IconPlayerStop aria-hidden />}
            data-testid="upload-queue-stop"
            onClick={() => setStopOpen(true)}
          >
            Hentikan antrean
          </Button>
        ) : null}
        {!open ? (
          <Button
            size="sm"
            variant="outline"
            className={control}
            pending={busy}
            leadingIcon={<IconX aria-hidden />}
            data-testid="upload-queue-dismiss"
            onClick={dismiss}
          >
            Tutup ringkasan
          </Button>
        ) : null}
      </div>

      <ConfirmDialog
        open={stopOpen}
        onOpenChange={(o) => {
          if (!busy) setStopOpen(o);
        }}
        title="Hentikan antrean?"
        busy={busy}
        data-testid="upload-queue-stop-confirm"
        description={`${fmt(q.counts.remaining)} file yang belum selesai dibatalkan dan tidak diproses. File yang sedang diproses atau ditinjau tetap diselesaikan; periode yang sudah diterapkan tidak berubah.`}
        action={
          <Button
            variant="destructive"
            className={DIALOG_CTA}
            pending={busy}
            leadingIcon={<IconPlayerStop aria-hidden />}
            data-testid="upload-queue-stop-go"
            onClick={stop}
          >
            Hentikan antrean
          </Button>
        }
      />
    </section>
  );
}
