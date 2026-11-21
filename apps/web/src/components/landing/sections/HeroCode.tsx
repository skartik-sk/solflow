"use client";

import type { ReactNode } from "react";
import { Bar, Collapse } from "../kit";

// lib.rs in the hero's editor. Real lines from @solflow/codegen's vault
// template (Anchor's Withdraw accounts, Pinocchio's has_one check), trimmed;
// the rest are bars at the code's own indent.

export type Line = {
  /** Real text, or a bar of this width */
  t?: string;
  bar?: number;
  /** Indent in characters */
  ind?: number;
  /** Banded: the code the constraint wrote */
  hl?: boolean;
  /** Opens when the constraint is wired */
  add?: boolean;
};

export const ANCHOR: Line[] = [
  { bar: 180 },
  { bar: 120 },
  {},
  { t: "#[derive(Accounts)]" },
  { t: "pub struct Withdraw<'info> {" },
  { t: "#[account(", ind: 4 },
  { t: "mut,", ind: 8 },
  { t: "has_one = authority,", ind: 8, hl: true, add: true },
  { bar: 210, ind: 8 },
  { bar: 120, ind: 8 },
  { t: ")]", ind: 4 },
  { t: "pub vault: Account<'info, VaultState>,", ind: 4 },
  { bar: 190, ind: 4 },
  { bar: 230, ind: 4 },
  { t: "}" },
  {},
  { bar: 140 },
  { bar: 200, ind: 4 },
  { bar: 160, ind: 4 },
  { bar: 90, ind: 4 },
  { t: "}" },
];

export const PINOCCHIO: Line[] = [
  { t: "#![no_std]" },
  { bar: 160 },
  {},
  { t: "pub fn process(" },
  { bar: 170, ind: 4 },
  { bar: 110, ind: 4 },
  { t: ") -> ProgramResult {" },
  { bar: 250, ind: 4 },
  { bar: 180, ind: 4 },
  { t: "// Validate vault.authority == authority", ind: 4, hl: true },
  { t: "let data = vault.try_borrow()?;", ind: 4, hl: true },
  { t: "if &data[32..64] != authority.address() {", ind: 4, hl: true },
  { t: "return Err(ProgramError::InvalidAccountData);", ind: 8, hl: true },
  { t: "}", ind: 4, hl: true },
  { bar: 200, ind: 4 },
  { bar: 150, ind: 4 },
  { bar: 120, ind: 8 },
  { t: "Ok(())", ind: 4 },
  { t: "}" },
  {},
  { bar: 120 },
];

/** The phone column's cut: the same lines at a two-space indent, so they fit whole. */
export const ANCHOR_COMPACT: Line[] = [
  { t: "#[derive(Accounts)]" },
  { t: "pub struct Withdraw<'info> {" },
  { t: "#[account(", ind: 2 },
  { t: "mut,", ind: 4 },
  { t: "has_one = authority,", ind: 4, hl: true, add: true },
  { bar: 170, ind: 4 },
  { bar: 110, ind: 4 },
];

export const PINOCCHIO_COMPACT: Line[] = [
  { t: "// Validate vault.authority == authority", hl: true },
  { t: "let data = vault.try_borrow()?;", hl: true },
  { t: "if &data[32..64] != authority.address() {", hl: true },
  { bar: 200, ind: 2, hl: true },
  { t: "}", hl: true },
  { bar: 150 },
];

const TOKEN =
  /(\/\/.*$)|(b?"[^"]*")|(#!?\[|\]\)?$|\)\]$)|\b(pub|fn|struct|let|if|return|mut)\b|\b([A-Z][A-Za-z0-9_]*)\b|('info)/g;

/** Quiet syntax colour: comments, strings, attributes, keywords, types. */
function paint(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const cls = m[1] ? "c" : m[2] ? "s" : m[3] ? "a" : m[4] ? "k" : m[5] ? "t" : "l";
    out.push(
      <span key={m.index} className={`sl-hs__tk-${cls}`}>
        {m[0]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Content({ line }: { line: Line }) {
  return (
    <span className="sl-hs__src" style={{ paddingLeft: `${line.ind ?? 0}ch` }}>
      {line.t ? paint(line.t) : line.bar ? <Bar w={line.bar} h={6} tone={2} /> : null}
    </span>
  );
}

/** One version of lib.rs. Both stay mounted and crossfade in one cell. */
export function HeroCode({ lines, first, on, open }: { lines: Line[]; first: number; on: boolean; open: boolean }) {
  return (
    <div className="sl-hs__file" data-on={on || undefined} aria-hidden={!on}>
      {/* The gutter counts rows; content moves under it when a line opens */}
      <div className="sl-hs__gutter">
        {lines.map((_, i) => (
          <span key={i}>{first + i}</span>
        ))}
      </div>
      <div className="sl-hs__rows">
        {lines.map((line, i) =>
          line.add ? (
            <Collapse key={i} open={open}>
              <div className="sl-hs__row" data-hl>
                <Content line={line} />
              </div>
            </Collapse>
          ) : (
            <div key={i} className="sl-hs__row" data-hl={line.hl || undefined}>
              <Content line={line} />
            </div>
          ),
        )}
      </div>
    </div>
  );
}
