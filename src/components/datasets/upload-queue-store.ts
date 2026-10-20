"use client";

import { useSyncExternalStore } from "react";
import {
  UploadError,
  api,
  precheck,
  runMultipart,
  type UploadPhase,
} from "@/features/uploads/client";
import { fileIdentity, type QueueItemView } from "@/features/uploads/queue-plan";

/*
 * Pengunggah antrean di browser (T-059): file antrean diunggah satu per satu menurut `seq` (multipart,
 * bisa dilanjutkan) ke /api/upload-queue/items/<id>. Status disimpan di modul, bukan di komponen, jadi
 * unggahan tetap berjalan saat pemilik pindah ke layar tinjauan/pemetaan lalu kembali (navigasi klien).
 * Muat ulang/tutup tab menghapus File dari memori: file yang sudah terunggah tetap diproses server;
 * sisanya dipilih ulang (dicocokkan nama + ukuran + waktu ubah) atau dilewati.
 */

export interface QueueUploadSnapshot {
  /** File antrean yang File-nya ada di tab ini. */
  attached: ReadonlySet<string>;
  /** File yang selesai dikirim tab ini (menunggu status server). */
  sent: ReadonlySet<string>;
  /** Unggahan yang sedang berjalan. */
  current: { itemId: string; phase: UploadPhase; loaded: number; total: number } | null;
  /** Unggahan terhenti (jaringan/sesi): "Coba lagi" melanjutkan dari bagian terakhir. */
  error: { itemId: string; message: string } | null;
  running: boolean;
}

const RETRYABLE = new Set(["NETWORK", "STORAGE_ERROR", "BUSY", "RATE_LIMITED"]);
const RETRIES = 3;

class QueueUploader {
  files = new Map<string, File>();
  items: QueueItemView[] = [];
  maxBytes = 0;
  private abort: AbortController | null = null;
  private listeners = new Set<() => void>();
  snapshot: QueueUploadSnapshot = {
    attached: new Set(),
    sent: new Set(),
    current: null,
    error: null,
    running: false,
  };

  constructor(readonly queueId: string) {}

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private set(patch: Partial<QueueUploadSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const fn of this.listeners) fn();
  }

  /** File pilihan dicocokkan ke file antrean (identitas sama); yang tidak cocok dikembalikan. */
  attach(items: readonly QueueItemView[], files: readonly File[]): string[] {
    this.items = [...items];
    const byId = new Map(items.map((it) => [fileIdentity(it), it.id]));
    const unmatched: string[] = [];
    for (const f of files) {
      const id = byId.get(fileIdentity(f));
      if (id) this.files.set(id, f);
      else unmatched.push(f.name);
    }
    this.set({ attached: new Set(this.files.keys()) });
    return unmatched;
  }

  sync(items: readonly QueueItemView[]) {
    this.items = [...items];
  }

  private next(): { item: QueueItemView; file: File } | null {
    const sorted = [...this.items].sort((a, b) => a.seq - b.seq);
    for (const it of sorted) {
      if (it.state !== "WAITING" && it.state !== "UPLOADING") continue;
      if (this.snapshot.sent.has(it.id)) continue;
      const file = this.files.get(it.id);
      if (file) return { item: it, file };
    }
    return null;
  }

  start(maxBytes: number) {
    this.maxBytes = maxBytes;
    if (this.snapshot.running) return;
    const ctl = new AbortController();
    this.abort = ctl;
    this.set({ running: true, error: null });
    void (async () => {
      try {
        for (let n = this.next(); n; n = this.next()) {
          const ok = await this.uploadOne(n.item, n.file, ctl.signal);
          if (!ok) break;
        }
      } finally {
        if (this.abort === ctl) this.abort = null;
        this.set({ running: false, current: null });
      }
    })();
  }

  /** Hentikan unggahan di tab ini (antrean dihentikan/dataset berganti). Part yang ada tetap di server. */
  stop() {
    this.abort?.abort();
    this.abort = null;
  }

  private markSent(id: string) {
    this.set({ sent: new Set([...this.snapshot.sent, id]) });
  }

  /** false = berhenti (galat yang perlu tindakan pemilik, atau dibatalkan). */
  private async uploadOne(it: QueueItemView, file: File, signal: AbortSignal): Promise<boolean> {
    const base = `/api/upload-queue/items/${it.id}`;
    this.set({ current: { itemId: it.id, phase: "checking", loaded: 0, total: file.size } });
    try {
      await precheck(file, this.maxBytes);
    } catch (e) {
      // Format/ukuran salah: file ditandai gagal di server (pesan tetap server), antrean lanjut.
      const code = e instanceof UploadError ? e.code : "INVALID_FORMAT";
      try {
        await api(`${base}/skip`, "POST", { reason: code }, signal);
      } catch (err) {
        if (signal.aborted) return false;
        this.set({ error: { itemId: it.id, message: messageOf(err) } });
        return false;
      }
      this.markSent(it.id);
      return true;
    }
    for (let attempt = 0; ; attempt++) {
      try {
        const plan = await api<{
          ok: true;
          versionId: string;
          partSize: number;
          partCount: number;
          uploadedParts: number[];
          resumed: boolean;
        }>(base, "POST", {}, signal);
        await runMultipart({
          file,
          signal,
          plan,
          base,
          onProgress: (p) => {
            if (!signal.aborted) {
              this.set({
                current: { itemId: it.id, phase: p.phase, loaded: p.loaded, total: p.total },
              });
            }
          },
        });
        this.markSent(it.id);
        return true;
      } catch (e) {
        if (signal.aborted) return false;
        const err = e instanceof UploadError ? e : null;
        if (err && RETRYABLE.has(err.code) && attempt < RETRIES) {
          await sleep(1500 * 2 ** attempt, signal).catch(() => {});
          if (signal.aborted) return false;
          continue;
        }
        if (!err || RETRYABLE.has(err.code) || err.code === "UNAUTHENTICATED") {
          this.set({ error: { itemId: it.id, message: messageOf(e) } });
          return false;
        }
        // Ditolak permanen server (format/rusak/kedaluwarsa/tidak ada): file sudah ditandai gagal atau
        // tidak lagi di antrean; status server yang menjelaskan — lanjut ke file berikutnya.
        this.markSent(it.id);
        return true;
      }
    }
  }
}

function messageOf(e: unknown): string {
  return e instanceof UploadError ? e.message : "Terjadi gangguan. Coba lagi beberapa saat lagi.";
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

const uploaders = new Map<string, QueueUploader>();

export function queueUploader(queueId: string): QueueUploader {
  let u = uploaders.get(queueId);
  if (!u) {
    u = new QueueUploader(queueId);
    uploaders.set(queueId, u);
  }
  return u;
}

/** Lepaskan pengunggah antrean yang sudah selesai (File tidak ditahan di memori). */
export function forgetQueueUploader(queueId: string) {
  uploaders.get(queueId)?.stop();
  uploaders.delete(queueId);
}

const EMPTY: QueueUploadSnapshot = {
  attached: new Set(),
  sent: new Set(),
  current: null,
  error: null,
  running: false,
};

const noop = () => () => {};

/**
 * true setelah hidrasi: render server tidak tahu file mana yang ada di tab ini, jadi ajakan "Pilih ulang
 * file" baru tampil di klien (input yang dirender server sebelum hidrasi tidak punya handler).
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

export function useQueueUploads(queueId: string): QueueUploadSnapshot {
  const u = queueUploader(queueId);
  return useSyncExternalStore(
    u.subscribe,
    () => u.snapshot,
    () => EMPTY,
  );
}
