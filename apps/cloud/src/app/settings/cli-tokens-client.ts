// Browser client for the session-authenticated /api/cli/token route
// (owner-scoped list, create, revoke). The plaintext token only exists in the
// create response; the server stores a SHA-256 hash.

export interface CliTokenRow {
  id: string;
  name: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface CreatedCliToken {
  token: string;
  tokenPreview: string;
  apiKey: { id: string; name: string | null; expiresAt: string | null; createdAt: string };
}

export const TOKEN_EXPIRY_OPTIONS = [
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "1 year" },
  { days: 0, label: "Never" },
] as const;

export class CliTokenError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

async function call<T>(fetcher: FetchLike, path: string, init?: RequestInit): Promise<T> {
  const res = await fetcher(path, {
    ...init,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new CliTokenError(body.error ?? `Request failed (${res.status})`, res.status);
  return body as T;
}

export async function listCliTokens(fetcher: FetchLike = fetch): Promise<CliTokenRow[]> {
  const data = await call<{ tokens: CliTokenRow[] }>(fetcher, "/api/cli/token");
  return data.tokens ?? [];
}

export function createCliToken(name: string, expiresInDays: number, fetcher: FetchLike = fetch): Promise<CreatedCliToken> {
  const trimmed = name.trim().slice(0, 100);
  return call<CreatedCliToken>(fetcher, "/api/cli/token", {
    method: "POST",
    body: JSON.stringify({ name: trimmed || undefined, expiresInDays }),
  });
}

export async function revokeCliToken(id: string, fetcher: FetchLike = fetch): Promise<void> {
  await call<{ ok: boolean }>(fetcher, `/api/cli/token?id=${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** The command to paste after creating a token. */
export function cliLoginCommand(endpoint: string, token: string): string {
  return `solstudio cloud login --endpoint ${endpoint} --token ${token}`;
}
