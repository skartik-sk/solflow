"use client";

import { RotateCcw, X } from "lucide-react";
import { Badge, Bar, Button, Check, Collapse, Roll, Stage, type Act } from "../kit";
import { NODES, NodeChip, type NodeId } from "./shared";
import "./Runs.css";

/*
 * Runs and replay: the executions of the Price-Guarded DCA template (its real
 * five nodes, cron "0 *\/4 * * *") beside the selected run's node timeline.
 * Run #1284 failed on Jupiter Direct Swap with the error safety.ts throws for
 * slippage. Replay is pressed, #1285 "Replay of #1284" opens above it, the
 * timeline clears and fills node by node, and the run succeeds. Run numbers,
 * times and durations are illustrative.
 */

type St = "idle" | "run" | "ok" | "fail" | "skip";
type S = { view: 84 | 85; r85: "off" | "run" | "ok"; st: St[] };

const RUN84: St[] = ["ok", "ok", "ok", "fail", "skip"];
const START: S = { view: 84, r85: "off", st: RUN84 };
const POSTER: S = { view: 85, r85: "ok", st: ["ok", "ok", "ok", "ok", "ok"] };

const STEPS: { id: NodeId; out84: string; out85: string; ms84: string; ms85: string }[] = [
  { id: "cron", out84: "fired 12:00:00 UTC", out85: "same trigger data", ms84: "0 ms", ms85: "0 ms" },
  { id: "priceFetch", out84: "SOL 171.42", out85: "SOL 171.42", ms84: "212 ms", ms85: "198 ms" },
  { id: "ifElse", out84: "price < 180 → true", out85: "price < 180 → true", ms84: "3 ms", ms85: "2 ms" },
  { id: "jupSwap", out84: "slippage", out85: "0.1 SOL → USDC", ms84: "1,840 ms", ms85: "1,612 ms" },
  { id: "result", out84: "skipped", out85: "Price-guarded DCA result", ms84: "", ms85: "4 ms" },
];

const setAt = (arr: St[], i: number, v: St) => arr.map((x, j) => (j === i ? v : x));

async function script(a: Act<S>) {
  await a.wait(1400);
  a.mark("replay");
  await a.click({ at: "replay", x: 0.82, y: 0.62 });
  for (let i = 4; i >= 0; i--) {
    await a.set((s) => ({ st: setAt(s.st, i, "idle") }));
    await a.wait(70);
  }
  await a.set({ view: 85, r85: "run" });
  await a.wait(450);
  const pace = [380, 560, 300, 1100, 380];
  for (let i = 0; i < 5; i++) {
    await a.set((s) => ({ st: setAt(s.st, i, "run") }));
    await a.wait(pace[i]);
    await a.set((s) => ({ st: setAt(s.st, i, "ok") }));
    await a.wait(110);
  }
  a.mark("done");
  await a.set({ r85: "ok" });
  await a.wait(2400);
}

/* ---------- the executions table ---------- */

function StatusBadge({ kind }: { kind: "ok" | "fail" | "run" }) {
  return (
    <Badge tone={kind === "ok" ? "success" : kind === "fail" ? "danger" : "neutral"} dot className="rn-badge" data-run={kind === "run" || undefined}>
      <Roll variant="fade">{kind === "ok" ? "Success" : kind === "fail" ? "Failed" : "Running"}</Roll>
    </Badge>
  );
}

type RowProps = { id: string; kind: "ok" | "fail" | "run"; trigger: string; nodes: string; dur: string; at: string; sel?: boolean; replay?: boolean; compact: boolean };

function Row({ id, kind, trigger, nodes, dur, at, sel, replay, compact }: RowProps) {
  const action = replay ? (
    <Button size="small" icon={<RotateCcw size={14} strokeWidth={2} />} data-target="replay" className="rn-replay">
      Replay
    </Button>
  ) : null;
  if (compact) {
    return (
      <div className="rn-row" data-sel={sel || undefined}>
        <StatusBadge kind={kind} />
        <span className="rn-row__main">
          <span className="rn-mono rn-strong">{id}</span>
          <span className="rn-row__sub">
            {trigger} · {dur}
          </span>
        </span>
        <span className="rn-row__act">{action}</span>
      </div>
    );
  }
  return (
    <div className="rn-row" data-sel={sel || undefined}>
      <StatusBadge kind={kind} />
      <span className="rn-mono rn-strong">{id}</span>
      <span className="rn-row__trigger">{trigger}</span>
      <span className="rn-mono rn-faint">{nodes}</span>
      <span className="rn-mono rn-faint">
        <Roll variant="fade">{dur}</Roll>
      </span>
      <span className="rn-mono rn-faint">{at}</span>
      <span className="rn-row__act">{action}</span>
    </div>
  );
}

function Filler({ w, compact }: { w: number; compact: boolean }) {
  return (
    <div className="rn-row rn-row--fill" aria-hidden>
      <Bar w={64} h={20} r={10} tone={2} />
      <Bar w={44} h={6} tone={3} />
      {!compact && (
        <>
          <Bar w={w} h={6} tone={2} />
          <Bar w={28} h={6} tone={2} />
          <Bar w={36} h={6} tone={2} />
          <Bar w={40} h={6} tone={2} />
        </>
      )}
    </div>
  );
}

function Table({ s, compact }: { s: S; compact: boolean }) {
  const done = s.st.filter((x) => x === "ok").length;
  return (
    <div className="rn-table">
      {!compact && (
        <div className="rn-row rn-row--head">
          <span>Status</span>
          <span>Run</span>
          <span>Trigger</span>
          <span>Nodes</span>
          <span>Duration</span>
          <span>Started</span>
          <span />
        </div>
      )}
      <Collapse open={s.r85 !== "off"}>
        <Row
          compact={compact}
          id="#1285"
          kind={s.r85 === "ok" ? "ok" : "run"}
          trigger="Replay of #1284"
          nodes={`${s.view === 85 ? done : 0} / 5`}
          dur={s.r85 === "ok" ? "1.9 s" : "–"}
          at="12:06"
          sel={s.view === 85}
        />
      </Collapse>
      <Row compact={compact} id="#1284" kind="fail" trigger="Cron" nodes="3 / 5" dur="2.1 s" at="12:00" sel={s.view === 84} replay />
      <Row compact={compact} id="#1283" kind="ok" trigger="Cron" nodes="5 / 5" dur="2.3 s" at="08:00" />
      {[96, 72, 88, 64].map((w, i) => (
        <Filler key={i} w={w} compact={compact} />
      ))}
    </div>
  );
}

/* ---------- the run's node timeline ---------- */

function Mark({ st }: { st: St }) {
  if (st === "fail") {
    return (
      <span className="rn-x" aria-hidden>
        <X size={10} strokeWidth={3} />
      </span>
    );
  }
  return <Check on={st === "ok"} pending={st === "run"} size={16} className="rn-check" data-skip={st === "skip" || undefined} />;
}

function Timeline({ s }: { s: S }) {
  const v = s.view;
  return (
    <div className="rn-detail">
      <div className="rn-detail__head">
        <span className="rn-mono rn-strong rn-detail__id">
          <Roll>{`#${1200 + v}`}</Roll>
        </span>
        <span className="rn-faint rn-detail__sub">
          <Roll variant="fade">{v === 84 ? "Cron · 12:00 UTC" : "Replay of #1284"}</Roll>
        </span>
      </div>
      <ol className="rn-steps">
        {STEPS.map((step, i) => {
          const st = s.st[i];
          const shown = st === "ok" || st === "fail" || st === "skip";
          const out = v === 84 ? step.out84 : step.out85;
          const ms = v === 84 ? step.ms84 : step.ms85;
          return (
            <li key={step.id} className="rn-step" data-st={st}>
              <span className="rn-step__mark">
                <Mark st={st} />
              </span>
              <NodeChip id={step.id} size={22} />
              <span className="rn-step__main">
                <span className="rn-step__label">{NODES[step.id].label}</span>
                <span className="rn-step__out" data-on={shown || undefined}>
                  <Roll variant="fade">{out}</Roll>
                </span>
              </span>
              <span className="rn-mono rn-faint rn-step__ms" data-on={(shown && ms) || undefined}>
                <Roll variant="fade" align="end">
                  {ms || " "}
                </Roll>
              </span>
              {step.id === "jupSwap" && (
                <Collapse open={st === "fail"} className="rn-err-wrap">
                  <p className="rn-err">Jupiter Direct Swap exceeds the configured max slippage.</p>
                </Collapse>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function Runs() {
  return (
    <section className="sl-section sl-runs" aria-labelledby="runs-title">
      <div className="sl-wrap">
        <div className="cs-head" data-center data-sl-reveal>
          <h2 id="runs-title" className="sl-h2">
            Every run is kept, and can be replayed
          </h2>
          <p className="cs-lead">Each run keeps its trigger data and every node&apos;s output. Fix a node, then replay the run that failed.</p>
        </div>
        <div className="cs-stage" data-sl-reveal>
          <Stage<S>
            width={1152}
            height={420}
            compact={{ below: 900, width: 358, height: 664 }}
            theme="dark"
            initial={START}
            poster={POSTER}
            script={script}
            play="once"
            cursor={{ at: { wide: { x: 640, y: 330 }, compact: { x: 250, y: 300 } }, style: "real" }}
          >
            {(s, _rect, layout) => {
              const compact = layout === "compact";
              return (
                <div className="rn-app">
                  <div className="rn-bar">
                    <span className="rn-bar__title">Executions</span>
                    <span className="rn-faint">Price-Guarded DCA</span>
                    {!compact && <span className="rn-mono rn-faint rn-bar__cron">0 */4 * * *</span>}
                  </div>
                  <div className="rn-body">
                    <Table s={s} compact={compact} />
                    <Timeline s={s} />
                  </div>
                </div>
              );
            }}
          </Stage>
        </div>
      </div>
    </section>
  );
}
