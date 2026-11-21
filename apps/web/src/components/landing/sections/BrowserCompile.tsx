"use client";

import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { RotateCcw } from "lucide-react";
import { Stage, clock, type Act } from "../kit";
import "./BrowserCompile.css";

// Compiles in your browser: a timing instrument. A ruler in seconds, three
// lanes that race once the panel is in view (Pinocchio and Quasar in the
// browser, Anchor on the server) and the build output beside them, its lines
// arriving on the same clock. Measured warm builds of the vault template.

const MAX = 8500; // ms the ruler spans
const SECONDS = [1, 2, 3, 4, 5, 6, 7, 8];
const LANES = [
  { id: "pinocchio", name: "Pinocchio", where: "In your browser", ms: 400, final: "0.4 s", first: 1000, browser: true },
  { id: "quasar", name: "Quasar", where: "In your browser", ms: 900, final: "0.9 s", first: 1500, browser: true },
  { id: "anchor", name: "Anchor", where: "On our server", ms: 8000, final: "~8 s", first: null, browser: false },
] as const;

type Mark = "dot" | "spin" | "ok";
type Line = { at: number; done?: number; tag: string; text: string; doneText?: string; strong?: boolean };
const LINES: Line[] = [
  { at: 0, tag: "toolchain", text: "rustc 1.101.0-nightly, sbpf v3" },
  { at: 40, done: 300, tag: "pinocchio", text: "compile vault v0.1.0" },
  { at: 60, done: 750, tag: "quasar", text: "compile vault v0.1.0" },
  { at: 90, done: 8000, tag: "anchor", text: "build on server", doneText: "build on server, done" },
  { at: 300, done: 400, tag: "pinocchio", text: "sbpf-link vault.so" },
  { at: 400, tag: "pinocchio", text: "vault.so 11,392 bytes in 0.4 s", strong: true },
  { at: 750, done: 900, tag: "quasar", text: "sbpf-link vault.so" },
  { at: 900, tag: "quasar", text: "vault.so 10,432 bytes in 0.9 s", strong: true },
];

type S = { t: number; on: boolean };
const initial: S = { t: 0, on: false };
const poster: S = { t: MAX, on: true };

const race = async (a: Act<S>) => {
  await a.wait(600);
  a.mark("go");
  await a.set({ on: true });
  const start = clock.now();
  for (;;) {
    const t = Math.min(8000, clock.now() - start);
    a.put({ t });
    if (t >= 8000) break;
    await a.wait(16);
  }
  a.mark("done");
  await a.wait(400);
  await a.set({ t: MAX });
};

function useWidth(initialWidth: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(initialWidth);
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

const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

function Spinner() {
  return <span className="bc-spin" aria-hidden />;
}

function Console({ t, compact }: { t: number; compact: boolean }) {
  return (
    <div className="bc-console">
      <div className="bc-console__head">Build output</div>
      <div className="bc-console__lines">
        {LINES.map((l, i) => {
          const shown = t >= l.at;
          const mark: Mark = l.done === undefined ? (l.strong ? "ok" : "dot") : t >= l.done ? "ok" : "spin";
          const text = l.doneText && l.done !== undefined && t >= l.done ? l.doneText : l.text;
          return (
            <div key={i} className="bc-line" data-on={shown || undefined} data-strong={l.strong || undefined}>
              <span className="bc-line__mark" data-mark={mark}>
                <Spinner />
                <span className="bc-tick">✓</span>
                <span className="bc-dot">·</span>
              </span>
              <span className="bc-line__tag" data-tag={l.tag}>
                {compact && l.tag === "toolchain" ? "rustc" : l.tag}
              </span>
              <span className="bc-line__text">{compact && i === 0 ? "1.101.0-nightly, sbpf v3" : text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Ruler({ width, compact }: { width: number; compact: boolean }) {
  const ticks: { s: number; major: boolean; label: boolean }[] = [];
  for (let q = 0; q <= 32; q++) {
    const s = q / 4;
    const major = q % 4 === 0;
    ticks.push({ s, major, label: major && (!compact || s % 2 === 0) });
  }
  return (
    <div className="bc-ruler" style={{ width }}>
      {ticks.map((k) => (
        <span key={k.s} className="bc-tick-mark" data-major={k.major || undefined} style={{ left: (k.s * 1000 * width) / MAX }}>
          {k.label && <span className="bc-tick-label">{k.s} s</span>}
        </span>
      ))}
    </div>
  );
}

export function BrowserCompile() {
  const [ref, width] = useWidth(1152);
  const [run, setRun] = useState(0);
  const again = useCallback(() => setRun((n) => n + 1), []);

  const compact = width < 880;
  const consoleW = compact ? width : Math.min(400, Math.round(width * 0.35));
  const instW = compact ? width : width - consoleW;
  const pad = compact ? 16 : 32;
  const labelW = compact ? 0 : 168;
  const valueW = compact ? 0 : 64;
  const trackW = instW - pad * 2 - labelW - valueW;
  const headH = 56;
  const rulerH = compact ? 44 : 52;
  const laneH = compact ? 68 : 80;
  const instH = rulerH + laneH * 3 + (compact ? 20 : 28);
  const consoleH = compact ? 8 * 22 + 64 : instH;
  const height = headH + (compact ? instH + consoleH : instH);

  return (
    <section className="sl-section sl-compile" aria-labelledby="bc-title">
      <div className="sl-wrap">
        <header className="bc-header" data-sl-reveal>
          <h2 id="bc-title" className="sl-h2">
            Compiles in your browser
          </h2>
          <p className="sl-lead">
            Pinocchio and Quasar build with rustc compiled to WebAssembly, right on your machine. No queue, no upload. Anchor still builds on our
            server.
          </p>
        </header>

        <div ref={ref} className="bc-host">
          <Stage<S> key={run} width={width} height={height} theme="dark" initial={initial} poster={poster} play="once" script={race} className="bc-stage">
            {(s) => {
              const x = (ms: number) => (Math.min(ms, MAX) / MAX) * trackW;
              return (
                <div className="bc-panel" data-layout={compact ? "compact" : "wide"} data-bleed={width < 600 || undefined} style={{ width, height }}>
                  <div className="bc-head" style={{ height: headH }}>
                    <div className="bc-head__title">
                      <span className="bc-head__prog">vault</span>
                      <span className="bc-head__sep">/</span>
                      <span>warm build</span>
                    </div>
                    <button type="button" className="sl-btn sl-btn-quiet sl-btn-sm bc-again" onClick={again}>
                      <RotateCcw size={16} strokeWidth={1.75} aria-hidden />
                      Run again
                    </button>
                  </div>
                  <div className="bc-body" style={{ gridTemplateColumns: compact ? "minmax(0, 1fr)" : `${instW}px ${consoleW}px` }}>
                    <div className="bc-inst" style={{ height: instH, padding: `0 ${pad}px` }}>
                      <div className="bc-grid" style={{ gridTemplateColumns: `${labelW}px ${trackW}px ${valueW}px` }}>
                        <div style={{ height: rulerH }} />
                        <div className="bc-ruler-cell" style={{ height: rulerH }}>
                          <Ruler width={trackW} compact={compact} />
                        </div>
                        <div />
                        {LANES.map((l) => {
                          const done = s.t >= l.ms;
                          const shown = s.on ? Math.min(s.t, l.ms) : 0;
                          return (
                            <div key={l.id} className="bc-lane" data-browser={l.browser || undefined} data-done={done || undefined} style={{ height: laneH, gridColumn: "1 / -1", gridTemplateColumns: compact ? undefined : `${labelW}px ${trackW}px ${valueW}px` }}>
                              <div className="bc-lane__label">
                                <span className="bc-lane__name">{l.name}</span>
                                <span className="bc-lane__where">{l.where}</span>
                              </div>
                              <div className="bc-lane__track" style={{ width: trackW }}>
                                {SECONDS.map((sec) => (
                                  <span key={sec} className="bc-lane__grid" style={{ left: x(sec * 1000) }} />
                                ))}
                                {l.first !== null && !compact && (
                                  <span className="bc-first" style={{ left: x(l.first) }}>
                                    <span>first build {secs(l.first)}</span>
                                  </span>
                                )}
                                <span className="bc-lane__bar" style={{ transform: `scaleX(${Math.max(shown, 0) / MAX})` } as CSSProperties} />
                                <span className="bc-lane__cap" data-on={(s.on && !done) || undefined} style={{ transform: `translateX(${x(shown)}px)` }} />
                              </div>
                              <div className="bc-lane__value" data-on={s.on || undefined}>
                                {done ? l.final : secs(shown)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="bc-playhead" data-on={(s.on && s.t < 8000) || undefined} style={{ left: pad + labelW, top: 0, height: instH - 12, transform: `translateX(${x(Math.min(s.t, 8000))}px)` }}>
                        <span className="bc-playhead__chip">{secs(Math.min(s.t, 8000))}</span>
                      </div>
                    </div>
                    <Console t={s.on ? s.t : 0} compact={compact} />
                  </div>
                </div>
              );
            }}
          </Stage>
        </div>

        <p className="bc-note" data-sl-reveal>
          Warm builds of the vault template. The first build in your browser takes 1.0 s for Pinocchio and 1.5 s for Quasar, after a one-time
          download of about 30 MB that stays cached.
        </p>
      </div>
    </section>
  );
}
