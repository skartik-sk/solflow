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

  if (!privateNetworkAllowed(options) && isPrivateOrLocalHost(url.hostname)) {
    throw new Error("Outbound URL targets a private or local network address");
  }

  return url;
}

/**
 * Like assertSafeOutboundUrl, but also resolves the hostname and rejects it
 * when any resolved address is private, loopback, link-local or metadata.
 * Catches names such as 127.0.0.1.nip.io that point back at internal hosts.
 */
export async function assertSafeOutboundUrlResolved(
  rawUrl: string,
  options: OutboundUrlOptions = {},
): Promise<URL> {
  const url = assertSafeOutboundUrl(rawUrl, options);
  if (privateNetworkAllowed(options)) return url;

  const host = stripHostBrackets(url.hostname);
  if (parseIPv4(host) || parseIPv6(host)) return url; // literal, already checked

  let addresses: string[];
  try {
    addresses = await (outboundResolver ?? defaultResolver)(host);
  } catch {
    throw new Error("Outbound URL host could not be resolved");
  }
  if (addresses.length === 0) {
    throw new Error("Outbound URL host could not be resolved");
  }
  for (const address of addresses) {
    if (isPrivateOrLocalHost(address)) {
      throw new Error("Outbound URL resolves to a private or local network address");
    }
  }
  return url;
}

export interface SafeOutboundFetchOptions extends OutboundUrlOptions {
  /** Per-request timeout in ms. Defaults to 15 s. */
  timeoutMs?: number;
  /** Max redirects to follow, each re-validated. Defaults to 3. */
  maxRedirects?: number;
}

export const DEFAULT_OUTBOUND_TIMEOUT_MS = 15_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
// Headers kept when a redirect leaves the original origin; everything else
// (auth, API keys, custom secrets) is dropped.
const CROSS_ORIGIN_KEPT_HEADERS = new Set(["accept", "content-type", "user-agent"]);

/**
 * fetch() for user-influenced URLs: validates the URL (including DNS), applies a
 * per-request timeout merged with the run signal, and follows redirects
 * manually so every hop is validated again.
 */
export async function safeOutboundFetch(
  rawUrl: string | URL,
  init: RequestInit = {},
  options: SafeOutboundFetchOptions = {},
): Promise<Response> {
  if (typeof fetch !== "function") {
    throw new Error("Global fetch is not available in this runtime");
  }
  const maxRedirects = options.maxRedirects ?? 3;
  const signal = withRequestTimeout(init.signal ?? undefined, options.timeoutMs);
  let url = await assertSafeOutboundUrlResolved(rawUrl.toString(), options);
  let requestInit: RequestInit = { ...init, signal, redirect: "manual" };

  for (let hop = 0; ; hop += 1) {
    const response = await fetch(url.toString(), requestInit);
    const location = response.headers?.get?.("location");
    if (!REDIRECT_STATUSES.has(response.status) || !location) {
      return response;
    }
    if (hop >= maxRedirects) {
      throw new Error(`Outbound request exceeded ${maxRedirects} redirects`);
    }

    const next = await assertSafeOutboundUrlResolved(new URL(location, url).toString(), options);
    const method = (requestInit.method ?? "GET").toUpperCase();
    const nextInit: RequestInit = { ...requestInit };
    if (
      response.status === 303 ||
      ((response.status === 301 || response.status === 302) && method === "POST")
    ) {
      nextInit.method = method === "HEAD" ? "HEAD" : "GET";
      delete nextInit.body;
    }
    if (next.origin !== url.origin) {
      nextInit.headers = stripCrossOriginHeaders(requestInit.headers);
    }
    url = next;
    requestInit = nextInit;
  }
}

/** Merge the run signal with a per-request timeout (default 15 s). */
export function withRequestTimeout(
  signal?: AbortSignal,
  timeoutMs: number = DEFAULT_OUTBOUND_TIMEOUT_MS,
): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!signal) return timeout;
  const any = (AbortSignal as { any?: (signals: AbortSignal[]) => AbortSignal }).any;
  if (typeof any === "function") return any([signal, timeout]);

  const controller = new AbortController();
  const abort = (source: AbortSignal) => () => controller.abort(source.reason);
  if (signal.aborted) controller.abort(signal.reason);
  signal.addEventListener("abort", abort(signal), { once: true });
  timeout.addEventListener("abort", abort(timeout), { once: true });
  return controller.signal;
}

type OutboundResolver = (hostname: string) => Promise<string[]>;
let outboundResolver: OutboundResolver | undefined;

/** Override DNS resolution (tests, or runtimes without node:dns). Pass undefined to reset. */
export function setOutboundResolver(resolver: OutboundResolver | undefined): void {
  outboundResolver = resolver;
}

async function defaultResolver(hostname: string): Promise<string[]> {
  const proc = (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }).process;
  let dns = proc?.getBuiltinModule?.("node:dns") as
    | { promises: { lookup(host: string, opts: object): Promise<Array<{ address: string }>> } }
    | undefined;
  if (!dns) {
    const specifier = "node:dns";
    dns = await import(/* webpackIgnore: true */ /* @vite-ignore */ specifier);
  }
  const results = await dns!.promises.lookup(hostname, { all: true, verbatim: true });
  return results.map((entry) => entry.address);
}

function stripCrossOriginHeaders(headers: RequestInit["headers"]): Record<string, string> {
  const out: Record<string, string> = {};
  new Headers(headers ?? {}).forEach((value, key) => {
    if (CROSS_ORIGIN_KEPT_HEADERS.has(key.toLowerCase())) out[key] = value;
  });
  return out;
}

function privateNetworkAllowed(options: OutboundUrlOptions): boolean {
  return options.allowPrivateNetwork ?? getEnv(PRIVATE_OUTBOUND_ENV) === "1";
}

function stripHostBrackets(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "").replace(/\.$/, "");
}

export function isPrivateOrLocalHost(hostname: string): boolean {
  const host = stripHostBrackets(hostname);
  if (!host) return true;

  const v4 = parseIPv4(host);
  if (v4) return isBlockedIPv4(v4);
  const v6 = parseIPv6(host);
  if (v6) return isBlockedIPv6(v6);

  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "metadata.google.internal" ||
    // Single-label names resolve through search domains (e.g. "metadata", "kubernetes").
    !host.includes(".")
  );
}

function parseIPv4(host: string): number[] | null {
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return null;
  const octets = match.slice(1).map(Number);
  if (octets.some((octet) => octet > 255)) return null;
  return octets;
}

function isBlockedIPv4([a, b, c]: number[]): boolean {
  return (
    a === 0 || // 0.0.0.0/8
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT, incl. 100.100.100.200 metadata
    (a === 169 && b === 254) || // link-local, incl. 169.254.169.254 metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224 // multicast, reserved, broadcast
  );
}

/** Parse an IPv6 literal (with optional embedded IPv4 tail) into 16 bytes. */
function parseIPv6(host: string): number[] | null {
  if (!host.includes(":")) return null;
  let head = host.split("%")[0];
  const lastColon = head.lastIndexOf(":");
  const maybeV4 = head.slice(lastColon + 1);
  if (maybeV4.includes(".")) {
    const v4 = parseIPv4(maybeV4);
    if (!v4) return null;
    const hex = (hi: number, lo: number) => ((hi << 8) | lo).toString(16);
    head = `${head.slice(0, lastColon + 1)}${hex(v4[0], v4[1])}:${hex(v4[2], v4[3])}`;
  }

  const groupsNeeded = 8;
  const parts = head.split("::");
  if (parts.length > 2) return null;
  const parseGroups = (part: string) => (part ? part.split(":") : []);
  const left = parseGroups(parts[0]);
  const right = parts.length === 2 ? parseGroups(parts[1]) : [];
  if (left.some((g) => g === "") || right.some((g) => g === "")) return null;
  const missing = groupsNeeded - left.length - right.length;
  if (parts.length === 2 ? missing < 0 : missing !== 0) return null;

  const groups = [...left, ...Array(parts.length === 2 ? missing : 0).fill("0"), ...right];
  const bytes: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(group)) return null;
    const value = parseInt(group, 16);
    bytes.push(value >> 8, value & 0xff);
  }
  return bytes.length === 16 ? bytes : null;
}

function isBlockedIPv6(b: number[]): boolean {
  const zeroPrefix = (n: number) => b.slice(0, n).every((x) => x === 0);
  if (zeroPrefix(16)) return true; // ::
  if (zeroPrefix(15) && b[15] === 1) return true; // ::1
  // IPv4-mapped ::ffff:a.b.c.d and IPv4-compatible ::a.b.c.d
  if (zeroPrefix(10) && ((b[10] === 0xff && b[11] === 0xff) || (b[10] === 0 && b[11] === 0))) {
    return isBlockedIPv4(b.slice(12));
  }
  // NAT64 64:ff9b::/96
  if (b[0] === 0 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && b.slice(4, 12).every((x) => x === 0)) {
    return isBlockedIPv4(b.slice(12));
  }
  if (b[0] === 0x20 && b[1] === 0x02) return isBlockedIPv4(b.slice(2, 6)); // 6to4
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0 && b[3] === 0) return true; // Teredo
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x0d && b[3] === 0xb8) return true; // documentation
  if ((b[0] & 0xfe) === 0xfc) return true; // fc00::/7 ULA (incl. fd00:ec2::254)
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return true; // fe80::/10 link-local
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0xc0) return true; // fec0::/10 site-local
  if (b[0] === 0xff) return true; // multicast
  return false;
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
