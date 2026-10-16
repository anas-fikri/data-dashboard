/*
 * Baca body permintaan sebagai teks dengan batas byte. req.text()/req.json() membaca seluruh body dulu
 * baru bisa diukur, sehingga body chunked tanpa Content-Length memakan memori sebanyak yang dikirim
 * klien (sampai batas buffer proxy). Di sini pembacaan berhenti dan stream dibatalkan begitu lewat
 * batas.
 */
export async function readTextLimited(req: Request, maxBytes: number): Promise<string | null> {
  const bytes = await readBytesLimited(req, maxBytes);
  return bytes === null ? null : new TextDecoder().decode(bytes);
}

/** Sama dengan readTextLimited, hasilnya byte mentah (mis. poster PNG). */
export async function readBytesLimited(req: Request, maxBytes: number): Promise<Uint8Array | null> {
  if (Number(req.headers.get("content-length") ?? "0") > maxBytes) return null;
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
