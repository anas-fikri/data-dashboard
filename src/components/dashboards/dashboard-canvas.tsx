"use client";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ReactGridLayout, { useContainerWidth, type Layout } from "react-grid-layout";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import type { WidgetView } from "@/features/dashboards/service";
import { GRID_COLS, type LayoutItem } from "@/features/dashboards/validation";
import { CanvasEmpty } from "./canvas-empty";
import { CanvasToolbar } from "./canvas-toolbar";
import { MIN_H, MIN_W, moveItem, readingOrder, resizeItem } from "./layout-ops";
import { useDashboardEditor } from "./use-dashboard-editor";
import { useIsPhone } from "./use-is-phone";
import { DRAG_HANDLE, WidgetCard } from "./widget-card";
import { WidgetPanel } from "./widget-panel";

/*
 * Kanvas dashboard (T-010). ≥ 768 px: grid 12 kolom (react-grid-layout) — statis di mode lihat; di mode
 * edit diseret lewat pegangan dan diubah ukurannya di pojok. < 768 px: satu kolom urut baca, tanpa
 * menyeret (posisi/ukuran tetap bisa diubah lewat panel pengaturan).
 */
const ROW_HEIGHT = 56;
const MARGIN: [number, number] = [16, 16];
const plain = (l: Layout): LayoutItem[] => l.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }));

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
  const { width, containerRef, mounted } = useContainerWidth();
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [announce, setAnnounce] = useState("");
  const byId = new Map(ed.widgets.map((w) => [w.id, w]));
  const panelItem = editing && selected ? ed.layout.find((it) => it.i === selected) : undefined;

  // Ctrl/Cmd+Z = urungkan (di luar kolom isian).
  useEffect(() => {
    if (!editing) return;
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
  }, [editing, ed]);

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
    if (await ed.removeWidget(id)) {
      if (selected === id) setSelected(null);
      setAnnounce("Widget dihapus. Gunakan Urungkan untuk mengembalikannya.");
    }
  }
  async function done() {
    setFinishing(true);
    if (ed.save !== "saved" && !(await ed.flush())) return setFinishing(false);
    router.push(`/dashboards/${dashboardId}`);
  }

  const card = (w: WidgetView, it: LayoutItem, extra?: { style?: React.CSSProperties }) => (
    <WidgetCard
      key={w.id}
      widget={w}
      editing={editing}
      draggable={!phone}
      selected={selected === w.id}
      onSettings={() => setSelected(selected === w.id ? null : w.id)}
      onDelete={() => void remove(w.id)}
      data-pos={`${it.x},${it.y},${it.w},${it.h}`}
      {...extra}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      {editing ? (
        <CanvasToolbar
          save={ed.save}
          undoKind={ed.undoKind}
          adding={adding}
          finishing={finishing}
          onAdd={() => void add()}
          onUndo={() => void ed.undo()}
          onRetry={() => void ed.flush()}
          onReload={() => router.refresh()}
          onDone={() => void done()}
        />
      ) : null}
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      {ed.notice ? (
        <FormAlert tone="error">
          <span className="block">{ed.notice}</span>
          <Button size="sm" variant="outline" className="mt-2" onClick={ed.dismissNotice}>
            Tutup
          </Button>
        </FormAlert>
      ) : null}

      {ed.widgets.length === 0 ? (
        <CanvasEmpty
          dashboardId={dashboardId}
          editing={editing}
          adding={adding}
          onAdd={() => void add()}
        />
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <div
            ref={containerRef}
            className="min-w-0 flex-1"
            data-testid="canvas"
            data-layout={phone ? "stack" : "grid"}
          >
            {phone ? (
              <div className="flex flex-col gap-4">
                {readingOrder(ed.layout).map((it) => {
                  const w = byId.get(it.i);
                  return w
                    ? card(w, it, { style: { minHeight: Math.max(160, it.h * ROW_HEIGHT) } })
                    : null;
                })}
              </div>
            ) : mounted ? (
              <ReactGridLayout
                // Mode lihat: item statis — tanpa pegangan seret/ubah ukuran sama sekali.
                layout={ed.layout.map((it) => ({
                  ...it,
                  minW: MIN_W,
                  minH: MIN_H,
                  static: !editing,
                }))}
                width={width}
                gridConfig={{
                  cols: GRID_COLS,
                  rowHeight: ROW_HEIGHT,
                  margin: MARGIN,
                  containerPadding: [0, 0],
                }}
                dragConfig={{ enabled: editing, handle: `.${DRAG_HANDLE}` }}
                resizeConfig={{ enabled: editing, handles: ["se"] }}
                onDragStop={(l) => ed.commitLayout(plain(l))}
                onResizeStop={(l) => ed.commitLayout(plain(l))}
              >
                {ed.layout.map((it) => {
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
          {panelItem && byId.get(panelItem.i) ? (
            <div className="lg:sticky lg:top-4 lg:w-80 lg:shrink-0">
              <WidgetPanel
                key={panelItem.i}
                widget={byId.get(panelItem.i)!}
                item={panelItem}
                onRename={(t) => ed.renameWidget(panelItem.i, t)}
                onMove={(dx, dy) => ed.commitLayout(moveItem(ed.layout, panelItem.i, dx, dy))}
                onResize={(dw, dh) => ed.commitLayout(resizeItem(ed.layout, panelItem.i, dw, dh))}
                onDelete={() => void remove(panelItem.i)}
                onClose={() => setSelected(null)}
              />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
