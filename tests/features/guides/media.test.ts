import { describe, expect, it } from "vitest";
import {
  CAPTION_MAX_BYTES,
  VIDEO_MAX_BYTES,
  captionProblem,
  formatDuration,
  isPng,
  isVtt,
  sniffVideo,
  videoExtOf,
  videoProblem,
} from "@/features/guides/media";

/* T-021 AC2/AC5: signature video (mp4 ftyp, webm EBML+DocType) dan PNG dari byte awal, bukan ekstensi. */
const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(
    parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)),
  );
const MP4 = bytes([0, 0, 0, 0x1c], "ftypisom", [0, 0, 2, 0]);
const EBML = [0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01];
const WEBM = bytes(EBML, [0x42, 0x82, 0x84], "webm", [0x42, 0x87, 0x81, 0x04]);
const MKV = bytes(EBML, [0x42, 0x82, 0x88], "matroska", [0x42, 0x87, 0x81, 0x04]);
const PNG = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "IHDR");

describe("media video panduan (T-021)", () => {
  it("ekstensi hanya mp4/webm (huruf besar boleh)", () => {
    expect(videoExtOf("Demo.MP4")).toBe("mp4");
    expect(videoExtOf("a.webm")).toBe("webm");
    expect(videoExtOf("a.mkv")).toBeNull();
    expect(videoExtOf("a.mp4.exe")).toBeNull();
  });

  it("AC2: mp4 butuh ftyp di byte 4–8; webm butuh EBML + DocType webm (mkv ditolak)", () => {
    expect(sniffVideo("mp4", MP4)).toBe(true);
    expect(sniffVideo("mp4", MKV)).toBe(false); // .mkv diganti .mp4
    expect(sniffVideo("webm", WEBM)).toBe(true);
    expect(sniffVideo("webm", MKV)).toBe(false); // .mkv diganti .webm
    expect(sniffVideo("webm", MP4)).toBe(false);
    expect(sniffVideo("mp4", new Uint8Array(4))).toBe(false);
  });

  it("AC2: pra-cek → INVALID_FORMAT / FILE_TOO_LARGE dengan pesan", () => {
    expect(videoProblem("a.mp4", 10, MKV)?.code).toBe("INVALID_FORMAT");
    expect(videoProblem("a.mov", 10, MP4)?.code).toBe("INVALID_FORMAT");
    expect(videoProblem("a.mp4", VIDEO_MAX_BYTES + 1, MP4)?.code).toBe("FILE_TOO_LARGE");
    expect(videoProblem("a.mp4", VIDEO_MAX_BYTES, MP4)).toBeNull();
  });

  it("AC5: PNG dari 8 byte signature", () => {
    expect(isPng(PNG)).toBe(true);
    expect(isPng(bytes([0xff, 0xd8, 0xff, 0xe0], "JFIF0000"))).toBe(false);
    expect(isPng(PNG.subarray(0, 7))).toBe(false);
  });

  it("durasi m:ss / h:mm:ss", () => {
    expect(formatDuration(75)).toBe("1:15");
    expect(formatDuration(360)).toBe("6:00");
    expect(formatDuration(3725)).toBe("1:02:05");
  });
});

/* T-j9j6: takarir WebVTT — signature "WEBVTT" di awal teks UTF-8 sah, tanpa NUL; .vtt ≤ 200 KB. */
describe("takarir WebVTT (T-j9j6)", () => {
  const enc = (s: string) => new TextEncoder().encode(s);
  it("WEBVTT + baris baru / spasi / akhir file; BOM UTF-8 boleh", () => {
    expect(isVtt(enc("WEBVTT\n\n00:00.000 --> 00:02.000\nHalo"))).toBe(true);
    expect(isVtt(enc("WEBVTT - Panduan unggah\r\n"))).toBe(true);
    expect(isVtt(enc("WEBVTT"))).toBe(true);
    expect(isVtt(new Uint8Array([0xef, 0xbb, 0xbf, ...enc("WEBVTT\n")]))).toBe(true);
  });
  it("bukan WebVTT: SRT, WEBVTTX, huruf kecil, UTF-8 rusak, NUL → ditolak", () => {
    expect(isVtt(enc("1\n00:00:00,000 --> 00:00:02,000\nHalo"))).toBe(false);
    expect(isVtt(enc("WEBVTTX\n"))).toBe(false);
    expect(isVtt(enc("webvtt\n"))).toBe(false);
    expect(isVtt(new Uint8Array([...enc("WEBVTT\n"), 0xff, 0xfe]))).toBe(false);
    expect(isVtt(enc("WEBVTT\n\u0000"))).toBe(false);
    expect(isVtt(new Uint8Array())).toBe(false);
  });
  it("pra-cek browser: ekstensi .vtt dan ukuran ≤ 200 KB", () => {
    expect(captionProblem("narasi.vtt", 1000)).toBeNull();
    expect(captionProblem("narasi.VTT", CAPTION_MAX_BYTES)).toBeNull();
    expect(captionProblem("narasi.srt", 1000)?.code).toBe("INVALID_FORMAT");
    expect(captionProblem("narasi.vtt", CAPTION_MAX_BYTES + 1)?.code).toBe("FILE_TOO_LARGE");
  });
});
