"use client";

import { Play } from "lucide-react";
import { Badge, Button, Check, Collapse, Roll, Spinner, Stage, type Act } from "../kit";
import { NodeChip } from "./shared";
import "./Triggers.css";

/*
 * Triggers: the three real trigger nodes (trigger:cron, trigger:webhook,
 * trigger:manual) side by side as one ruled strip, each doing its one thing.
 * The cron's bar runs out and the run lands in its history while the next
 * run rolls on; a POST reaches the webhook's URL and its JSON lands; Run once
 * is pressed and the Pyth Feed Finder template's three nodes tick through.
 * Played once when seen; the poster is the end, all three done.
 */

type S = {
  /** cron bar: 0 empty, 1 running out, 2 reset after the fire, 3 ticking on */
  bar: 0 | 1 | 2 | 3;
  fired: boolean;
  next: string;
  req: boolean;
  body: number;
  run: 0 | 1 | 2;
  steps: number;
};

const START: S = { bar: 0, fired: false, next: "12:05:00", req: false, body: 0, run: 0, steps: 0 };
const POSTER: S = { bar: 3, fired: true, next: "12:10:00", req: true, body: 5, run: 2, steps: 3 };

async function script(a: Act<S>) {
  await a.wait(400);
  await a.set({ bar: 1 });
  await a.wait(3000);
  a.mark("cron");
  await a.set({ fired: true, next: "12:10:00" });
  await a.snap({ bar: 2 }, "cron-bar");
  await a.set({ bar: 3 });
  await a.wait(900);
  a.mark("webhook");
  await a.set({ req: true });
  await a.wait(240);
  for (let i = 1; i <= 5; i++) {
    await a.set({ body: i });
    await a.wait(90);
  }
  await a.wait(900);
  a.mark("manual");
  await a.click({ at: "run-once", x: 0.86, y: 0.62 });
  await a.set({ run: 1 });
  for (let i = 1; i <= 3; i++) {
    await a.wait(i === 2 ? 620 : 320);
    await a.set({ steps: i });
  }
  await a.wait(260);
  a.mark("done");
  await a.set({ run: 2 });
  await a.wait(2400);
}

const BODY = [
  <>{"{"}</>,
  <>
    {"  "}
    <b>&quot;type&quot;</b>: <i>&quot;SWAP&quot;</i>,
  </>,
  <>
    {"  "}
    <b>&quot;source&quot;</b>: <i>&quot;JUPITER&quot;</i>,
  </>,
  <>
    {"  "}
    <b>&quot;feePayer&quot;</b>: <i>&quot;7xKX…9fQ2&quot;</i>
  </>,
  <>{"}"}</>,
];

const STEPS = [
  { id: "manual" as const, ms: "0 ms" },
  { id: "pythSearch" as const, ms: "318 ms" },
  { id: "display" as const, ms: "2 ms" },
];
const STEP_LABEL = { manual: "Manual Trigger", pythSearch: "Pyth Feed Search", display: "Display Output" };

function Tile({ id, label, meta, children }: { id: "cron" | "webhook" | "manual"; label: string; meta: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="tr-tile">
      <div className="tr-tile__head">
        <NodeChip id={id} />
        <span className="tr-tile__label">{label}</span>
        <span className="tr-tile__meta">{meta}</span>
      </div>
      {children}
    </div>
  );
}

function Cron({ s }: { s: S }) {
  return (
    <Tile id="cron" label="Cron Trigger" meta="UTC">
      <div className="tr-box">
        <span className="tr-mono tr-strong">*/5 * * * *</span>
        <span className="tr-faint">Every 5 minutes</span>
      </div>
      <div className="tr-next">
        <span className="tr-faint">Next run</span>
        <span className="tr-mono tr-strong">
          <Roll align="end">{s.next}</Roll>
        </span>
      </div>
      <span className="tr-bar" data-target="cron-bar" aria-hidden>
        <i data-bar={s.bar} />
      </span>
      <div className="tr-hist">
        <Collapse open={s.fired}>
          <div className="tr-hist__row" data-new>
            <i className="tr-dot" />
            <span className="tr-mono">12:05:00</span>
            <span className="tr-faint tr-push">just now</span>
          </div>
        </Collapse>
        <div className="tr-hist__row">
          <i className="tr-dot" />
          <span className="tr-mono">12:00:00</span>
          <span className="tr-faint tr-push">5 min ago</span>
        </div>
        <div className="tr-hist__row">
          <i className="tr-dot" />
          <span className="tr-mono">11:55:00</span>
          <span className="tr-faint tr-push">10 min ago</span>
        </div>
      </div>
    </Tile>
  );
}

function Hook({ s }: { s: S }) {
  return (
    <Tile
      id="webhook"
      label="Webhook Trigger"
      meta={
        <Badge tone={s.req ? "success" : "neutral"} dot className="tr-listen" data-wait={!s.req || undefined}>
          <Roll variant="fade">{s.req ? "200 OK" : "Listening"}</Roll>
        </Badge>
      }
    >
      <div className="tr-box">
        <span className="tr-verb">POST</span>
        <span className="tr-mono tr-url">/api/webhook/wallet-watch</span>
      </div>
      <div className="tr-json" data-on={s.body > 0 || undefined}>
        <span className="tr-json__wait">Waiting for a request</span>
        {BODY.map((line, i) => (
          <span key={i} className="tr-json__line" data-on={s.body > i || undefined}>
            {line}
          </span>
        ))}
      </div>
    </Tile>
  );
}

function Manual({ s }: { s: S }) {
  return (
    <Tile id="manual" label="Manual Trigger" meta="Pyth Feed Finder">
      <Button
        size="large"
        data-target="run-once"
        className="tr-run"
        icon={s.run === 1 ? <Spinner size={14} /> : s.run === 2 ? <Check on size={14} /> : <Play size={14} strokeWidth={2} />}
      >
        {s.run === 0 ? "Run once" : s.run === 1 ? "Running" : "Completed"}
      </Button>
      <div className="tr-steps">
        {STEPS.map((st, i) => {
          const done = s.steps > i;
          return (
            <div key={st.id} className="tr-step" data-done={done || undefined}>
              <NodeChip id={st.id} size={20} />
              <span className="tr-step__label">{STEP_LABEL[st.id]}</span>
              <span className="tr-mono tr-faint tr-step__ms">{st.ms}</span>
              <Check on={done} pending={s.run === 1 && s.steps === i} size={14} />
            </div>
          );
        })}
      </div>
    </Tile>
  );
}

export function Triggers() {
  return (
    <section className="sl-section sl-triggers" aria-labelledby="triggers-title">
      <div className="sl-wrap">
        <div className="cs-head" data-split data-sl-reveal>
          <h2 id="triggers-title" className="sl-h2">
            A schedule, a webhook or a button
          </h2>
          <p className="cs-lead">Every workflow starts from one trigger. Runs queue on the server, so your browser can close.</p>
        </div>
        <div className="cs-stage" data-sl-reveal>
          <Stage<S>
            width={1152}
            height={292}
            compact={{ below: 900, width: 358, height: 720 }}
            theme="dark"
            initial={START}
            poster={POSTER}
            script={script}
            play="once"
            cursor={{ at: { wide: { x: 1104, y: 260 }, compact: { x: 320, y: 700 } }, style: "real" }}
          >
            {(s) => (
              <div className="tr-strip">
                <Cron s={s} />
                <Hook s={s} />
                <Manual s={s} />
              </div>
            )}
          </Stage>
        </div>
      </div>
    </section>
  );
}
