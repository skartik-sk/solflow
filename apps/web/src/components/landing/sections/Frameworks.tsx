"use client";

import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Shield, Wallet, Zap } from "lucide-react";
import { Stage, type Act } from "../kit";
import { EXCERPTS, rustTokens, type Excerpt } from "./Frameworks.code";
import "./Frameworks.css";

// One graph, three frameworks. The deposit instruction of the vault template
// as a small graph on the left; on the right, the code SolStudio generates
// for it in Anchor, Pinocchio and Quasar (real codegen output). The tabs
// advance on their own, pause while the pointer or focus is inside, and can
// be clicked or driven with the arrow keys. The line that enforces the
// graph's one constraint (amount > 0) is marked in every framework.

const DWELL = 5200;
const NONE = {};

type Layout = "wide" | "compact";

function useWidth(initial: number) {
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

/* ---------------- The graph ---------------- */

type Kind = "instruction" | "account" | "constraint";
const ICON: Record<Kind, ReactNode> = {
  instruction: <Zap size={16} strokeWidth={1.75} />,
  account: <Wallet size={16} strokeWidth={1.75} />,
  constraint: <Shield size={16} strokeWidth={1.75} />,
};

function GraphNode({ kind, name, tag, rows, x, y, w }: { kind: Kind; name: string; tag: string; rows?: [string, string][]; x: number; y: number; w: number }) {
  return (
    <div className="fw-node" data-kind={kind} style={{ left: x, top: y, width: w }}>
      <div className="fw-node__head">
        <span className="fw-node__icon">{ICON[kind]}</span>
        <span className="fw-node__name">{name}</span>
        <span className="fw-node__tag">{tag}</span>
      </div>
      {rows && rows.length > 0 && (
        <div className="fw-node__rows">
          {rows.map(([k, v]) => (
            <div key={k} className="fw-node__row">
              <span>{k}</span>
              <code>{v}</code>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Node geometry per layout. Heights follow the CSS: head 36, rows 26 each, rows block padded 6 top and bottom.
const HEAD = 36;
const ROW = 26;
const nodeH = (rows: number) => HEAD + (rows ? rows * ROW + 13 : 0);

function edge(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = Math.max(24, (b.x - a.x) / 2);
  return `M${a.x} ${a.y} C${a.x + dx} ${a.y} ${b.x - dx} ${b.y} ${b.x} ${b.y}`;
}
function drop(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dy = Math.max(18, (b.y - a.y) / 2);
  return `M${a.x} ${a.y} C${a.x} ${a.y + dy} ${b.x} ${b.y - dy} ${b.x} ${b.y}`;
}

function Graph({ width, height, layout }: { width: number; height: number; layout: Layout }) {
  const wide = layout === "wide";
  const inW = wide ? 184 : 150;
  const acW = wide ? 224 : 150;
  const pad = wide ? 28 : 16;
  const acX = width - pad - acW;
  const accRows: [string, string][][] = wide
    ? [[["state", "VaultState"], ["seeds", '"vault", authority']], [["kind", "Signer"]], []]
    : [[], [], []];
  const accNames = [
    ["vault", "account"],
    ["authority", "signer"],
    ["system_program", "program"],
  ];
  const gap = wide ? 28 : 12;
  const accTop = wide ? 72 : 52;
  const accBottom = accTop + accRows.reduce((h, r) => h + nodeH(r.length), 0) + gap * 2;
  // The instruction sits level with the middle of its accounts; its constraint hangs under it
  const insY = wide ? Math.round((accTop + accBottom) / 2 - nodeH(1) / 2) - 40 : 52;
  const ins = { x: pad, y: insY, w: inW, rows: 1 };
  const req = { x: pad, y: ins.y + nodeH(1) + (wide ? 56 : 24), w: inW, rows: wide ? 2 : 1 };
  let ay = accTop;
  const accs = accNames.map(([name, tag], i) => {
    const n = { name, tag, x: acX, y: ay, w: acW, rows: accRows[i] };
    ay += nodeH(accRows[i].length) + gap;
    return n;
  });
  const out = { x: ins.x + ins.w, y: ins.y + HEAD / 2 };
  return (
    <div className="fw-canvas" style={{ width, height }}>
      {/* The dot grid is its own layer under the nodes, as the editor draws it */}
      <div className="fw-grid" aria-hidden />
      <div className="fw-crumb">
        <span>vault</span>
        <span className="fw-crumb__sep">/</span>
        <span className="fw-crumb__on">deposit</span>
      </div>
      <svg className="fw-edges" width={width} height={height} aria-hidden>
        {accs.map((a) => (
          <path key={a.name} d={edge(out, { x: a.x, y: a.y + HEAD / 2 })} className="fw-edge" />
        ))}
        <path d={drop({ x: ins.x + 28, y: ins.y + nodeH(1) }, { x: req.x + 28, y: req.y })} className="fw-edge" data-kind="constraint" />
        {accs.map((a) => (
          <circle key={a.name} cx={a.x} cy={a.y + HEAD / 2} r={3} className="fw-port" data-kind="account" />
        ))}
        <circle cx={out.x} cy={out.y} r={3} className="fw-port" data-kind="instruction" />
        <circle cx={req.x + 28} cy={req.y} r={3} className="fw-port" data-kind="constraint" />
      </svg>
      <GraphNode kind="instruction" name="deposit" tag="instruction" rows={[["amount", "u64"]]} x={ins.x} y={ins.y} w={ins.w} />
      <GraphNode
        kind="constraint"
        name="require"
        tag="constraint"
        rows={wide ? [["check", "amount > 0"], ["error", "InvalidAmount"]] : [["check", "amount > 0"]]}
        x={req.x}
        y={req.y}
        w={req.w}
      />
      {accs.map((a) => (
        <GraphNode key={a.name} kind="account" name={a.name} tag={a.tag} rows={a.rows} x={a.x} y={a.y} w={a.w} />
      ))}
    </div>
  );
}

/* ---------------- The code ---------------- */

function CodeLayer({ ex, on }: { ex: Excerpt; on: boolean }) {
  return (
    <div className="fw-code" data-on={on || undefined} aria-hidden={!on} id={`fw-panel-${ex.id}`} role="tabpanel" aria-labelledby={`fw-tab-${ex.id}`}>
      {ex.lines.map((line, i) => {
        const n = ex.start + i;
        return (
          <div key={i} className="fw-line" data-mark={ex.mark.includes(n) || undefined} style={{ ["--i" as string]: i } as CSSProperties}>
            <span className="fw-line__num">{n}</span>
            <span className="fw-line__text" data-crop>
              {rustTokens(line).map((t, j) =>
                t.kind ? (
                  <span key={j} className={`tk-${t.kind}`}>
                    {t.text}
                  </span>
                ) : (
                  t.text
                ),
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Tabs({ value, onPick, paused }: { value: number; onPick: (i: number, focus?: boolean) => void; paused: boolean }) {
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const n = EXCERPTS.length;
    let next = -1;
    if (e.key === "ArrowRight") next = (value + 1) % n;
    else if (e.key === "ArrowLeft") next = (value - 1 + n) % n;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    if (next < 0) return;
    e.preventDefault();
    onPick(next, true);
  };
  return (
    <div className="fw-tabs" role="tablist" aria-label="Generated framework" onKeyDown={onKey}>
      <span className="fw-tabs__thumb" style={{ transform: `translateX(${value * 100}%)` }} aria-hidden />
      {EXCERPTS.map((ex, i) => (
        <button
          key={ex.id}
          id={`fw-tab-${ex.id}`}
          type="button"
          role="tab"
          aria-selected={i === value}
          aria-controls={`fw-panel-${ex.id}`}
          tabIndex={i === value ? 0 : -1}
          className="fw-tab"
          data-on={i === value || undefined}
          onClick={() => onPick(i)}
        >
          {ex.name}
          {i === value && <span key={`${value}`} className="fw-tab__progress" data-paused={paused || undefined} aria-hidden />}
        </button>
      ))}
    </div>
  );
}

function Footer({ value, wide }: { value: number; wide: boolean }) {
  return (
    <div className="fw-foot">
      {EXCERPTS.map((ex, i) => (
        <div key={ex.id} className="fw-foot__cell" data-on={i === value || undefined}>
          <span className="fw-foot__name">{ex.name}</span>
          {ex.size && (
            <span className="fw-foot__value">
              <b>{ex.size}</b> bytes
            </span>
          )}
          <span className="fw-foot__where">{wide ? ex.where : ex.short}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------------- The section ---------------- */

export function Frameworks() {
  const [ref, width] = useWidth(1152);
  const [fw, setFw] = useState(0);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const elapsed = useRef(0);
  const tabsRef = useRef<HTMLDivElement>(null);

  const pause = (on: boolean) => {
    pausedRef.current = on;
    setPaused(on);
  };

  const pick = useCallback((i: number, focus?: boolean) => {
    elapsed.current = 0;
    setFw(i);
    if (focus) requestAnimationFrame(() => document.getElementById(`fw-tab-${EXCERPTS[i].id}`)?.focus());
  }, []);

  // One loop is the three tabs in turn, ending back on the first. The dwell
  // counts only while nobody is reading (pointer or focus inside pauses it).
  const script = useCallback(async (a: Act<object>) => {
    for (let step = 0; step < EXCERPTS.length; step++) {
      elapsed.current = 0;
      while (elapsed.current < DWELL) {
        await a.wait(100);
        if (!pausedRef.current) elapsed.current += 100;
      }
      a.mark(`tab-${step + 1}`);
      setFw((v) => (v + 1) % EXCERPTS.length);
    }
  }, []);

  const layout: Layout = width >= 1000 ? "wide" : "compact";
  const wide = layout === "wide";
  const canvasW = wide ? Math.max(520, Math.round(width * 0.45)) : width;
  const headH = 52;
  const lineH = wide ? 22 : 20;
  const codeH = 14 * lineH + (wide ? 44 : 32);
  const canvasH = wide ? headH + codeH : 248;
  const footH = wide ? 72 : 84;
  const height = wide ? canvasH + footH : canvasH + headH + codeH + footH;

  return (
    <section className="sl-section sl-frameworks" aria-labelledby="fw-title">
      <div className="sl-wrap">
        <header className="sl-split" data-sl-reveal>
          <h2 id="fw-title" className="sl-h2">
            One graph, three frameworks
          </h2>
          <p className="sl-lead">
            Draw an instruction once. SolStudio writes it as Anchor, Pinocchio or Quasar, and switching is one click. Below is the vault
            template&apos;s <span className="fw-inline">deposit</span>, exactly as it generates.
          </p>
        </header>

        <div
          ref={ref}
          className="fw-host"
          onPointerEnter={() => pause(true)}
          onPointerLeave={() => pause(false)}
          onFocus={() => pause(true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) pause(false);
          }}
        >
          <Stage width={width} height={height} theme="dark" initial={NONE} poster={NONE} script={script} className="fw-stage">
            {() => (
              <div className="fw-panel" data-layout={layout} data-bleed={width < 600 || undefined} style={{ width, height }}>
                <div className="fw-body" style={{ gridTemplateColumns: wide ? `${canvasW}px minmax(0, 1fr)` : "minmax(0, 1fr)" }}>
                  <Graph width={canvasW} height={canvasH} layout={layout} />
                  <div className="fw-pane">
                    <div className="fw-pane__head" ref={tabsRef} style={{ height: headH }}>
                      <Tabs value={fw} onPick={pick} paused={paused} />
                      <span className="fw-file">
                        {EXCERPTS.map((ex, i) => (
                          <span key={ex.id} data-on={i === fw || undefined}>
                            {ex.file}
                          </span>
                        ))}
                      </span>
                    </div>
                    <div className="fw-codebox" style={{ ["--lh" as string]: `${lineH}px` } as CSSProperties}>
                      {EXCERPTS.map((ex, i) => (
                        <CodeLayer key={ex.id} ex={ex} on={i === fw} />
                      ))}
                    </div>
                  </div>
                </div>
                <Footer value={fw} wide={wide} />
              </div>
            )}
          </Stage>
        </div>
      </div>
    </section>
  );
}
