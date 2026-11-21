"use client";

import { ArrowRight, GripVertical, Search } from "lucide-react";
import { Collapse, Field, Roll, Stage, type Act, type Point } from "../kit";
import { CLOUD_DOCS_URL, NODES, NodeChip, type NodeId } from "./shared";
import "./Integrations.css";

/*
 * Integrations: the editor's node palette (CloudNodePalette: "Nodes" with its
 * count, "Search nodes...", category pills, rows grouped by category) beside a
 * slice of canvas. "jup" is typed, the list narrows to the Jupiter nodes
 * (58 nodes, 16 for "j", 10 for "ju" and "jup", counted from the registry),
 * Jupiter Direct Swap is dragged out, dropped, and wired to Pyth Price.
 */

type S = {
  q: string;
  focused: boolean;
  hover: boolean;
  lifted: boolean;
  ghost: Point | null;
  placed: boolean;
  wired: boolean;
};

const START: S = { q: "", focused: false, hover: false, lifted: false, ghost: null, placed: false, wired: false };
const POSTER: S = { q: "jup", focused: false, hover: false, lifted: false, ghost: null, placed: true, wired: true };

/* Rows in the faux list. `found` rows only show once a search finds them. */
const ROWS: { id: NodeId; found?: boolean }[] = [
  { id: "pyth" },
  { id: "jupPrice" },
  { id: "jupSwap", found: true },
  { id: "heliusWallet" },
  { id: "jupOrder", found: true },
  { id: "metaplexGet" },
  { id: "jupPortfolio", found: true },
  { id: "squads" },
  { id: "jupSearch", found: true },
  { id: "jitoBundle" },
  { id: "telegram" },
  { id: "switchboard" },
  { id: "dialect" },
  { id: "transfer" },
];

const COUNT: Record<string, [number, number]> = { "": [58, 47], j: [16, 16], ju: [10, 10], jup: [10, 10] };

const shows = (q: string, r: (typeof ROWS)[number]) => (q ? NODES[r.id].label.toLowerCase().includes(q) : !r.found);

/* Canvas geometry, in stage px. Wide: left to right, as the editor lays a
   graph out. Compact: top to bottom, so each label fits whole. */
type P = { x: number; y: number };
const GEO: Record<"wide" | "compact", { w: number; h: number; dir: "x" | "y"; at: Record<"cron" | "pyth" | "swap", P> }> = {
  wide: { w: 176, h: 76, dir: "x", at: { cron: { x: 276, y: 182 }, pyth: { x: 488, y: 182 }, swap: { x: 700, y: 182 } } },
  compact: { w: 200, h: 76, dir: "y", at: { cron: { x: -400, y: 0 }, pyth: { x: 79, y: 336 }, swap: { x: 79, y: 452 } } },
};
/* Where the hand takes the row (a fraction of the row's width) and the row's
   width per layout; the held copy keeps that offset and lands on the new
   node's head, so the node opens around it */
const GRAB = { x: 0.3, h: 32, row: { wide: 236, compact: 346 } };
const grabX = (layout: "wide" | "compact") => GRAB.x * GRAB.row[layout];

async function script(a: Act<S>) {
  await a.wait(500);
  await a.click({ at: "search", x: 0.62, y: 0.5 });
  await a.set({ focused: true });
  await a.wait(200);
  a.mark("type");
  await a.type("q", "jup", { interval: 150 });
  await a.wait(700);
  a.mark("pick");
  await a.move({ at: "row-jupSwap", x: GRAB.x, y: 0.5 });
  await a.set({ hover: true, focused: false });
  await a.wait(250);
  const g = GEO[a.layout];
  await a.drag({ at: "drop", x: grabX(a.layout) / g.w, y: 22 / g.h }, (at) => a.put({ lifted: true, ghost: at, hover: false }), { duration: 1100 });
  a.mark("drop");
  await a.set({ lifted: false, placed: true });
  await a.wait(380);
  await a.set({ wired: true });
  await a.move({ wide: { x: 840, y: 360 }, compact: { x: 320, y: 420 } });
  await a.wait(2600);
}

function Palette({ s, compact }: { s: S; compact: boolean }) {
  const [all, actions] = COUNT[s.q] ?? COUNT.jup;
  return (
    <div className="in-pal">
      <div className="in-pal__head">
        <span className="in-pal__title">Nodes</span>
        <span className="in-mono in-faint">
          <Roll align="end">{String(all)}</Roll>
        </span>
      </div>
      <div className="in-pal__search">
        <Field
          value={s.q}
          placeholder="Search nodes..."
          focused={s.focused}
          leading={<Search size={14} strokeWidth={2} className="in-faint" />}
          box={{ "data-target": "search" }}
        />
      </div>
      <Collapse open={!s.q}>
        <div className="in-pills">
          <span className="in-pill" data-on>
            All
          </span>
          <span className="in-pill">Triggers</span>
          <span className="in-pill">Actions</span>
          {!compact && <span className="in-pill">Logic</span>}
        </div>
      </Collapse>
      <div className="in-group" data-cat="action">
        <i className="in-group__dot" />
        <span>Actions</span>
        <span className="in-mono in-faint in-group__n">
          <Roll align="end">{String(actions)}</Roll>
        </span>
      </div>
      <div className="in-rows">
        {ROWS.map((r) => (
          <Collapse key={r.id} open={shows(s.q, r)}>
            <div className="in-row" data-target={`row-${r.id}`} data-cursor="open" data-held={(r.id === "jupSwap" && (s.hover || s.lifted)) || undefined}>
              <NodeChip id={r.id} size={22} />
              <span className="in-row__label">{NODES[r.id].label}</span>
              <GripVertical size={12} strokeWidth={2} className="in-row__grip" aria-hidden />
            </div>
          </Collapse>
        ))}
      </div>
    </div>
  );
}

function CanvasNode({ id, k, v, x, y, w, h, className = "", on }: { id: NodeId; k: string; v?: string; x: number; y: number; w: number; h: number; className?: string; on?: boolean }) {
  return (
    <div className={`in-node ${className}`} data-cat={NODES[id].cat} data-on={on || undefined} style={{ left: x, top: y, width: w, height: h }}>
      <div className="in-node__head">
        <NodeChip id={id} size={22} />
        <span className="in-node__label">{NODES[id].label}</span>
      </div>
      <div className="in-node__body">
        <span className="in-node__k">{k}</span>
        {v && <span className="in-node__v">{v}</span>}
      </div>
    </div>
  );
}

function Canvas({ s, compact }: { s: S; compact: boolean }) {
  const g = GEO[compact ? "compact" : "wide"];
  // Handles: out on the right (wide) or the bottom (compact), in on the opposite side
  const out = (p: P) => (g.dir === "x" ? { x: p.x + g.w, y: p.y + g.h / 2 } : { x: p.x + g.w / 2, y: p.y + g.h });
  const inn = (p: P) => (g.dir === "x" ? { x: p.x, y: p.y + g.h / 2 } : { x: p.x + g.w / 2, y: p.y });
  const edge = (a: P, b: P) => {
    const f = out(a);
    const t = inn(b);
    if (g.dir === "y") return `M${f.x} ${f.y}V${t.y}`;
    const m = (f.x + t.x) / 2;
    return `M${f.x} ${f.y}C${m} ${f.y} ${m} ${t.y} ${t.x} ${t.y}`;
  };
  const { cron, pyth, swap } = g.at;
  const dot = (p: { x: number; y: number }, extra?: { className?: string; "data-on"?: true }) => <circle cx={p.x} cy={p.y} r={4.5} {...extra} />;
  return (
    <>
      <svg className="in-edges" width="100%" height="100%" aria-hidden>
        {!compact && <path d={edge(cron, pyth)} className="in-edge" />}
        <path d={edge(pyth, swap)} className="in-edge in-edge--new" pathLength={1} data-on={s.wired || undefined} />
        {!compact && dot(out(cron))}
        {dot(inn(pyth))}
        {dot(out(pyth))}
        {dot(inn(swap), { className: "in-handle--new", "data-on": s.placed || undefined })}
      </svg>
      {!compact && <CanvasNode id="cron" k="*/5 * * * *" v="UTC" x={cron.x} y={cron.y} w={g.w} h={g.h} />}
      <CanvasNode id="pyth" k="SOL/USD" v="$138.42" x={pyth.x} y={pyth.y} w={g.w} h={g.h} />
      <CanvasNode id="jupSwap" k="SOL → USDC" x={swap.x} y={swap.y} w={g.w} h={g.h} className="in-node--new" on={s.placed} />
      <div className="in-drop" data-target="drop" style={{ left: swap.x, top: swap.y, width: g.w, height: g.h }} aria-hidden />
      <div
        className="in-ghost"
        data-on={(s.lifted && s.ghost) || undefined}
        style={{ width: g.w, ...(s.ghost ? { transform: `translate(${s.ghost.x - grabX(compact ? "compact" : "wide")}px, ${s.ghost.y - GRAB.h / 2}px)` } : null) }}
        aria-hidden
      >
        <div className="in-row in-row--held">
          <NodeChip id="jupSwap" size={22} />
          <span className="in-row__label">Jupiter Direct Swap</span>
        </div>
      </div>
    </>
  );
}

export function Integrations() {
  return (
    <section className="sl-section sl-integrations" aria-labelledby="integrations-title">
      <div className="sl-wrap in-layout">
        <div className="in-copy" data-sl-reveal>
          <h2 id="integrations-title" className="sl-h2">
            58 nodes for the protocols you already use
          </h2>
          <p className="cs-lead">Jupiter, Pyth, Helius, Metaplex, Squads and Jito, plus alerts, an AI Agent and a Custom API node.</p>
          <a className="cs-link" href={CLOUD_DOCS_URL}>
            Read the node reference
            <ArrowRight size={16} strokeWidth={1.75} aria-hidden />
          </a>
        </div>
        <div className="in-bleed cs-stage" data-sl-reveal>
          <Stage<S>
            width={940}
            height={440}
            compact={{ below: 600, width: 358, height: 560 }}
            theme="dark"
            initial={START}
            poster={POSTER}
            script={script}
            play="once"
            cursor={{ at: { wide: { x: 420, y: 360 }, compact: { x: 320, y: 420 } }, style: "real" }}
          >
            {(s, _rect, layout) => {
              const compact = layout === "compact";
              return (
                <div className="in-app">
                  <div className="in-canvas" />
                  <Palette s={s} compact={compact} />
                  <Canvas s={s} compact={compact} />
                </div>
              );
            }}
          </Stage>
        </div>
      </div>
    </section>
  );
}
