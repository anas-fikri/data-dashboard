"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WidgetView } from "@/features/dashboards/service";
import type { LayoutItem } from "@/features/dashboards/validation";
import { api, type ApiResult } from "./dashboard-api";
import { sameLayout } from "./layout-ops";

/*
 * Status editor kanvas (T-010). Semua mutasi melewati satu antrean berurutan dan membawa revisi tata
 * letak terakhir yang diketahui; tata letak yang belum terkirim disimpan dulu sebelum tambah/hapus.
 * Server menolak revisi lama dengan STALE → editor berhenti mengirim sampai halaman dimuat ulang
 * (tidak pernah menimpa perubahan tab lain). Geser/ubah ukuran disimpan otomatis (debounce); halaman
 * yang ditutup sebelum jeda habis tetap mengirim lewat keepalive. "Urungkan" membatalkan satu langkah.
 */
export type SaveState = "saved" | "pending" | "saving" | "error" | "stale";
type Undo =
  | { kind: "layout"; layout: LayoutItem[] }
  | { kind: "add"; widgetId: string }
  | { kind: "delete"; title: string; item: LayoutItem };
type Failure = Extract<ApiResult<unknown>, { ok: false }>;

const SAVE_DELAY_MS = 500;

export function useDashboardEditor(o: {
  dashboardId: string;
  widgets: WidgetView[];
  layout: LayoutItem[];
  revision: number;
}) {
  const [widgets, setWidgetsState] = useState(o.widgets);
  const [layout, setLayoutState] = useState(o.layout);
  const [undo, setUndo] = useState<Undo | null>(null);
  const [save, setSave] = useState<SaveState>("saved");
  const [notice, setNotice] = useState<string | null>(null);
  const revision = useRef(o.revision);
  const latest = useRef(o.layout);
  const widgetsNow = useRef(o.widgets);
  /** Ada tata letak yang belum diterima server. */
  const dirty = useRef(false);
  /** Server menjawab STALE: jangan kirim apa pun lagi sampai dimuat ulang. */
  const stale = useRef(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const id = o.dashboardId;

  const run = useCallback(<T>(op: () => Promise<T>): Promise<T> => {
    const next = queue.current.then(op);
    queue.current = next.catch(() => {});
    return next;
  }, []);

  const setLayout = useCallback((next: LayoutItem[]) => {
    latest.current = next;
    setLayoutState(next);
  }, []);
  const setWidgets = useCallback((next: WidgetView[]) => {
    widgetsNow.current = next;
    setWidgetsState(next);
  }, []);

  const failed = useCallback((r: Failure, layoutSave = false) => {
    if (r.code === "STALE") {
      stale.current = true;
      clearTimeout(timer.current);
      setSave("stale");
    } else if (layoutSave) setSave("error");
    setNotice(r.message);
  }, []);

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
    if (!dirty.current) setSave("saved");
    setNotice(null);
    return true;
  }, [id, failed]);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    return run(saveNow);
  }, [run, saveNow]);

  /** Tata letak baru dari geser/ubah ukuran (atau tombol posisi): simpan otomatis setelah jeda. */
  const commitLayout = useCallback(
    (next: LayoutItem[], recordUndo = true) => {
      // Klik pegangan tanpa bergeser / langkah di tepi grid: tidak ada yang disimpan atau diurungkan.
      if (stale.current || sameLayout(next, latest.current)) return;
      if (recordUndo) setUndo({ kind: "layout", layout: latest.current });
      setLayout(next);
      dirty.current = true;
      setSave("pending");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
    },
    [flush, setLayout],
  );

  const addWidget = useCallback(
    (restore?: { title: string; at: Omit<LayoutItem, "i"> }) => {
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
        setNotice(null);
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
        const title = widgetsNow.current.find((w) => w.id === widgetId)?.title ?? "";
        const r = await api.deleteWidget(id, widgetId, revision.current);
        if (!r.ok) {
          failed(r);
          return false;
        }
        revision.current = r.data.layoutRevision;
        setWidgets(widgetsNow.current.filter((w) => w.id !== widgetId));
        setLayout(dirty.current ? latest.current.filter((it) => it.i !== widgetId) : r.data.layout);
        setUndo(recordUndo && item ? { kind: "delete", title, item } : null);
        setNotice(null);
        return true;
      });
    },
    [id, run, saveNow, failed, setLayout, setWidgets],
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

  const undoLast = useCallback(async () => {
    const u = undo;
    if (!u || stale.current) return;
    setUndo(null);
    if (u.kind === "layout") commitLayout(u.layout, false);
    else if (u.kind === "add") await removeWidget(u.widgetId, false);
    else {
      const { i: _i, ...at } = u.item;
      await addWidget({ title: u.title, at });
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
    undo: undoLast,
    flush,
    dismissNotice: () => setNotice(null),
  };
}
