"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WidgetView } from "@/features/dashboards/service";
import type { LayoutItem } from "@/features/dashboards/validation";
import { api, type ApiResult } from "./dashboard-api";

/*
 * Status editor kanvas (T-010). Semua mutasi melewati satu antrean berurutan sehingga revisi tata
 * letak yang dikirim selalu revisi terbaru (tambah/hapus widget juga menaikkan revisi di server).
 * Geser/ubah ukuran disimpan otomatis (debounce); "urungkan" membatalkan satu langkah terakhir.
 */
export type SaveState = "saved" | "pending" | "saving" | "error" | "stale";
type Undo =
  | { kind: "layout"; layout: LayoutItem[] }
  | { kind: "add"; widgetId: string }
  | { kind: "delete"; title: string; item: LayoutItem };

const SAVE_DELAY_MS = 500;

export function useDashboardEditor(o: {
  dashboardId: string;
  widgets: WidgetView[];
  layout: LayoutItem[];
  revision: number;
}) {
  const [widgets, setWidgets] = useState(o.widgets);
  const [layout, setLayoutState] = useState(o.layout);
  const [undo, setUndo] = useState<Undo | null>(null);
  const [save, setSave] = useState<SaveState>("saved");
  const [notice, setNotice] = useState<string | null>(null);
  const revision = useRef(o.revision);
  const latest = useRef(o.layout);
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

  const failed = useCallback((r: Extract<ApiResult<unknown>, { ok: false }>) => {
    if (r.code === "STALE") setSave("stale");
    setNotice(r.message);
  }, []);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    return run(async () => {
      setSave("saving");
      const r = await api.saveLayout(id, revision.current, latest.current);
      if (r.ok) {
        revision.current = r.data.layoutRevision;
        setSave("saved");
        setNotice(null);
      } else {
        setSave(r.code === "STALE" ? "stale" : "error");
        failed(r);
      }
      return r.ok;
    });
  }, [id, run, failed]);

  /** Tata letak baru dari geser/ubah ukuran (atau tombol posisi): simpan otomatis setelah jeda. */
  const commitLayout = useCallback(
    (next: LayoutItem[], recordUndo = true) => {
      if (recordUndo) setUndo({ kind: "layout", layout: latest.current });
      setLayout(next);
      setSave("pending");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
    },
    [flush, setLayout],
  );

  const addWidget = useCallback(
    (restore?: { title: string; at: Omit<LayoutItem, "i"> }) =>
      run(async () => {
        const r = await api.addWidget(id, restore);
        if (!r.ok) {
          failed(r);
          return null;
        }
        revision.current = r.data.layoutRevision;
        setWidgets((ws) => [...ws, r.data.widget]);
        setLayout([...latest.current, r.data.item]);
        setUndo(restore ? null : { kind: "add", widgetId: r.data.widget.id });
        setNotice(null);
        return r.data.widget.id;
      }),
    [id, run, failed, setLayout],
  );

  const removeWidget = useCallback(
    (widgetId: string, recordUndo = true) =>
      run(async () => {
        const item = latest.current.find((it) => it.i === widgetId);
        const title = widgets.find((w) => w.id === widgetId)?.title ?? "";
        const r = await api.deleteWidget(id, widgetId);
        if (!r.ok) {
          failed(r);
          return false;
        }
        revision.current = r.data.layoutRevision;
        setWidgets((ws) => ws.filter((w) => w.id !== widgetId));
        setLayout(latest.current.filter((it) => it.i !== widgetId));
        setUndo(recordUndo && item ? { kind: "delete", title, item } : null);
        setNotice(null);
        return true;
      }),
    [id, run, failed, setLayout, widgets],
  );

  const renameWidget = useCallback(
    (widgetId: string, title: string) =>
      run(async () => {
        const r = await api.renameWidget(id, widgetId, title);
        if (!r.ok) {
          failed(r);
          return false;
        }
        setWidgets((ws) => ws.map((w) => (w.id === widgetId ? { ...w, title: r.data.title } : w)));
        return true;
      }),
    [id, run, failed],
  );

  const undoLast = useCallback(async () => {
    const u = undo;
    if (!u) return;
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
    if (save !== "pending" && save !== "saving") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [save]);
  useEffect(() => () => clearTimeout(timer.current), []);

  return {
    widgets,
    layout,
    save,
    notice,
    canUndo: undo !== null,
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
