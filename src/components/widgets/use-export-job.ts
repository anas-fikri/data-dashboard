"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { ExportStatusView } from "@/features/exports/types";
import { markDownloadNavigation } from "@/lib/download-navigation";
import { usePolling } from "@/lib/hooks/use-polling";
import { isAccessLost, useAccessLost } from "./access-refresh";
import {
  EXPORT_IDLE,
  exportBusy,
  exportDownloadUrl,
  exportStatusUrl,
  expiryDelay,
  recheckOutcome,
  type ExportEvent,
  type ExportStartBody,
} from "./export-model";
import {
  claimDownload,
  dispatchExport,
  exportJobOf,
  exportKey,
  subscribeExport,
} from "./export-store";
import { useExportUser } from "./export-user";

/*
 * Satu ekspor per sasaran (widget T-017, PDF dashboard T-018): POST → polling status 1 s (usePolling: satu permintaan sekaligus,
 * jeda saat tab tersembunyi, berhenti di 401/403/404/410) → selesai: unduhan dimulai SEKALI lewat
 * <a download> ke route unduh (302 ke presigned `attachment`; Chromium menjadikan 302 lintas origin
 * navigasi, jadi ditandai untuk penjaga beforeunload editor — lib/download-navigation.ts) → tombol
 * "Unduh lagi" sampai kedaluwarsa; tombol itu membaca status dulu (recheckOutcome) agar tautan mati
 * tidak gagal diam-diam. Status hidup di export-store.ts (bukan state kartu): kartu yang dipasang ulang
 * melanjutkan polling, dan POST yang masih berjalan saat itu tetap mendarat di store; kuncinya user +
 * sasaran (review R2-CL-1). 404 saat membuat, polling, atau membaca ulang = akses dashboard dicabut →
 * halaman dimuat ulang dari server (access-refresh.tsx di kanvas; PDF dashboard T-018 di kepala halaman,
 * di luar kanvas, memberi `onAccessLost` sendiri).
 */
function triggerDownload(url: string) {
  // 302 lintas origin ke storage = navigasi di Chromium: penjaga beforeunload editor melewatinya.
  markDownloadNavigation();
  const a = document.createElement("a");
  a.href = url;
  a.download = "";
  document.body.append(a);
  a.click();
  a.remove();
}

type CreateResponse =
  { ok: true; exportId: string } | { ok: false; code?: string; message?: string } | null;

/**
 * Polling berhenti tanpa hasil (401/403/404/410). 404 = akses dicabut di tengah ekspor (review R2-CL-2):
 * halaman diambil ulang seperti saat membuat ekspor dan "Unduh lagi", galat NOT_FOUND tanpa "Ekspor
 * lagi" (yang hanya bisa gagal lagi).
 */
export function pollStopped(
  key: string,
  job: { target: string; id: string },
  status: number,
  accessLost: ((target?: string) => boolean) | null,
) {
  if (isAccessLost({ ok: false, status })) accessLost?.(job.target);
  dispatchExport(key, { type: "stopped", id: job.id, status });
}

/**
 * `target`: id widget (T-017) atau dashboardExportTarget(id) (PDF, T-018). `onAccessLost` menggantikan
 * penjaga akses kanvas untuk pemanggil di luar kanvas (kepala halaman).
 */
export function useExportJob(target: string, onAccessLost?: () => void) {
  const key = exportKey(useExportUser(), target);
  const subscribe = useCallback((cb: () => void) => subscribeExport(key, cb), [key]);
  const job = useSyncExternalStore(
    subscribe,
    () => exportJobOf(key),
    () => EXPORT_IDLE,
  );
  const dispatch = useCallback((e: ExportEvent) => dispatchExport(key, e), [key]);
  const canvasLost = useAccessLost();
  const accessLost = onAccessLost
    ? () => {
        onAccessLost();
        return true;
      }
    : canvasLost;
  // "Unduh lagi": membaca status (checking) / status tidak terbaca (jaringan, tautan tetap).
  const [again, setAgain] = useState<"idle" | "checking" | "failed">("idle");

  const id = job.phase === "running" ? job.id : null;
  const poll = usePolling<ExportStatusView>({
    url: id ? exportStatusUrl(id) : null,
    intervalMs: 1_000,
    initial: null,
    done: (v) => v.state !== "queued" && v.state !== "running",
    // Sekali per URL per pemasangan; claimDownload menjaga sekali per ekspor lintas pemasangan.
    onDone: (view) => {
      if (!id) return;
      dispatch({ type: "status", id, view });
      if (view.state === "done" && claimDownload(key, id)) triggerDownload(exportDownloadUrl(id));
    },
    onStop: (status) => {
      if (id) pollStopped(key, { target, id }, status, accessLost);
    },
  });

  // Tautan unduh berlaku 60 menit: setelah itu "Unduh lagi" diganti galat kedaluwarsa + "Ekspor lagi".
  const doneId = job.phase === "done" ? job.id : null;
  const expiresAt = job.phase === "done" ? job.expiresAt : null;
  useEffect(() => {
    const wait = doneId ? expiryDelay(expiresAt, Date.now()) : null;
    if (!doneId || wait === null) return;
    const t = setTimeout(() => dispatch({ type: "expired", id: doneId }), wait);
    return () => clearTimeout(t);
  }, [doneId, expiresAt, dispatch]);

  async function start(body: ExportStartBody) {
    if (exportBusy(exportJobOf(key))) return;
    dispatch({ type: "start", format: body.format });
    setAgain("idle");
    // Tanpa abort saat unmount: jawaban tetap masuk ke store untuk kartu yang dipasang ulang.
    try {
      const res = await fetch("/api/exports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as CreateResponse;
      if (json?.ok && typeof json.exportId === "string") {
        dispatch({ type: "created", id: json.exportId });
        return;
      }
      if (isAccessLost({ ok: false, status: res.status })) accessLost?.(target);
      const fail = json && !json.ok ? json : null;
      dispatch({ type: "rejected", status: res.status, code: fail?.code, message: fail?.message });
    } catch {
      dispatch({ type: "rejected", status: 0 });
    }
  }

  async function downloadAgain() {
    const current = exportJobOf(key);
    if (current.phase !== "done" || again === "checking") return;
    setAgain("checking");
    let status = 0;
    let view: ExportStatusView | null = null;
    try {
      const res = await fetch(exportStatusUrl(current.id), { cache: "no-store" });
      status = res.status;
      view = res.ok ? ((await res.json().catch(() => null)) as ExportStatusView | null) : null;
    } catch {
      // status 0: jaringan
    }
    const outcome = recheckOutcome(status, view, Date.now());
    setAgain(outcome.kind === "retry" ? "failed" : "idle");
    if (outcome.kind === "download") triggerDownload(exportDownloadUrl(current.id));
    if (outcome.kind !== "error") return;
    if (outcome.accessLost) accessLost?.(target);
    dispatch({ type: "recheck", id: current.id, code: outcome.code, message: outcome.message });
  }

  return {
    job,
    start,
    /** Status belum terbaca 2× berturut-turut (jaringan); polling tetap mencoba. */
    pollError: id !== null && poll.error,
    retryPoll: poll.retry,
    downloadAgain,
    /** "Unduh lagi" sedang membaca status / status tidak terbaca (coba lagi). */
    again: job.phase === "done" ? again : "idle",
  };
}
