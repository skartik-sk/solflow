export type CloudRuntimeMode = "api" | "worker" | "all";

const VALID_MODES = new Set<CloudRuntimeMode>(["api", "worker", "all"]);

export function getCloudRuntimeMode(): CloudRuntimeMode {
  const raw = process.env.CLOUD_RUNTIME_MODE?.toLowerCase();
  if (raw && VALID_MODES.has(raw as CloudRuntimeMode)) {
    return raw as CloudRuntimeMode;
  }

  return process.env.NODE_ENV === "production" ? "api" : "all";
}

export function shouldRunWorkersInThisProcess(): boolean {
  const mode = getCloudRuntimeMode();
  return mode === "worker" || mode === "all";
}

export function shouldApiStartEmbeddedWorkers(): boolean {
  return getCloudRuntimeMode() === "all";
}

export function logCloudRuntimeEvent(
  event: string,
  data: Record<string, unknown> = {},
): void {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "info",
      component: "cloud-runtime",
      event,
      mode: getCloudRuntimeMode(),
      ...data,
    }),
  );
}
