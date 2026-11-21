// Reduces a project's flowData (untrusted JSON) to a tiny thumbnail shape on
// the server, so the full graph never reaches the client.

export type ThumbKind =
  | "program"
  | "instruction"
  | "account"
  | "state"
  | "constraint"
  | "error"
  | "event"
  | "other";

export type Thumb = {
  /** Node positions in 0..1 of the graph's bounding box, aspect kept: x in 0..w, y in 0..h. */
  nodes: { t: ThumbKind; x: number; y: number }[];
  /** Index pairs into `nodes`. */
  edges: [number, number][];
  w: number;
  h: number;
};

const MAX_NODES = 14;
const MAX_EDGES = 24;
const KINDS = new Set<ThumbKind>(["program", "instruction", "account", "state", "constraint", "error", "event"]);

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function toThumb(flowData: unknown): Thumb | null {
  if (!isObj(flowData) || !Array.isArray(flowData.nodes)) return null;

  const ids: string[] = [];
  const raw: { t: ThumbKind; x: number; y: number }[] = [];
  for (const n of flowData.nodes) {
    if (raw.length >= MAX_NODES) break;
    if (!isObj(n) || typeof n.id !== "string" || !isObj(n.position)) continue;
    const x = num(n.position.x);
    const y = num(n.position.y);
    if (x === null || y === null) continue;
    const t = typeof n.type === "string" && KINDS.has(n.type as ThumbKind) ? (n.type as ThumbKind) : "other";
    ids.push(n.id);
    raw.push({ t, x, y });
  }
  if (raw.length === 0) return null;

  const xs = raw.map((n) => n.x);
  const ys = raw.map((n) => n.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const rangeX = Math.max(...xs) - minX;
  const rangeY = Math.max(...ys) - minY;
  const span = Math.max(rangeX, rangeY) || 1;
  const round = (v: number) => Math.round(v * 1000) / 1000;
  const nodes = raw.map((n) => ({ t: n.t, x: round((n.x - minX) / span), y: round((n.y - minY) / span) }));

  const edges: [number, number][] = [];
  if (Array.isArray(flowData.edges)) {
    const index = new Map(ids.map((id, i) => [id, i]));
    const seen = new Set<string>();
    for (const e of flowData.edges) {
      if (edges.length >= MAX_EDGES) break;
      if (!isObj(e) || typeof e.source !== "string" || typeof e.target !== "string") continue;
      const a = index.get(e.source);
      const b = index.get(e.target);
      if (a === undefined || b === undefined || a === b) continue;
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([a, b]);
    }
  }

  return { nodes, edges, w: round(rangeX / span), h: round(rangeY / span) };
}
