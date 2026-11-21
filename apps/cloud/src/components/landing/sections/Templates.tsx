"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Cat } from "./shared";
import "./Templates.css";

/*
 * Templates: many of one. Workflow template cards run off both edges of the
 * page; each thumbnail is the template's own graph from
 * packages/db/prisma/cloud-seed.ts (its node types, in category colour when in
 * focus). One card is in focus by depth with its description and Use
 * template; hovering or focusing another card brings that one forward.
 * Plain CSS rather than a Stage: the grid keeps its real size at every width
 * and is cropped by the page, centred on the focus card.
 */

type Tpl = { name: string; desc: string; tags: string; graph: Cat[][]; branch?: number };

// Name, description, tags and node types from cloud-seed.ts. `branch` marks
// the If / Else column, which leaves a false edge hanging.
const TEMPLATES: Tpl[] = [
  { name: "NFT Asset Watch", desc: "Read Metaplex asset metadata through Helius and show the asset result.", tags: "helius · metaplex · nft", graph: [["trigger"], ["action"], ["output"]] },
  { name: "Oracle Guard", desc: "Gate a workflow with Pyth or Switchboard price data before logging an alert.", tags: "pyth · switchboard · oracle", graph: [["trigger"], ["action"], ["logic"], ["output"]], branch: 2 },
  { name: "Price-Guarded DCA", desc: "Only run a Jupiter DCA swap when the current price is inside your range.", tags: "dca · price · jupiter", graph: [["trigger"], ["action"], ["logic"], ["action"], ["output"]], branch: 2 },
  { name: "Webhook Payment Runner", desc: "Accept approved payout requests and execute token transfers through a Cloud wallet.", tags: "payment · webhook · transfer", graph: [["trigger"], ["transform"], ["action"], ["output"]] },
  { name: "Wallet Activity Alert", desc: "Poll recent wallet signatures and display activity in Cloud.", tags: "wallet · helius · alert", graph: [["trigger"], ["action"], ["output"]] },
  { name: "Jito Bundle Readiness", desc: "Check Jito tip floor and tip accounts before submitting signed bundles.", tags: "jito · bundle · infra", graph: [["trigger"], ["action", "action"], ["output"]] },
  { name: "AI Transaction Classifier", desc: "Turn incoming transaction webhook payloads into structured AI summaries.", tags: "ai · webhook · json", graph: [["trigger"], ["ai"], ["output"]] },
  { name: "Liquidation Guard", desc: "Monitor lending positions and auto-deleverage before risk spikes.", tags: "liquidation · risk · alert", graph: [["trigger"], ["action"], ["logic"], ["action"], ["output"]], branch: 2 },
];
const FOCUS_DEFAULT = 2; // Price-Guarded DCA

/* Wordless shapes for the filler cards */
const FILL: Pick<Tpl, "graph" | "branch">[] = [
  { graph: [["trigger"], ["action"], ["action"], ["output"]] },
  { graph: [["trigger"], ["action"], ["logic"], ["output"]], branch: 2 },
  { graph: [["trigger"], ["action", "action"], ["output"]] },
  { graph: [["trigger"], ["transform"], ["output"]] },
  { graph: [["trigger"], ["action"], ["logic"], ["action"], ["output"]], branch: 2 },
  { graph: [["trigger"], ["ai"], ["action"], ["output"]] },
];

const GW = 232;
const GH = 100;
const NW = 28;
const NH = 14;

/** The template's graph: one pill per node, left to right, as the editor lays it out. */
function Graph({ t }: { t: Pick<Tpl, "graph" | "branch"> }) {
  const n = t.graph.length;
  const pad = 22;
  const step = (GW - pad * 2 - NW) / Math.max(n - 1, 1);
  const cols = t.graph.map((col, c) => {
    const x = pad + c * step;
    const ys = col.length === 1 ? [GH / 2] : col.map((_, k) => GH / 2 + (k - (col.length - 1) / 2) * 30);
    return col.map((cat, k) => ({ x, y: ys[k], cat }));
  });
  const edges: ReactNode[] = [];
  for (let c = 0; c < n - 1; c++) {
    for (const a of cols[c]) {
      for (const b of cols[c + 1]) {
        const x1 = a.x + NW;
        const m = (x1 + b.x) / 2;
        edges.push(<path key={`${c}-${a.y}-${b.y}`} d={`M${x1} ${a.y}C${m} ${a.y} ${m} ${b.y} ${b.x} ${b.y}`} />);
      }
    }
  }
  const br = t.branch !== undefined ? cols[t.branch][0] : null;
  return (
    <svg className="tm-graph" viewBox={`0 0 ${GW} ${GH}`} preserveAspectRatio="xMidYMid meet" aria-hidden>
      <g className="tm-graph__edges">
        {edges}
        {br && <path d={`M${br.x + NW} ${br.y}C${br.x + NW + 12} ${br.y} ${br.x + NW + 8} ${br.y + 24} ${br.x + NW + 22} ${br.y + 24}`} className="tm-graph__false" />}
      </g>
      {br && <circle className="tm-graph__stub" cx={br.x + NW + 24} cy={br.y + 24} r={2.5} />}
      {cols.flat().map((p, i) => (
        <rect key={i} className="tm-n" data-cat={p.cat} x={p.x} y={p.y - NH / 2} width={NW} height={NH} rx={4} />
      ))}
    </svg>
  );
}

function Card({ t, focus, onEnter }: { t: Tpl; focus: boolean; onEnter: () => void }) {
  return (
    <Link
      href={`/marketplace?q=${encodeURIComponent(t.name)}`}
      className="tm-card"
      data-focus={focus || undefined}
      onMouseEnter={onEnter}
      onFocus={onEnter}
      aria-label={`${t.name} template`}
    >
      <span className="tm-thumb">
        <Graph t={t} />
        <span className="tm-use" aria-hidden>
          Use template
        </span>
      </span>
      <span className="tm-name">{t.name}</span>
      <span className="tm-sub">
        <span className="tm-sub__tags">{t.tags}</span>
        <span className="tm-sub__desc">{t.desc}</span>
      </span>
    </Link>
  );
}

function FillerCard({ i }: { i: number }) {
  const w = [[96, 128], [80, 104], [112, 90], [86, 124], [102, 76], [90, 116]][i % 6];
  return (
    <span className="tm-card tm-card--fill" aria-hidden>
      <span className="tm-thumb">
        <Graph t={FILL[i % FILL.length]} />
      </span>
      <span className="tm-fillbars">
        <i style={{ width: w[0] }} />
        <i style={{ width: w[1] }} />
      </span>
    </span>
  );
}

/* 9 columns by 3 rows, centred on the focus card (column 5) and cropped by
   the page: the middle row holds five real templates, the bottom row three,
   the rest are wordless filler. On a phone the crop leaves the focus card and
   the edges of its neighbours. */
const MAP: (number | null)[][] = [
  [null, null, null, null, null, null, null, null, null],
  [null, null, 0, 1, 2, 3, 4, null, null],
  [null, null, null, 5, 6, 7, null, null, null],
];

function Grid({ focus, setFocus }: { focus: number; setFocus: (i: number) => void }) {
  let fill = 0;
  return (
    <div className="tm-grid">
      {MAP.flatMap((row, r) =>
        row.map((t, c) =>
          t === null ? (
            <FillerCard key={`${r}-${c}`} i={fill++} />
          ) : (
            <Card key={`${r}-${c}`} t={TEMPLATES[t]} focus={focus === t} onEnter={() => setFocus(t)} />
          ),
        ),
      )}
    </div>
  );
}

export function Templates() {
  const [focus, setFocus] = useState(FOCUS_DEFAULT);
  return (
    <section className="sl-section sl-tm" aria-labelledby="templates-title">
      <div className="sl-wrap">
        <div className="tm-head" data-sl-reveal>
          <div className="tm-head__copy">
            <h2 id="templates-title" className="sl-h2">
              Start from a workflow that already runs
            </h2>
            <p className="cs-lead">Every template opens as a graph you can change, from a guarded DCA to an NFT watch.</p>
          </div>
          <Link className="cs-link" href="/marketplace">
            Browse all templates
            <ArrowRight size={16} strokeWidth={1.75} aria-hidden />
          </Link>
        </div>
      </div>
      <div className="tm-bleed" data-sl-reveal onMouseLeave={() => setFocus(FOCUS_DEFAULT)}>
        <Grid focus={focus} setFocus={setFocus} />
      </div>
    </section>
  );
}
