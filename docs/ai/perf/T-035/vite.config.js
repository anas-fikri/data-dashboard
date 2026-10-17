import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// html.cspNonce menaruh placeholder nonce di <script>/<link>; server.mjs menggantinya per request
// (meniru CSP ber-nonce + 'strict-dynamic' dari src/lib/security-headers.ts, T-027).
// SPLIT=1: pecah per paket hanya untuk melihat porsi tiap library di chunk rute.
const split = process.env.SPLIT === "1";
const PKGS = ["ag-grid-community", "ag-stack", "ag-grid-react", "@glideapps", "@linaria", "lodash", "marked", "react-number-format", "canvas-hypertxt", "@tabler", "react-dom", "react"];

export default defineConfig({
  plugins: [react()],
  html: { cspNonce: "__CSP_NONCE__" },
  build: {
    outDir: process.env.OUT_DIR || "dist",
    target: "es2022",
    sourcemap: false,
    reportCompressedSize: true,
    chunkSizeWarningLimit: 2000,
    rollupOptions: split
      ? {
          output: {
            manualChunks(id) {
              const m = id.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/);
              if (!m) return undefined;
              const pkg = PKGS.find((p) => m[1] === p || m[1].startsWith(p + "/") || (p.startsWith("@") && m[1].startsWith(p)));
              return pkg ? "pkg-" + pkg.replace(/[@/]/g, "") : "pkg-other";
            },
          },
        }
      : undefined,
  },
});
