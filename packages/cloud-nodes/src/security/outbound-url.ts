export interface OutboundUrlOptions {
  allowHttp?: boolean;
  allowPrivateNetwork?: boolean;
}

const PRIVATE_OUTBOUND_ENV = "SOLFLOW_ALLOW_PRIVATE_OUTBOUND";

export function assertSafeOutboundUrl(rawUrl: string, options: OutboundUrlOptions = {}): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Outbound URL is invalid");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Outbound URL must use http or https");
  }
  if (url.protocol === "http:" && options.allowHttp === false) {
    throw new Error("Provider URL must use https");
  }
  if (url.username || url.password) {
    throw new Error("Outbound URL must not include credentials");
  }

  const allowPrivateNetwork = options.allowPrivateNetwork ?? getEnv(PRIVATE_OUTBOUND_ENV) === "1";
  if (!allowPrivateNetwork && isPrivateOrLocalHost(url.hostname)) {
    throw new Error("Outbound URL targets a private or local network address");
  }

  return url;
}

export function isPrivateOrLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "").replace(/\.$/, "");

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "metadata.google.internal"
  ) {
    return true;
  }

  if (host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) {
    return true;
  }

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;

  const octets = ipv4.slice(1).map(Number);
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return true;
  }

  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a === 169 && b === 254 ||
    a === 172 && b >= 16 && b <= 31 ||
    a === 192 && b === 168
  );
}

function getEnv(name: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[name];
}
