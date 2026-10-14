"use client";

import {
  IconFileSpreadsheet,
  IconPlayerPause,
  IconPlayerPlay,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { IngestProgress } from "@/components/datasets/ingest-progress";
import { VersionMappingNotice } from "@/components/datasets/version-history-mapping";
import { Button } from "@/components/ui/button";
import { FocusNotice } from "@/components/ui/focus-notice";
import type { IngestStatus } from "@/features/schema/service";
import {
  UploadError,
  cancelUploadRequest,
  formatBytes,
  uploadFile,
  type UploadProgress,
} from "@/features/uploads/client";
import { cn } from "@/lib/utils";

export interface PendingUploadInfo {
  versionId: string;
  originalName: string;
  sizeBytes: number;
  uploadedBytes: number;
}

interface UploadPanelProps {
  datasetId: string;
  maxBytes: number;
  /** Dataset sudah punya data aktif → teks "ganti data". */
  hasData: boolean;
  /** Unggahan milik user yang belum selesai (dari server), untuk ajakan melanjutkan. */
  pending: PendingUploadInfo | null;
  /** Versi terbaru sedang diproses (progres hidup) atau menunggu pemetaan kolom; unggah baru ditahan (D4). */
  processing:
    | { kind: "ingest"; status: IngestStatus }
    | { kind: "mapping"; versionId: string | null; fileName: string | null; message: string | null }
    | null;
}

type State =
  | { kind: "idle" }
  | { kind: "cancelled" }
  | { kind: "running"; file: File; progress: UploadProgress }
  | { kind: "paused"; file: File; progress: UploadProgress }
  | { kind: "error"; file: File | null; message: string; retryable: boolean; versionId?: string }
  | { kind: "done"; name: string }
  | { kind: "discarded"; name: string };

const RETRYABLE = new Set(["NETWORK", "STORAGE_ERROR", "BUSY", "RATE_LIMITED", "UNAUTHENTICATED"]);

function percentOf(p: UploadProgress): number {
  return p.total > 0 ? Math.floor((p.loaded / p.total) * 100) : 0;
}

/** Sisa waktu kasar dari laju rata-rata sejak mulai (hanya setelah ada cukup data). */
function etaText(
  started: { t: number; loaded: number },
  p: UploadProgress,
  now: number,
): string | null {
  const elapsed = (now - started.t) / 1000;
  const sent = p.loaded - started.loaded;
  if (elapsed < 3 || sent <= 0) return null;
  const sec = (p.total - p.loaded) / (sent / elapsed);
  if (sec < 60) return "kurang dari 1 menit lagi";
  return `sekitar ${Math.round(sec / 60).toLocaleString("id-ID")} menit lagi`;
}

export function UploadPanel({
  datasetId,
  maxBytes,
  hasData,
  pending,
  processing,
}: UploadPanelProps) {
  const router = useRouter();
  const inputId = useId();
  const hintId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<State>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [pendingInfo, setPendingInfo] = useState(pending);
  const [announce, setAnnounce] = useState("");
  const lastAnnounced = useRef(-1);

  const running = state.kind === "running";
  const progress = state.kind === "running" || state.kind === "paused" ? state.progress : null;
  const [eta, setEta] = useState<string | null>(null);

  // Peringatan saat menutup tab di tengah unggahan (unggahan tetap bisa dilanjutkan nanti).
  useEffect(() => {
    if (!running) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [running]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (state.kind === "error") errorRef.current?.focus();
  }, [state.kind]);

  const start = useCallback(
    async (file: File) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      lastAnnounced.current = -1;
      let started: { t: number; loaded: number } | null = null;
      // Versi UPLOADING sudah ada di server begitu progres membawa versionId → refresh sekali agar
      // halaman (badge, "Aktifkan" di riwayat versi) tahu dataset sibuk. State panel ini tetap.
      let refreshed = false;
      setEta(null);
      setState({
        kind: "running",
        file,
        progress: { phase: "checking", loaded: 0, total: file.size, resumed: false },
      });
      try {
        await uploadFile({
          file,
          datasetId,
          maxBytes,
          signal: controller.signal,
          onProgress: (p) => {
            if (controller.signal.aborted) return;
            setState({ kind: "running", file, progress: p });
            if (p.versionId && !refreshed) {
              refreshed = true;
              router.refresh();
            }
            if (p.phase === "uploading") {
              const now = performance.now();
              started ??= { t: now, loaded: p.loaded };
              setEta(etaText(started, p, now));
            }
            // Umumkan ke pembaca layar per 25% (bukan setiap event).
            const step = Math.floor(percentOf(p) / 25) * 25;
            if (p.phase === "uploading" && step !== lastAnnounced.current) {
              lastAnnounced.current = step;
              setAnnounce(
                p.resumed && step === 0 ? "Melanjutkan unggahan." : `Terunggah ${step} persen.`,
              );
            }
            if (p.phase === "finishing") setAnnounce("Memeriksa file di server.");
          },
        });
        setPendingInfo(null);
        setState({ kind: "done", name: file.name });
        router.refresh();
      } catch (e) {
        if (controller.signal.aborted) return; // jeda/batal ditangani pemanggil
        const err =
          e instanceof UploadError
            ? e
            : new UploadError("NETWORK", "Terjadi gangguan. Coba lagi beberapa saat lagi.");
        setState({
          kind: "error",
          file,
          message: err.message,
          retryable: RETRYABLE.has(err.code),
          versionId: err.versionId,
        });
        // Unggahan gagal permanen di server (rusak/format) → perbarui badge status di halaman.
        if (["INVALID_FORMAT", "UPLOAD_CORRUPT", "UPLOAD_FAILED"].includes(err.code)) {
          setPendingInfo(null);
          router.refresh();
        }
      }
    },
    [datasetId, maxBytes, router],
  );

  const onFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) void start(file);
    if (inputRef.current) inputRef.current.value = "";
  };

  const pause = () => {
    if (state.kind !== "running") return;
    abortRef.current?.abort();
    setState({ kind: "paused", file: state.file, progress: state.progress });
    setAnnounce("Unggahan dijeda.");
  };

  const cancel = async (versionId: string | undefined) => {
    abortRef.current?.abort();
    setCancelling(true);
    try {
      if (versionId) await cancelUploadRequest(versionId);
      setPendingInfo(null);
      // Notice yang menerima fokus (tombol yang ditekan hilang setelah batal).
      setState({ kind: "cancelled" });
      router.refresh();
    } catch (e) {
      setState({
        kind: "error",
        file: null,
        message: e instanceof UploadError ? e.message : "Unggahan gagal dibatalkan. Coba lagi.",
        retryable: false,
      });
    } finally {
      setCancelling(false);
    }
  };

  const busyVersionId =
    progress?.versionId ?? (state.kind === "error" ? state.versionId : undefined);
  const pct = progress ? percentOf(progress) : 0;
  const idleLike =
    state.kind === "idle" ||
    state.kind === "cancelled" ||
    state.kind === "error" ||
    state.kind === "done" ||
    state.kind === "discarded";
  const showDropzone = idleLike && !processing;
  const showPending = Boolean(pendingInfo) && idleLike;
  // Kontrol unggahan: tinggi 44px di ponsel (target sentuh), ringkas di ≥640.
  const control = "h-11 w-full sm:h-(--control-h-sm) sm:w-auto";

  return (
    <div className="flex flex-col gap-4">
      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>

      {state.kind === "done" ? <FocusNotice>{`"${state.name}" terunggah.`}</FocusNotice> : null}
      {state.kind === "cancelled" ? <FocusNotice>Unggahan dibatalkan.</FocusNotice> : null}
      {state.kind === "discarded" ? (
        <div data-testid="version-discard-result">
          <FocusNotice>
            <span className="[overflow-wrap:anywhere]">
              Versi “{state.name}” dibuang. Data aktif tetap dipakai; unggah file yang sudah
              diperbaiki.
            </span>
          </FocusNotice>
        </div>
      ) : null}

      {processing?.kind === "ingest" && idleLike ? (
        <IngestProgress datasetId={datasetId} initial={processing.status} />
      ) : null}
      {processing?.kind === "mapping" && idleLike ? (
        <VersionMappingNotice
          datasetId={datasetId}
          versionId={processing.versionId}
          fileName={processing.fileName}
          message={processing.message}
          onDiscarded={(name) => setState({ kind: "discarded", name })}
        />
      ) : null}

      {state.kind === "error" ? (
        <FormAlert tone="error" ref={errorRef}>
          <span className="block">{state.message}</span>
          {state.retryable && state.file ? (
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => state.file && void start(state.file)}
            >
              Coba lagi
            </Button>
          ) : null}
        </FormAlert>
      ) : null}

      {showPending && pendingInfo ? (
        <div
          className="flex flex-col gap-3 rounded-md border bg-muted/40 p-3 text-sm"
          data-testid="upload-pending"
        >
          <p className="min-w-0">
            <span className="block font-medium">Unggahan belum selesai</span>
            <span className="flex min-w-0 gap-1 text-muted-foreground">
              <span className="truncate">{pendingInfo.originalName}</span>
              <span className="shrink-0 tabular-nums">
                · {Math.floor((pendingInfo.uploadedBytes / pendingInfo.sizeBytes) * 100)}% terunggah
              </span>
            </span>
            <span className="mt-1 block text-muted-foreground">
              Pilih file yang sama untuk melanjutkan dari bagian terakhir.
            </span>
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              size="sm"
              className={control}
              leadingIcon={<IconPlayerPlay aria-hidden />}
              onClick={() => inputRef.current?.click()}
            >
              Lanjutkan unggahan
            </Button>
            <Button
              size="sm"
              variant="outline"
              className={control}
              pending={cancelling}
              leadingIcon={<IconX aria-hidden />}
              onClick={() => void cancel(pendingInfo.versionId)}
            >
              Batalkan unggahan
            </Button>
          </div>
        </div>
      ) : null}

      {progress && (state.kind === "running" || state.kind === "paused") ? (
        <div className="flex flex-col gap-3 rounded-md border p-3" data-testid="upload-progress">
          <div className="flex items-start gap-3">
            <IconFileSpreadsheet
              size={20}
              stroke={1.5}
              aria-hidden
              className="mt-0.5 shrink-0 text-muted-foreground"
            />
            <p className="min-w-0 flex-1 text-sm">
              <span className="block truncate font-medium">{state.file.name}</span>
              <span className="block text-muted-foreground">
                {state.kind === "paused"
                  ? `Dijeda di ${pct}%. Lanjutkan kapan saja.`
                  : progress.phase === "checking"
                    ? "Memeriksa file…"
                    : progress.phase === "finishing"
                      ? "Memeriksa file di server…"
                      : `${formatBytes(progress.loaded)} dari ${formatBytes(progress.total)}${
                          eta ? ` · ${eta}` : ""
                        }${progress.resumed ? " · dilanjutkan" : ""}`}
              </span>
            </p>
            <span className="text-sm font-medium tabular-nums" aria-hidden>
              {pct}%
            </span>
          </div>
          <div
            role="progressbar"
            aria-label={`Unggahan ${state.file.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-valuetext={`${pct}%`}
            className="h-2 overflow-hidden rounded-full bg-muted"
          >
            <div
              className={cn(
                "h-full rounded-full bg-primary motion-safe:transition-[width] motion-safe:duration-300",
                progress.phase === "finishing" && "motion-safe:animate-pulse",
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {state.kind === "running" ? (
              <Button
                size="sm"
                variant="outline"
                className={control}
                disabled={progress.phase !== "uploading"}
                leadingIcon={<IconPlayerPause aria-hidden />}
                onClick={pause}
              >
                Jeda
              </Button>
            ) : (
              <Button
                size="sm"
                className={control}
                leadingIcon={<IconPlayerPlay aria-hidden />}
                onClick={() => void start(state.file)}
              >
                Lanjutkan
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className={control}
              pending={cancelling}
              disabled={progress.phase === "finishing"}
              leadingIcon={<IconX aria-hidden />}
              onClick={() => void cancel(busyVersionId)}
            >
              Batalkan
            </Button>
          </div>
        </div>
      ) : null}

      {showDropzone ? (
        <div
          data-testid="upload-dropzone"
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            onFiles(e.dataTransfer.files);
          }}
          className={cn(
            "flex flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-8 text-center transition-colors",
            dragging ? "border-primary bg-primary/5" : "border-input",
          )}
        >
          <span
            aria-hidden
            className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
          >
            <IconUpload size={24} stroke={1.5} />
          </span>
          <div className="max-w-sm text-sm">
            <p className="font-medium">
              {hasData ? "Ganti data dengan file baru" : "Belum ada data"}
            </p>
            <p id={hintId} className="mt-1 text-muted-foreground">
              Pilih atau seret file .xlsx/.csv (maks. {formatBytes(maxBytes)}). Unggahan bisa
              dilanjutkan bila koneksi terputus.
            </p>
          </div>
          {/* Input asli tersembunyi; tombol nyata memicunya (fokus keyboard + label jelas). */}
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="hidden"
            tabIndex={-1}
            aria-label="Pilih file data"
            data-testid="upload-input"
            onChange={(e) => onFiles(e.target.files)}
          />
          {/* Saat ada unggahan tertunda, CTA primer satu-satunya = "Lanjutkan unggahan". */}
          <Button
            type="button"
            variant={showPending ? "outline" : "primary"}
            className="h-11 w-full sm:h-(--control-h) sm:w-auto"
            aria-describedby={hintId}
            leadingIcon={<IconUpload aria-hidden />}
            onClick={() => inputRef.current?.click()}
          >
            Pilih file
          </Button>
        </div>
      ) : null}
    </div>
  );
}
