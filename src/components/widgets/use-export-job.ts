"use client";

import { useEffect, useReducer, useRef } from "react";
import type { ExportCreateBody, ExportStatusView } from "@/features/exports/types";
import { markDownloadNavigation } from "@/lib/download-navigation";
import { usePolling } from "@/lib/hooks/use-polling";
import { isAccessLost, useAccessLost } from "./access-refresh";
import {
  EXPORT_IDLE,
  exportBusy,
  exportDownloadUrl,
  exportReducer,
  exportStatusUrl,
  expiryDelay,
} from "./export-model";

/*
 * Satu ekspor per kartu (T-017): POST → polling status 1 s (usePolling: satu permintaan sekaligus,
 * jeda saat tab tersembunyi, berhenti di 401/403/404/410) → selesai: unduhan dimulai SEKALI lewat
 * <a download> ke route unduh (302 ke presigned `attachment`; Chromium menjadikan 302 lintas origin
 * navigasi, jadi ditandai untuk penjaga beforeunload editor — lib/download-navigation.ts) dan galat
 * 404/410 tidak menampilkan halaman JSON → tautan "Unduh lagi"
 * sampai kedaluwarsa. Status dipegang reducer murni (export-model.ts). 404 saat membuat = akses
 * dashboard dicabut → halaman dimuat ulang dari server, sama seperti query widget (access-refresh.tsx).
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

export function useExportJob() {
  const [job, dispatch] = useReducer(exportReducer, EXPORT_IDLE);
  const accessLost = useAccessLost();
  const create = useRef<AbortController | null>(null);
  useEffect(() => () => create.current?.abort(), []);

  const id = job.phase === "running" ? job.id : null;
  const poll = usePolling<ExportStatusView>({
    url: id ? exportStatusUrl(id) : null,
    intervalMs: 1_000,
    initial: null,
    done: (v) => v.state !== "queued" && v.state !== "running",
    // Dipanggil sekali per URL (= per ekspor): unduhan otomatis tidak terulang.
    onDone: (view) => {
      if (!id) return;
      dispatch({ type: "status", id, view });
      if (view.state === "done") triggerDownload(exportDownloadUrl(id));
    },
    onStop: (status) => {
      if (id) dispatch({ type: "stopped", id, status });
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
  }, [doneId, expiresAt]);

  async function start(body: ExportCreateBody) {
    if (exportBusy(job)) return;
    dispatch({ type: "start", format: body.format });
    const ctl = new AbortController();
    create.current = ctl;
    try {
      const res = await fetch("/api/exports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: ctl.signal,
      });
      const json = (await res.json().catch(() => null)) as CreateResponse;
      if (json?.ok && typeof json.exportId === "string") {
        dispatch({ type: "created", id: json.exportId });
        return;
      }
      if (isAccessLost({ ok: false, status: res.status })) accessLost?.(body.widgetId);
      const fail = json && !json.ok ? json : null;
      dispatch({ type: "rejected", status: res.status, code: fail?.code, message: fail?.message });
    } catch {
      if (!ctl.signal.aborted) dispatch({ type: "rejected", status: 0 });
    }
  }

  return {
    job,
    start,
    /** Status belum terbaca 2× berturut-turut (jaringan); polling tetap mencoba. */
    pollError: id !== null && poll.error,
    retryPoll: poll.retry,
  };
}
