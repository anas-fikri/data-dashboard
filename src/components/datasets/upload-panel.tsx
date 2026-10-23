"use client";

import {
  IconCalendarStats,
  IconChecklist,
  IconFileSpreadsheet,
  IconPlayerPause,
  IconPlayerPlay,
  IconRefresh,
  IconReplace,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { usePublishUploading } from "@/components/datasets/dataset-activity";
import { IngestProgress } from "@/components/datasets/ingest-progress";
import { PeriodCapacityNotice, UploadEstimateNotice } from "@/components/datasets/period-usage";
import {
  REPLACE_CHOICE,
  RETRYABLE,
  cancelFailedState,
  actionForFile,
  periodRequest,
  replaceAllText,
  holdsActivation,
  isIdleLike,
  ownVersionAfterError,
  showsPendingCard,
  versionGone,
  type UploadChoice,
  type UploadPanelState,
} from "@/components/datasets/upload-panel-state";
import { UploadPeriodPicker } from "@/components/datasets/upload-period-picker";
import { UploadSheetPicker } from "@/components/datasets/upload-sheet-picker";
import { UploadQueueDraft, UploadQueuePanel } from "@/components/datasets/upload-queue";
import { queueUploader } from "@/components/datasets/upload-queue-store";
import { VersionMappingNotice } from "@/components/datasets/version-history-mapping";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, DIALOG_CTA } from "@/components/ui/confirm-dialog";
import { FocusNotice } from "@/components/ui/focus-notice";
import { periodLabel } from "@/features/ingest/period";
import type { UploadEstimate } from "@/features/ingest/period-capacity";
import type { IngestStatus } from "@/features/schema/service";
import type { MappingLast } from "@/features/versions/types";
import {
  UploadError,
  cancelUploadRequest,
  formatBytes,
  uploadFile,
  type UploadProgress,
} from "@/features/uploads/client";
import { guessPeriodFromName } from "@/features/uploads/period-label";
import { needsPicker, selectionToSend } from "@/features/uploads/sheet-selection";
import { readXlsxSheets, type XlsxSheetInfo } from "@/features/uploads/xlsx-sheets";
import type { QueueView } from "@/features/uploads/queue-plan";
import type { PeriodUploadContext } from "@/features/versions/period-upload";
import { cn } from "@/lib/utils";

export interface PendingUploadInfo {
  versionId: string;
  originalName: string;
  sizeBytes: number;
  uploadedBytes: number;
  /** Pilihan saat unggahan dimulai: melanjutkan hanya dengan mode + label yang sama (T-053). */
  mode: "REPLACE" | "PERIOD";
  label: string | null;
  /** Sheet pilihan unggahan tertunda (T-85tb); melanjutkan memakai pilihan yang sama. */
  sheets?: string[];
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
    | {
        kind: "mapping";
        versionId: string | null;
        fileName: string | null;
        message: string | null;
        /** Job pemetaan yang sedang antre/diterapkan (T-014), atau null. */
        mappingJobId: string | null;
        /** Hasil terakhir job pemetaan yang tidak selesai (gagal/perlu diperiksa), atau null. */
        mappingLast: MappingLast | null;
      }
    /** Unggahan periode menunggu keputusan pemilik di layar tinjauan (T-054). */
    | { kind: "confirm"; versionId: string; fileName: string | null }
    | null;
  /**
   * Dataset per periode (T-053): dropzone utama menambah/memperbarui periode terhadap versi aktif,
   * "Ganti semua data…" menjadi tautan sekunder. null = panel biasa.
   */
  period?: PeriodUploadContext | null;
  /** Dataset biasa yang sudah berisi data: tautan "Atur periode" (T-051); null = tanpa tautan. */
  setupHref?: string | null;
  /**
   * "Unggah ulang" dari kartu Periode (T-056): periode yang diisikan ke pemilih periode (sheet
   * berlabel) untuk file berikutnya; null = tanpa.
   */
  reupload?: { start: string; label: string } | null;
  /**
   * Antrean unggah banyak file (T-059): yang sedang berjalan (dropzone ditahan) atau ringkasan antrean
   * terakhir yang belum ditutup; null = tanpa antrean.
   */
  queue?: QueueView | null;
  /** Nama sheet data aktif (T-85tb): sheet yang cocok dicentang bawaan di pemilih sheet. */
  activeSheets?: string[];
}

/** Keterangan pilihan unggahan di kartu progres/tertunda dataset periode. */
function choiceText(
  choice: UploadChoice | undefined,
  period: PeriodUploadContext | null,
): string | null {
  if (!period || !choice) return null;
  if (choice.mode === "REPLACE") return "Mengganti semua data";
  return choice.label
    ? `Periode ${periodLabel(period.grain, choice.label)}`
    : "Tambah atau perbarui periode";
}

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
  period = null,
  setupHref = null,
  reupload = null,
  queue = null,
  activeSheets = [],
}: UploadPanelProps) {
  const router = useRouter();
  const inputId = useId();
  const hintId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const replaceLinkRef = useRef<HTMLButtonElement>(null);
  // File yang menunggu periode dipilih (sheet berlabel); belum ada yang dikirim ke server.
  const [picking, setPicking] = useState<{ file: File; guess: string | null } | null>(null);
  /**
   * Dialog "Ganti semua data…": "pick" = dari tautan (lanjut membuka pemilih file); { file } = file sama
   * dengan unggahan "ganti semua" tertunda yang dipilih di dropzone periode (review M2).
   */
  const [confirmReplace, setConfirmReplace] = useState<false | "pick" | { file: File }>(false);
  // Banyak file terpilih di dataset periode (T-059): draf antrean, belum ada yang dikirim ke server.
  const [draft, setDraft] = useState<File[] | null>(null);
  // File xlsx yang menunggu sheet dipilih (T-85tb); belum ada yang dikirim ke server.
  const [sheetPick, setSheetPick] = useState<{ file: File; sheets: XlsxSheetInfo[] } | null>(null);
  // Pembacaan daftar sheet terakhir: file lain yang dipilih sesudahnya membatalkan hasil yang lama.
  const sheetRead = useRef(0);
  const queueOpen = queue?.status === "OPEN";
  const pickButtonRef = useRef<HTMLButtonElement>(null);
  // Batal di pemilih periode/draf antrean → fokus kembali ke "Pilih file" setelah dropzone tampil lagi
  // (review L1).
  const refocusPick = useRef(false);
  useEffect(() => {
    if (picking || draft || sheetPick || !refocusPick.current) return;
    refocusPick.current = false;
    pickButtonRef.current?.focus();
  }, [picking, draft, sheetPick]);
  const abortRef = useRef<AbortController | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<UploadPanelState>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [pendingInfo, setPendingInfo] = useState(pending);
  // Versi server yang dimulai/dilanjutkan tab ini dan mungkin masih UPLOADING (upload-panel-state).
  const [ownVersion, setOwnVersion] = useState<string | undefined>();
  const [announce, setAnnounce] = useState("");
  // Perkiraan batas periode dari ukuran file (T-055): dari init, tampil selama unggahan dan sesudahnya.
  const [estimate, setEstimate] = useState<UploadEstimate | null>(null);
  // "Unggah ulang <periode>" berlaku untuk file pertama yang dipilih setelahnya (T-056); periode lain
  // dari tautan lain = ajakan baru (reset saat prop berubah, tanpa efek).
  const [reuploadUsed, setReuploadUsed] = useState(false);
  const [seenReupload, setSeenReupload] = useState(reupload?.start ?? null);
  if (seenReupload !== (reupload?.start ?? null)) {
    setSeenReupload(reupload?.start ?? null);
    setReuploadUsed(false);
  }
  const reuploadOpen = period && reupload && !reuploadUsed ? reupload : null;
  const lastAnnounced = useRef(-1);

  const running = state.kind === "running";
  const progress = state.kind === "running" || state.kind === "paused" ? state.progress : null;
  const [eta, setEta] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();
  // Versi UPLOADING sudah ada di server → riwayat versi di tab ini menahan "Aktifkan" (tanpa refresh
  // di tengah unggahan; badge dan alert gagal di atas panel tetap sampai unggahan selesai/batal).
  // Galat yang masih memegang versi milik tab ini (gagal sementara, file lain → DATASET_BUSY, batal
  // gagal) tetap menahan; setelah selesai ditahan sampai refresh membawa status server (tanpa kedip).
  usePublishUploading(holdsActivation(state, ownVersion, refreshing));

  // Peringatan saat menutup tab di tengah unggahan (unggahan tetap bisa dilanjutkan nanti).
  useEffect(() => {
    if (!running) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [running]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Tiap galat baru (termasuk galat → galat, mis. batal gagal) memindahkan fokus ke alert.
  useEffect(() => {
    if (state.kind === "error") errorRef.current?.focus();
  }, [state]);

  /**
   * `versionId`: versi yang dilanjutkan (jeda/galat/pilih ulang file); server memakai versi yang sama
   * untuk file yang sama, dan selama pra-cek/init versi itu tetap dianggap ditransfer (tanpa kedip).
   */
  const start = useCallback(
    async (file: File, versionId: string | undefined, choice: UploadChoice) => {
      // Pilihan periode tanpa konteks periode (data aktif berganti): jangan pernah diturunkan menjadi
      // ganti semua data — tidak ada yang dikirim; pemilik memuat ulang lalu memilih lagi (review M1).
      const req = periodRequest(choice, period);
      if (!req.ok) {
        setPicking(null);
        setState({ kind: "error", file, message: req.message, retryable: false, stale: true });
        return;
      }
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      lastAnnounced.current = -1;
      let started: { t: number; loaded: number } | null = null;
      setEta(null);
      setPicking(null);
      setSheetPick(null);
      // File baru → perkiraan lama tidak berlaku; melanjutkan versi yang sama mempertahankannya.
      if (!versionId) setEstimate(null);
      setState({
        kind: "running",
        file,
        choice,
        progress: { phase: "checking", loaded: 0, total: file.size, resumed: false, versionId },
      });
      try {
        await uploadFile({
          file,
          datasetId,
          maxBytes,
          signal: controller.signal,
          ...(req.period ? { period: req.period } : {}),
          ...(req.sheets ? { sheets: req.sheets } : {}),
          onEstimate: (e) => {
            if (!controller.signal.aborted && e) setEstimate(e);
          },
          onProgress: (p) => {
            if (controller.signal.aborted) return;
            // Tanda tangan part bisa gagal tanpa membawa versionId: versi diingat sejak diketahui.
            if (p.versionId) setOwnVersion(p.versionId);
            // Pra-cek saat melanjutkan belum membawa versionId: versi lama tetap dianggap ditransfer
            // (tanpa kedip "Aktifkan") dan "Batalkan" tetap membatalkannya di server.
            setState({
              kind: "running",
              file,
              choice,
              progress: { ...p, versionId: p.versionId ?? versionId },
            });
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
        setOwnVersion(undefined);
        setState({ kind: "done", name: file.name });
        startRefresh(() => router.refresh());
      } catch (e) {
        if (controller.signal.aborted) return; // jeda/batal ditangani pemanggil
        // Part lain masih berjalan: hentikan, agar progres yang terlambat tidak menimpa galat ini.
        controller.abort();
        const err =
          e instanceof UploadError
            ? e
            : new UploadError("NETWORK", "Terjadi gangguan. Coba lagi beberapa saat lagi.");
        setState({
          kind: "error",
          file,
          message: err.message,
          retryable: RETRYABLE.has(err.code),
          choice,
          stale: err.code === "STALE",
        });
        setOwnVersion((cur) => ownVersionAfterError(err, cur));
        // Versi hilang/gagal permanen di server (rusak/format) → perbarui badge status di halaman.
        if (versionGone(err)) {
          setPendingInfo(null);
          router.refresh();
        }
      }
    },
    [datasetId, maxBytes, router, period],
  );

  /**
   * Ganti semua data (T-85tb): file sama dengan unggahan tertunda melanjutkan pilihan sheet-nya; xlsx
   * dengan ≥ 2 worksheet → pemilih sheet dulu; selain itu (CSV, satu sheet, tidak terbaca) langsung.
   */
  const startReplace = (file: File) => {
    const p = pendingInfo;
    const seq = ++sheetRead.current;
    if (p?.mode === "REPLACE" && p.originalName === file.name && p.sizeBytes === file.size) {
      void start(
        file,
        ownVersion,
        p.sheets?.length ? { mode: "REPLACE", sheets: p.sheets } : REPLACE_CHOICE,
      );
      return;
    }
    if (!/\.xlsx$/i.test(file.name)) {
      void start(file, ownVersion, REPLACE_CHOICE);
      return;
    }
    void readXlsxSheets(file).then((list) => {
      if (seq !== sheetRead.current) return;
      if (list && needsPicker(list)) {
        setState({ kind: "idle" });
        setPicking(null);
        setSheetPick({ file, sheets: list });
      } else void start(file, ownVersion, REPLACE_CHOICE);
    });
  };

  const onFiles = (files: FileList | null) => {
    const file = files?.[0];
    const all = files ? [...files] : [];
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;
    // Banyak file → antrean (hanya dataset periode; dataset biasa tetap satu file = ganti data).
    if (period && all.length > 1) {
      setReuploadUsed(true);
      if (pendingInfo) {
        setState({
          kind: "error",
          file: null,
          retryable: false,
          message:
            "Masih ada unggahan yang belum selesai. Lanjutkan atau batalkan unggahan itu dulu, lalu pilih beberapa file.",
        });
        return;
      }
      setState({ kind: "idle" });
      setPicking(null);
      setDraft(all);
      return;
    }
    const action = actionForFile(file, { period, pending: pendingInfo });
    const target = reuploadOpen;
    setReuploadUsed(true);
    // Sheet berlabel: periode dipilih dulu (terisi dari "Unggah ulang", atau dari nama file bila
    // jelas), baru diunggah.
    if (action.kind === "pick" && period) {
      setState({ kind: "idle" });
      setPicking({ file, guess: target?.start ?? guessPeriodFromName(file.name, period.grain) });
      return;
    }
    if (action.kind === "confirm-replace") {
      setConfirmReplace({ file });
      return;
    }
    // Versi milik tab ini ikut dibawa: file yang sama melanjutkannya; file lain → DATASET_BUSY dan
    // galat tetap menawarkan "Batalkan unggahan" untuk versi itu.
    if (action.kind === "start" && action.choice.mode === "PERIOD") {
      void start(file, ownVersion, action.choice);
      return;
    }
    startReplace(file);
  };

  /** "Ganti semua data…" (dataset periode): file dari input terpisah, selalu REPLACE. */
  const onReplaceFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (replaceRef.current) replaceRef.current.value = "";
    if (file) startReplace(file);
  };

  const pause = () => {
    if (state.kind !== "running") return;
    abortRef.current?.abort();
    setState({
      kind: "paused",
      file: state.file,
      progress: state.progress,
      ...(state.choice ? { choice: state.choice } : {}),
    });
    setAnnounce("Unggahan dijeda.");
  };

  const cancel = async (versionId: string | undefined) => {
    abortRef.current?.abort();
    // Penanda panggilan ini: start() yang lebih baru menggantinya → hasil batal terlambat diabaikan.
    const mine = new AbortController();
    abortRef.current = mine;
    setCancelling(true);
    try {
      if (versionId) await cancelUploadRequest(versionId);
      if (abortRef.current !== mine) return;
      setPendingInfo(null);
      setOwnVersion(undefined);
      setEstimate(null);
      // Notice yang menerima fokus (tombol yang ditekan hilang setelah batal).
      setState({ kind: "cancelled" });
      router.refresh();
    } catch (e) {
      if (abortRef.current !== mine) return;
      const err = e instanceof UploadError ? e : null;
      // Versi sudah tidak ada → tidak ditahan/ditawarkan lagi; selain itu konteks galat tetap.
      if (err?.code === "NOT_FOUND") {
        setOwnVersion(undefined);
        setPendingInfo((p) => (p?.versionId === versionId ? null : p));
        router.refresh();
      }
      setState((prev) => cancelFailedState(prev, err));
    } finally {
      setCancelling(false);
    }
  };

  const pct = progress ? percentOf(progress) : 0;
  const idleLike = isIdleLike(state);
  const showDropzone = idleLike && !processing && !picking && !sheetPick && !draft && !queueOpen;
  const showPending = showsPendingCard(state, pendingInfo?.versionId, ownVersion);
  const pendingText = pendingInfo
    ? choiceText(
        pendingInfo.mode === "PERIOD"
          ? { mode: "PERIOD", label: pendingInfo.label }
          : REPLACE_CHOICE,
        period,
      )
    : null;
  // Kontrol unggahan: tinggi 44px di ponsel (target sentuh), ringkas di ≥640.
  const control = "h-11 w-full sm:h-(--control-h-sm) sm:w-auto";

  return (
    <div className="flex flex-col gap-4">
      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>

      {state.kind === "done" ? <FocusNotice>{`"${state.name}" terunggah.`}</FocusNotice> : null}
      {/* Wilayah live selalu ada: perkiraan init diumumkan sopan saat muncul (review T-055 #4). */}
      <div role="status" aria-live="polite" aria-atomic="true">
        {state.kind === "done" ||
        ((state.kind === "running" || state.kind === "paused") &&
          state.choice?.mode === "PERIOD") ? (
          <UploadEstimateNotice estimate={estimate} />
        ) : null}
      </div>
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
          mappingJobId={processing.mappingJobId}
          last={processing.mappingLast}
          onDiscarded={(name) => setState({ kind: "discarded", name })}
        />
      ) : null}
      {processing?.kind === "confirm" &&
      idleLike &&
      !(queueOpen && queue?.held?.versionId === processing.versionId) ? (
        <div
          className="flex flex-col gap-3 rounded-md border border-warning/50 bg-warning/15 p-3 text-sm md:flex-row md:items-center md:justify-between"
          data-testid="upload-awaiting-confirm"
        >
          <p className="flex min-w-0 items-start gap-2">
            <IconChecklist size={20} stroke={1.5} aria-hidden className="mt-px shrink-0" />
            <span className="[overflow-wrap:anywhere]">
              {processing.fileName ? `“${processing.fileName}”` : "File baru"} menunggu konfirmasi:
              tinjau periode yang akan ditambah, diganti, atau dilepas. Data aktif belum berubah.
            </span>
          </p>
          <Button
            asChild
            className="h-(--control-h-lg) w-full shrink-0 md:h-(--control-h) md:w-auto"
          >
            <Link href={`/datasets/${datasetId}/tinjau/${processing.versionId}`}>
              <IconChecklist aria-hidden />
              Tinjau perubahan
            </Link>
          </Button>
        </div>
      ) : null}

      {state.kind === "error" ? (
        <FormAlert tone="error" ref={errorRef}>
          <span className="block">{state.message}</span>
          {(state.retryable && state.file) || ownVersion || state.stale ? (
            <span className="mt-2 flex flex-col gap-2 sm:flex-row">
              {state.stale ? (
                <Button
                  size="sm"
                  variant="outline"
                  className={control}
                  pending={refreshing}
                  leadingIcon={<IconRefresh aria-hidden />}
                  onClick={() => {
                    setState({ kind: "idle" });
                    startRefresh(() => router.refresh());
                  }}
                >
                  Muat ulang data
                </Button>
              ) : null}
              {state.retryable && state.file ? (
                <Button
                  size="sm"
                  variant="outline"
                  className={control}
                  disabled={cancelling}
                  onClick={() =>
                    state.file && void start(state.file, ownVersion, state.choice ?? REPLACE_CHOICE)
                  }
                >
                  Coba lagi
                </Button>
              ) : null}
              {ownVersion ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className={control}
                  pending={cancelling}
                  leadingIcon={<IconX aria-hidden />}
                  onClick={() => void cancel(ownVersion)}
                >
                  Batalkan unggahan
                </Button>
              ) : null}
            </span>
          ) : null}
        </FormAlert>
      ) : null}

      {queue ? (
        <UploadQueuePanel
          key={queue.id}
          datasetId={datasetId}
          initial={queue}
          maxBytes={maxBytes}
        />
      ) : null}
      {draft && period && !queueOpen && !processing ? (
        <UploadQueueDraft
          datasetId={datasetId}
          period={period}
          files={draft}
          onCancel={() => {
            setDraft(null);
            refocusPick.current = true;
            setAnnounce("Antrean dibatalkan sebelum dimulai.");
          }}
          onCreated={(q, files) => {
            const u = queueUploader(q.id);
            u.attach(q.items, files);
            u.start(maxBytes);
            setDraft(null);
            startRefresh(() => router.refresh());
          }}
        />
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
            {pendingText ? (
              <span className="block text-muted-foreground">{pendingText}</span>
            ) : null}
            <span className="mt-1 block text-muted-foreground">
              Pilih file yang sama untuk melanjutkan dari bagian terakhir.
            </span>
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              size="sm"
              className={control}
              disabled={cancelling}
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
              {choiceText(state.choice, period) ? (
                <span className="block text-muted-foreground" data-testid="upload-choice">
                  {choiceText(state.choice, period)}
                </span>
              ) : null}
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
                disabled={cancelling}
                leadingIcon={<IconPlayerPlay aria-hidden />}
                onClick={() =>
                  void start(
                    state.file,
                    progress.versionId ?? ownVersion,
                    state.choice ?? REPLACE_CHOICE,
                  )
                }
              >
                Lanjutkan
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className={control}
              pending={cancelling}
              // Versi server belum diketahui saat memeriksa (mis. lanjut dari kartu tertunda): batal
              // hanya lokal dan versi tetap UPLOADING → tunggu sampai init membawa versionId.
              disabled={
                progress.phase === "finishing" ||
                (progress.phase === "checking" && !(progress.versionId ?? ownVersion))
              }
              leadingIcon={<IconX aria-hidden />}
              onClick={() => void cancel(progress.versionId ?? ownVersion)}
            >
              Batalkan
            </Button>
          </div>
        </div>
      ) : null}

      {picking && period && idleLike && !processing ? (
        <UploadPeriodPicker
          key={`${picking.file.name}:${picking.file.size}:${picking.file.lastModified}`}
          fileName={picking.file.name}
          grain={period.grain}
          guess={picking.guess}
          onSubmit={(label) => void start(picking.file, ownVersion, { mode: "PERIOD", label })}
          onCancel={() => {
            refocusPick.current = true;
            setPicking(null);
            setAnnounce("Pemilihan file dibatalkan.");
          }}
        />
      ) : null}

      {sheetPick && idleLike && !processing ? (
        <UploadSheetPicker
          key={`${sheetPick.file.name}:${sheetPick.file.size}:${sheetPick.file.lastModified}`}
          fileName={sheetPick.file.name}
          sheets={sheetPick.sheets}
          activeSheets={activeSheets}
          onSubmit={(picked) => {
            const sheets = selectionToSend(sheetPick.sheets, picked);
            void start(
              sheetPick.file,
              ownVersion,
              sheets.length ? { mode: "REPLACE", sheets } : REPLACE_CHOICE,
            );
          }}
          onCancel={() => {
            refocusPick.current = true;
            setSheetPick(null);
            setAnnounce("Pemilihan sheet dibatalkan.");
          }}
        />
      ) : null}

      {showDropzone && period ? (
        <PeriodCapacityNotice capacity={period.capacity} testId="upload-capacity" />
      ) : null}

      {showDropzone && reuploadOpen ? (
        <div data-testid="upload-reupload">
          <FocusNotice>
            <span className="[overflow-wrap:anywhere]">
              Unggah ulang {reuploadOpen.label}: pilih file berisi data pengganti periode ini.{" "}
              {period?.needsLabel
                ? `Periode file terisi ${reuploadOpen.label} dan masih bisa diubah sebelum diproses.`
                : "Periode dibaca dari kolom tanggal file; periode yang sudah ada diganti utuh."}{" "}
              Periode lain tidak berubah.
            </span>
          </FocusNotice>
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
            {period ? (
              <p className="font-medium" data-testid="upload-period-title">
                Tambah atau perbarui periode{" "}
                <span className="font-normal text-muted-foreground">
                  — periode yang sudah ada akan diganti, bukan digandakan
                </span>
              </p>
            ) : (
              <p className="font-medium">
                {hasData ? "Ganti data dengan file baru" : "Belum ada data"}
              </p>
            )}
            <p id={hintId} className="mt-1 text-muted-foreground">
              Pilih atau seret file .xlsx/.csv (maks. {formatBytes(maxBytes)}).
              {period?.needsLabel ? " Periode file dipilih sebelum diproses." : ""}
              {period
                ? " Pilih beberapa file sekaligus untuk mengisi banyak periode berurutan."
                : ""}{" "}
              Unggahan bisa dilanjutkan bila koneksi terputus.
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
            multiple={period !== null}
            data-testid="upload-input"
            onChange={(e) => onFiles(e.target.files)}
          />
          {/* Saat ada unggahan tertunda, CTA primer satu-satunya = "Lanjutkan unggahan". */}
          <Button
            ref={pickButtonRef}
            type="button"
            variant={showPending ? "outline" : "primary"}
            className="h-11 w-full sm:h-(--control-h) sm:w-auto"
            aria-describedby={hintId}
            leadingIcon={<IconUpload aria-hidden />}
            onClick={() => inputRef.current?.click()}
          >
            Pilih file
          </Button>
          {period ? (
            <>
              <input
                ref={replaceRef}
                type="file"
                accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                className="hidden"
                tabIndex={-1}
                aria-label="Pilih file pengganti semua data"
                data-testid="upload-input-replace"
                onChange={(e) => onReplaceFiles(e.target.files)}
              />
              <Button
                ref={replaceLinkRef}
                type="button"
                variant="link"
                className="h-11 px-2 sm:h-(--control-h-sm)"
                data-testid="upload-replace-all"
                onClick={() => setConfirmReplace("pick")}
              >
                Ganti semua data…
              </Button>
            </>
          ) : setupHref && hasData ? (
            <p className="text-sm text-muted-foreground" data-testid="upload-period-setup">
              Ingin menyimpan data per bulan?{" "}
              <Link
                href={setupHref}
                className="inline-flex min-h-6 items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
              >
                <IconCalendarStats size={16} stroke={1.5} aria-hidden />
                Atur periode
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}

      {period ? (
        <ConfirmDialog
          open={confirmReplace !== false}
          onOpenChange={(open) => {
            if (!open) setConfirmReplace(false);
          }}
          title="Ganti semua data?"
          data-testid="upload-replace-confirm"
          description={
            <>
              {typeof confirmReplace === "object" ? (
                <span
                  className="block [overflow-wrap:anywhere]"
                  data-testid="upload-replace-pending"
                >
                  {`“${confirmReplace.file.name}” adalah unggahan “Ganti semua data” yang belum selesai. Untuk menambah periode dengan file ini, batalkan dulu unggahan tertunda itu.`}
                </span>
              ) : null}
              <span data-testid="upload-replace-count">{replaceAllText(period.periodCount)}</span>{" "}
              dengan isi file baru, dan data tidak lagi disimpan per periode. Atur periode lagi
              setelahnya bila perlu. Versi sekarang tetap ada di riwayat dan bisa diaktifkan
              kembali.
            </>
          }
          onCloseAutoFocus={(e) => {
            // Batal → kembali ke tautan; lanjut → pemilih file sistem sudah terbuka.
            e.preventDefault();
            replaceLinkRef.current?.focus();
          }}
          action={
            <Button
              className={DIALOG_CTA}
              leadingIcon={<IconReplace aria-hidden />}
              data-testid="upload-replace-go"
              onClick={() => {
                const held = confirmReplace;
                setConfirmReplace(false);
                if (typeof held === "object") {
                  startReplace(held.file);
                  return;
                }
                // Masih dalam gestur klik pengguna: peramban mengizinkan membuka pemilih file.
                replaceRef.current?.click();
              }}
            >
              {typeof confirmReplace === "object"
                ? "Lanjutkan ganti semua data"
                : "Pilih file pengganti"}
            </Button>
          }
        />
      ) : null}
    </div>
  );
}
