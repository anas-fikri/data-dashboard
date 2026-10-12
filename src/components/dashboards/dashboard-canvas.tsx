"use client";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ReactGridLayout, { useContainerWidth, type Layout } from "react-grid-layout";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import type { WidgetView } from "@/features/dashboards/service";
import { GRID_COLS, type LayoutItem } from "@/features/dashboards/validation";
import { CanvasEmpty } from "./canvas-empty";
import { CanvasToolbar, UNDO_ATTR } from "./canvas-toolbar";
import { MIN_H, MIN_W, applyStep, readingOrder, stepAvailability } from "./layout-ops";
import { useDashboardEditor } from "./use-dashboard-editor";
import { useIsPhone, useIsWide } from "./use-media-query";
import { DRAG_HANDLE, SETTINGS_ATTR, WidgetCard } from "./widget-card";
import { WidgetPanel } from "./widget-panel";
import { WidgetPanelFrame } from "./widget-panel-frame";

/*
 * Kanvas dashboard (T-010). ≥ 768 px: grid 12 kolom (react-grid-layout) — mode edit menyeret lewat
 * kepala kartu dan mengubah ukuran di pojok; mode lihat tanpa pegangan apa pun. < 768 px: satu kolom
 * urut baca, tanpa menyeret (posisi/ukuran lewat panel pengaturan). DOM grid juga urut baca agar
 * urutan Tab = urutan tampilan. Fokus dipindah eksplisit saat panel dibuka/ditutup dan setelah hapus.
 */
const ROW_HEIGHT = 56;
const MARGIN: [number, number] = [16, 16];
const plain = (l: Layout): LayoutItem[] => l.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }));
const settingsOf = (id: string) => `[data-widget-id="${id}"] [${SETTINGS_ATTR}]`;

export function DashboardCanvas(props: {
  dashboardId: string;
  widgets: WidgetView[];
  layout: LayoutItem[];
  revision: number;
  editing: boolean;
}) {
  const { dashboardId, editing } = props;
  const ed = useDashboardEditor(props);
  const router = useRouter();
  const phone = useIsPhone();
  const wide = useIsWide();
  const { width, containerRef, mounted } = useContainerWidth();
  const root = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [announce, setAnnounce] = useState("");
  /** Selektor yang difokus setelah commit berikutnya (elemen pertama yang ada menang). */
  const focusTo = useRef<string[] | null>(null);
  const canEdit = editing && ed.save !== "stale";
  const byId = new Map(ed.widgets.map((w) => [w.id, w]));
  const ordered = readingOrder(ed.layout);
  const panelItem = canEdit && selected ? ed.layout.find((it) => it.i === selected) : undefined;
  const panelWidget = panelItem ? byId.get(panelItem.i) : undefined;

  // Tanpa deps: berjalan setelah tiap commit; permintaan fokus selalu menyertai perubahan state.
  useEffect(() => {
    const wanted = focusTo.current;
    if (!wanted) return;
    focusTo.current = null;
    for (const s of wanted) {
      const el = root.current?.querySelector<HTMLElement>(s);
      if (el) return el.focus();
    }
  });

  // Ctrl/Cmd+Z = urungkan (di luar kolom isian).
  useEffect(() => {
    if (!canEdit) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest(
        "input, textarea, [contenteditable]",
      );
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !typing && ed.canUndo) {
        e.preventDefault();
        void ed.undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canEdit, ed]);

  function closePanel() {
    if (selected) focusTo.current = [settingsOf(selected)];
    setSelected(null);
  }
  async function add() {
    setAdding(true);
    const id = await ed.addWidget();
    setAdding(false);
    if (id) {
      setSelected(id);
      setAnnounce("Widget kosong ditambahkan di bagian bawah.");
    }
  }
  async function remove(id: string) {
    if (!(await ed.removeWidget(id))) return;
    if (selected === id) setSelected(null);
    setAnnounce("Widget dihapus. Gunakan Urungkan untuk mengembalikannya.");
    focusTo.current = [`[${UNDO_ATTR}]`];
  }
  async function done() {
    setFinishing(true);
    // STALE: perubahan lokal memang tidak bisa disimpan; mode lihat menampilkan versi terbaru.
    if (ed.save !== "stale" && !(await ed.flush())) return setFinishing(false);
    router.push(`/dashboards/${dashboardId}`);
  }
  const reload = () => window.location.reload();

  const card = (w: WidgetView, it: LayoutItem, extra?: { style?: React.CSSProperties }) => (
    <WidgetCard
      key={w.id}
      widget={w}
      editing={canEdit}
      draggable={!phone}
      selected={selected === w.id}
      onSettings={() => setSelected(selected === w.id ? null : w.id)}
      data-pos={`${it.x},${it.y},${it.w},${it.h}`}
      {...extra}
    />
  );

  return (
    <div ref={root} className="flex flex-col gap-4">
      {editing ? (
        <CanvasToolbar
          save={ed.save}
          undoKind={ed.canUndo ? ed.undoKind : null}
          adding={adding}
          finishing={finishing}
          onAdd={() => void add()}
          onUndo={() => void ed.undo()}
          onRetry={() => void ed.flush()}
          onReload={reload}
          onDone={() => void done()}
        />
      ) : null}
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      {ed.notice ? (
        <FormAlert tone="error">
          <span className="block">{ed.notice}</span>
          {ed.save === "stale" ? (
            <Button size="sm" className="mt-2" onClick={reload}>
              Muat ulang
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="mt-2" onClick={ed.dismissNotice}>
              Tutup
            </Button>
          )}
        </FormAlert>
      ) : null}

      {ed.widgets.length === 0 ? (
        <CanvasEmpty dashboardId={dashboardId} editing={editing} />
      ) : (
        <div className="flex items-start gap-4">
          <div
            ref={containerRef}
            className="min-w-0 flex-1"
            data-testid="canvas"
            data-layout={phone ? "stack" : "grid"}
          >
            {phone ? (
              <div className="flex flex-col gap-4">
                {ordered.map((it) => {
                  const w = byId.get(it.i);
                  return w
                    ? card(w, it, { style: { minHeight: Math.max(160, it.h * ROW_HEIGHT) } })
                    : null;
                })}
              </div>
            ) : mounted ? (
              <ReactGridLayout
                layout={ed.layout.map((it) => ({ ...it, minW: MIN_W, minH: MIN_H }))}
                width={width}
                gridConfig={{
                  cols: GRID_COLS,
                  rowHeight: ROW_HEIGHT,
                  margin: MARGIN,
                  containerPadding: [0, 0],
                }}
                dragConfig={{ enabled: canEdit, handle: `.${DRAG_HANDLE}`, cancel: "button" }}
                resizeConfig={{ enabled: canEdit, handles: ["se"] }}
                onDragStop={(l) => ed.commitLayout(plain(l))}
                onResizeStop={(l) => ed.commitLayout(plain(l))}
              >
                {ordered.map((it) => {
                  const w = byId.get(it.i);
                  return w ? card(w, it) : <div key={it.i} />;
                })}
              </ReactGridLayout>
            ) : (
              <div
                className="h-64 animate-pulse rounded-lg bg-muted motion-reduce:animate-none"
                aria-hidden
              />
            )}
          </div>
          {panelItem && panelWidget ? (
            <WidgetPanelFrame key={panelItem.i} docked={wide} onClose={closePanel}>
              <WidgetPanel
                widget={panelWidget}
                item={panelItem}
                can={stepAvailability(ed.layout, panelItem.i)}
                onRename={(t) => ed.renameWidget(panelItem.i, t)}
                onStep={(k) => ed.commitLayout(applyStep(ed.layout, panelItem.i, k))}
                onDelete={() => void remove(panelItem.i)}
              />
            </WidgetPanelFrame>
          ) : null}
        </div>
      )}
    </div>
  );
}
