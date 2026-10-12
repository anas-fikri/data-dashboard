"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { RecastInput } from "@/features/ingest/recast-input";
import type { RecastStatus } from "@/features/schema/service";
import { usePolling } from "@/lib/hooks/use-polling";
import { useSessionJson, writeSessionJson } from "@/lib/hooks/use-session-json";

/*
 * Satu alur koreksi per sheet (T-008): kirim → antre → diproses → selesai (render ulang dari server).
 * Job yang berjalan disimpan di sessionStorage (satu sumber kebenaran) agar muat ulang halaman tetap
 * menampilkan statusnya; hasil "selesai" dibawa melewati router.refresh() dan berlaku untuk revisi
 * yang dihasilkannya saja.
 */
export interface RecastJob {
  jobId: string;
  baseRevision: number;
  /** Kolom yang diubah (untuk melaporkan gagal konversi) atau baris header baru. */
  change: { kind: "columns"; positions: number[] } | { kind: "header"; row: number };
}
export interface DoneNotice {
  revision: number;
  change: RecastJob["change"];
}
type Local =
  | { phase: "idle" }
  | { phase: "submitting" }
  | { phase: "error"; message: string; stale?: boolean };

interface RecastContextValue {
  local: Local;
  /** Job yang sedang ditunggu (antre/diproses), atau null. */
  jobState: "queued" | "running" | null;
  /** Status job belum bisa dibaca (jaringan); polling tetap mencoba. */
  pollError: boolean;
  retryPoll(): void;
  busy: boolean;
  done: DoneNotice | null;
  dismissDone(): void;
  submit(input: Omit<RecastInput, "baseRevision">, change: RecastJob["change"]): Promise<boolean>;
  dismissError(): void;
}

const Ctx = createContext<RecastContextValue | null>(null);
const jobKey = (sheetId: string) => `dd:recast:${sheetId}`;
const doneKey = (sheetId: string) => `dd:recast-done:${sheetId}`;

const STALE_MESSAGE =
  "Skema sheet ini sudah diubah sejak halaman dibuka (mungkin di tab lain). Muat ulang untuk melihat versi terbaru, lalu ulangi perubahan.";

export function RecastProvider({
  sheetId,
  revision,
  children,
}: {
  sheetId: string;
  revision: number;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [local, setLocal] = useState<Local>({ phase: "idle" });
  const storedJob = useSessionJson<RecastJob>(jobKey(sheetId));
  const storedDone = useSessionJson<DoneNotice>(doneKey(sheetId));
  const job = storedJob?.baseRevision === revision ? storedJob : null;
  const done = storedDone?.revision === revision ? storedDone : null;

  const poll = usePolling<{ ok: boolean; status: RecastStatus }>({
    url: job ? `/api/sheets/${sheetId}/recast/${job.jobId}` : null,
    intervalMs: 1_500,
    initial: null,
    done: (d) => !d.ok || !["queued", "running"].includes(d.status.state),
    // Sesi habis / sheet tidak lagi aktif / dataset dihapus: tampilkan keadaan terbaru dari server.
    onStop: () => {
      writeSessionJson(jobKey(sheetId), null);
      router.refresh();
    },
    onDone: (d) => {
      writeSessionJson(jobKey(sheetId), null);
      const s = d.ok ? d.status : ({ state: "unknown" } as const);
      if (s.state === "done") {
        writeSessionJson(doneKey(sheetId), { revision: s.revision, change: job!.change });
        router.refresh();
      } else if (s.state === "stale") {
        setLocal({ phase: "error", message: STALE_MESSAGE, stale: true });
      } else if (s.state === "invalid" || s.state === "failed") {
        setLocal({ phase: "error", message: s.message });
      } else {
        router.refresh(); // job sudah dibersihkan/dataset berubah: tampilkan keadaan terbaru
      }
    },
  });

  const submit = useCallback<RecastContextValue["submit"]>(
    async (input, change) => {
      setLocal({ phase: "submitting" });
      writeSessionJson(doneKey(sheetId), null);
      try {
        const res = await fetch(`/api/sheets/${sheetId}/recast`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ baseRevision: revision, ...input }),
        });
        const body = (await res.json().catch(() => null)) as
          | { ok: true; jobId: string }
          | { ok: true; applied: true; revision: number }
          | { ok: false; code?: string; message?: string }
          | null;
        if (body?.ok && "applied" in body) {
          // Nama/sembunyikan diterapkan langsung (tanpa antrean).
          writeSessionJson(doneKey(sheetId), { revision: body.revision, change });
          setLocal({ phase: "idle" });
          router.refresh();
          return true;
        }
        if (body?.ok) {
          writeSessionJson(jobKey(sheetId), { jobId: body.jobId, baseRevision: revision, change });
          setLocal({ phase: "idle" });
          return true;
        }
        if (res.status === 401) router.refresh(); // sesi habis → halaman mengarahkan ke login
        const stale = body?.code === "STALE";
        setLocal({
          phase: "error",
          stale,
          message: stale
            ? STALE_MESSAGE
            : (body?.message ?? "Perubahan belum bisa disimpan. Coba lagi beberapa saat lagi."),
        });
      } catch {
        setLocal({
          phase: "error",
          message: "Tidak bisa menghubungi server. Periksa koneksi lalu coba lagi.",
        });
      }
      return false;
    },
    [sheetId, revision, router],
  );

  const polled = poll.data?.ok ? poll.data.status.state : null;
  const jobState = job ? (polled === "running" ? "running" : "queued") : null;
  const value = useMemo<RecastContextValue>(
    () => ({
      local,
      jobState,
      pollError: poll.error,
      retryPoll: poll.retry,
      busy: local.phase === "submitting" || job !== null,
      done,
      dismissDone: () => writeSessionJson(doneKey(sheetId), null),
      submit,
      dismissError: () => setLocal({ phase: "idle" }),
    }),
    [local, jobState, poll.error, poll.retry, job, done, sheetId, submit],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRecast(): RecastContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useRecast di luar RecastProvider");
  return v;
}
