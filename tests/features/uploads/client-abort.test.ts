import { afterEach, describe, expect, it, vi } from "vitest";
import { UploadError, uploadFile, type UploadProgress } from "@/features/uploads/client";

/*
 * T-013 review 5 (R5-UP-1): saat satu part gagal, uploadFile menolak sementara part lain masih
 * berjalan. Panel unggah membatalkan controller-nya di catch; kontrak di bawah memastikan abort itu
 * menghentikan worker lain sehingga tidak ada progres terlambat yang menimpa status galat.
 */
class FakeXHR {
  static all: FakeXHR[] = [];
  upload: { onprogress: ((e: { loaded: number }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  status = 0;
  aborted = false;
  url = "";
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor() {
    FakeXHR.all.push(this);
  }
  open(_method: string, url: string) {
    this.url = url;
  }
  abort() {
    this.aborted = true;
    clearInterval(this.timer);
    this.onabort?.();
  }
  send() {
    // Part 1 gagal jaringan; part lain terus mengirim progres sampai dibatalkan.
    if (this.url.endsWith("part=1")) {
      setTimeout(() => this.onerror?.(), 5);
      return;
    }
    let loaded = 0;
    this.timer = setInterval(() => this.upload.onprogress?.({ loaded: ++loaded }), 20);
  }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

afterEach(() => {
  vi.unstubAllGlobals();
  FakeXHR.all = [];
});

describe("uploadFile + abort pemanggil", () => {
  it("part gagal → menolak; abort sesudahnya menghentikan part lain (tanpa progres terlambat)", async () => {
    let signs = 0;
    vi.stubGlobal("XMLHttpRequest", FakeXHR);
    vi.stubGlobal("fetch", async (path: string) => {
      if (path === "/api/uploads") {
        return json({
          ok: true,
          versionId: "v1",
          partSize: 10,
          partCount: 4,
          uploadedParts: [],
          resumed: false,
        });
      }
      if (path.endsWith("/parts")) {
        signs++;
        // Tanda tangan ulang part 1 ditolak (bukan NETWORK) → worker itu melempar.
        if (signs > 1) return json({ ok: false, code: "BUSY", message: "Sibuk." }, 503);
        return json({
          ok: true,
          urls: [1, 2, 3, 4].map((n) => ({
            partNumber: n,
            url: `https://s/x?part=${n}`,
            size: 10,
          })),
        });
      }
      return json({ ok: false, code: "UNEXPECTED", message: "tak terduga" }, 500);
    });

    const file = new File(["a,b\n1,2\n3,4\n5,6\n7,8\n9,10\n11,12\n13,14\n"], "x.csv");
    const controller = new AbortController();
    const events: UploadProgress[] = [];
    const err = await uploadFile({
      file,
      datasetId: "d1",
      maxBytes: 1e9,
      signal: controller.signal,
      onProgress: (p) => events.push(p),
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(UploadError);
    expect((err as UploadError).code).toBe("BUSY");
    const siblings = FakeXHR.all.filter((x) => !x.url.endsWith("part=1"));
    expect(siblings.length).toBeGreaterThan(0);
    // Tanpa abort, part lain masih berjalan setelah uploadFile menolak.
    expect(siblings.every((x) => !x.aborted)).toBe(true);

    controller.abort();
    const seen = events.length;
    await new Promise((r) => setTimeout(r, 120));
    expect(siblings.every((x) => x.aborted)).toBe(true);
    expect(events.length).toBe(seen);
  }, 10_000);
});
