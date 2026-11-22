// Standalone API client — REST calls replacing tRPC.
// In standalone mode, the Express server provides REST endpoints.

import type { Node, Edge } from "@xyflow/react";

const API_BASE = typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:6139";
const TOKEN_STORAGE_KEY = "solstudio-session-token";
let cachedToken: string | null = null;

/**
 * Session token printed by `solstudio view` in the URL fragment (#token=...).
 * Kept in sessionStorage so reloads work, and stripped from the address bar.
 */
export function getSessionToken(): string {
  if (typeof window === "undefined") return "";
  const match = window.location.hash.match(/(?:^#|&)token=([^&]+)/);
  if (match) {
    cachedToken = decodeURIComponent(match[1]);
    try { window.sessionStorage.setItem(TOKEN_STORAGE_KEY, cachedToken); } catch { /* storage blocked */ }
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    return cachedToken;
  }
  if (cachedToken) return cachedToken;
  try { cachedToken = window.sessionStorage.getItem(TOKEN_STORAGE_KEY); } catch { /* storage blocked */ }
  return cachedToken ?? "";
}

/** fetch() against the local CLI server with the session token and a JSON body type. */
export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("x-solstudio-token", getSessionToken());
  const method = (init.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    body: init.body ?? (method !== "GET" && method !== "HEAD" ? "{}" : undefined),
  });
}

/** WebSocket URL for live updates (browsers can't set headers on upgrades). */
export function wsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws?token=${encodeURIComponent(getSessionToken())}`;
}

export interface ProjectData {
  nodes: Node[];
  edges: Edge[];
  name: string;
  framework: string;
  version: string;
  report?: ParseReport;
}

export interface ParseReportFile {
  path: string;
  status: "parsed" | "skipped";
  reason?: string;
}

export interface ParseReport {
  framework: "anchor" | "pinocchio" | "quasar" | "unknown";
  filesParsed: number;
  filesSkipped: number;
  parsedFiles: ParseReportFile[];
  skippedFiles: ParseReportFile[];
  unsupportedConstructs: string[];
  confidence: "high" | "medium" | "low";
  confidenceReasons: string[];
}

export async function loadProject(): Promise<ProjectData> {
  const res = await apiFetch("/api/project");
  if (!res.ok) throw new Error(`Failed to load project: ${res.statusText}`);
  return res.json();
}

export async function saveProject(data: {
  nodes: Node[];
  edges: Edge[];
}): Promise<void> {
  const res = await apiFetch("/api/project", {
    method: "PUT",
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to save project: ${res.statusText}`);
}

export async function generateCode(flowData: {
  nodes: Node[];
  edges: Edge[];
}): Promise<{ files: Record<string, string>; errors: string[] }> {
  const res = await apiFetch("/api/codegen", {
    method: "POST",
    body: JSON.stringify(flowData),
  });
  if (!res.ok) throw new Error(`Codegen failed: ${res.statusText}`);
  return res.json();
}

export async function runAudit(flowData: {
  nodes: Node[];
  edges: Edge[];
}): Promise<unknown> {
  const res = await apiFetch("/api/audit", {
    method: "POST",
    body: JSON.stringify(flowData),
  });
  if (!res.ok) throw new Error(`Audit failed: ${res.statusText}`);
  return res.json();
}

export interface SourceFile {
  path: string;
  content: string;
  language: "rust" | "toml";
}

export async function fetchSourceFiles(): Promise<{ files: SourceFile[] }> {
  const res = await apiFetch("/api/source");
  if (!res.ok) throw new Error(`Failed to fetch source: ${res.statusText}`);
  return res.json();
}

export async function saveSourceFile(
  path: string,
  content: string,
): Promise<{ ok: boolean; nodes: Node[]; edges: Edge[]; warnings: string[]; report?: ParseReport }> {
  const res = await apiFetch("/api/source", {
    method: "PUT",
    body: JSON.stringify({ path, content }),
  });
  if (!res.ok) throw new Error(`Failed to save source: ${res.statusText}`);
  return res.json();
}

export async function reparseProject(): Promise<{ nodes: Node[]; edges: Edge[]; warnings: string[]; report?: ParseReport }> {
  const res = await apiFetch("/api/parse", {
    method: "POST",
  });
  if (!res.ok) throw new Error(`Re-parse failed: ${res.statusText}`);
  return res.json();
}

export interface SyncChange {
  path: string;
  status: "new" | "modified";
  beforeHash: string | null;
  diff: string;
}

export async function previewSync(): Promise<{ ok: boolean; changes: SyncChange[]; errors: string[] }> {
  const res = await apiFetch("/api/sync/preview", { method: "POST" });
  return res.json();
}

/** Write the reviewed changes. The server refuses if any file changed since the preview. */
export async function confirmSync(changes: SyncChange[]): Promise<{ ok: boolean; written: number; backupDir?: string | null; errors: string[] }> {
  const expected = Object.fromEntries(changes.map((c) => [c.path, c.beforeHash]));
  const res = await apiFetch("/api/sync", { method: "POST", body: JSON.stringify({ confirm: true, expected }) });
  return res.json();
}
