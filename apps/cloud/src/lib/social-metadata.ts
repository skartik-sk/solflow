export const CLOUD_ORIGIN = normalizeOrigin(
  process.env.NEXT_PUBLIC_CLOUD_URL ?? "https://cloud.solstudio.fun",
);
export const CLOUD_URL = `${CLOUD_ORIGIN}/`;
export const CLOUD_SITE_NAME = "SolStudio Cloud";
export const CLOUD_TITLE = "SolStudio Cloud - Maintenance Mode";
export const CLOUD_DESCRIPTION =
  "SolStudio Cloud is currently under maintenance while we upgrade the platform.";
export const CLOUD_SOCIAL_DESCRIPTION =
  "We are upgrading SolStudio Cloud. The site will be back online soon.";
export const CLOUD_OG_IMAGE_PATH = "/maintenance-social.png";
export const CLOUD_OG_IMAGE_URL = absoluteCloudUrl(CLOUD_OG_IMAGE_PATH);
export const CLOUD_OG_IMAGE_ALT = "SolStudio Cloud maintenance announcement";
export const CLOUD_OG_IMAGE_WIDTH = 1254;
export const CLOUD_OG_IMAGE_HEIGHT = 1254;
export const CLOUD_OG_IMAGE_TYPE = "image/png";

export function absoluteCloudUrl(path: string): string {
  return new URL(path, CLOUD_ORIGIN).toString();
}

export function normalizeOrigin(value: string): string {
  return value.replace(/\/+$/, "");
}
