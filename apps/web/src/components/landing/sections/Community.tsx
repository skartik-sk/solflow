"use client";

import type { CSSProperties, ReactNode } from "react";
import { Code2, Database, Zap } from "lucide-react";
import { Avatar, Card, Facepile, Pin, Stage, Window, type Act, type Layout, type Rect } from "../kit";
import "./Community.css";

/*
 * #10 Community: three real notes from early demos, left as comment threads
 * pinned to nodes on the editor's own canvas. Built from stageshow's
 * `presence` (one colour per person, names riding their cursors) and
 * `google-docs` (a comment card opening beside what it is about).
 *
 * Beats: each person's cursor comes in, drops a pin on a node, their thread
 * opens under it. Plays once when in view; the poster is all three threads.
 * Real strings: three node names, three names, three roles, three quotes.
 */

type Who = "jk" | "gui" | "vb";
type Spot = "off" | "pin" | "park";

const PEOPLE: Record<Who, { name: string; first: string; role: string; quote: string; color: string; node: string }> = {
  jk: {
    name: "Jayakrishna",
    first: "Jayakrishna",
    role: "Solana Developer",
    quote: "Looks good, better way to understand a program.",
    color: "#f472b6",
    node: "prog",
  },
  gui: {
    name: "Gui Bibeau",
    first: "Gui",
    role: "Product @ Solana",
    quote: "It's hard to find Rust expertise, so this is already a good idea.",
    color: "#fb7a4a",
    node: "dep",
  },
  vb: {
    name: "Vaibhav",
    first: "Vaibhav",
    role: "Solana Developer",
    quote:
      "Damn, really great job. A better use case would be making a visualizer for agentic engineers so they can see what their agent implemented and make quick tweaks.",
    color: "#c084fc",
    node: "state",
  },
};
const ORDER: Who[] = ["jk", "gui", "vb"];

type S = Record<Who, Spot> & { pins: number; cards: number };

// Opens with the first note already left, so the first frame reads on its own
const initial: S = { jk: "park", gui: "off", vb: "off", pins: 1, cards: 1 };
const poster: S = { jk: "park", gui: "park", vb: "park", pins: 3, cards: 3 };

async function script(a: Act<S>) {
  await a.wait(500);
  for (let i = 1; i < ORDER.length; i++) {
    const who = ORDER[i]!;
    a.mark(who);
    a.put({ [who]: "pin" } as Partial<S>);
    await a.wait(1050);
    a.put({ pins: i + 1 });
    await a.wait(260);
    a.put({ cards: i + 1 });
    await a.wait(420);
    a.put({ [who]: "park" } as Partial<S>);
    await a.wait(500);
  }
  a.mark("done");
  await a.wait(2000);
}

/** Where a person's cursor is, in stage coordinates. */
function spot(who: Who, at: Spot, pin: Rect, card: Rect, stage: { w: number; h: number }): { x: number; y: number } {
  if (!pin.width) return { x: -60, y: -60 };
  if (at === "pin") return { x: pin.x + pin.width * 0.55, y: pin.y + pin.height * 0.5 };
  if (at === "park" && stage.w < 400) return { x: card.x + card.width - 40, y: card.y + card.height - 20 };
  if (at === "park") return { x: card.x + card.width - 70, y: card.y + card.height + 10 };
  // Off stage, past the nearest edge, so each person arrives already moving
  if (who === "jk") return { x: -40, y: pin.y + 120 };
  if (who === "gui") return { x: pin.x + 60, y: stage.h + 40 };
  return { x: stage.w + 40, y: pin.y + 160 };
}

export function Community() {
  return (
    <section className="sl-community sl-section" aria-labelledby="sl-community-title">
      <div className="sl-wrap">
        <header className="sl-community__head" data-sl-reveal>
          <h2 id="sl-community-title" className="sl-h2">
            What Solana developers said
          </h2>
          <p className="sl-lead">Notes from early demos, word for word. Each one is left on the part of the program it is about.</p>
        </header>

        <figure className="sl-community__figure" data-sl-reveal>
          <Stage<S>
            width={1152}
            height={516}
            compact={{ below: 900, width: 358, height: 717 }}
            initial={initial}
            poster={poster}
            script={script}
            play="once"
            theme="dark"
            fidelity="standard"
            className="cm"
          >
            {(s, rect, layout) => <Scene s={s} rect={rect} layout={layout} />}
          </Stage>
          <figcaption className="sl-community__caption">
            {ORDER.map((k) => (
              <span key={k}>
                <span className="sl-community__dot" style={{ background: PEOPLE[k].color }} aria-hidden />
                {PEOPLE[k].name}, {PEOPLE[k].role}
              </span>
            ))}
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

function Scene({ s, rect, layout }: { s: S; rect: (n: string) => Rect; layout: Layout }) {
  const compact = layout === "compact";
  const stage = compact ? { w: 358, h: 717 } : { w: 1152, h: 516 };
  const canvas = rect("canvas");
  const local = (r: Rect) => ({ x: r.x - canvas.x, y: r.y - canvas.y, w: r.width, h: r.height });
  const prog = local(rect("n-prog"));
  const dep = local(rect("n-dep"));
  const st = local(rect("n-state"));

  const canvasEl = (
      <div className="cm-canvas" data-target="canvas">
        {/* The canvas ground: a dotted grid the nodes and comments sit on */}
        <div className="cm-grid" aria-hidden />
        {/* Edges: program → instruction → state, drawn from the nodes' own handles */}
        {canvas.width > 0 && !compact && (
          <svg className="cm-edges" aria-hidden>
            <path d={hEdge(prog.x + prog.w, prog.y + 22, dep.x, dep.y + 22)} stroke="var(--n-program)" />
            <path d={hEdge(dep.x + dep.w, dep.y + 22, st.x, st.y + 22)} stroke="var(--n-instruction)" />
          </svg>
        )}

        <Node
          id="prog"
          kind="program"
          icon={<Code2 size={12} strokeWidth={2} />}
          label="vault"
          rows={compact ? [] : [["instructions", "4"], ["version", "0.1.0"]]}
        />
        <Node
          id="dep"
          kind="instruction"
          icon={<Zap size={12} strokeWidth={2} />}
          label="deposit"
          rows={compact ? [] : [["amount", "u64"], ["accounts", "3"]]}
        />
        <Node
          id="state"
          kind="state"
          icon={<Database size={12} strokeWidth={2} />}
          label="VaultState"
          rows={compact ? [] : [["authority", "Pubkey"], ["balance", "u64"], ["bump", "u8"]]}
        />

        {/* Pins: the square corner on each node's bottom edge */}
        {canvas.width > 0 &&
          ([["jk", prog], ["gui", dep], ["vb", st]] as const).map(([k, n]) => (
            <Thread key={k} who={k} s={s} at={{ x: n.x + 18, y: n.y + n.h - 4 }} />
          ))}

        {/* The open threads, each under the node it is pinned to */}
        {ORDER.map((k, i) => (
          <div key={k} className="cm-thread" data-who={k} data-on={s.cards > i || undefined} data-target={`card-${k}`}>
            <Card pad="medium" className="cm-card" style={{ "--who": PEOPLE[k].color } as CSSProperties}>
                <div className="cm-card__head">
                  <Avatar name={PEOPLE[k].name} tone="ios" size={24} className="cm-avatar" style={{ background: PEOPLE[k].color }} />
                  <span className="cm-card__name">{PEOPLE[k].name}</span>
                  <span className="cm-card__role">{PEOPLE[k].role}</span>
                </div>
                <p className="cm-card__quote">{PEOPLE[k].quote}</p>
            </Card>
          </div>
        ))}
      </div>
  );

  return (
    <>
      {compact ? (
        canvasEl
      ) : (
        <Window title="vault" className="cm-win" toolbar={<Facepile names={ORDER.map((k) => PEOPLE[k].name)} size={22} className="cm-pile" />}>
          {canvasEl}
        </Window>
      )}

      {ORDER.map((k) => (
        <Peer
          key={k}
          name={PEOPLE[k].first}
          color={PEOPLE[k].color}
          at={spot(k, s[k], rect(`pin-${k}`), rect(`card-${k}`), stage)}
          visible={s[k] !== "off" && !(compact && s[k] === "park")}
        />
      ))}
    </>
  );
}

function Node({ id, kind, icon, label, rows }: { id: string; kind: string; icon: ReactNode; label: string; rows: [string, string][] }) {
  return (
    <div className={`cm-node cm-node--${id}`} data-kind={kind} data-target={`n-${id}`}>
      <div className="cm-node__head">
        <span className="cm-node__icon">{icon}</span>
        <span className="cm-node__label">{label}</span>
      </div>
      {rows.length > 0 && (
        <div className="cm-node__body">
          {rows.map(([k, v]) => (
            <div key={k} className="cm-node__row">
              <span>{k}</span>
              <span>{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** The pin a person drops on a node: its square corner on the node's edge. */
function Thread({ who, s, at }: { who: Who; s: S; at: { x: number; y: number } }) {
  const i = ORDER.indexOf(who);
  return (
    <span className="cm-pin" data-on={s.pins > i || undefined} data-target={`pin-${who}`} style={{ left: at.x, top: at.y }}>
      <Pin name={PEOPLE[who].name} size={26} corner="tl" style={{ "--ss-accent": PEOPLE[who].color } as CSSProperties} />
    </span>
  );
}

function Peer({ name, color, at, visible }: { name: string; color: string; at: { x: number; y: number }; visible: boolean }) {
  return (
    <span className="cm-peer" data-on={visible || undefined} style={{ transform: `translate(${at.x}px, ${at.y}px)`, "--who": color } as CSSProperties}>
      <svg width="16" height="18" viewBox="0 0 16 18" aria-hidden>
        <path d="M1.5 1.5v13.2l3.6-3.3 2.4 5.4 2.4-1-2.4-5.3h5.1Z" fill="var(--who)" stroke="#0b0c0e" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
      <span className="cm-flag">{name}</span>
    </span>
  );
}

function hEdge(x1: number, y1: number, x2: number, y2: number) {
  const dx = Math.max(40, (x2 - x1) / 2);
  return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
}

