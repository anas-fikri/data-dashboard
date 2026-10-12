/*
 * Baca body permintaan sebagai teks dengan batas byte. req.text()/req.json() membaca seluruh body dulu
 * baru bisa diukur, sehingga body chunked tanpa Content-Length memakan memori sebanyak yang dikirim
 * klien (sampai batas buffer proxy). Di sini pembacaan berhenti dan stream dibatalkan begitu lewat
 * batas.
 */
export async function readTextLimited(req: Request, maxBytes: number): Promise<string | null> {
  if (Number(req.headers.get("content-length") ?? "0") > maxBytes) return null;
  if (!req.body) return "";
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
  return new TextDecoder().decode(Buffer.concat(chunks));
}
