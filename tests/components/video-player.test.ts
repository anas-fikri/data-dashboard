import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GuideVideoPlayer } from "@/components/guides/video-player";

/*
 * T-j9j6: <track> takarir hanya untuk video bertakarir; URL same-origin berversi (takarir yang diganti
 * langsung dimuat ulang pemutar, bukan cue lama).
 */
const VID = "cmv4kljx40009oczvdmpuvid1";
const render = (captionVersion: number | null) =>
  renderToStaticMarkup(
    createElement(GuideVideoPlayer, {
      video: {
        id: VID,
        issuedAt: 0,
        title: "Unggah data",
        durationSec: 75,
        src: "https://storage/x.webm",
        poster: null,
        captionVersion,
      },
    }),
  );

describe("GuideVideoPlayer takarir", () => {
  it("tanpa takarir → tanpa <track>", () => {
    expect(render(null)).not.toContain("<track");
  });

  it("bertakarir → <track kind=captions srclang=id> ke route app dengan versi", () => {
    const html = render(1760000000123);
    expect(html).toContain('kind="captions"');
    expect(html).toContain('srcLang="id"');
    expect(html).toContain(`src="/api/guides/videos/${VID}/takarir?v=1760000000123"`);
    expect(html).toContain('label="Bahasa Indonesia"');
  });
});
