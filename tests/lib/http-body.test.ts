import { describe, expect, it } from "vitest";
import { readTextLimited } from "@/lib/http-body";

const post = (body: BodyInit, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/x", {
    method: "POST",
    body,
    headers,
    duplex: "half",
  } as RequestInit);

describe("readTextLimited", () => {
  it("membaca body kecil sebagai teks UTF-8", async () => {
    expect(await readTextLimited(post('{"kota":"Bandung–Kota"}'), 1024)).toBe(
      '{"kota":"Bandung–Kota"}',
    );
    expect(await readTextLimited(new Request("http://localhost/api/x"), 1024)).toBe("");
  });

  it("Content-Length di atas batas → null tanpa membaca body", async () => {
    const req = post("x".repeat(10), { "content-length": "999999" });
    expect(await readTextLimited(req, 1024)).toBeNull();
    expect(req.bodyUsed).toBe(false);
  });

  it("body chunked tanpa Content-Length berhenti dibaca dan dibatalkan begitu lewat batas", async () => {
    let pulls = 0;
    let cancelled = false;
    const endless = new ReadableStream<Uint8Array>({
      pull(ctl) {
        pulls++;
        ctl.enqueue(new Uint8Array(1024).fill(120));
      },
      cancel() {
        cancelled = true;
      },
    });
    expect(await readTextLimited(post(endless), 8 * 1024)).toBeNull();
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThan(16);
  });

  it("batas dihitung dalam byte, bukan karakter", async () => {
    // 600 karakter "é" = 1.200 byte UTF-8.
    expect(await readTextLimited(post("é".repeat(600)), 1_000)).toBeNull();
    expect(await readTextLimited(post("é".repeat(400)), 1_000)).toBe("é".repeat(400));
  });
});
