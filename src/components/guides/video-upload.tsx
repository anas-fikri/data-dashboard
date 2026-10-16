"use client";

import { IconUpload, IconVideo, IconX } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  VIDEO_MAX_BYTES,
  VIDEO_SNIFF_BYTES,
  VIDEO_TITLE_MAX,
  videoProblem,
} from "@/features/guides/media";
import { UploadError, api, formatBytes, runMultipart } from "@/features/uploads/client";
import { probeVideo } from "./video-probe";

type Phase = "reading" | "uploading" | "finishing";
type Errors = { title?: string; file?: string; form?: string };
type InitRes = { ok: true; videoId: string; partSize: number; partCount: number };
const LABEL: Record<Phase, string> = {
  reading: "Membaca durasi dan poster…",
  uploading: "Mengunggah…",
  finishing: "Memeriksa video di server…",
};

/**
 * Form unggah video panduan (T-021): judul + file mp4/webm ≤ 500 MB. Pra-cek signature di browser,
 * durasi + poster PNG dari file lokal, unggah multipart langsung ke storage (progres + Batalkan), lalu
 * poster. Progres diumumkan (role=status, per 25%); selama unggah fokus di Batalkan (atau form saat
 * pemeriksaan). Hasil/galat hanya mengambil fokus bila pengguna masih di form ini (atau fokus hilang),
 * tidak merebut fokus dari kolom lain yang sedang diketik; isian dipertahankan saat galat.
 */
export function VideoUpload({ articleId }: { articleId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [run, setRun] = useState<{ phase: Phase; pct: number } | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [done, setDone] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const fileBtnRef = useRef<HTMLButtonElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const ctrl = useRef<AbortController | null>(null);
  const videoId = useRef<string | null>(null);

  /** Fokus boleh dipindah: pengguna masih di form ini atau fokus jatuh ke <body>. */
  const here = () => {
    const a = document.activeElement;
    return !a || a === document.body || !!formRef.current?.contains(a);
  };

  useEffect(() => {
    if (!here()) return;
    (errors.title
      ? titleRef
      : errors.file
        ? fileBtnRef
        : errors.form
          ? alertRef
          : null
    )?.current?.focus();
  }, [errors]);

  useEffect(() => {
    if (done && here()) doneRef.current?.focus();
  }, [done]);

  // Tombol Unggah jadi disabled saat mulai: fokus ke Batalkan (pemeriksaan server: ke form).
  const phase = run?.phase;
  useEffect(() => {
    const a = document.activeElement;
    const lost =
      !a ||
      a === document.body ||
      (!!formRef.current?.contains(a) && (a as HTMLButtonElement).disabled === true);
    if (phase && lost) (cancelRef.current ?? formRef.current)?.focus();
  }, [phase]);

  const fail = (e: Errors) => {
    setRun(null);
    setErrors(e);
  };

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setDone(null);
    if (!title.trim()) return fail({ title: "Judul video wajib diisi." });
    if (!file) return fail({ file: "Pilih file video .mp4 atau .webm." });
    const head = new Uint8Array(await file.slice(0, VIDEO_SNIFF_BYTES).arrayBuffer());
    const problem = videoProblem(file.name, file.size, head);
    if (problem) return fail({ file: problem.message });
    setErrors({});
    const signal = (ctrl.current = new AbortController()).signal;
    videoId.current = null;
    try {
      setRun({ phase: "reading", pct: 0 });
      const meta = await probeVideo(file);
      const init = await api<InitRes>(
        "/api/guides/videos",
        "POST",
        { articleId, title: title.trim(), name: file.name, size: file.size },
        signal,
      );
      videoId.current = init.videoId;
      const base = `/api/guides/videos/${init.videoId}`;
      await runMultipart({
        file,
        signal,
        plan: { ...init, versionId: init.videoId, uploadedParts: [], resumed: false },
        base,
        completeBody: meta.durationSec ? { durationSec: meta.durationSec } : {},
        onProgress: (p) =>
          setRun({
            phase: p.phase === "finishing" ? "finishing" : "uploading",
            pct: Math.floor((p.loaded / Math.max(1, p.total)) * 100),
          }),
      });
      videoId.current = null;
      const poster = meta.poster
        ? await fetch(`${base}/poster`, {
            method: "POST",
            headers: { "content-type": "image/png" },
            body: meta.poster,
          }).catch(() => null)
        : null;
      setDone(
        `Video “${title.trim()}” tersimpan${poster?.ok ? "" : " tanpa poster (browser tidak bisa membaca gambarnya)"}.`,
      );
      setRun(null);
      setTitle("");
      setFile(null);
      router.refresh();
    } catch (err) {
      if (signal.aborted) return;
      void discard();
      const u = err instanceof UploadError ? err : null;
      if (u?.code === "INVALID_FORMAT" || u?.code === "FILE_TOO_LARGE") fail({ file: u.message });
      else if (u?.code === "INVALID") fail({ title: u.message });
      else fail({ form: u?.message ?? "Terjadi gangguan. Coba lagi beberapa saat lagi." });
    }
  }

  async function discard() {
    const id = videoId.current;
    videoId.current = null;
    if (id) await api(`/api/guides/videos/${id}`, "DELETE", null).catch(() => {});
  }

  function cancel() {
    ctrl.current?.abort();
    void discard();
    setRun(null);
    setDone("Unggahan dibatalkan.");
  }

  return (
    <form
      ref={formRef}
      tabIndex={-1}
      aria-labelledby="video-upload-title"
      onSubmit={start}
      noValidate
      className="flex flex-col gap-4 rounded-lg border p-4 outline-none"
    >
      <h3 id="video-upload-title" className="text-base font-semibold">
        Tambah video
      </h3>
      <p role="status" className="sr-only">
        {run
          ? run.phase === "uploading"
            ? `Mengunggah ${Math.floor(run.pct / 25) * 25}%`
            : LABEL[run.phase]
          : ""}
      </p>
      {errors.form ? (
        <FormAlert tone="error" ref={alertRef}>
          {errors.form}
        </FormAlert>
      ) : null}
      {done ? (
        <FormAlert tone="success" ref={doneRef}>
          {done}
        </FormAlert>
      ) : null}
      <Field id="video-title" label="Judul video" required error={errors.title}>
        <Input
          ref={titleRef}
          value={title}
          maxLength={VIDEO_TITLE_MAX}
          disabled={!!run}
          placeholder="Mis. Mengunggah file Excel pertama"
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>
      <div role="group" aria-labelledby="video-file-label" className="flex flex-col gap-1.5">
        <span className="text-sm font-medium" id="video-file-label">
          File video
        </span>
        <input
          ref={inputRef}
          type="file"
          accept=".mp4,.webm,video/mp4,video/webm"
          className="hidden"
          tabIndex={-1}
          aria-label="Pilih file video"
          data-testid="video-input"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setErrors((x) => ({ ...x, file: undefined }));
            e.target.value = "";
          }}
        />
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            ref={fileBtnRef}
            type="button"
            variant="outline"
            disabled={!!run}
            aria-describedby={`video-file-name ${errors.file ? "video-file-error" : "video-file-hint"}`}
            aria-invalid={errors.file ? true : undefined}
            leadingIcon={<IconVideo aria-hidden />}
            className="h-(--control-h-lg) w-full sm:h-(--control-h) sm:w-auto"
            onClick={() => inputRef.current?.click()}
          >
            Pilih video
          </Button>
          <span id="video-file-name" className="min-w-0 truncate text-sm text-muted-foreground">
            {file ? `${file.name} · ${formatBytes(file.size)}` : "Belum ada file dipilih"}
          </span>
        </div>
        {errors.file ? (
          <p id="video-file-error" role="alert" className="text-sm text-destructive">
            {errors.file}
          </p>
        ) : (
          <p id="video-file-hint" className="text-sm text-muted-foreground">
            .mp4 atau .webm, maks. {formatBytes(VIDEO_MAX_BYTES)}. Durasi dan poster diambil
            otomatis.
          </p>
        )}
      </div>
      {run ? (
        <div className="flex flex-col gap-2" data-testid="video-progress">
          <p className="flex justify-between text-sm">
            <span>{LABEL[run.phase]}</span>
            <span className="font-medium tabular-nums" aria-hidden>
              {run.phase === "reading" ? "" : `${run.pct}%`}
            </span>
          </p>
          <div
            role="progressbar"
            aria-label="Unggahan video"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={run.pct}
            aria-valuetext={run.phase === "uploading" ? `${run.pct}%` : LABEL[run.phase]}
            className="h-2 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-primary motion-safe:transition-[width] motion-safe:duration-300"
              style={{ width: `${run.pct}%` }}
            />
          </div>
        </div>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="submit"
          pending={!!run}
          leadingIcon={<IconUpload aria-hidden />}
          className="h-(--control-h-lg) w-full sm:h-(--control-h) sm:w-auto"
        >
          Unggah video
        </Button>
        {run && run.phase !== "finishing" ? (
          <Button
            ref={cancelRef}
            type="button"
            variant="ghost"
            leadingIcon={<IconX aria-hidden />}
            className="h-(--control-h-lg) w-full sm:h-(--control-h) sm:w-auto"
            onClick={cancel}
          >
            Batalkan
          </Button>
        ) : null}
      </div>
    </form>
  );
}
