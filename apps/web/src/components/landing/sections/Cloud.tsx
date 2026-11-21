"use client";

import type { ReactNode } from "react";
import { ArrowRightLeft, ArrowUpRight, Bell, Clock, GitBranch, KeyRound, Lock, Maximize, Minus, Play, Plus, RotateCcw, Satellite, ShieldCheck, Wallet } from "lucide-react";
import { Badge, Bar, Button, Check, Collapse, Roll, Stage, type Act } from "../kit";
import { CLOUD_URL } from "../shared";
import "./Cloud.css";

/*
 * Cloud: a real workflow from SolStudio Cloud's own node set (Cron Trigger,
 * Pyth Price, If / Else, Jupiter Direct Swap, Telegram Message), drawn with the
 * product's node anatomy: a category edge on the left, an icon chip, the label
 * and a status mark, then a key and value in mono.
 *
 * Story, played once when seen: a run travels the edges node by node, each
 * node ticks, the run lands in Executions, Replay is pressed on that row and
 * the same run plays again from its trigger data. The poster is the end.
 */

type St = 0 | 1 | 2; // idle, running, ok
type S = {
  node: [St, St, St, St, St];
  edge: [boolean, boolean, boolean, boolean];
  vals: boolean;
  r84: boolean;
  r85: "off" | "run" | "ok";
};

const START: S = { node: [0, 0, 0, 0, 0], edge: [false, false, false, false], vals: false, r84: false, r85: "off" };
const POSTER: S = { node: [2, 2, 2, 2, 2], edge: [true, true, true, true], vals: true, r84: true, r85: "ok" };

const setAt = <T,>(arr: T[], i: number, v: T) => arr.map((x, j) => (j === i ? v : x));

async function travel(a: Act<S>, fast: boolean) {
  const run = fast ? [200, 240, 180, 320, 200] : [450, 520, 380, 760, 450];
  const gap = fast ? 120 : 220;
  for (let i = 0; i < 5; i++) {
    await a.set((s) => ({ node: setAt(s.node, i, 1) as S["node"] }));
    await a.wait(run[i]);
    await a.set((s) => ({ node: setAt(s.node, i, 2) as S["node"], vals: s.vals || i === 1 }));
    if (i < 4) {
      await a.wait(gap);
      await a.set((s) => ({ edge: setAt(s.edge, i, true) as S["edge"] }));
      await a.wait(fast ? 220 : 380);
    }
  }
}

async function script(a: Act<S>) {
  await a.wait(700);
  a.mark("run");
  await travel(a, false);
  await a.wait(500);
  a.mark("landed");
  await a.set({ r84: true });
  await a.wait(1300);
  a.mark("replay");
  await a.click({ at: "replay", x: 0.94, y: 0.7 });
  // Replay starts a new run: the canvas clears last to first, then the run opens in Executions
  for (let i = 4; i >= 0; i--) {
    await a.set((s) => ({ node: setAt(s.node, i, 0) as S["node"], edge: i > 0 ? (setAt(s.edge, i - 1, false) as S["edge"]) : s.edge }));
    await a.wait(70);
  }
  await a.set({ r85: "run" });
  await a.wait(400);
  await travel(a, true);
  await a.wait(300);
  a.mark("done");
  await a.set({ r85: "ok" });
  await a.wait(2000);
}

/* ---------- the workflow ---------- */

type NodeDef = {
  label: string;
  cat: "trigger" | "action" | "logic";
  icon: ReactNode;
  k: string;
  v: (s: S) => string;
};

const IC = { size: 16, strokeWidth: 1.75 } as const;

const NODES: NodeDef[] = [
  { label: "Cron Trigger", cat: "trigger", icon: <Clock {...IC} />, k: "*/5 * * * *", v: () => "UTC" },
  { label: "Pyth Price", cat: "action", icon: <Satellite {...IC} />, k: "SOL/USD", v: (s) => (s.vals ? "$138.42" : "$141.07") },
  { label: "If / Else", cat: "logic", icon: <GitBranch {...IC} />, k: "price < 140", v: (s) => (s.r84 || s.node[2] === 2 ? "true" : "false") },
  { label: "Jupiter Swap", cat: "action", icon: <ArrowRightLeft {...IC} />, k: "25 USDC → SOL", v: (s) => (s.r84 || s.node[3] === 2 ? "0.1806" : "") },
  { label: "Telegram Alert", cat: "action", icon: <Bell {...IC} />, k: "Bought SOL", v: (s) => (s.r84 || s.node[4] === 2 ? "sent" : "") },
];

/* Geometry, in stage px. Wide: one row, left to right, like the editor. Compact: a column. */
const W = { x: [28, 252, 476, 700, 924], y: 116, w: 184, h: 88 };
const C = { x: 40, y: [76, 158, 240, 322, 404], w: 262, h: 62 };

function edgePath(i: number, compact: boolean) {
  if (compact) {
    const x = C.x + C.w / 2;
    const y1 = C.y[i] + C.h;
    const y2 = C.y[i + 1];
    return `M${x} ${y1}V${y2}`;
  }
  const x1 = W.x[i] + W.w;
  const x2 = W.x[i + 1];
  const y1 = i === 2 ? W.y + 34 : W.y + W.h / 2;
  const y2 = W.y + W.h / 2;
  const m = (x1 + x2) / 2;
  return `M${x1} ${y1}C${m} ${y1} ${m} ${y2} ${x2} ${y2}`;
}

/* Handles sit on the node edges, as React Flow draws them: one layer over the nodes */
function Handles({ compact }: { compact: boolean }) {
  const pts: { x: number; y: number }[] = [];
  let label: { x: number; y: number; t: string }[] = [];
  if (compact) {
    const cx = C.x + C.w / 2;
    for (let i = 0; i < 5; i++) {
      if (i > 0) pts.push({ x: cx, y: C.y[i] });
      if (i < 4) pts.push({ x: cx, y: C.y[i] + C.h });
    }
    pts.push({ x: C.x + C.w, y: C.y[2] + C.h / 2 });
    label = [{ x: C.x + C.w + 10, y: C.y[2] + C.h / 2 + 4, t: "false" }];
  } else {
    const mid = W.y + W.h / 2;
    for (let i = 0; i < 5; i++) {
      if (i > 0) pts.push({ x: W.x[i], y: mid });
      if (i < 4 && i !== 2) pts.push({ x: W.x[i] + W.w, y: mid });
    }
    const r = W.x[2] + W.w;
    pts.push({ x: r, y: W.y + 34 }, { x: r, y: W.y + 68 });
    label = [
      { x: r + 10, y: W.y + 26, t: "true" },
      { x: r + 10, y: W.y + 86, t: "false" },
    ];
  }
  return (
    <svg className="cl-edges cl-handles" width="100%" height="100%" aria-hidden>
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={4.5} />
      ))}
      {label.map((l) => (
        <text key={l.t} x={l.x} y={l.y}>
          {l.t}
        </text>
      ))}
    </svg>
  );
}

function WorkflowNode({ d, i, s, compact }: { d: NodeDef; i: number; s: S; compact: boolean }) {
  const st = s.node[i];
  const pos = compact ? { left: C.x, top: C.y[i], width: C.w, height: C.h } : { left: W.x[i], top: W.y, width: W.w, height: W.h };
  return (
    <div className="cl-node" data-cat={d.cat} data-state={st === 1 ? "run" : st === 2 ? "ok" : undefined} style={pos}>
      <div className="cl-node__head">
        <span className="cl-node__chip">{d.icon}</span>
        <span className="cl-node__label">{d.label}</span>
        <Check on={st === 2} pending={st === 1} size={14} className="cl-node__check" />
      </div>
      <div className="cl-node__body">
        <span className="cl-node__k">{d.k}</span>
        <span className="cl-node__v" data-hot={(st === 2 && i > 0) || undefined}>
          <Roll variant="fade">{d.v(s)}</Roll>
        </span>
      </div>
    </div>
  );
}

/* ---------- executions ---------- */

type Run = { id: string; trigger: string; nodes: string; dur: string; at: string };
const OLD: Run[] = [
  { id: "#1283", trigger: "Cron", nodes: "3 / 5", dur: "0.8 s", at: "5 min ago" },
];

function RunRow({ run, status, replay, compact }: { run: Run; status: ReactNode; replay?: boolean; compact: boolean }) {
  if (compact) {
    return (
      <div className="cl-run">
        <span className="cl-run__status">{status}</span>
        <span className="cl-run__main">
          <span className="cl-run__id">{run.id}</span>
          <span className="cl-run__sub">
            {run.trigger} · {run.dur}
          </span>
        </span>
        {replay && (
          <Button size="small" icon={<RotateCcw size={16} strokeWidth={1.75} />} data-target="replay" className="cl-replay">
            Replay
          </Button>
        )}
      </div>
    );
  }
  return (
    <div className="cl-run">
      <span className="cl-run__status">{status}</span>
      <span className="cl-run__id">{run.id}</span>
      <span className="cl-run__trigger">{run.trigger}</span>
      <span className="cl-run__num">{run.nodes}</span>
      <span className="cl-run__num">{run.dur}</span>
      <span className="cl-run__at">{run.at}</span>
      <span className="cl-run__act">
        {replay && (
          <Button size="small" icon={<RotateCcw size={16} strokeWidth={1.75} />} data-target="replay" className="cl-replay">
            Replay
          </Button>
        )}
      </span>
    </div>
  );
}

function FillerRow({ i, compact }: { i: number; compact: boolean }) {
  const w = [[44, 120], [40, 96], [44, 132], [40, 104]][i];
  return (
    <div className="cl-run cl-run--fill" aria-hidden>
      <Bar w={64} h={20} r={10} tone={2} />
      <Bar w={w[0]} h={6} tone={3} />
      {!compact && <Bar w={36} h={6} tone={2} />}
      {!compact && <Bar w={32} h={6} tone={2} />}
      {!compact && <Bar w={36} h={6} tone={2} />}
      {!compact && <Bar w={w[1] - 40} h={6} tone={2} />}
    </div>
  );
}

function Executions({ s, compact }: { s: S; compact: boolean }) {
  const ok = (
    <Badge tone="success" dot>
      Success
    </Badge>
  );
  return (
    <div className="cl-dock">
      <div className="cl-dock__tabs">
        <span className="cl-dock__tab" data-on>
          Executions
        </span>
        {!compact && <span className="cl-dock__tab">Logs</span>}
        <span className="cl-dock__meta">Last 24 hours</span>
      </div>
      {!compact && (
        <div className="cl-run cl-run--head">
          <span>Status</span>
          <span>Run</span>
          <span>Trigger</span>
          <span>Nodes</span>
          <span>Duration</span>
          <span>Started</span>
          <span />
        </div>
      )}
      <Collapse open={s.r85 !== "off"} reveal="clip">
        <RunRow
          compact={compact}
          run={{ id: "#1285", trigger: "Replay of #1284", nodes: "5 / 5", dur: s.r85 === "ok" ? "2.1 s" : "–", at: "just now" }}
          status={
            <Badge tone={s.r85 === "ok" ? "success" : "neutral"} dot className="cl-badge-roll" data-run={s.r85 === "run" || undefined}>
              <Roll variant="fade">{s.r85 === "ok" ? "Success" : "Running"}</Roll>
            </Badge>
          }
        />
      </Collapse>
      <Collapse open={s.r84} reveal="clip">
        <RunRow compact={compact} replay run={{ id: "#1284", trigger: "Cron", nodes: "5 / 5", dur: "2.4 s", at: s.r85 === "off" ? "just now" : "1 min ago" }} status={ok} />
      </Collapse>
      <RunRow compact={compact} run={OLD[0]} status={ok} />
      {/* Older runs are filler: they run off the bottom of the frame */}
      {[0, 1, 2, 3].map((i) => (
        <FillerRow key={i} i={i} compact={compact} />
      ))}
    </div>
  );
}

/* ---------- the stage ---------- */

function CloudStage() {
  return (
    <Stage<S>
      width={1136}
      height={576}
      compact={{ below: 760, width: 358, height: 724 }}
      initial={START}
      poster={POSTER}
      script={script}
      play="once"
      theme="dark"
      cursor={{ at: { wide: { x: 1010, y: 250 }, compact: { x: 320, y: 470 } }, style: "real" }}
      className="cl-stage"
    >
      {(s, _rect, layout) => {
        const compact = layout === "compact";
        return (
          <div className="cl-app">
            <div className="cl-bar">
              <span className="cl-crumb">
                {!compact && <span className="cl-crumb__muted">Workflows</span>}
                {!compact && <span className="cl-crumb__sep">/</span>}
                <span className="cl-crumb__name">SOL dip buyer</span>
              </span>
              {!compact && (
                <span className="cl-tabs">
                  <span className="cl-tab" data-on>
                    Editor
                  </span>
                  <span className="cl-tab">Executions</span>
                </span>
              )}
              <span className="cl-bar__end">
                <Badge tone="success" dot>
                  Active
                </Badge>
                {!compact && (
                  <Button size="medium" icon={<Play size={16} strokeWidth={1.75} />}>
                    Run once
                  </Button>
                )}
              </span>
            </div>

            <div className="cl-canvas" />
              {!compact && (
                <div className="cl-rail" aria-hidden>
                  <span>
                    <Plus size={16} strokeWidth={1.75} />
                  </span>
                  <span>
                    <Minus size={16} strokeWidth={1.75} />
                  </span>
                  <span>
                    <Maximize size={16} strokeWidth={1.75} />
                  </span>
                </div>
              )}
            <svg className="cl-edges" width="100%" height="100%" aria-hidden>
                {[0, 1, 2, 3].map((i) => (
                  <g key={i}>
                    <path d={edgePath(i, compact)} className="cl-edge" />
                    <path d={edgePath(i, compact)} className="cl-edge cl-edge--lit" pathLength={1} data-lit={s.edge[i] || undefined} />
                  </g>
                ))}
              </svg>
              {NODES.map((d, i) => (
                <WorkflowNode key={d.label} d={d} i={i} s={s} compact={compact} />
              ))}
            <Handles compact={compact} />
            <Executions s={s} compact={compact} />
          </div>
        );
      }}
    </Stage>
  );
}

/* ---------- facts: three miniatures of the real settings ---------- */

function MiniPreflight() {
  return (
    <div className="cl-mini" aria-hidden>
      <div className="cl-mini__row">
        <span>Simulate before signing</span>
        <span className="cl-switch" data-on />
      </div>
      <div className="cl-mini__row">
        <span>Spend limit</span>
        <span className="cl-mini__mono">0.5 SOL</span>
      </div>
      <div className="cl-mini__row">
        <span>Max slippage</span>
        <span className="cl-mini__mono">50 bps</span>
      </div>
    </div>
  );
}

function MiniSecrets() {
  return (
    <div className="cl-mini" aria-hidden>
      <div className="cl-mini__row">
        <span className="cl-mini__lead">
          <KeyRound size={16} strokeWidth={1.75} />
          Jupiter API key
        </span>
        <span className="cl-mini__mono cl-mini__dots">••••••••</span>
      </div>
      <div className="cl-mini__row">
        <span className="cl-mini__lead">
          <Wallet size={16} strokeWidth={1.75} />
          Bot wallet
        </span>
        <span className="cl-mini__mono">7xKX…9fQ2</span>
      </div>
      <div className="cl-mini__row cl-mini__foot">
        <span className="cl-mini__lead">
          <Lock size={16} strokeWidth={1.75} />
          AES-256-GCM, server side
        </span>
      </div>
    </div>
  );
}

function MiniReplay() {
  return (
    <div className="cl-mini cl-mini--replay" aria-hidden>
      <div className="cl-mini__row">
        <span className="cl-mini__lead">
          <span className="cl-mini__dot" />
          <span className="cl-mini__mono cl-mini__strong">#1284</span>
          Cron
        </span>
        <span className="cl-mini__mono">$138.42</span>
      </div>
      <svg className="cl-mini__link" width="24" height="22" viewBox="0 0 24 22" aria-hidden>
        <path d="M6 1v8a6 6 0 0 0 6 6h8" />
        <path d="M16 11l4 4-4 4" />
      </svg>
      <div className="cl-mini__row cl-mini__row--in">
        <span className="cl-mini__lead">
          <span className="cl-mini__dot" />
          <span className="cl-mini__mono cl-mini__strong">#1285</span>
          Replay of #1284
        </span>
        <span className="cl-mini__mono">$138.42</span>
      </div>
    </div>
  );
}

const FACTS = [
  { title: "Limits before anything signs", body: "Spend limits, slippage caps and a preflight simulation run before a wallet action can sign.", mini: <MiniPreflight /> },
  { title: "Encrypted credentials and wallets", body: "API keys and wallet keys are encrypted on the server and never sent back to the browser.", mini: <MiniSecrets /> },
  { title: "Every run can be replayed", body: "A run keeps its trigger data, so Replay runs the same input again and shows both results.", mini: <MiniReplay /> },
];

export function Cloud() {
  return (
    <section className="sl-section sl-cloud" id="cloud" aria-labelledby="cloud-title">
      <div className="sl-wrap">
        <div className="cl-head" data-sl-reveal>
          <div className="cl-head__copy">
            <span className="cl-tag">
              <ShieldCheck size={16} strokeWidth={1.75} />
              SolStudio Cloud
            </span>
            <h2 id="cloud-title" className="sl-h2">
              Workflows that act on Solana for you
            </h2>
            <p className="sl-lead">
              Cron, webhook and manual triggers wired to nodes for Jupiter, Pyth, Helius, Metaplex, Squads and Jito. Build it on a canvas, then let it run.
            </p>
          </div>
          <a className="sl-btn sl-btn-quiet cl-cta" href={CLOUD_URL}>
            Open Cloud
            <ArrowUpRight size={16} strokeWidth={1.75} />
          </a>
        </div>

        <div className="sl-bezel cl-bezel" data-sl-reveal>
          <CloudStage />
        </div>

        <div className="cl-facts">
          {FACTS.map((f) => (
            <div key={f.title} className="cl-fact" data-sl-reveal>
              {f.mini}
              <h3 className="sl-h3">{f.title}</h3>
              <p className="sl-body">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
