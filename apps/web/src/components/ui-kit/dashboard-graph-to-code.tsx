"use client";

import { Code2, FileCode2, Shield, Wallet, Zap } from "lucide-react";
import { Stage, Window, type Act } from "@/components/landing/kit";
import "./dashboard-graph-to-code.css";

/*
 * A small stageshow miniature for the dashboard empty state and the sign-in
 * side panel: the vault graph assembling node by node, each node writing its
 * lines into lib.rs as it lands.
 * - Focal object: the code that each node writes, banded in the node's colour.
 * - Beats (about 9 s): program, instruction, account, constraint arrive; each
 *   one opens its lines. Hold on the finished file, then the scene clears
 *   together and the loop starts over.
 * - Poster: everything placed, has_one's line banded.
 * - Real strings: node names, their fields, the Rust lines. Nothing else.
 */

type Kind = "program" | "instruction" | "account" | "constraint";
type S = { step: number };
const STEP: Record<Kind, number> = { program: 1, instruction: 2, account: 3, constraint: 4 };

async function script(a: Act<S>) {
  await a.wait(500);
  for (let step = 1; step <= 4; step++) {
    await a.set({ step });
    await a.wait(1150);
  }
  await a.wait(2400);
  await a.set({ step: 0 });
  await a.wait(800);
}

const CODE: { kind: Kind; text: string; compact?: boolean }[] = [
  { kind: "program", text: "#[program]" },
  { kind: "program", text: "pub mod vault {" },
  { kind: "instruction", text: "    pub fn deposit(ctx: Context<Deposit>, amount: u64)", compact: true },
  { kind: "program", text: "}" },
  { kind: "account", text: "#[account]" },
  { kind: "account", text: "pub struct VaultState {", compact: true },
  { kind: "account", text: "    pub authority: Pubkey,", compact: true },
  { kind: "account", text: "    pub balance: u64,", compact: true },
  { kind: "account", text: "}" },
  { kind: "constraint", text: "#[account(mut, has_one = authority)]", compact: true },
  { kind: "constraint", text: "pub vault: Account<'info, VaultState>," },
];

/** The sign-in panel's taller scene: the whole lib.rs, Deposit's accounts struct included. */
const CODE_TALL: { kind: Kind; text: string }[] = [
  { kind: "program", text: "#[program]" },
  { kind: "program", text: "pub mod vault {" },
  { kind: "instruction", text: "    pub fn deposit(ctx: Context<Deposit>, amount: u64)" },
  { kind: "program", text: "}" },
  { kind: "program", text: "" },
  { kind: "account", text: "#[account]" },
  { kind: "account", text: "pub struct VaultState {" },
  { kind: "account", text: "    pub authority: Pubkey," },
  { kind: "account", text: "    pub balance: u64," },
  { kind: "account", text: "}" },
  { kind: "account", text: "" },
  { kind: "instruction", text: "#[derive(Accounts)]" },
  { kind: "instruction", text: "pub struct Deposit<'info> {" },
  { kind: "constraint", text: "    #[account(mut, has_one = authority)]" },
  { kind: "constraint", text: "    pub vault: Account<'info, VaultState>," },
  { kind: "instruction", text: "    pub authority: Signer<'info>," },
  { kind: "instruction", text: "}" },
];

const ICON = { program: Code2, instruction: Zap, account: Wallet, constraint: Shield } as const;
const HEAD = 32;
const ROW = 20;
const nodeH = (rows: number) => HEAD + 6 + rows * ROW + 6;
const rowY = (top: number, row: number) => top + HEAD + 6 + row * ROW + ROW / 2;

type NodeDef = { kind: Kind; name: string; at: [number, number, number]; fields: [string, string][] };

const WIDE: NodeDef[] = [
  { kind: "program", name: "vault", at: [76, 18, 148], fields: [["instructions", "1"]] },
  { kind: "instruction", name: "deposit", at: [14, 112, 120], fields: [["amount", "u64"]] },
  { kind: "account", name: "vault_state", at: [162, 112, 128], fields: [["authority", "Pubkey"], ["balance", "u64"]] },
  { kind: "constraint", name: "has_one", at: [14, 198, 120], fields: [["target", "authority"]] },
];
const TALL: NodeDef[] = [
  { kind: "program", name: "vault", at: [76, 28, 148], fields: [["instructions", "1"]] },
  { kind: "instruction", name: "deposit", at: [14, 150, 120], fields: [["amount", "u64"]] },
  { kind: "account", name: "vault_state", at: [162, 150, 128], fields: [["authority", "Pubkey"], ["balance", "u64"]] },
  { kind: "constraint", name: "has_one", at: [14, 290, 120], fields: [["target", "authority"]] },
];
const COMPACT: NodeDef[] = [
  { kind: "instruction", name: "deposit", at: [12, 14, 120], fields: [["amount", "u64"]] },
  { kind: "account", name: "vault_state", at: [196, 14, 132], fields: [["authority", "Pubkey"], ["balance", "u64"]] },
  { kind: "constraint", name: "has_one", at: [40, 92, 120], fields: [["target", "authority"]] },
];

function vPath(x1: number, y1: number, x2: number, y2: number) {
  const dy = Math.max(14, Math.abs(y2 - y1) / 2);
  return `M${x1} ${y1} C${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`;
}
function hPath(x1: number, y1: number, x2: number, y2: number) {
  const dx = Math.max(20, Math.abs(x2 - x1) / 2);
  return `M${x1} ${y1} C${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

/**
 * `tall` is the sign-in panel's version: a 640 x 600 scene whose window runs
 * off the stage's right and bottom edges, for a host that bleeds it off its own.
 */
export function GraphToCode({ className, tall = false }: { className?: string; tall?: boolean }) {
  const H = tall ? 600 : 340;
  return (
    <Stage<S>
      width={640}
      height={H}
      fill={tall}
      compact={{ below: 520, width: 358, height: 300 }}
      theme="dark"
      initial={{ step: 0 }}
      poster={{ step: 4 }}
      script={script}
      className={`gx ${className ?? ""}`}
    >
      {(s, _rect, layout) => {
        const wide = layout === "wide";
        const nodes = wide ? (tall ? TALL : WIDE) : COMPACT;
        const on = (k: Kind) => s.step >= STEP[k];
        const n = (k: Kind) => nodes.find((d) => d.kind === k)!;
        const edges: { d: string; kind: Kind; show: boolean }[] = [];
        if (wide) {
          const p = n("program"), i = n("instruction"), ac = n("account"), c = n("constraint");
          const px = p.at[0] + p.at[2] / 2, py = p.at[1] + nodeH(1);
          edges.push({ d: vPath(px, py, i.at[0] + i.at[2] / 2, i.at[1]), kind: "program", show: on("instruction") });
          edges.push({ d: vPath(px, py, ac.at[0] + ac.at[2] / 2, ac.at[1]), kind: "program", show: on("account") });
          edges.push({ d: hPath(c.at[0] + c.at[2], rowY(c.at[1], 0), ac.at[0], rowY(ac.at[1], 0)), kind: "constraint", show: on("constraint") });
        } else {
          const i = n("instruction"), ac = n("account"), c = n("constraint");
          edges.push({ d: hPath(i.at[0] + i.at[2], rowY(i.at[1], 0), ac.at[0], rowY(ac.at[1], 1)), kind: "account", show: on("account") });
          edges.push({ d: hPath(c.at[0] + c.at[2], rowY(c.at[1], 0), ac.at[0], rowY(ac.at[1], 0)), kind: "constraint", show: on("constraint") });
        }
        const lines = wide ? (tall ? CODE_TALL : CODE) : CODE.filter((l) => l.compact);
        return (
          <Window
            className="gx__win"
            data-tall={(tall && wide) || undefined}
            style={tall && wide ? { height: H } : undefined}
            title="vault"
            toolbar={<span className="gx__fw">Anchor</span>}
          >
            <div className="gx__body" style={tall && wide ? { height: H - 38 } : undefined}>
              <div className="gx__canvas">
                <div className="gx__dots" aria-hidden />
                <svg className="gx__edges" aria-hidden>
                  {edges.map((e, k) => (
                    <path key={k} d={e.d} pathLength={1} className="gx__edge" data-kind={e.kind} data-on={e.show || undefined} />
                  ))}
                </svg>
                {nodes.map((d) => {
                  const I = ICON[d.kind];
                  const [left, top, width] = d.at;
                  return (
                    <div key={d.kind} className="gx__node" data-kind={d.kind} data-on={on(d.kind) || undefined} style={{ left, top, width, height: nodeH(d.fields.length) }}>
                      <div className="gx__nhead">
                        <span className="gx__badge">
                          <I size={12} strokeWidth={2} />
                        </span>
                        <span className="gx__name">{d.name}</span>
                      </div>
                      <div className="gx__nbody">
                        {d.fields.map(([k, v]) => (
                          <div key={k} className="gx__field">
                            <span>{k}</span>
                            <span className="gx__val">{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="gx__code">
                {wide && (
                  <div className="gx__tabs">
                    <span className="gx__tab">
                      <FileCode2 size={12} strokeWidth={1.75} />
                      lib.rs
                    </span>
                  </div>
                )}
                <div className="gx__lines">
                  {lines.map((l, k) => (
                    <div key={k} className="gx__line" data-kind={l.kind} data-on={on(l.kind) || undefined} data-new={s.step === STEP[l.kind] || undefined}>
                      <span className="gx__ln">{k + 1}</span>
                      <span className="gx__txt">{l.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Window>
        );
      }}
    </Stage>
  );
}
