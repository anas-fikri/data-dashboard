"use client";

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/*
 * Sinyal siap cetak halaman /render (T-018 D7). Renderer menunggu
 * document.documentElement.dataset.renderReady === "1" lalu baru memanggil pdf(); tanpa sinyal dalam
 * batas waktunya ekspor gagal EXPORT_TIMEOUT (tidak pernah mencetak halaman setengah jadi).
 * Urutan: semua bagian async yang terdaftar selesai (grafik tergambar — galat juga dihitung selesai)
 * → document.fonts.ready → DOM tenang 250 ms (pengukuran KPI/kartu grafik yang merender ulang sesudah
 * ResizeObserver; paling lama 3 s) → 2 frame → tanda dipasang SEKALI. Bagian yang mendaftar atau
 * selesai selama urutan berjalan mengulang urutannya. Data widget sudah ada di HTML (diambil server),
 * jadi tidak ada fetch yang ditunggu.
 */
export interface ReadyDeps {
  fontsReady: () => Promise<unknown>;
  /** Selesai saat DOM tidak berubah sesaat (dibatasi waktu maksimum). */
  quiet: () => Promise<void>;
  frame: (cb: () => void) => void;
  /** Pasang tanda siap. */
  mark: () => void;
}

export interface ReadyTracker {
  /** Satu bagian async: kembalikan `settle` (idempoten). */
  register: () => () => void;
  /** Mulai memeriksa (setelah bagian awal terdaftar); kembalikan penghenti. */
  start: () => () => void;
}

/** Pelacak murni (diuji tanpa DOM). */
export function createReadyTracker(deps: ReadyDeps): ReadyTracker {
  let pending = 0;
  let generation = 0;
  let started = false;
  let running = false;
  let done = false;
  const frames = () => new Promise<void>((resolve) => deps.frame(() => deps.frame(resolve)));

  async function finish() {
    running = true;
    for (;;) {
      const seen = generation;
      await deps.fontsReady().catch(() => undefined);
      await deps.quiet();
      await frames();
      if (!started || pending > 0) {
        // Dihentikan, atau bagian baru masih berjalan: `settle` terakhir memulai lagi.
        running = false;
        return;
      }
      if (seen === generation) break;
    }
    running = false;
    done = true;
    deps.mark();
  }

  function check() {
    if (started && !running && !done && pending === 0) void finish();
  }

  return {
    register() {
      pending++;
      generation++;
      let open = true;
      return () => {
        if (!open) return;
        open = false;
        pending--;
        generation++;
        check();
      };
    },
    start() {
      started = true;
      check();
      return () => {
        started = false;
      };
    },
  };
}

const QUIET_MS = 250;
const QUIET_MAX_MS = 3_000;

function quietDom(root: Node): Promise<void> {
  return new Promise((resolve) => {
    let timer = setTimeout(stop, QUIET_MS);
    const cap = setTimeout(stop, QUIET_MAX_MS);
    const mo = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(stop, QUIET_MS);
    });
    mo.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
    function stop() {
      mo.disconnect();
      clearTimeout(timer);
      clearTimeout(cap);
      resolve();
    }
  });
}

/** Dependensi browser; hanya dipanggil di klien (effect). */
const browserDeps = (): ReadyDeps => ({
  fontsReady: () => document.fonts?.ready ?? Promise.resolve(),
  quiet: () => quietDom(document.body),
  frame: (cb) => void requestAnimationFrame(cb),
  mark: () => {
    document.documentElement.dataset.renderReady = "1";
  },
});

const Register = createContext<ReadyTracker["register"] | null>(null);

export function RenderReadyProvider({ children }: { children: ReactNode }) {
  const [tracker] = useState(() => createReadyTracker(browserDeps()));
  // Effect induk berjalan setelah effect anak: grafik yang terpasang sudah terdaftar.
  useEffect(() => tracker.start(), [tracker]);
  return <Register value={tracker.register}>{children}</Register>;
}

/**
 * Bagian async selama komponen ini terpasang (lepas = selesai). Kembalikan `settle` yang stabil; di
 * luar RenderReadyProvider tidak berbuat apa-apa. Mendaftar di layout effect: semua layout effect
 * berjalan sebelum effect biasa, jadi anak yang langsung selesai di effect-nya (kartu grafik tanpa
 * gambar) tidak memanggil `settle` sebelum terdaftar.
 */
export function useRenderPending(): () => void {
  const register = use(Register);
  const settle = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    if (!register) return;
    const done = register();
    settle.current = done;
    return () => {
      settle.current = null;
      done();
    };
  }, [register]);
  return useCallback(() => settle.current?.(), []);
}
