// Standalone API client — REST calls replacing tRPC.
// In standalone mode, the Express server provides REST endpoints.

import type { Node, Edge } from "@xyflow/react";

const API_BASE = typeof window !== "undefined" ? window.location.origin : "http://localhost:6139";

export interface ProjectData {
  nodes: Node[];
  edges: Edge[];
  name: string;
  framework: string;
  version: string;
}

export async function loadProject(): Promise<ProjectData> {
  const res = await fetch(`${API_BASE}/api/project`);
  if (!res.ok) throw new Error(`Failed to load project: ${res.statusText}`);
  return res.json();
}

export async function saveProject(data: {
  nodes: Node[];
  edges: Edge[];
}): Promise<void> {
  const res = await fetch(`${API_BASE}/api/project`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to save project: ${res.statusText}`);
}

export async function generateCode(flowData: {
  nodes: Node[];
  edges: Edge[];
}): Promise<{ files: Record<string, string>; errors: string[] }> {
  const res = await fetch(`${API_BASE}/api/codegen`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(flowData),
  });
  if (!res.ok) throw new Error(`Codegen failed: ${res.statusText}`);
  return res.json();
}

export async function runAudit(flowData: {
  nodes: Node[];
  edges: Edge[];
}): Promise<unknown> {
  const res = await fetch(`${API_BASE}/api/audit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  const res = await fetch(`${API_BASE}/api/source`);
  if (!res.ok) throw new Error(`Failed to fetch source: ${res.statusText}`);
  return res.json();
}

export async function saveSourceFile(
  path: string,
  content: string,
): Promise<{ ok: boolean; nodes: Node[]; edges: Edge[]; warnings: string[] }> {
  const res = await fetch(`${API_BASE}/api/source`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, content }),
  });
  if (!res.ok) throw new Error(`Failed to save source: ${res.statusText}`);
  return res.json();
}

export async function reparseProject(): Promise<{ nodes: Node[]; edges: Edge[]; warnings: string[] }> {
  const res = await fetch(`${API_BASE}/api/parse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Re-parse failed: ${res.statusText}`);
  return res.json();
}
