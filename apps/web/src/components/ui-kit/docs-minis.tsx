"use client";

import type { ReactNode } from "react";
import { Bell, Clock, Database, FileCode2, GitBranch, Play, Satellite } from "lucide-react";
import { Stage } from "@/components/landing/kit/stage";
import { Caret, Prompt, Window } from "@/components/landing/kit/window";
import type { Act } from "@/components/landing/kit/act";
import "./docs-minis.css";

/*
 * Three small product shots for the docs entry cards, one per learn track.
 * Each is a still until hovered; on hover it plays one beat and settles on the
 * poster (the end state), which is what most people see.
 *   Visual Builder: the vault graph, the State node wired to withdraw.
 *   CLI: `solstudio parse . --format summary` and its first summary lines.
 *   Cloud: a run travels Cron Trigger -> Pyth Price -> If / Else -> Telegram.
 */

const W = 320;
const H = 196;
const IC = { size: 12, strokeWidth: 2 } as const;

/* ---------- Visual Builder ---------- */

type VS = { wire: boolean; state: boolean };

async function visualScript(a: Act<VS>) {
  await a.set({ wire: false, state: false });
  await a.wait(250);
  await a.set({ state: true });
  await a.wait(350);
  await a.set({ wire: true });
  await a.wait(2400);
}

function GNode({
  kind,
  label,
  name,
  icon,
  x,
  y,
  on = true,
}: {
  kind: "program" | "ix" | "state";
  label: string;
  name: string;
  icon: ReactNode;
  x: number;
  y: number;
  on?: boolean;
}) {
  return (
    <div className={`dm-node dm-node--${kind}`} data-on={on || undefined} style={{ left: x, top: y }}>
      <div className="dm-node__head">
        <span className="dm-node__badge">{icon}</span>
        {label}
      </div>
      <div className="dm-node__name">{name}</div>
    </div>
  );
}

export function VisualMini() {
  return (
    <Stage<VS>
      width={W}
      height={H}
      theme="dark"
      initial={{ wire: true, state: true }}
      poster={{ wire: true, state: true }}
      script={visualScript}
      play="hover"
      className="dmini"
    >
      {(s) => (
        <Window title="vault" className="dm-win" body={{ className: "dm-canvas" }}>
          <svg className="dm-wires" viewBox="0 0 380 200" aria-hidden>
            <path d="M126 39 C 146 39, 146 35, 166 35" />
            <path d="M126 39 C 146 39, 146 99, 166 99" />
            <path className="dm-draw" data-on={s.wire || undefined} pathLength={1} d="M126 111 C 146 111, 146 111, 166 111" />
          </svg>
          <GNode kind="program" label="Program" name="vault" icon={<FileCode2 {...IC} />} x={14} y={12} />
          <GNode kind="ix" label="Instruction" name="deposit" icon={<Play {...IC} />} x={166} y={8} />
          <GNode kind="ix" label="Instruction" name="withdraw" icon={<Play {...IC} />} x={166} y={72} />
          <GNode kind="state" label="State" name="Vault" icon={<Database {...IC} />} x={14} y={84} on={s.state} />
        </Window>
      )}
    </Stage>
  );
}

/* ---------- CLI ---------- */

type CS = { cmd: string; out: boolean };
const CMD = "solstudio parse . --format summary";

async function cliScript(a: Act<CS>) {
  await a.set({ cmd: "", out: false });
  await a.wait(200);
  await a.type("cmd", CMD, { interval: 26 });
  await a.wait(220);
  await a.set({ out: true });
  await a.wait(2400);
}

export function CliMini() {
  return (
    <Stage<CS>
      width={W}
      height={H}
      theme="dark"
      initial={{ cmd: CMD, out: true }}
      poster={{ cmd: CMD, out: true }}
      script={cliScript}
      play="hover"
      className="dmini"
    >
      {(s) => (
        <Window chrome="terminal" lights="grey" title="vault — zsh" className="dm-term">
          <div className="dm-term__body">
            <Prompt path="~/vault">
              <span>{s.cmd}</span>
              {!s.out && <Caret still />}
            </Prompt>
            {[
              ["Instructions :", "3"],
              ["Accounts     :", "4"],
              ["States       :", "1"],
              ["Framework    :", "anchor"],
            ].map(([k, v], i) => (
              <div key={k} className="dm-out" data-on={s.out || undefined} style={{ ["--i" as string]: i }}>
                <span className="dim">{k}</span> {v}
              </div>
            ))}
          </div>
        </Window>
      )}
    </Stage>
  );
}

/* ---------- Cloud ---------- */

type St = 0 | 1 | 2;
type KS = { n: [St, St, St, St] };
const DONE: KS = { n: [2, 2, 2, 2] };

async function cloudScript(a: Act<KS>) {
  await a.set({ n: [0, 0, 0, 0] });
  await a.wait(200);
  for (let i = 0; i < 4; i++) {
    await a.set((s) => ({ n: s.n.map((v, j) => (j === i ? 1 : v)) as KS["n"] }));
    await a.wait(380);
    await a.set((s) => ({ n: s.n.map((v, j) => (j === i ? 2 : v)) as KS["n"] }));
    await a.wait(140);
  }
  await a.wait(2200);
}

const FLOW = [
  { label: "Cron Trigger", cat: "trigger", icon: <Clock {...IC} />, k: "*/5 * * * *", x: 14, y: 12 },
  { label: "Pyth Price", cat: "action", icon: <Satellite {...IC} />, k: "SOL/USD", x: 166, y: 12 },
  { label: "If / Else", cat: "logic", icon: <GitBranch {...IC} />, k: "price < 140", x: 166, y: 82 },
  { label: "Telegram Alert", cat: "action", icon: <Bell {...IC} />, k: "Bought SOL", x: 14, y: 82 },
] as const;

export function CloudMini() {
  return (
    <Stage<KS>
      width={W}
      height={H}
      theme="dark"
      initial={DONE}
      poster={DONE}
      script={cloudScript}
      play="hover"
      className="dmini"
    >
      {(s) => (
        <Window title="Workflow" className="dm-win" body={{ className: "dm-canvas" }}>
          <svg className="dm-wires" viewBox="0 0 380 200" aria-hidden>
            <path className="dm-draw" data-on={s.n[1] > 0 || undefined} pathLength={1} d="M138 38 L 166 38" />
            <path className="dm-draw" data-on={s.n[2] > 0 || undefined} pathLength={1} d="M228 64 L 228 82" />
            <path className="dm-draw" data-on={s.n[3] > 0 || undefined} pathLength={1} d="M166 108 L 138 108" />
          </svg>
          {FLOW.map((f, i) => (
            <div key={f.label} className={`dm-flow dm-flow--${f.cat}`} style={{ left: f.x, top: f.y }} data-st={s.n[i]}>
              <div className="dm-flow__head">
                <span className="dm-flow__chip">{f.icon}</span>
                <span className="dm-flow__label">{f.label}</span>
                <span className="dm-flow__st" aria-hidden />
              </div>
              <div className="dm-flow__k">{f.k}</div>
            </div>
          ))}
        </Window>
      )}
    </Stage>
  );
}
