export const FLOATING_BROWSER_EMBED_ORIGINS = [
  "https://explorer.solana.com",
  "https://www.anchor-lang.com",
  "https://anchor-lang.com",
  "https://docs.solanalabs.com",
  "https://docs.anza.xyz",
  "https://faucet.solana.com",
] as const;

const DEFAULT_BASE_ORIGIN = "https://solstudio.fun";

export interface FloatingBrowserTarget {
  canEmbed: boolean;
  displayUrl: string;
  frameSrc: string;
  isExternal: boolean;
  openUrl: string;
}

function baseUrlFor(origin: string): URL {
  try {
    return new URL(origin);
  } catch {
    return new URL(DEFAULT_BASE_ORIGIN);
  }
}

function internalPath(url: URL): string {
  return `${url.pathname}${url.search}${url.hash}`;
}

export function canEmbedFloatingBrowserUrl(
  href: string,
  baseOrigin = DEFAULT_BASE_ORIGIN,
): boolean {
  const base = baseUrlFor(baseOrigin);
  const url = new URL(href, base);

  if (url.origin === base.origin) return true;
  return FLOATING_BROWSER_EMBED_ORIGINS.includes(
    url.origin as (typeof FLOATING_BROWSER_EMBED_ORIGINS)[number],
  );
}

export function resolveFloatingBrowserTarget(
  target: string,
  baseOrigin = DEFAULT_BASE_ORIGIN,
): FloatingBrowserTarget | null {
  const trimmed = target.trim();
  if (!trimmed) return null;

  const href =
    /^https?:\/\//i.test(trimmed) || trimmed.startsWith("/")
      ? trimmed
      : `https://${trimmed}`;

  try {
    const base = baseUrlFor(baseOrigin);
    const url = new URL(href, base);

    if (url.protocol !== "http:" && url.protocol !== "https:") return null;

    const isExternal = url.origin !== base.origin;
    const canEmbed = canEmbedFloatingBrowserUrl(url.toString(), base.origin);
    const sameOriginPath = internalPath(url);

    return {
      canEmbed,
      displayUrl: isExternal ? url.toString() : sameOriginPath,
      frameSrc: isExternal ? url.toString() : sameOriginPath,
      isExternal,
      openUrl: isExternal ? url.toString() : sameOriginPath,
    };
  } catch {
    return null;
  }
}
