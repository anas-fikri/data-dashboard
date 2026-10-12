"use client";

import {
  IconFileSpreadsheet,
  IconLoader2,
  IconPlayerPause,
  IconPlayerPlay,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { FocusNotice } from "@/components/ui/focus-notice";
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
  partCount: number;
  uploadedCount: number;
}

interface UploadPanelProps {
  datasetId: string;
  maxBytes: number;
  /** Dataset sudah punya data aktif → teks "ganti data". */
  hasData: boolean;
  /** Unggahan milik user yang belum selesai (dari server), untuk ajakan melanjutkan. */
  pending: PendingUploadInfo | null;
  /** Versi terbaru menunggu/sedang diproses → unggah baru ditahan (D4: satu versi non-terminal). */
  processing: { fileName: string | null } | null;
}

type State =
  | { kind: "idle" }
  | { kind: "running"; file: File; progress: UploadProgress }
  | { kind: "paused"; file: File; progress: UploadProgress }
  | { kind: "error"; file: File | null; message: string; retryable: boolean; versionId?: string }
  | { kind: "done"; name: string };

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
      setState({ kind: "idle" });
      setAnnounce("Unggahan dibatalkan.");
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
  const idleLike = state.kind === "idle" || state.kind === "error" || state.kind === "done";
  const showDropzone = idleLike && !processing;

  return (
    <div className="flex flex-col gap-4">
      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>

      {state.kind === "done" ? <FocusNotice>{`"${state.name}" terunggah.`}</FocusNotice> : null}

      {processing && idleLike ? (
        <p
          className="flex items-start gap-3 rounded-md border bg-muted/40 p-3 text-sm"
          data-testid="dataset-processing"
        >
          <IconLoader2
            size={20}
            stroke={1.5}
            aria-hidden
            className="mt-0.5 shrink-0 text-primary motion-safe:animate-spin"
          />
          <span>
            <span className="block font-medium">
              {processing.fileName
                ? `"${processing.fileName}" sedang diproses`
                : "File sedang diproses"}
            </span>
            <span className="block text-muted-foreground">
              Anda boleh menutup halaman ini. File baru bisa diunggah setelah proses selesai.
            </span>
          </span>
        </p>
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

      {pendingInfo && state.kind !== "running" && state.kind !== "paused" ? (
        <div
          className="flex flex-col gap-3 rounded-md border bg-muted/40 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
          data-testid="upload-pending"
        >
          <p className="min-w-0">
            <span className="block font-medium">Unggahan belum selesai</span>
            <span className="block truncate text-muted-foreground">
              {pendingInfo.originalName} ·{" "}
              {Math.floor((pendingInfo.uploadedCount / pendingInfo.partCount) * 100)}% terunggah.
              Pilih file yang sama untuk melanjutkan.
            </span>
          </p>
          <Button
            size="sm"
            variant="outline"
            className="w-full sm:w-auto"
            pending={cancelling}
            leadingIcon={<IconX aria-hidden />}
            onClick={() => void cancel(pendingInfo.versionId)}
          >
            Batalkan unggahan
          </Button>
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
                className="w-full sm:w-auto"
                disabled={progress.phase !== "uploading"}
                leadingIcon={<IconPlayerPause aria-hidden />}
                onClick={pause}
              >
                Jeda
              </Button>
            ) : (
              <Button
                size="sm"
                className="w-full sm:w-auto"
                leadingIcon={<IconPlayerPlay aria-hidden />}
                onClick={() => void start(state.file)}
              >
                Lanjutkan
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="w-full sm:w-auto"
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
              Seret file .xlsx atau .csv ke sini, maksimal {formatBytes(maxBytes)}. Unggahan bisa
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
          <Button
            type="button"
            className="w-full sm:w-auto"
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
