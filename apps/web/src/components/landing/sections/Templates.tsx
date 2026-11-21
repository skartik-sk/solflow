"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Bar, Stage } from "../kit";
import "./Templates.css";

/*
 * Templates: many of one. A grid of template cards runs off every edge of its
 * stage; each card is a tiny node graph of the template (program, its
 * instructions, their accounts, state and errors, counted from the real
 * fixtures in packages/codegen) and its name. One card is in focus by depth,
 * in colour, with its words and a Use template button. On desktop, hovering a
 * card brings it forward instead.
 */

type Tpl = {
  name: string;
  desc: string;
  tags: string;
  ix: number;
  acc: number[]; // accounts per instruction
  state: number;
  err: number;
};

// Counts from packages/codegen/fixtures/templates; descriptions from
// packages/codegen/src/templates/index.json and the marketplace cards.
const TEMPLATES: Tpl[] = [
  { name: "Simple Vault", desc: "PDA vault with deposit, withdraw and close.", tags: "vault · pda · events", ix: 4, acc: [3, 3, 3, 3], state: 1, err: 2 },
  { name: "Token Escrow", desc: "Trustless escrow that swaps two SPL tokens.", tags: "escrow · spl-token · pda", ix: 3, acc: [3, 3, 3], state: 1, err: 2 },
  { name: "Staking Pool", desc: "Stake, unstake and claim pool rewards.", tags: "staking · rewards · pda", ix: 4, acc: [3, 3, 3, 3], state: 2, err: 2 },
  { name: "NFT Collection", desc: "Collection state, minting and verification.", tags: "nft · metaplex · mint", ix: 3, acc: [3, 4, 2], state: 1, err: 1 },
  { name: "DAO Voting", desc: "Create proposals, vote, execute the result.", tags: "dao · governance · votes", ix: 3, acc: [3, 4, 2], state: 2, err: 3 },
  { name: "AMM", desc: "A liquidity pool with add, remove and swap.", tags: "amm · liquidity · swap", ix: 4, acc: [3, 2, 2, 2], state: 1, err: 2 },
];

const FOCUS_DEFAULT = 1; // Token Escrow

/* Filler shapes for the outer ring of cards: varied, wordless */
const FILL: Pick<Tpl, "ix" | "acc" | "state" | "err">[] = [
  { ix: 3, acc: [2, 3, 2], state: 1, err: 1 },
  { ix: 4, acc: [2, 2, 3, 2], state: 1, err: 2 },
  { ix: 2, acc: [3, 2], state: 1, err: 1 },
  { ix: 5, acc: [2, 2, 2, 2, 2], state: 2, err: 2 },
  { ix: 3, acc: [3, 3, 2], state: 2, err: 1 },
];

/** A tiny graph of a program: the program node, its instructions, their accounts, state and errors. */
function Graph({ t }: { t: Pick<Tpl, "ix" | "acc" | "state" | "err"> }) {
  const W = 210;
  const H = 112;
  const top = 14;
  const ixGap = (H - top * 2) / t.ix;
  const ixY = Array.from({ length: t.ix }, (_, i) => top + ixGap * i + ixGap / 2);
  const prog = { x: 24, y: H / 2 - 9, w: 36, h: 18 };
  const ixX = 88;
  const ixW = 44;
  const accX = 156;
  return (
    <svg className="tp-graph" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
      <g className="tp-graph__edges">
        {ixY.map((y, i) => (
          <path key={`p${i}`} d={`M${prog.x + prog.w} ${H / 2}C${(prog.x + prog.w + ixX) / 2} ${H / 2} ${(prog.x + prog.w + ixX) / 2} ${y} ${ixX} ${y}`} />
        ))}
        {ixY.map((y, i) =>
          Array.from({ length: Math.min(t.acc[i] ?? 2, 2) }, (_, k) => {
            const ay = y + (k - (Math.min(t.acc[i] ?? 2, 2) - 1) / 2) * 8;
            return <path key={`a${i}${k}`} d={`M${ixX + ixW} ${y}C${ixX + ixW + 10} ${y} ${accX - 10} ${ay} ${accX} ${ay}`} />;
          }),
        )}
      </g>
      <rect className="tp-n tp-n--program" x={prog.x} y={prog.y} width={prog.w} height={prog.h} rx={4} />
      {ixY.map((y, i) => (
        <rect key={i} className="tp-n tp-n--instruction" x={ixX} y={y - 5} width={ixW} height={10} rx={3} />
      ))}
      {ixY.map((y, i) =>
        Array.from({ length: Math.min(t.acc[i] ?? 2, 2) }, (_, k) => {
          const ay = y + (k - (Math.min(t.acc[i] ?? 2, 2) - 1) / 2) * 8;
          return <rect key={`${i}${k}`} className="tp-n tp-n--account" x={accX} y={ay - 2.5} width={14} height={5} rx={2} />;
        }),
      )}
      {Array.from({ length: t.state }, (_, i) => (
        <rect key={`s${i}`} className="tp-n tp-n--state" x={182} y={top + 2 + i * 10} width={12} height={6} rx={2} />
      ))}
      {Array.from({ length: t.err }, (_, i) => (
        <circle key={`e${i}`} className="tp-n tp-n--error" cx={188} cy={H - top - 2 - i * 9} r={2.5} />
      ))}
    </svg>
  );
}

function Card({ t, focus, onEnter }: { t: Tpl; focus: boolean; onEnter: () => void }) {
  const href = `/marketplace?q=${encodeURIComponent(t.name)}`;
  return (
    <Link href={href} className="tp-card" data-focus={focus || undefined} onMouseEnter={onEnter} onFocus={onEnter} aria-label={`${t.name} template`}>
      <span className="tp-thumb">
        <Graph t={t} />
        <span className="tp-use" aria-hidden={!focus}>
          Use template
        </span>
      </span>
      <span className="tp-name">{t.name}</span>
      <span className="tp-sub">
        <span className="tp-sub__tags">{t.tags}</span>
        <span className="tp-sub__desc">{t.desc}</span>
      </span>
    </Link>
  );
}

function FillerCard({ i }: { i: number }) {
  const f = FILL[i % FILL.length];
  const w = [[96, 120], [74, 104], [110, 88], [82, 126], [100, 70]][i % 5];
  return (
    <span className="tp-card tp-card--fill" aria-hidden>
      <span className="tp-thumb">
        <Graph t={f} />
      </span>
      <span className="tp-fillbars">
        <Bar w={w[0]} h={8} r={4} tone={3} />
        <Bar w={w[1]} h={6} r={3} tone={2} />
        <Bar w={Math.round(w[1] * 0.6)} h={6} r={3} tone={2} />
      </span>
    </span>
  );
}

/* Wide: 5 columns by 4 rows, the middle 3 x 2 are the real templates.
   Compact: the same grid, cropped to the focus card and its neighbours. */
function Grid({ compact, focus, setFocus }: { compact: boolean; focus: number; setFocus: (i: number) => void }) {
  const cols = 5;
  const rows = compact ? 3 : 4;
  const cells: React.ReactNode[] = [];
  let fill = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let t = -1;
      if (compact) {
        if (c === 2 && r === 1) t = FOCUS_DEFAULT;
      } else if (r >= 1 && r <= 2 && c >= 1 && c <= 3) {
        t = (r - 1) * 3 + (c - 1);
      }
      cells.push(
        t >= 0 ? (
          <Card key={`${r}-${c}`} t={TEMPLATES[t]} focus={focus === t} onEnter={() => setFocus(t)} />
        ) : (
          <FillerCard key={`${r}-${c}`} i={fill++} />
        ),
      );
    }
  }
  return <div className="tp-grid">{cells}</div>;
}

export function Templates() {
  const [focus, setFocus] = useState(FOCUS_DEFAULT);
  return (
    <section className="sl-section sl-templates" id="templates" aria-labelledby="templates-title">
      <div className="sl-wrap tp-layout">
        <div className="tp-copy" data-sl-reveal>
          <h2 id="templates-title" className="sl-h2">
            Start from a program that already works
          </h2>
          <p className="sl-lead">Open a template as a graph, change what you need, and generate Anchor, Pinocchio or Quasar code from it.</p>
          <Link className="tp-link" href="/marketplace">
            Browse all templates
            <ArrowRight size={16} strokeWidth={1.75} />
          </Link>
        </div>
        <div className="tp-bleed" data-sl-reveal onMouseLeave={() => setFocus(FOCUS_DEFAULT)}>
          <Stage width={900} height={616} compact={{ below: 600, width: 358, height: 372 }} theme="dark" fill className="tp-stage">
            {(_s, _rect, layout) => <Grid compact={layout === "compact"} focus={focus} setFocus={setFocus} />}
          </Stage>
        </div>
      </div>
    </section>
  );
}
