export interface OutboundUrlOptions {
  allowHttp?: boolean;
  allowPrivateNetwork?: boolean;
}

const PRIVATE_OUTBOUND_ENV = "SOLFLOW_ALLOW_PRIVATE_OUTBOUND";
const SENSITIVE_QUERY_KEY_RE = /key|token|secret|auth|password|credential|bearer|uuid|jwt|signature/i;
const SENSITIVE_PATH_SEGMENT_RE = /key|token|secret|auth|password|credential|bearer|uuid|jwt/i;
const HIGH_ENTROPY_PATH_SEGMENT_RE = /^(?=.{16,}$)(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9._~=-]+$/;

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

export function redactUrlSecrets(rawUrl: string | URL): string {
  const clean = new URL(rawUrl.toString());
  clean.username = "";
  clean.password = "";

  const sensitiveQueryKeys: string[] = [];
  clean.searchParams.forEach((_value, key) => {
    if (SENSITIVE_QUERY_KEY_RE.test(key)) {
      sensitiveQueryKeys.push(key);
    }
  });

  for (const key of sensitiveQueryKeys) {
    clean.searchParams.set(key, "[redacted]");
  }

  clean.pathname = clean.pathname
    .split("/")
    .map((segment) => {
      if (!segment) return segment;
      const decoded = safeDecodeURIComponent(segment);
      if (
        SENSITIVE_PATH_SEGMENT_RE.test(decoded) ||
        HIGH_ENTROPY_PATH_SEGMENT_RE.test(decoded)
      ) {
        return "[redacted]";
      }
      return segment;
    })
    .join("/");

  if (clean.hash && SENSITIVE_QUERY_KEY_RE.test(clean.hash)) {
    clean.hash = "#[redacted]";
  }

  return clean.toString();
}

function getEnv(name: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[name];
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
