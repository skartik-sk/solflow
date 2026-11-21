"use client";

import Link from "next/link";
import { useId, useState, type CSSProperties } from "react";
import { ArrowRight } from "lucide-react";
import { NODES, NodeChip, type NodeId } from "./shared";
import "./Closing.css";

/*
 * Final call: a working "New workflow" dialog. Pick a trigger and one of the
 * real templates that starts from it (packages/db/prisma/cloud-seed.ts); the
 * preview draws that template's nodes with the values the seed sets. Create
 * workflow goes to the dashboard, which asks you to sign in first.
 */

type Trig = "cron" | "webhook" | "manual";
type Tpl = { name: string; nodes: [NodeId, string][] };

const TRIGGERS: { key: Trig; name: string; templates: Tpl[] }[] = [
  {
    key: "cron",
    name: "Cron",
    templates: [
      { name: "Price-Guarded DCA", nodes: [["cron", "0 */4 * * *"], ["priceFetch", "SOL"], ["ifElse", "price < 180"], ["jupSwap", "0.1 SOL → USDC"], ["result", "result"]] },
      { name: "Oracle Guard", nodes: [["cron", "*/10 * * * *"], ["pyth", "SOL/USD"], ["ifElse", "oracle.price > 200"], ["log", "alert"]] },
      { name: "Wallet Activity Alert", nodes: [["cron", "*/5 * * * *"], ["heliusWallet", "signatures"], ["display", "Wallet activity"]] },
    ],
  },
  {
    key: "webhook",
    name: "Webhook",
    templates: [
      { name: "Webhook Payment Runner", nodes: [["webhook", "POST"], ["filter", "body.approved"], ["transfer", "body.token"], ["result", "result"]] },
      { name: "AI Transaction Classifier", nodes: [["webhook", "POST"], ["ai", "classify"], ["result", "result"]] },
      { name: "Webhook Processor", nodes: [["webhook", "POST"], ["ai", "summarize"], ["result", "result"]] },
    ],
  },
  {
    key: "manual",
    name: "Manual",
    templates: [
      { name: "NFT Asset Watch", nodes: [["manual", "Run once"], ["metaplexGet", "assetId"], ["result", "result"]] },
      { name: "Jito Bundle Readiness", nodes: [["manual", "Run once"], ["jitoTipAccounts", "tip accounts"], ["jitoTipFloor", "tip floor"], ["display", "Jito readiness"]] },
      { name: "Pyth Feed Finder", nodes: [["manual", "Run once"], ["pythSearch", "SOL"], ["display", "Pyth feed search"]] },
    ],
  },
];

export function Closing() {
  const [trig, setTrig] = useState<Trig>("cron");
  const [pick, setPick] = useState(0);
  const id = useId();
  const tIndex = TRIGGERS.findIndex((t) => t.key === trig);
  const trigger = TRIGGERS[tIndex]!;
  const template = trigger.templates[pick] ?? trigger.templates[0]!;

  const choose = (k: Trig) => {
    setTrig(k);
    setPick(0);
  };

  return (
    <section className="sl-section sl-close" aria-labelledby="close-title">
      <div className="sl-wrap cl2-grid">
        <div className="cl2-copy" data-sl-reveal>
          <h2 id="close-title" className="sl-h2">
            Pick a trigger. Start from a template.
          </h2>
          <p className="cs-lead">Build it once on the canvas, and Cloud runs it on schedule and keeps the record.</p>
          <p className="cl2-more">
            Or <Link href="/marketplace">browse every template</Link> in the marketplace.
          </p>
        </div>

        <div className="cl2-dialog" role="group" aria-labelledby={`${id}-title`} data-sl-reveal>
          <div className="cl2-head">
            <p id={`${id}-title`} className="cl2-title">
              New workflow
            </p>
            <p className="cl2-sub">Choose a trigger and a template.</p>
          </div>

          <fieldset className="cl2-field">
            <legend>Trigger</legend>
            <div className="cl2-seg" style={{ "--i": tIndex } as CSSProperties}>
              <span className="cl2-seg__thumb" aria-hidden />
              {TRIGGERS.map((t) => (
                <label key={t.key} data-on={trig === t.key || undefined}>
                  <input type="radio" name={`${id}-trig`} value={t.key} checked={trig === t.key} onChange={() => choose(t.key)} />
                  <NodeChip id={t.key} size={20} />
                  {t.name}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="cl2-field">
            <legend>Template</legend>
            <div className="cl2-list">
              {trigger.templates.map((t, i) => (
                <label key={t.name} className="cl2-tpl" data-on={pick === i || undefined}>
                  <input type="radio" name={`${id}-tpl`} value={t.name} checked={pick === i} onChange={() => setPick(i)} />
                  <span className="cl2-radio" aria-hidden />
                  <span className="cl2-tpl__name">{t.name}</span>
                  <span className="cl2-tpl__n">{t.nodes.length} nodes</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="cl2-preview" aria-live="polite" aria-label={`${template.name}: ${template.nodes.map(([n]) => NODES[n].label).join(", ")}`}>
            <ol className="cl2-graph" key={template.name}>
              {template.nodes.map(([n, v], i) => (
                <li key={`${n}-${i}`} className="cl2-node" data-cat={NODES[n].cat} style={{ "--i": i } as CSSProperties}>
                  <NodeChip id={n} size={22} />
                  <span className="cl2-node__label">{NODES[n].label}</span>
                  <span className="cl2-node__v">{v}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="cl2-foot">
            <p className="cl2-note">Free. Sign in with GitHub or Google.</p>
            <Link href="/dashboard" className="sl-btn sl-btn-primary">
              Create workflow
              <ArrowRight size={16} strokeWidth={2} aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
