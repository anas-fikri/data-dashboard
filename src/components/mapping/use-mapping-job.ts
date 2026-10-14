"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { versionErrorText } from "@/components/datasets/version-history-status";
import { submitMappingAction } from "@/features/versions/actions";
import { usePolling } from "@/lib/hooks/use-polling";
import type { MappingJobState, MappingPayload } from "./mapping-types";

/*
 * Alur simpan pemetaan (T-014): kirim keputusan → job map-version antre/berjalan → selesai (pindah
 * ke dataset) atau gagal dengan langkah berikutnya. Versi tetap "menunggu pemetaan" selama job
 * berjalan, jadi job yang sedang berjalan juga dibaca dari server (tab lain, muat ulang).
 */
export interface MappingJobStatus {
  state: MappingJobState;
  message?: string;
}
const RUNNING: MappingJobState[] = ["queued", "running"];

/**
 * Polling status job sampai selesai; null = tidak ada job yang ditunggu. `onStop` = polling berhenti
 * tanpa hasil (401/403/404/410), dipanggil sebelum halaman dirender ulang.
 */
export function useMappingPoll(
  datasetId: string,
  jobId: string | null,
  onDone: (s: MappingJobStatus) => void,
  onStop?: () => void,
) {
  const router = useRouter();
  const poll = usePolling<MappingJobStatus>({
    url: jobId ? `/api/datasets/${datasetId}/mapping/${jobId}` : null,
    intervalMs: 1_500,
    initial: null,
    done: (s) => !RUNNING.includes(s.state),
    onDone,
    // Sesi habis / dataset dihapus / job sudah dibersihkan: tampilkan keadaan terbaru dari server.
    onStop: () => {
      onStop?.();
      router.refresh();
    },
  });
  const state = poll.data?.state;
  const phase: "queued" | "running" | null =
    jobId && (!state || RUNNING.includes(state))
      ? state === "running"
        ? "running"
        : "queued"
      : null;
  return { phase, pollError: poll.error, retry: poll.retry };
}

export type MappingLocal =
  | { phase: "idle" }
  | { phase: "submitting" }
  | { phase: "error"; message: string; reload: boolean };

const FAILED = "Pemetaan belum bisa diterapkan. Periksa pilihan kolom, lalu simpan lagi.";

export function useMappingJob(datasetId: string, versionId: string, serverJobId: string | null) {
  const router = useRouter();
  const [local, setLocal] = useState<MappingLocal>({ phase: "idle" });
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useMappingPoll(
    datasetId,
    jobId ?? serverJobId,
    (s) => {
      setJobId(null);
      if (s.state === "done") router.push(`/datasets/${datasetId}?mapped=1`);
      else if (s.state === "stale") setLocal(errorOf("STALE", ""));
      else if (s.state === "gone")
        router.refresh(); // dibuang/diaktifkan di tab lain
      else setLocal({ phase: "error", message: s.message || FAILED, reload: false });
    },
    // Job sudah hilang dari antrean (404): lepaskan job lokal agar form tidak terkunci; render ulang
    // membawa job yang masih berjalan dari server, bila ada.
    () => setJobId(null),
  );

  async function submit(payload: MappingPayload) {
    setLocal({ phase: "submitting" });
    const res = await submitMappingAction(datasetId, versionId, payload).catch(() => null);
    if (res?.ok) {
      setJobId(res.data.jobId);
      setLocal({ phase: "idle" });
      return;
    }
    // Job lain untuk versi ini sudah berjalan (tab lain): render ulang membawa status job itu.
    if (res?.code === "DATASET_BUSY") router.refresh();
    // Tanpa jawaban (jaringan) → kode kosong → NETWORK_ERROR.
    setLocal(errorOf(res?.code ?? "", res?.message ?? ""));
  }

  return {
    local,
    job,
    busy: local.phase === "submitting" || job.phase !== null,
    submit,
    dismiss: () => setLocal({ phase: "idle" }),
  };
}

/** Skema aktif berubah / versi hilang → hanya muat ulang yang menolong. */
function errorOf(code: string, message: string): MappingLocal {
  return {
    phase: "error",
    message: versionErrorText(code, message),
    reload: code === "STALE" || code === "NOT_FOUND",
  };
}
