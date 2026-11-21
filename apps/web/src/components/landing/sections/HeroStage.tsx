"use client";

import type { ReactNode } from "react";
import { Check, Code2, FileCode2, Hammer, Shield, Wallet, Zap } from "lucide-react";
import { Bar, Button, Collapse, Segmented, Spinner, Stage, States, Window, type Act, type Point, type Rect } from "../kit";
import { HeroCode, ANCHOR, ANCHOR_COMPACT, PINOCCHIO, PINOCCHIO_COMPACT } from "./HeroCode";

// The SolStudio editor, simplified. Plan:
// - Place: full-width hero under centred copy, dark page, shown 1:1 at 1440
//   (1136 x 640 inside the bezel); compact redesign at 342 for the phone column.
// - Focal object: the has_one constraint and the code it writes.
// - Beats (about 14 s): 1. the cursor wires has_one to vault_state's authority
//   field; 2. the matching line opens in lib.rs, banded in the constraint's
//   colour; 3. the framework switch goes Anchor -> Pinocchio, the program node
//   and the code follow; 4. Compile: the console line spins, then reads
//   "Compiled in your browser · 0.41 s · 11,392 bytes"; 5. Deploy to devnet
//   confirms on itself and the console prints the program id. Hold, then
//   everything the loop added leaves in one reverse stagger.
// - Poster: the compiled state (wired, Pinocchio, compiled).
// - Real strings: node names and fields, a few code lines, the console lines.
//   Everything else is bars.

type S = {
  /** The live end of the wire while it is being dragged */
  wire: Point | null;
  wired: boolean;
  line: boolean;
  fw: 0 | 1;
  build: 0 | 1 | 2;
  deploy: 0 | 1 | 2;
};

const initial: S = { wire: null, wired: false, line: false, fw: 0, build: 0, deploy: 0 };
const POSTER: S = { wire: null, wired: true, line: true, fw: 1, build: 2, deploy: 0 };
const FW = ["anchor", "pinocchio"] as const;
const PROGRAM_ID = "Cz5y…REhz";
const REST = { wide: { x: 760, y: 560 }, compact: { x: 250, y: 300 } };

async function script(a: Act<S>) {
  await a.wait(700);

  // 1. Wire the constraint to the account's authority field
  await a.move("h-con");
  await a.wait(250);
  a.mark("wire");
  await a.drag("h-acct", (at) => a.put({ wire: at }), { duration: 1200, cursor: "preserve" });
  a.put({ wired: true, wire: null });

  // 2. The matching line opens in lib.rs
  await a.wait(350);
  await a.set({ line: true });
  await a.wait(1500);

  // 3. Switch the framework
  await a.move({ at: "fw-pinocchio", x: 0.82, y: 0.7 });
  await a.wait(200);
  await a.click();
  await a.set({ fw: 1 });
  await a.wait(1500);

  // 4. Compile in the browser
  await a.move({ at: "compile", x: 0.86, y: 0.7 });
  await a.wait(200);
  await a.click();
  await a.set({ build: 1 });
  await a.wait(1000);
  a.mark("compiled");
  await a.set({ build: 2 });
  await a.wait(1400);

  // 5. Deploy to devnet
  await a.move({ at: "deploy", x: 0.88, y: 0.7 });
  await a.wait(200);
  await a.click();
  await a.set({ deploy: 1 });
  await a.wait(1100);
  a.mark("deployed");
  await a.set({ deploy: 2 });
  await a.move("rest");
  await a.wait(2200);

  // Undo in place, last change first
  await a.set({ deploy: 0, build: 0 });
  await a.wait(90);
  await a.set({ fw: 0 });
  await a.wait(90);
  await a.set({ line: false });
  await a.wait(90);
  await a.set({ wired: false });
  await a.wait(700);
}

/** A horizontal S between two handles, as the editor draws its edges. */
function hPath(from: Point, to: Point) {
  const dx = Math.max(40, Math.abs(to.x - from.x) / 2);
  return `M${from.x} ${from.y} C${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`;
}
/** A vertical S, parent above child. */
function vPath(from: Point, to: Point) {
  const dy = Math.max(24, Math.abs(to.y - from.y) / 2);
  return `M${from.x} ${from.y} C${from.x} ${from.y + dy}, ${to.x} ${to.y - dy}, ${to.x} ${to.y}`;
}
const mid = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
const ok = (r: Rect) => r.width > 0;

export function HeroStage() {
  return (
    <Stage<S>
      width={1136}
      height={640}
      compact={{ below: 880, width: 346, height: 586 }}
      theme="dark"
      initial={initial}
      poster={POSTER}
      script={script}
      cursor={{ at: REST }}
      className="sl-hs"
    >
      {(s, rect, layout) => {
        const wide = layout === "wide";
        const actions = <Actions s={s} small={!wide} />;
        const edge = (a: string, b: string, d: (f: Point, t: Point) => string) =>
          ok(rect(a)) && ok(rect(b)) ? d(mid(rect(a)), mid(rect(b))) : undefined;
        const con = ok(rect("h-con")) ? mid(rect("h-con")) : null;
        const target = s.wire ?? (ok(rect("h-acct")) ? mid(rect("h-acct")) : null);
        const Frame = wide ? Window : Panel;
        return (
          <>
            <Frame
              className="sl-hs__win"
              title="vault"
              toolbar={
                <div className="sl-hs__tools">
                  <Segmented
                    className="sl-hs__fw"
                    items={["Anchor", "Pinocchio", "Quasar"]}
                    value={s.fw}
                    targets={["fw-anchor", "fw-pinocchio", "fw-quasar"]}
                    cursor="pointer"
                  />
                  {wide && actions}
                </div>
              }
            >
              <div className="sl-hs__body">
                <div className="sl-hs__canvas" data-cursor="open" data-crop>
                  <div className="sl-hs__dots" aria-hidden />
                  {wide && (
                    <>
                      <Node kind="program" name="vault" tag={<States align="end" value={FW[s.fw]} states={{ anchor: "anchor", pinocchio: "pinocchio" }} />} at={[254, 40, 180]} handles={[{ id: "h-prog", side: "bottom" }]}>
                        <Field label="instructions" value="3" />
                      </Node>
                      <Node kind="instruction" name="initialize" at={[28, 172, 176]} handles={[{ id: "h-i0", side: "top" }]}>
                        <Filler a={44} b={52} />
                      </Node>
                      <Node kind="instruction" name="deposit" at={[256, 172, 176]} handles={[{ id: "h-i1", side: "top" }]}>
                        <Filler a={50} b={30} />
                      </Node>
                    </>
                  )}
                  <Node kind="instruction" name="withdraw" at={wide ? [484, 172, 176] : [192, -50, 142]} handles={[{ id: "h-i2", side: "top" }, { id: "h-i2o", side: "bottom" }]}>
                    <Filler a={46} b={34} />
                  </Node>
                  <Node kind="account" name="vault_state" rows={3} at={wide ? [460, 308, 200] : [192, 102, 142]} handles={[{ id: "h-acc-top", side: "top" }, { id: "h-acct", side: "left", row: 0, lit: s.wired }]}>
                    <Field label="authority" value="Pubkey" />
                    <Field label="balance" value="u64" />
                    <Field label="bump" value="u8" />
                  </Node>
                  <Node kind="constraint" name="has_one" at={wide ? [84, 346, 196] : [12, 146, 132]} handles={[{ id: "h-con", side: "right", row: 0, grab: true }]}>
                    <Field label="target" value="authority" />
                  </Node>
                </div>

                <div className="sl-hs__code">
                  <div className="sl-hs__tabs">
                    <span className="sl-hs__tab">
                      <FileCode2 size={14} strokeWidth={1.75} />
                      lib.rs
                    </span>
                  </div>
                  <div className="sl-hs__versions" data-crop>
                    <HeroCode lines={wide ? ANCHOR : ANCHOR_COMPACT} first={wide ? 1 : 4} on={s.fw === 0} open={s.line} />
                    <HeroCode lines={wide ? PINOCCHIO : PINOCCHIO_COMPACT} first={wide ? 1 : 10} on={s.fw === 1} open />
                  </div>
                </div>

                <div className="sl-hs__console">
                  <div className="sl-hs__chead">
                    <span className="sl-hs__ctab">Build</span>
                    {!wide && actions}
                  </div>
                  {/* Two lines in view: each new line opens as the oldest folds away */}
                  <div className="sl-hs__lines">
                    <Collapse open={s.build === 0}>
                      <div className="sl-hs__ln sl-hs__ln--dim">
                        <span className="sl-hs__mark"><i className="sl-hs__dot" /></span>
                        {wide ? "rustc 1.101.0-nightly · sBPF v3 · ready" : "rustc 1.101.0-nightly · ready"}
                      </div>
                    </Collapse>
                    <Collapse open={s.deploy === 0}>
                      <div className="sl-hs__ln sl-hs__ln--dim">
                        <span className="sl-hs__mark"><i className="sl-hs__dot" /></span>
                        <span>
                          Generated lib.rs ·<States className="sl-hs__fwname" align="start" value={FW[s.fw]} states={{ anchor: "anchor", pinocchio: "pinocchio" }} />
                        </span>
                      </div>
                    </Collapse>
                    <Collapse open={s.build > 0}>
                      <div className="sl-hs__ln">
                        <Mark done={s.build === 2} />
                        <States
                          align="start"
                          value={s.build === 2 ? "done" : "busy"}
                          states={{ busy: "Compiling in your browser", done: wide ? "Compiled in your browser · 0.41 s · 11,392 bytes" : "Compiled · 0.41 s · 11,392 bytes" }}
                        />
                      </div>
                    </Collapse>
                    <Collapse open={s.deploy > 0}>
                      <div className="sl-hs__ln">
                        <Mark done={s.deploy === 2} />
                        <States align="start" value={s.deploy === 2 ? "done" : "busy"} states={{ busy: "Deploying to devnet", done: `Deployed to devnet · ${PROGRAM_ID}` }} />
                      </div>
                    </Collapse>
                  </div>
                </div>
              </div>
            </Frame>

            {/* Edges, drawn over the canvas in stage pixels from the measured handles */}
            <svg className="sl-hs__edges" aria-hidden>
              {wide && (
                <>
                  <path className="sl-hs__edge" d={edge("h-prog", "h-i0", vPath)} />
                  <path className="sl-hs__edge" d={edge("h-prog", "h-i1", vPath)} />
                  <path className="sl-hs__edge" d={edge("h-prog", "h-i2", vPath)} />
                </>
              )}
              <path
                className="sl-hs__edge sl-hs__edge--acct"
                d={edge("h-i2o", "h-acc-top", vPath)}
              />
              {con && target && (
                <path className="sl-hs__edge sl-hs__edge--con" data-on={s.wired || !!s.wire || undefined} data-live={!!s.wire || undefined} d={hPath(con, target)} />
              )}
            </svg>
            <span data-target="rest" style={{ position: "absolute", left: REST[layout].x, top: REST[layout].y }} />
          </>
        );
      }}
    </Stage>
  );
}

/** The phone column's frame: the editor's own top bar, no desktop chrome. */
function Panel({ title, toolbar, children, className }: { title: string; toolbar: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`sl-hs__panel ${className ?? ""}`}>
      <div className="sl-hs__pbar">
        <span className="sl-hs__ptitle">{title}</span>
        {toolbar}
      </div>
      {children}
    </div>
  );
}

function Actions({ s, small }: { s: S; small: boolean }) {
  return (
    <>
      <Button data-target="compile" size={small ? "medium" : "medium"} icon={<Hammer size={14} strokeWidth={1.75} />}>
        Compile
      </Button>
      {/* The label states share one box held at the widest, so nothing beside it moves */}
      <Button data-target="deploy" variant="primary" className="sl-hs__deploy">
        <States
          value={(["idle", "busy", "done"] as const)[s.deploy]}
          states={{
            idle: small ? "Deploy" : "Deploy to devnet",
            busy: "Deploying",
            done: (
              <span className="sl-hs__done">
                <Check size={14} strokeWidth={2} />
                Deployed
              </span>
            ),
          }}
        />
      </Button>
    </>
  );
}

const ICON = { program: Code2, instruction: Zap, account: Wallet, constraint: Shield } as const;

// Node geometry, as the editor lays it out: a 40px header over 18px rows.
const HEAD = 42;
const ROW = 22;
type HandleDef = { id: string; side: "top" | "bottom" | "left" | "right"; row?: number; lit?: boolean; grab?: boolean };

/** A node, with its handles placed on its edges as siblings so they sit outside its padding. */
function Node({
  kind,
  name,
  tag,
  at,
  rows = 1,
  handles = [],
  children,
}: {
  kind: keyof typeof ICON;
  name: string;
  tag?: ReactNode;
  /** left, top, width */
  at: [number, number, number];
  rows?: number;
  handles?: HandleDef[];
  children?: ReactNode;
}) {
  const I = ICON[kind];
  const [left, top, width] = at;
  const height = HEAD + 8 + rows * ROW - 4 + 10 + 1;
  const pos = (h: HandleDef) => {
    const rowY = top + HEAD + 8 + (h.row ?? 0) * ROW + 9;
    if (h.side === "top") return { left: left + width / 2, top };
    if (h.side === "bottom") return { left: left + width / 2, top: top + height };
    if (h.side === "left") return { left, top: rowY };
    return { left: left + width, top: rowY };
  };
  return (
    <>
      <div className="sl-hs__node" data-kind={kind} style={{ left, top, width, height }}>
        <div className="sl-hs__nhead">
          <span className="sl-hs__badge">
            <I size={14} strokeWidth={1.75} />
          </span>
          <span className="sl-hs__name">{name}</span>
          {tag && <span className="sl-hs__tag">{tag}</span>}
        </div>
        {children && <div className="sl-hs__nbody">{children}</div>}
      </div>
      {handles.map((h) => (
        <i
          key={h.id}
          className="sl-hs__handle"
          data-kind={kind}
          data-target={h.id}
          data-cursor={h.side === "left" || h.side === "right" ? "pointer" : undefined}
          data-lit={h.lit || undefined}
          data-grab={h.grab || undefined}
          style={pos(h)}
        />
      ))}
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="sl-hs__field">
      <span>{label}</span>
      <span className="sl-hs__val">{value}</span>
    </div>
  );
}

function Filler({ a, b }: { a: number; b: number }) {
  return (
    <div className="sl-hs__field">
      <Bar w={a} h={6} tone={2} />
      <Bar w={b} h={6} tone={3} />
    </div>
  );
}

/** A status mark: the spinner and the tick share one cell and crossfade. */
function Mark({ done }: { done: boolean }) {
  return (
    <span className="sl-hs__mark" data-done={done || undefined}>
      <Spinner size={14} />
      <Check size={14} strokeWidth={2} />
    </span>
  );
}
