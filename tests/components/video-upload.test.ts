import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/*
 * T-z5nq: form unggah video panduan — artikel yang sudah berisi batas video menampilkan batasnya sejak
 * awal (kontrol nonaktif), bukan menolak setelah file dibaca; nama file panjang dibungkus, bukan
 * dipotong.
 */
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const { VideoUpload } = await import("@/components/guides/video-upload");

const render = (props: { full?: boolean }) =>
  renderToStaticMarkup(createElement(VideoUpload, { articleId: "a1", ...props }));

describe("VideoUpload", () => {
  it("batas tercapai → pesan batas, judul + pilih file + unggah nonaktif", () => {
    const html = render({ full: true });
    expect(html).toContain('data-testid="video-limit"');
    expect(html).toContain("sudah berisi 5 video (batas)");
    expect(html.match(/disabled=""/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it("belum penuh → tanpa pesan batas; nama file dibungkus (tanpa truncate)", () => {
    const html = render({});
    expect(html).not.toContain('data-testid="video-limit"');
    const name = /<span id="video-file-name" class="([^"]*)"/.exec(html)?.[1] ?? "";
    expect(name).toContain("[overflow-wrap:anywhere]");
    expect(name).not.toContain("truncate");
  });
});
