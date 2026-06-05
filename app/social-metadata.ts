export const SITE_ORIGIN = normalizeOrigin(
  process.env.NEXT_PUBLIC_APP_URL ?? "https://solstudio.fun",
);
export const SITE_URL = `${SITE_ORIGIN}/`;
export const SITE_NAME = "SolStudio";
export const SITE_TITLE = "SolStudio — Visual Solana Contract Builder";
export const SITE_DESCRIPTION =
  "Build production-ready Solana smart contracts visually. Drag, drop, connect nodes and generate Anchor, Pinocchio, or Quasar Rust code in real-time.";
export const SOCIAL_DESCRIPTION =
  "Build production-ready Solana smart contracts visually. No Rust required.";
export const DEFAULT_OG_IMAGE_PATH = "/og.png";
export const DEFAULT_OG_IMAGE_URL = absoluteUrl(DEFAULT_OG_IMAGE_PATH);
export const DEFAULT_OG_IMAGE_ALT =
  "SolStudio visual Solana program builder with graph, CLI, audit, and cloud workflows";
export const DEFAULT_OG_IMAGE_WIDTH = 1200;
export const DEFAULT_OG_IMAGE_HEIGHT = 630;
export const DEFAULT_OG_IMAGE_TYPE = "image/png";

export function absoluteUrl(path: string): string {
  return new URL(path, SITE_ORIGIN).toString();
}

export function normalizeOrigin(value: string): string {
  return value.replace(/\/+$/, "");
}