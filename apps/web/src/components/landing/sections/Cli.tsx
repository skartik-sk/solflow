"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Copy, Database, FileCode2, Play } from "lucide-react";
import { Stage } from "../kit/stage";
import { Caret, Prompt, Window } from "../kit/window";
import { Spinner } from "../kit/parts/Spinner";
import type { Act } from "../kit/act";
import "./Cli.css";

// The CLI in a terminal: audit a local Anchor repo, then open the visualizer.
// The transcript follows what the tool prints (packages/cli/src/commands
// audit.ts -> formatSummary, view.ts), simplified: the summary block, the two
// findings that are left on the vault, then the server lines. When `view`
// says "Opened in browser." the visualizer comes forward as a satellite
// straddling the terminal's right edge.

type S = {
  /** characters of the first command typed */
  cmd1: string;
  /** 0 idle, 1 parsing, 2 parsed */
  parse: 0 | 1 | 2;
  summary: boolean;
  findings: boolean;
  cmd2: string;
  server: boolean;
  opened: boolean;
  view: boolean;
};

const CMD1 = "bunx @solstudio/cli audit ./programs/vault";
const CMD2 = "solstudio view";
const INSTALL = "bun add -g @solstudio/cli";
const PATH = "~/code/vault";

const initial: S = { cmd1: "", parse: 0, summary: false, findings: false, cmd2: "", server: false, opened: false, view: false };
const poster: S = { cmd1: CMD1, parse: 2, summary: true, findings: true, cmd2: CMD2, server: true, opened: true, view: true };

async function script(a: Act<S>) {
  await a.wait(700);
  await a.type("cmd1", CMD1, { interval: 32 });
  await a.wait(250);
  await a.set({ parse: 1 });
  await a.wait(1100);
  await a.set({ parse: 2 });
  await a.wait(200);
  await a.set({ summary: true });
  await a.wait(500);
  await a.set({ findings: true });
  await a.wait(1400);
  await a.type("cmd2", CMD2, { interval: 45 });
  await a.wait(250);
  await a.set({ server: true });
  await a.wait(700);
  await a.set({ opened: true });
  await a.wait(150);
  a.mark("view");
  await a.set({ view: true });
  await a.wait(4200);
  // Close the visualizer, then clear the screen (Ctrl+L) so the loop starts from a fresh prompt
  await a.set({ view: false });
  await a.wait(500);
  await a.set(initial);
  await a.wait(300);
}

function Line({ on, i = 0, className = "", children }: { on: boolean; i?: number; className?: string; children: React.ReactNode }) {
  return (
    <div className={`cli-out ${className}`} data-on={on || undefined} style={{ ["--i" as string]: i }}>
      {children}
    </div>
  );
}

function Terminal({ s, compact }: { s: S; compact: boolean }) {
  const done1 = s.parse > 0;
  return (
    <Window chrome="terminal" lights="grey" title={compact ? undefined : "vault — zsh"} className="cli-term" body={{ "data-crop": "" }}>
      <div className="ss-term cli-term__body">
        <Prompt path={PATH}>
          <span data-typing>{s.cmd1}</span>
          {!done1 && <Caret />}
        </Prompt>

        <Line on={s.parse > 0} className="cli-mark-line">
          <span className="cli-mark">
            <span className="cli-spin" data-on={s.parse === 1 || undefined}>
              <Spinner size={12} />
            </span>
            <span className="cli-tick ok" data-on={s.parse === 2 || undefined}>
              ✓
            </span>
          </span>
          <span className="dim">Parsing</span> programs/vault<span className="dim">/src/lib.rs</span>
        </Line>

        <div className="cli-block">
          <Line on={s.summary} i={0}>
            <span className="dim">Framework    :</span> anchor
          </Line>
          <Line on={s.summary} i={1}>
            <span className="dim">Score        :</span> <span className="cli-strong">86/100</span>
          </Line>
          <Line on={s.summary} i={2}>
            <span className="dim">Findings     :</span> 2
          </Line>
          <Line on={s.summary} i={3}>
            <span className="dim">Severity     :</span> critical=0, high=0, <span className="warn">medium=2</span>
            {compact ? "" : ", low=0, info=0"}
          </Line>
        </div>

        <div className="cli-block">
          <Line on={s.findings} i={0}>
            <span className="dim">Top findings:</span>
          </Line>
          <Line on={s.findings} i={1} className="cli-hang">
            {"  - "}
            <span className="warn">[medium]</span> SOL-050: Missing input validation in &quot;deposit&quot;
          </Line>
          <Line on={s.findings} i={2} className="cli-hang">
            {"  - "}
            <span className="warn">[medium]</span> SOL-050: Missing input validation in &quot;withdraw&quot;
          </Line>
        </div>

        <Prompt path={PATH} className="cli-out cli-block" data-on={s.findings || undefined} style={{ ["--i" as string]: 3 }}>
          <span data-typing>{s.cmd2}</span>
          {s.findings && !s.server && <Caret />}
        </Prompt>

        <Line on={s.server} i={0}>
          <span className="dim">Starting SolStudio server on port 6139...</span>
        </Line>
        <Line on={s.opened} i={0} className="cli-block cli-indent">
          SolStudio running at <span className="cli-url">http://localhost:6139</span>
        </Line>
        <Line on={s.opened} i={1} className="cli-indent">
          <span className="dim">Opened in browser.</span>
        </Line>
      </div>
    </Window>
  );
}

/** The local visualizer: the same graph the editor draws, served from localhost */
function Visualizer({ show }: { show: boolean }) {
  return (
    <Window url="localhost:6139" className="cli-viz" data-show={show || undefined} urlShape="pill">
      <div className="cli-viz__canvas">
        <div className="cli-viz__graph">
        <svg className="cli-viz__wires" viewBox="-10 -9 400 254" aria-hidden>
          <path d="M150 58 C 186 58, 186 46, 222 46" />
          <path d="M150 58 C 186 58, 186 150, 222 150" />
          <path d="M310 70 C 310 100, 310 100, 310 126" />
        </svg>
        <div className="cli-node cli-node--program" style={{ left: 18, top: 34 }}>
          <div className="cli-node__head">
            <span className="cli-node__badge">
              <FileCode2 size={12} strokeWidth={2} />
            </span>
            Program
          </div>
          <div className="cli-node__name">vault</div>
        </div>
        <div className="cli-node cli-node--ix" style={{ left: 222, top: 22 }}>
          <div className="cli-node__head">
            <span className="cli-node__badge">
              <Play size={12} strokeWidth={2} />
            </span>
            Instruction
          </div>
          <div className="cli-node__name">deposit</div>
        </div>
        <div className="cli-node cli-node--ix" style={{ left: 222, top: 126 }}>
          <div className="cli-node__head">
            <span className="cli-node__badge">
              <Play size={12} strokeWidth={2} />
            </span>
            Instruction
          </div>
          <div className="cli-node__name">withdraw</div>
        </div>
        <div className="cli-node cli-node--state" style={{ left: 18, top: 150 }}>
          <div className="cli-node__head">
            <span className="cli-node__badge">
              <Database size={12} strokeWidth={2} />
            </span>
            State
          </div>
          <div className="cli-node__name">Vault</div>
        </div>
        </div>
      </div>
    </Window>
  );
}

function InstallChip() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };
  return (
    <button type="button" className="cli-chip" onClick={copy} aria-label={`Copy install command: ${INSTALL}`} data-copied={copied || undefined}>
      <span className="cli-chip__sigil" aria-hidden>
        $
      </span>
      <span className="cli-chip__cmd">{INSTALL}</span>
      <span className="cli-chip__icon" aria-hidden>
        <Copy size={16} strokeWidth={1.75} className="cli-chip__copy" />
        <Check size={16} strokeWidth={1.75} className="cli-chip__check" />
      </span>
      <span className="cli-chip__live" aria-live="polite">
        {copied ? "Copied" : ""}
      </span>
    </button>
  );
}

export function Cli() {
  return (
    <section className="sl-cli sl-section" aria-labelledby="sl-cli-title">
      <div className="sl-wrap">
        <div className="cli-head" data-sl-reveal>
          <h2 id="sl-cli-title" className="sl-h2">
            Your code never leaves your machine
          </h2>
          <p className="sl-lead">
            Point the CLI at an Anchor, Pinocchio or Quasar repo you already have. It parses the program into the same
            graph, audits it, runs your tests, writes CI and opens the visualizer on localhost.
          </p>
          <div className="cli-actions">
            <InstallChip />
            <a className="cli-link" href="/docs/cli">
              CLI docs
              <ArrowRight size={16} strokeWidth={1.75} aria-hidden />
            </a>
          </div>
        </div>

        <div className="cli-object" data-sl-reveal>
          <Stage<S>
            width={1152}
            height={500}
            compact={{ below: 880, width: 358, height: 620 }}
            theme="dark"
            initial={initial}
            poster={poster}
            script={script}
            play="loop"
            className="cli-stage"
          >
            {(s, _rect, layout) => (
              <>
                <Terminal s={s} compact={layout === "compact"} />
                <Visualizer show={s.view} />
              </>
            )}
          </Stage>
        </div>
      </div>
    </section>
  );
}
