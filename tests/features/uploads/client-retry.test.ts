import { afterEach, describe, expect, it, vi } from "vitest";
import { UploadError, uploadFile } from "@/features/uploads/client";

/*
 * Gangguan jaringan sesaat (fetch melempar) saat meminta URL part dan saat complete tidak lagi
 * menggagalkan unggahan: keduanya diulang dengan jeda. Galat server yang bukan jaringan tetap
 * langsung dilempar (kontrak client-abort.test.ts).
 */
class OkXHR {
  upload: { onprogress: ((e: { loaded: number }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  status = 0;
  open() {}
  abort() {}
  send() {
    setTimeout(() => {
      this.status = 200;
      this.onload?.();
    }, 1);
  }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

afterEach(() => {
  vi.unstubAllGlobals();
});

const file = () => new File(["a,b\n1,2\n3,4\n"], "x.csv");

function server(opts: { signFails: number; completeFails: number; completeCode?: string }) {
  const calls = { sign: 0, complete: 0 };
  vi.stubGlobal("XMLHttpRequest", OkXHR);
  vi.stubGlobal("fetch", async (path: string) => {
    if (path === "/api/uploads") {
      return json({
        ok: true,
        versionId: "v1",
        partSize: 1024,
        partCount: 1,
        uploadedParts: [],
        resumed: false,
      });
    }
    if (path.endsWith("/parts")) {
      if (calls.sign++ < opts.signFails) throw new TypeError("Failed to fetch");
      return json({ ok: true, urls: [{ partNumber: 1, url: "https://s/x?part=1", size: 12 }] });
    }
    if (path.endsWith("/complete")) {
      if (calls.complete++ < opts.completeFails) {
        if (opts.completeCode)
          return json({ ok: false, code: opts.completeCode, message: "x" }, 409);
        throw new TypeError("Failed to fetch");
      }
      return json({ ok: true, status: "UPLOADED" });
    }
    return json({ ok: false, code: "UNEXPECTED", message: "tak terduga" }, 500);
  });
  return calls;
}

const run = () =>
  uploadFile({
    file: file(),
    datasetId: "d1",
    maxBytes: 1e9,
    signal: new AbortController().signal,
    onProgress: () => {},
  });

describe("uploadFile: coba ulang galat jaringan", () => {
  it("minta URL part dan complete yang putus sesaat diulang sampai berhasil", async () => {
    const calls = server({ signFails: 1, completeFails: 1 });
    await expect(run()).resolves.toMatchObject({ versionId: "v1" });
    expect(calls.sign).toBe(2);
    expect(calls.complete).toBe(2);
  }, 15_000);

  it("galat server bukan jaringan saat complete tidak diulang", async () => {
    const calls = server({ signFails: 0, completeFails: 1, completeCode: "UPLOAD_CORRUPT" });
    const err = await run().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UploadError);
    expect((err as UploadError).code).toBe("UPLOAD_CORRUPT");
    expect(calls.complete).toBe(1);
  });
});
