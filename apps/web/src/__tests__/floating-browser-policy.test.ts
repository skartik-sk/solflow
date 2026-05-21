import { describe, expect, it } from "vitest";
import {
  canEmbedFloatingBrowserUrl,
  resolveFloatingBrowserTarget,
} from "../lib/floating-browser-policy";

const origin = "https://solstudio.fun";

describe("floating browser policy", () => {
  it("keeps same-origin docs embeddable with a relative frame src", () => {
    expect(resolveFloatingBrowserTarget("/docs", origin)).toEqual({
      canEmbed: true,
      displayUrl: "/docs",
      frameSrc: "/docs",
      isExternal: false,
      openUrl: "/docs",
    });
  });

  it("allows deployed program links on Solana Explorer", () => {
    const explorer =
      "https://explorer.solana.com/address/11111111111111111111111111111111?cluster=devnet";

    expect(canEmbedFloatingBrowserUrl(explorer, origin)).toBe(true);
    expect(resolveFloatingBrowserTarget(explorer, origin)).toMatchObject({
      canEmbed: true,
      frameSrc: explorer,
      isExternal: true,
      openUrl: explorer,
    });
  });

  it("refuses arbitrary external iframes so they can open in a new tab instead", () => {
    const target = resolveFloatingBrowserTarget("example.com", origin);

    expect(target).toMatchObject({
      canEmbed: false,
      displayUrl: "https://example.com/",
      isExternal: true,
      openUrl: "https://example.com/",
    });
  });
});
