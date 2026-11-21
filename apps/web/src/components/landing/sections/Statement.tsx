"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Check, Code, Count, Segmented, Spinner, Stage, clock, type Act } from "../kit";
import "./Statement.css";

// Three facts as a ruled bento (stageshow's ruled-bento): one rounded
// container, 1px rules, three equal cells. Each cell is a run-in headline over
// one small piece of the product, its own Stage at 1:1, pinned to the cell's
// foot and cropped by it.
//
//   Tile        Kind        The one thing                              Moves
//   Frameworks  Component   the framework switch over lib.rs           switches on its own, the file follows
//   Build       Stat + log  the build timer                            rolls to 0.41 s as the steps tick
//   Audit       List        rule rows, SOL-001 to SOL-073              each check lands, the count reaches 27
//
// Every string is real: lib.rs is the first five lines @solflow/codegen writes
// for the vault template per framework; 0.41 s and 11,392 bytes are the warm
// Pinocchio vault build the hero shows; rule ids and names come from
// packages/audit/src/rules (27 rules in all).

const H = 216;
const H_COMPACT = 200;

/** The picture slot's width, so each Stage draws 1:1 at the cell's own width. */
function useSlotWidth(initial: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(initial);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => node.clientWidth && setWidth(node.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function Tile({ title, line, children }: { title: string; line: string; children: (width: number) => ReactNode }) {
  const [ref, width] = useSlotWidth(380);
  return (
    <div className="sl-bt">
      <p className="sl-bt__copy">
        <b>{title}</b> {line}
      </p>
      <div ref={ref} className="sl-bt__pic">
        {children(width)}
      </div>
    </div>
  );
}

/* ---------- Frameworks: the switch and the file it writes ---------- */

const FRAMEWORKS = ["Anchor", "Pinocchio", "Quasar"];
const LIB_RS = [
  ["use anchor_lang::prelude::*;", "", "pub mod instructions;", "pub mod state;", "pub mod errors;", "pub mod events;"],
  ["#![no_std]", "", "use pinocchio::{", "    AccountView,", "    Address,", "    error::ProgramError,"],
  ["#![cfg_attr(not(test), no_std)]", "use quasar_lang::prelude::*;", "", "pub mod instructions;", "pub mod state;", "pub mod errors;"],
];

type Fw = { fw: number };

const cycle = async (a: Act<Fw>) => {
  await a.wait(1800);
  await a.set({ fw: 1 });
  await a.wait(2400);
  await a.set({ fw: 2 });
  await a.wait(2400);
  await a.set({ fw: 0 });
  await a.wait(600);
};

function Frameworks() {
  return (
    <Tile title="Three frameworks, one graph." line="Switch without redrawing.">
      {(width) => (
        <Stage<Fw>
          width={width}
          height={width < 360 ? H_COMPACT : H}
          theme="dark"
          initial={{ fw: 0 }}
          poster={{ fw: 1 }}
          script={cycle}
          play="loop"
          className="sl-bt-stage"
        >
          {(s) => (
            <div className="sl-bt-fw">
              <Segmented className="sl-bt-fw__seg" items={FRAMEWORKS} value={s.fw} />
              <div className="sl-bt-panel sl-bt-fw__file">
                <div className="sl-bt-panel__head">
                  <span className="sl-bt-mono">src/lib.rs</span>
                </div>
                <div className="sl-bt-fw__versions">
                  {LIB_RS.map((lines, i) => (
                    <div key={FRAMEWORKS[i]} className="sl-bt-fw__ver" data-on={i === s.fw || undefined} aria-hidden={i !== s.fw || undefined}>
                      <Code lines={lines} className="sl-bt-code" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Stage>
      )}
    </Tile>
  );
}

/* ---------- Build: a warm Pinocchio build, timed ---------- */

const BUILD_MS = 410;
// The build is shown slower than it runs, so the timer can be read rolling
const SHOWN_MS = 1400;
const STEPS = [
  { text: "compile vault v0.1.0", at: 0, done: 300 },
  { text: "sbpf-link vault.so", at: 300, done: 410 },
];

type Build = { t: number; on: boolean };

const build = async (a: Act<Build>) => {
  await a.wait(700);
  await a.set({ on: true });
  const start = clock.now();
  for (;;) {
    const p = Math.min(1, (clock.now() - start) / SHOWN_MS);
    a.put({ t: Math.round(p * BUILD_MS) });
    if (p >= 1) break;
    await a.wait(16);
  }
};

function BuildTile() {
  return (
    <Tile title="Builds in 0.41 s." line="Warm Pinocchio, in your browser.">
      {(width) => (
        <Stage<Build>
          width={width}
          height={width < 360 ? H_COMPACT : H}
          theme="dark"
          initial={{ t: 0, on: false }}
          poster={{ t: BUILD_MS, on: true }}
          script={build}
          play="once"
          className="sl-bt-stage"
        >
          {(s) => {
            const done = s.t >= BUILD_MS;
            return (
              <div className="sl-bt-build" data-done={done || undefined}>
                <div className="sl-bt-build__timer">
                  <span className="sl-bt-build__secs">{(s.t / 1000).toFixed(2)}</span>
                  <span className="sl-bt-build__unit">s</span>
                </div>
                <div className="sl-bt-build__log">
                  {STEPS.map((step) => {
                    const started = s.on && s.t >= step.at;
                    const ok = s.t >= step.done;
                    return (
                      <div key={step.text} className="sl-bt-ln" data-on={started || undefined}>
                        <span className="sl-bt-ln__mark" data-ok={ok || undefined}>
                          <Spinner size={12} />
                          <Check on={ok} size={14} />
                        </span>
                        <span>{step.text}</span>
                      </div>
                    );
                  })}
                  <div className="sl-bt-ln sl-bt-ln--out" data-on={done || undefined}>
                    <span className="sl-bt-ln__mark" />
                    <span>
                      vault.so <span className="sl-bt-faint">11,392 bytes</span>
                    </span>
                  </div>
                </div>
              </div>
            );
          }}
        </Stage>
      )}
    </Tile>
  );
}

/* ---------- Audit: the rules, checked ---------- */

const RULES = [
  { id: "SOL-001", name: "Missing signer check" },
  { id: "SOL-004", name: "Non-canonical PDA derivation" },
  { id: "SOL-010", name: "Unchecked arithmetic" },
  { id: "SOL-021", name: "Missing bump verification" },
  { id: "SOL-040", name: "CPI to unverified program" },
  { id: "SOL-073", name: "Missing constraint for uniqueness" },
];
const TOTAL = 27;

type Audit = { n: number };

const audit = async (a: Act<Audit>) => {
  await a.wait(900);
  for (let n = 1; n <= RULES.length; n++) {
    await a.set({ n });
    await a.wait(260);
  }
};

function AuditTile() {
  return (
    <Tile title="27 audit rules, always on." line="Checked on every change.">
      {(width) => (
        <Stage<Audit>
          width={width}
          height={width < 360 ? H_COMPACT : H}
          theme="dark"
          initial={{ n: 0 }}
          poster={{ n: RULES.length }}
          script={audit}
          play="once"
          className="sl-bt-stage"
        >
          {(s) => {
            const all = s.n >= RULES.length;
            return (
              <div className="sl-bt-panel sl-bt-audit">
                <div className="sl-bt-panel__head">
                  <span>Rules</span>
                  <span className="sl-bt-audit__count" data-done={all || undefined}>
                    <Count value={all ? TOTAL : Math.round((s.n / RULES.length) * (TOTAL - 4))} duration={300} />
                    <span className="sl-bt-faint">/{TOTAL}</span>
                  </span>
                </div>
                <div className="sl-bt-audit__rows">
                  {RULES.map((r, i) => (
                    <div key={r.id} className="sl-bt-rule" data-ok={i < s.n || undefined}>
                      <Check on={i < s.n} pending={i === s.n} size={14} />
                      <span className="sl-bt-rule__id">{r.id}</span>
                      <span className="sl-bt-rule__name">{r.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          }}
        </Stage>
      )}
    </Tile>
  );
}

export function Statement() {
  return (
    <section className="sl-statement" aria-labelledby="sl-statement-title">
      <div className="sl-wrap">
        <h2 id="sl-statement-title" className="sr-only">
          SolStudio at a glance
        </h2>
        <div className="sl-bento" data-sl-reveal>
          <Frameworks />
          <BuildTile />
          <AuditTile />
        </div>
      </div>
    </section>
  );
}
