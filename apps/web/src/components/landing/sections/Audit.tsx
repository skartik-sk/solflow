"use client";

import { ArrowRight } from "lucide-react";
import { Stage } from "../kit/stage";
import { Code } from "../kit/code";
import { Collapse, Count, Roll } from "../kit/motion";
import type { Act } from "../kit/act";
import "./Audit.css";

// The audit report as a ledger: the vault program's findings resolve as
// their fixes land, and the score rolls up to the real 86/100.
//
// Rows are built from packages/audit/src/rules (ids, severities and title
// templates as the code writes them). The score uses the real penalties
// (critical 25, high 15, medium 7, low 3): 100 - 61 = 39 at the start, then
// 64, 79 and 86 as SOL-001, SOL-010 and SOL-021 are fixed. The two SOL-050
// rows that stay open are the vault's real remaining findings.

type Severity = "critical" | "high" | "medium" | "low";
type S = { open: boolean; fixed: number };

const PENALTY: Record<Severity, number> = { critical: 25, high: 15, medium: 7, low: 3 };

const FINDINGS: { id: string; severity: Severity; title: string; where: string }[] = [
  { id: "SOL-001", severity: "critical", title: 'Missing signer check on "authority"', where: "withdraw" },
  { id: "SOL-010", severity: "high", title: 'Unchecked add in "deposit"', where: "deposit" },
  { id: "SOL-021", severity: "medium", title: 'PDA "vault" does not store/verify bump', where: "vault" },
  { id: "SOL-050", severity: "medium", title: 'Missing input validation in "deposit"', where: "deposit" },
  { id: "SOL-050", severity: "medium", title: 'Missing input validation in "withdraw"', where: "withdraw" },
];
const FIXABLE = 3;

const DIFF = [
  { text: "#[derive(Accounts)]" },
  { text: "pub struct Withdraw<'info> {" },
  { text: "    pub authority: AccountInfo<'info>,", kind: "del" as const },
  { text: "    pub authority: Signer<'info>,", kind: "add" as const },
];

const initial: S = { open: false, fixed: 0 };
const poster: S = { open: true, fixed: FIXABLE };

async function script(a: Act<S>) {
  await a.wait(900);
  await a.set({ open: true });
  await a.wait(1500);
  a.mark("fix");
  await a.set({ fixed: 1 });
  await a.wait(1300);
  await a.set({ fixed: 2 });
  await a.wait(900);
  await a.set({ fixed: 3 });
  await a.wait(2200);
}

function score(fixed: number) {
  return FINDINGS.reduce((n, f, i) => (i < fixed ? n : n - PENALTY[f.severity]), 100);
}

function tally(fixed: number) {
  const t: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  FINDINGS.forEach((f, i) => {
    if (i >= fixed) t[f.severity]++;
  });
  return t;
}

const R = 44;
const C = 2 * Math.PI * R;

function Ring({ value }: { value: number }) {
  return (
    <div className="aud-ring">
      <svg viewBox="0 0 104 104" width="104" height="104" aria-hidden>
        <circle cx="52" cy="52" r={R} className="aud-ring__track" />
        <circle
          cx="52"
          cy="52"
          r={R}
          className="aud-ring__arc"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - value / 100)}
          transform="rotate(-90 52 52)"
        />
      </svg>
      <span className="aud-ring__num">
        <Roll delay={250}>{String(value)}</Roll>
      </span>
    </div>
  );
}

function Report({ s, compact }: { s: S; compact: boolean }) {
  const value = score(s.fixed);
  const t = tally(s.fixed);
  const open = FINDINGS.length - s.fixed;
  return (
    <div className="aud-card">
      <div className="aud-head">
        <div className="aud-head__title">Audit report</div>
        <div className="aud-head__meta">
          <span className="aud-mono">vault</span>
          <span className="aud-sep">·</span>
          <span>Anchor</span>
        </div>
      </div>

      <div className="aud-score">
        <Ring value={value} />
        <div className="aud-score__side">
          <div className="aud-score__label">
            Security score <span className="aud-faint">out of 100</span>
          </div>
          <div className="aud-tally">
            {(Object.keys(t) as Severity[]).map((sev) => (
              <div key={sev} className="aud-tally__cell">
                <span className="aud-tally__name">
                  <i className="aud-dot" data-sev={sev} />
                  {sev[0].toUpperCase() + sev.slice(1)}
                </span>
                <Count className="aud-tally__n" value={t[sev]} duration={500} />
              </div>
            ))}
          </div>
          {!compact && <div className="aud-score__rules">27 rules checked, SOL-001 to SOL-073</div>}
        </div>
      </div>

      <div className="aud-list-head">
        <span>Findings</span>
        <span className="aud-faint">
          <Roll delay={250}>{`${open} open`}</Roll>
        </span>
      </div>

      <div className="aud-rows">
        {FINDINGS.map((f, i) => {
          const done = i < s.fixed;
          return (
            <div key={f.title} className="aud-item" data-done={done || undefined}>
              <div className="aud-row">
                <i className="aud-dot" data-sev={f.severity} />
                <span className="aud-id">{f.id}</span>
                <span className="aud-title">{f.title}</span>
                <span className="aud-status">
                  <Roll align="end">{done ? "Fixed" : "Open"}</Roll>
                </span>
              </div>
              {i === 0 && (
                <Collapse open={s.open} className="aud-fix-wrap">
                  <div className="aud-fix">
                    <div className="aud-fix__head">
                      <span className="aud-fix__label">
                        <Roll variant="fade">{done ? "Fix applied" : "Suggested fix"}</Roll>
                      </span>
                      <span className="aud-mono aud-faint">programs/vault/src/lib.rs</span>
                    </div>
                    <Code className="aud-code" lines={DIFF} start={18} />
                  </div>
                </Collapse>
              )}
            </div>
          );
        })}
      </div>

      <div className="aud-filler" aria-hidden>
        <div className="aud-filler__label">Deterministic stress</div>
        {[62, 48, 70, 55, 66, 44].map((w) => (
          <div key={w} className="aud-filler__row">
            <i />
            <b style={{ width: `${w}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function Audit() {
  return (
    <section className="sl-audit sl-section" aria-labelledby="sl-audit-title">
      <div className="sl-wrap aud-grid">
        <div className="aud-object" data-sl-reveal>
          <Stage<S>
            width={668}
            height={720}
            compact={{ below: 600, width: 358, height: 720 }}
            theme="dark"
            initial={initial}
            poster={poster}
            script={script}
            play="once"
            className="aud-stage"
          >
            {(s, _rect, layout) => <Report s={s} compact={layout === "compact"} />}
          </Stage>
        </div>

        <div className="aud-copy" data-sl-reveal>
          <h2 id="sl-audit-title" className="sl-h2">
            Audit the program before it ships
          </h2>
          <p className="sl-lead">
            27 rules check signers, owners, PDA seeds and bumps, arithmetic, CPI targets and account closes. Each
            finding points at the node that caused it and comes with the fix for the graph and the code.
          </p>
          <dl className="aud-facts">
            <div>
              <dt className="aud-mono">27</dt>
              <dd>rules, from SOL-001 missing signer to SOL-073 uniqueness constraints</dd>
            </div>
            <div>
              <dt className="aud-mono">100</dt>
              <dd>points to start. A critical finding costs 25, high 15, medium 7, low 3</dd>
            </div>
            <div>
              <dt className="aud-mono">0</dt>
              <dd>network calls. It runs in your browser as you edit, and in the CLI</dd>
            </div>
          </dl>
          <a className="aud-link" href="/docs">
            Read how the audit works
            <ArrowRight size={16} strokeWidth={1.75} aria-hidden />
          </a>
        </div>
      </div>
    </section>
  );
}
