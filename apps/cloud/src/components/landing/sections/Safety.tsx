"use client";

import { KeyRound, Lock, ShieldCheck, Wallet } from "lucide-react";
import { Badge, Button, Check, Collapse, Field, Roll, Spinner, Stage, Toggle, type Act } from "../kit";
import { NodeChip } from "./shared";
import "./Safety.css";

/*
 * Safety: the preflight a wallet action passes before it can sign. The
 * fields are the workflow's real safety settings (CloudPropertiesPanel:
 * "Spend limit (SOL)", "Max slippage (bps)", "Simulation required") and the
 * error is the one packages/cloud-nodes/security/safety.ts throws. A 0.8 SOL
 * swap hits the 0.5 SOL limit and is blocked on its Amount field; the amount
 * becomes 0.4, the simulation passes, and it is signed with the Cloud wallet.
 * Credentials only ever show as dots. "Bot wallet" and its address are
 * placeholders.
 */

type S = {
  amount: string;
  checked: boolean;
  editing: boolean;
  sim: 0 | 1 | 2;
  sent: 0 | 1 | 2;
};

const START: S = { amount: "0.8", checked: false, editing: false, sim: 0, sent: 0 };
const POSTER: S = { amount: "0.4", checked: true, editing: false, sim: 2, sent: 2 };
const LIMIT = 0.5;

const blocked = (s: S) => s.checked && Number(s.amount || 0) > LIMIT && !s.editing;

async function script(a: Act<S>) {
  await a.wait(600);
  await a.set({ checked: true });
  await a.wait(1700);
  a.mark("fix");
  await a.click({ at: "amount", x: 0.5, y: 0.5 }, { double: true });
  await a.set({ editing: true, amount: "" });
  await a.type("amount", "0.4", { interval: 170 });
  await a.wait(300);
  await a.set({ editing: false, sim: 1 });
  await a.wait(1200);
  await a.set({ sim: 2 });
  await a.wait(600);
  a.mark("sign");
  await a.click({ at: "send", x: 0.8, y: 0.6 });
  await a.set({ sent: 1 });
  await a.wait(700);
  await a.set({ sent: 2 });
  await a.wait(2400);
}

function status(s: S): { tone: "neutral" | "danger" | "accent" | "success"; text: string } {
  if (s.sent === 2) return { tone: "success", text: "Sent" };
  if (blocked(s)) return { tone: "danger", text: "Blocked" };
  if (s.sim === 2) return { tone: "accent", text: "Ready" };
  return { tone: "neutral", text: "Checking" };
}

function Preflight({ s, compact }: { s: S; compact: boolean }) {
  const st = status(s);
  const isBlocked = blocked(s);
  const valid = !isBlocked && s.sim > 0;
  return (
    <div className="sf-card">
      <div className="sf-head">
        <NodeChip id="jupSwap" />
        <span className="sf-head__title">Jupiter Direct Swap</span>
        {!compact && <span className="sf-faint">Preflight</span>}
        <Badge tone={st.tone} dot className="sf-head__badge">
          <Roll variant="fade">{st.text}</Roll>
        </Badge>
      </div>

      <div className="sf-body">
        <div className="sf-amount">
          <Field
            label="Amount (SOL)"
            value={s.amount}
            focused={s.editing}
            status={isBlocked ? "error" : valid ? "valid" : undefined}
            trailing={<span className="sf-unit">SOL → USDC</span>}
            box={{ "data-target": "amount" }}
          />
          <Collapse open={isBlocked}>
            <p className="sf-error">Jupiter Direct Swap exceeds the configured spend limit.</p>
          </Collapse>
        </div>

        <div className="sf-limits">
          <div className="sf-limit" data-hit={isBlocked || undefined}>
            <span className="sf-limit__label">Spend limit (SOL)</span>
            <span className="sf-limit__value">0.5</span>
          </div>
          <div className="sf-limit">
            <span className="sf-limit__label">Max slippage (bps)</span>
            <span className="sf-limit__value">50</span>
          </div>
          <div className="sf-limit">
            <span className="sf-limit__label">Simulation required</span>
            <Toggle on className="sf-toggle" />
          </div>
        </div>

        <div className="sf-sim">
          <ShieldCheck size={16} strokeWidth={1.75} className="sf-faint" aria-hidden />
          <span>Simulation</span>
          <span className="sf-sim__state" data-ok={s.sim === 2 || undefined}>
            <Roll variant="fade" align="end">
              {s.sim === 2 ? "Passed" : s.sim === 1 ? "Running" : "Waiting"}
            </Roll>
            <span className="sf-sim__mark">
              {s.sim === 1 ? <Spinner size={14} /> : <Check on={s.sim === 2} size={14} />}
            </span>
          </span>
        </div>

        <div className="sf-foot">
          <Collapse open={s.sent === 2} className="sf-signed">
            <p className="sf-signed__text">
              <Wallet size={14} strokeWidth={2} aria-hidden />
              Signed with Bot wallet <span className="sf-mono">7xKX…9fQ2</span>
            </p>
          </Collapse>
          <Button
            variant="primary"
            size="large"
            data-target="send"
            className="sf-send"
            icon={s.sent === 1 ? <Spinner size={14} /> : s.sent === 2 ? <Check on size={14} /> : undefined}
          >
            {s.sent === 2 ? "Sent" : s.sent === 1 ? "Signing" : "Sign and send"}
          </Button>
        </div>
      </div>

      <div className="sf-creds">
        <div className="sf-cred">
          <KeyRound size={14} strokeWidth={2} aria-hidden />
          <span>Jupiter API key</span>
          <span className="sf-dots">••••••••••••</span>
        </div>
        <div className="sf-cred">
          <Wallet size={14} strokeWidth={2} aria-hidden />
          <span>
            Bot wallet <span className="sf-mono sf-faint">7xKX…9fQ2</span>
          </span>
          <span className="sf-dots">••••••••••••</span>
        </div>
        <div className="sf-cred sf-cred--note">
          <Lock size={14} strokeWidth={2} aria-hidden />
          <span>Encrypted at rest with AES-256-GCM</span>
        </div>
      </div>
    </div>
  );
}

export function Safety() {
  return (
    <section className="sl-section sl-safety" aria-labelledby="safety-title">
      <div className="sl-wrap sf-layout">
        <div className="sf-object cs-stage" data-sl-reveal>
          <Stage<S>
            width={600}
            height={500}
            compact={{ below: 560, width: 358, height: 524 }}
            theme="dark"
            initial={START}
            poster={POSTER}
            script={script}
            play="once"
            cursor={{ at: { wide: { x: 560, y: 186 }, compact: { x: 300, y: 260 } }, style: "real" }}
          >
            {(s, _rect, layout) => <Preflight s={s} compact={layout === "compact"} />}
          </Stage>
        </div>
        <div className="sf-copy" data-sl-reveal>
          <h2 id="safety-title" className="sl-h2">
            Limits before anything signs
          </h2>
          <p className="cs-lead">Every wallet action checks the spend limit and simulates first. Keys stay encrypted on the server.</p>
        </div>
      </div>
    </section>
  );
}
