"use client";

import { IconDeviceFloppy } from "@tabler/icons-react";
import { useEffect, useRef } from "react";
import { fmtInt } from "@/components/schema/labels";
import { Button } from "@/components/ui/button";

export const SAVE_ID = "mapping-save";

/**
 * Bar simpan yang menempel di bawah layar. Halaman bergulir di dokumen, jadi selama bar terpasang
 * scroll-padding-bottom <html> = tinggi bar: kontrol yang difokus (Tab, fokus galat) tidak pernah
 * tertutup bar (WCAG 2.2 SC 2.4.11), termasuk saat bar membungkus ke dua baris di ponsel.
 */
export function MappingSaveBar({
  done,
  total,
  busy,
  pending,
}: {
  done: number;
  total: number;
  busy: boolean;
  pending: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const html = document.documentElement;
    const apply = () => {
      html.style.scrollPaddingBottom = `${el.offsetHeight + 8}px`;
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      ro.disconnect();
      html.style.scrollPaddingBottom = "";
    };
  }, []);

  const left = total - done;
  return (
    <div
      ref={ref}
      data-testid="mapping-save-bar"
      className="sticky bottom-0 z-10 flex flex-col gap-3 rounded-lg border bg-card/95 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-sm backdrop-blur md:flex-row md:items-center md:justify-between"
    >
      <p className="text-sm">
        {left > 0 ? (
          <>
            <span className="font-medium">{fmtInt(left)} keputusan lagi</span>
            <span className="text-muted-foreground">
              {" "}
              · {fmtInt(done)} dari {fmtInt(total)} diputuskan
            </span>
          </>
        ) : (
          <>
            <span className="font-medium">Siap disimpan</span>
            <span className="text-muted-foreground"> · versi baru langsung aktif</span>
          </>
        )}
      </p>
      <Button
        type="submit"
        id={SAVE_ID}
        data-testid="mapping-save"
        disabled={busy}
        pending={pending}
        leadingIcon={<IconDeviceFloppy aria-hidden />}
        className="h-(--control-h-lg) w-full md:h-(--control-h) md:w-auto"
      >
        Simpan &amp; aktifkan
      </Button>
    </div>
  );
}
