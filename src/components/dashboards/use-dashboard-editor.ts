"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WidgetView } from "@/features/dashboards/service";
import type { LayoutItem } from "@/features/dashboards/validation";
import { createConfigSaves, type ConfigSave } from "./config-saves";
import { api, type ApiResult } from "./dashboard-api";
import { fitToWidgets, sameLayout } from "./layout-ops";

/*
 * Status editor kanvas (T-010). Semua mutasi melewati satu antrean berurutan dan membawa revisi tata
 * letak terakhir yang diketahui; tata letak yang belum terkirim disimpan dulu sebelum tambah/hapus.
 * Server menolak revisi lama dengan STALE → editor berhenti mengirim sampai halaman dimuat ulang
 * (tidak pernah menimpa perubahan tab lain). Geser/ubah ukuran disimpan otomatis (debounce); halaman
 * yang ditutup sebelum jeda habis tetap mengirim lewat keepalive. "Urungkan" membatalkan satu langkah.
 * Setiap tata letak (awal, dari server, hasil geser/urungkan, ganti jenis) dibuat ≥ ukuran minimum
 * jenis widgetnya (tabel 3×4); tata letak lama hanya diperbesar di tampilan sampai disimpan berikutnya.
 * Pengaturan widget yang gagal disimpan (bukan STALE) membuat status "error" sampai berhasil; flush()
 * ("Coba lagi", "Selesai") mengirimnya ulang lebih dulu (config-saves).
 */
export type SaveState = "saved" | "pending" | "saving" | "error" | "stale";
type Undo =
  | { kind: "layout"; layout: LayoutItem[] }
  | { kind: "add"; widgetId: string }
  | { kind: "delete"; title: string; item: LayoutItem; type: string; spec: unknown };
type Failure = Extract<ApiResult<unknown>, { ok: false }>;

const SAVE_DELAY_MS = 500;

export function useDashboardEditor(o: {
  dashboardId: string;
  widgets: WidgetView[];
  layout: LayoutItem[];
  revision: number;
}) {
  const [widgets, setWidgetsState] = useState(o.widgets);
  const [layout, setLayoutState] = useState(() => fitToWidgets(o.layout, o.widgets));
  const [undo, setUndo] = useState<Undo | null>(null);
  const [save, setSave] = useState<SaveState>("saved");
  const [notice, setNotice] = useState<string | null>(null);
  const revision = useRef(o.revision);
  const latest = useRef(layout);
  const widgetsNow = useRef(o.widgets);
  /** Ada tata letak yang belum diterima server. */
  const dirty = useRef(false);
  /** Server menjawab STALE: jangan kirim apa pun lagi sampai dimuat ulang. */
  const stale = useRef(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [saves] = useState(createConfigSaves);
  /** Alasan gagal simpanan pengaturan per widget (baris status panel). */
  const [configErrors, setConfigErrors] = useState(saves.errors);
  const id = o.dashboardId;

  const run = useCallback(<T>(op: () => Promise<T>): Promise<T> => {
    const next = queue.current.then(op);
    queue.current = next.catch(() => {});
    return next;
  }, []);

  /** Tata letak baru (sudah ≥ minimum jenis tiap widget, lihat fitToWidgets). */
  const setLayout = useCallback((next: LayoutItem[]) => {
    const fitted = fitToWidgets(next, widgetsNow.current);
    latest.current = fitted;
    setLayoutState(fitted);
  }, []);
  const setWidgets = useCallback((next: WidgetView[]) => {
    widgetsNow.current = next;
    setWidgetsState(next);
  }, []);

  /** unsaved: perubahannya belum tersimpan → toolbar "Belum tersimpan. Coba lagi" (flush). */
  const failed = useCallback((r: Failure, unsaved = false) => {
    if (r.code === "STALE") {
      stale.current = true;
      clearTimeout(timer.current);
      setSave("stale");
    } else if (unsaved) setSave("error");
    setNotice(r.message);
  }, []);

  /** Simpanan berhasil: tanpa tata letak tertunda, status mengikuti pengaturan widget yang gagal. */
  const settled = useCallback(() => {
    if (!dirty.current && !stale.current) setSave(saves.retries().length ? "error" : "saved");
  }, [saves]);

  /** Kirim tata letak yang belum tersimpan. Hanya dari dalam antrean. */
  const saveNow = useCallback(async () => {
    if (stale.current) return false;
    if (!dirty.current) return true;
    dirty.current = false;
    setSave("saving");
    const r = await api.saveLayout(id, revision.current, latest.current);
    if (!r.ok) {
      dirty.current = true;
      failed(r, true);
      return false;
    }
    revision.current = r.data.layoutRevision;
    // Digeser lagi selama permintaan berjalan → tetap "pending", simpan berikutnya menyusul.
    settled();
    setNotice(null);
    return true;
  }, [id, failed, settled]);

  /** Tata letak baru dari geser/ubah ukuran (atau tombol posisi): simpan otomatis setelah jeda. */
  const commitLayout = useCallback(
    (raw: LayoutItem[], recordUndo = true) => {
      const next = fitToWidgets(raw, widgetsNow.current);
      // Klik pegangan tanpa bergeser / langkah di tepi grid: tidak ada yang disimpan atau diurungkan.
      if (stale.current || sameLayout(next, latest.current)) return;
      if (recordUndo) setUndo({ kind: "layout", layout: latest.current });
      setLayout(next);
      dirty.current = true;
      setSave("pending");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void run(saveNow), SAVE_DELAY_MS);
    },
    [run, saveNow, setLayout],
  );

  const addWidget = useCallback(
    (restore?: { title: string; at: Omit<LayoutItem, "i">; type: string; spec: unknown }) => {
      clearTimeout(timer.current); // simpan tertunda ikut antrean, sebelum tambah
      return run(async () => {
        if (!(await saveNow())) return null;
        const r = await api.addWidget(id, revision.current, restore);
        if (!r.ok) {
          failed(r);
          return null;
        }
        const { widget, layout: server, layoutRevision } = r.data;
        revision.current = layoutRevision;
        setWidgets([...widgetsNow.current, widget]);
        // Digeser selama permintaan berjalan: posisi lokal dipertahankan, simpan otomatis menyusul.
        const added = server.find((it) => it.i === widget.id);
        setLayout(dirty.current && added ? [...latest.current, added] : server);
        setUndo(restore ? null : { kind: "add", widgetId: widget.id });
        setNotice(
          r.data.configDropped
            ? "Widget dipulihkan tanpa isi karena datanya sudah berubah (mis. kolomnya disembunyikan). Atur ulang lewat tombol pengaturan."
            : null,
        );
        return widget.id;
      });
    },
    [id, run, saveNow, failed, setLayout, setWidgets],
  );

  const removeWidget = useCallback(
    (widgetId: string, recordUndo = true) => {
      clearTimeout(timer.current);
      return run(async () => {
        if (!(await saveNow())) return false;
        const item = latest.current.find((it) => it.i === widgetId);
        const gone = widgetsNow.current.find((w) => w.id === widgetId);
        const title = gone?.title ?? "";
        const r = await api.deleteWidget(id, widgetId, revision.current);
        if (!r.ok) {
          failed(r);
          return false;
        }
        revision.current = r.data.layoutRevision;
        setWidgets(widgetsNow.current.filter((w) => w.id !== widgetId));
        setLayout(dirty.current ? latest.current.filter((it) => it.i !== widgetId) : r.data.layout);
        // Pengaturannya yang gagal tidak perlu dikirim ulang lagi.
        saves.forget(widgetId);
        setConfigErrors(saves.errors());
        settled();
        setUndo(
          recordUndo && item
            ? {
                kind: "delete",
                title,
                item,
                type: gone?.type ?? "empty",
                // Spec widget yang dialihkan hanya tampilan (T-013): tidak valid → dipulihkan kosong.
                spec: gone?.retargeted ? null : (gone?.spec ?? {}),
              }
            : null,
        );
        setNotice(null);
        return true;
      });
    },
    [id, run, saveNow, failed, setLayout, setWidgets, saves, settled],
  );

  const renameWidget = useCallback(
    (widgetId: string, title: string) =>
      run(async () => {
        const r = await api.renameWidget(id, widgetId, title);
        if (!r.ok) {
          failed(r);
          return false;
        }
        setWidgets(
          widgetsNow.current.map((w) => (w.id === widgetId ? { ...w, title: r.data.title } : w)),
        );
        return true;
      }),
    [id, run, failed, setWidgets],
  );

  /**
   * Kirim pengaturan widget; hasil server (spec ternormalisasi) jadi sumber kebenaran. Hanya dari dalam
   * antrean, setelah saves.start(widgetId, c).
   */
  const sendConfig = useCallback(
    async (widgetId: string, c: ConfigSave) => {
      // Widget sudah dihapus (mis. simpanan tertunda panel saat "Hapus widget"): tidak ada yang disimpan.
      if (!widgetsNow.current.some((w) => w.id === widgetId)) {
        saves.finish(widgetId, c, null);
        return true;
      }
      const r = await api.configureWidget(id, widgetId, c.type, c.spec);
      // Gagal bukan STALE: diingat untuk dikirim ulang; alasannya juga untuk baris status panel (di
      // layar < 1280 px pesan kanvas tertutup panel). Ditolak permanen — widget/dashboard sudah dihapus
      // di tab lain, atau pengaturan tidak valid: alasan tetap tampil, tidak dikirim ulang, tidak menahan
      // "Selesai".
      const gone = !r.ok && r.code === "NOT_FOUND";
      const invalid = !r.ok && r.code === "INVALID";
      saves.finish(widgetId, c, r.ok || r.code === "STALE" ? null : r.message, !invalid && !gone);
      setConfigErrors(saves.errors());
      if (!r.ok) {
        failed(r, !gone && !invalid);
        if (gone || invalid) settled();
        return false;
      }
      setWidgets(
        widgetsNow.current.map((w) =>
          // Tersimpan → spec sudah di sheet aktif; tanda "dialihkan" (T-013) tidak berlaku lagi.
          w.id === widgetId
            ? { ...w, type: r.data.type, spec: r.data.spec, retargeted: undefined }
            : w,
        ),
      );
      settled();
      // Jadi tabel di kartu kecil: diperbesar ke minimum tabel dan disimpan otomatis.
      commitLayout(latest.current, false);
      setNotice(null);
      return true;
    },
    [id, saves, failed, setWidgets, settled, commitLayout],
  );

  /** Atur jenis + isi widget (T-011). Tercatat "dikirim" sejak masuk antrean (panel yang dibuka ulang). */
  const configureWidget = useCallback(
    (widgetId: string, type: string, spec: unknown) => {
      const c = { type, spec };
      saves.start(widgetId, c);
      return run(() => sendConfig(widgetId, c));
    },
    [run, saves, sendConfig],
  );

  /** Simpan semua yang belum tersimpan ("Coba lagi", "Selesai"): pengaturan widget yang gagal dulu. */
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    return run(async () => {
      if (stale.current) return false;
      if (saves.retries().length) setSave("saving");
      for (const [widgetId, c] of saves.retries()) {
        // Sudah ada simpanan lebih baru untuk widget ini di antrean: yang gagal tidak dikirim ulang.
        if (saves.unsaved(widgetId) !== c) continue;
        saves.start(widgetId, c);
        if (!(await sendConfig(widgetId, c))) {
          // Ditolak permanen dengan tata letak belum terkirim: settled() tidak mengubah status saat dirty.
          if (!stale.current && dirty.current) setSave("error");
          return false;
        }
      }
      return saveNow();
    });
  }, [run, saves, sendConfig, saveNow]);

  const undoLast = useCallback(async () => {
    const u = undo;
    if (!u || stale.current) return;
    setUndo(null);
    if (u.kind === "layout") commitLayout(u.layout, false);
    else if (u.kind === "add") await removeWidget(u.widgetId, false);
    else {
      const { i: _i, ...at } = u.item;
      await addWidget({ title: u.title, at, type: u.type, spec: u.spec });
    }
  }, [undo, commitLayout, removeWidget, addWidget]);

  // Perubahan yang belum tersimpan: peringatkan sebelum meninggalkan halaman.
  useEffect(() => {
    if (save !== "pending" && save !== "saving" && save !== "error") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [save]);

  // Perubahan yang belum terkirim saat meninggalkan editor: tab ditutup → kirim sekarang dengan
  // keepalive (tidak bisa menunggu); pindah halaman di dalam aplikasi → kirim setelah antrean selesai
  // agar memakai revisi terbaru. Kembali dari back/forward cache: revisi di memori bisa sudah usang
  // (keepalive tadi menaikkannya) → muat ulang daripada menampilkan STALE palsu.
  useEffect(() => {
    const send = () => {
      clearTimeout(timer.current);
      if (!dirty.current || stale.current) return;
      dirty.current = false;
      void api.saveLayout(id, revision.current, latest.current, { keepalive: true });
    };
    const restored = (e: PageTransitionEvent) => {
      if (e.persisted) window.location.reload();
    };
    window.addEventListener("pagehide", send);
    window.addEventListener("pageshow", restored);
    const pending = queue;
    return () => {
      window.removeEventListener("pagehide", send);
      window.removeEventListener("pageshow", restored);
      clearTimeout(timer.current);
      void pending.current.then(send);
    };
  }, [id]);

  return {
    widgets,
    layout,
    save,
    notice,
    canUndo: undo !== null && save !== "stale",
    undoKind: undo?.kind ?? null,
    commitLayout,
    addWidget,
    removeWidget,
    renameWidget,
    configureWidget,
    /** Spec widget yang sedang dikirim atau gagal: panel yang dibuka ulang mulai dari sini. */
    unsavedConfig: saves.unsaved,
    configError: (widgetId: string) => configErrors[widgetId],
    undo: undoLast,
    flush,
    dismissNotice: () => setNotice(null),
  };
}
