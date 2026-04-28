export const CLOUD_ORIGIN = normalizeOrigin(
  process.env.NEXT_PUBLIC_CLOUD_URL ?? "https://cloud.solstudio.fun",
);
export const CLOUD_URL = `${CLOUD_ORIGIN}/`;
export const CLOUD_SITE_NAME = "SolStudio Cloud";
export const CLOUD_TITLE = "SolStudio Cloud - Solana Workflow Automation";
export const CLOUD_DESCRIPTION =
  "Automate your Solana operations with visual workflows. DeFi, tokens, monitoring - no code required.";
export const CLOUD_SOCIAL_DESCRIPTION =
  "Build powerful Solana workflows for DeFi. Just drag, connect, deploy.";
export const CLOUD_OG_IMAGE_PATH = "/cloud-og.png";
export const CLOUD_OG_IMAGE_URL = absoluteCloudUrl(CLOUD_OG_IMAGE_PATH);
export const CLOUD_OG_IMAGE_ALT =
  "SolStudio Cloud visual workflow automation for Solana operations";
export const CLOUD_OG_IMAGE_WIDTH = 1200;
export const CLOUD_OG_IMAGE_HEIGHT = 630;
export const CLOUD_OG_IMAGE_TYPE = "image/png";

export function absoluteCloudUrl(path: string): string {
  return new URL(path, CLOUD_ORIGIN).toString();
}

export function normalizeOrigin(value: string): string {
  return value.replace(/\/+$/, "");
}
