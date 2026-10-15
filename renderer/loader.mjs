// Hook resolve untuk menjalankan renderer/*.ts dengan type stripping bawaan Node (≥ 22.18), tanpa tsx
// (esbuild host macOS tidak jalan di container Linux): impor relatif tanpa ekstensi ("./env") dicoba
// ulang dengan ".ts". Pakai: node --import ./renderer/loader.mjs renderer/server.ts
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (/^\.\.?\//.test(specifier) && !/\.[cm]?[jt]s$/.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw error;
    }
  },
});
