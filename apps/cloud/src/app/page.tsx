"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Workflow,
  Wallet,
  Bot,
  Shield,
  Zap,
  Activity,
  Timer,
  Plug,
  ChevronRight,
  Code2,
  BarChart3,
  GitBranch,
  Layers,
  Radio,
  Lock,
  Boxes,
  Cloud,
} from "lucide-react";

const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? "https://solstudio.fun";
const WEB_EDITOR_URL = `${WEB_URL}/dashboard`;
const CLOUD_DOCS_URL = `${WEB_URL}/docs/cloud`;

/* ─── Animation ─────────────────────────────────────────────────── */

const stagger = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.07 } } };
const fadeUp = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } } };

function Label({ children }: { children: React.ReactNode }) {
  return <span className="inline-block text-[11px] font-semibold text-primary uppercase tracking-[0.14em] mb-2.5">{children}</span>;
}

/* ─── Canvas types ──────────────────────────────────────────────── */

type NodeId = "trigger" | "fetch" | "split" | "swap" | "webhook";
type Pos = { x: number; y: number };
type DragState = { id: NodeId; pointerId: number; offsetX: number; offsetY: number };

const CANVAS_W = 640;
const CANVAS_H = 360;

const INITIAL_POSITIONS: Record<NodeId, Pos> = {
  trigger:  { x: 15,  y: 145 },
  fetch:    { x: 160, y: 145 },
  split:    { x: 310, y: 145 },
  swap:     { x: 460, y: 60 },
  webhook:  { x: 460, y: 230 },
};

const NODE_DEFS: Record<NodeId, { w: number; h: number; color: string; label: string; sub: string; icon: React.ReactNode; badge?: string }> = {
  trigger:  { w: 130, h: 72, color: "#f59e0b", label: "CRON TRIGGER", sub: "Every 5 minutes",       icon: <Radio className="h-3 w-3" /> },
  fetch:    { w: 130, h: 72, color: "#3b82f6", label: "FETCH PRICE",  sub: "Birdeye SOL/USDT",      icon: <Zap className="h-3 w-3" /> },
  split:    { w: 130, h: 72, color: "#8b5cf6", label: "IF / ELSE",    sub: "price > threshold?",    icon: <GitBranch className="h-3 w-3" />, badge: "logic" },
  swap:     { w: 140, h: 72, color: "#10b981", label: "JUPITER SWAP", sub: "Signed by Cloud wallet",icon: <Wallet className="h-3 w-3" /> },
  webhook:  { w: 130, h: 72, color: "#ef4444", label: "WEBHOOK OUT",  sub: "Send run summary",      icon: <Activity className="h-3 w-3" /> },
};

const CONNECTIONS: { from: NodeId; fromSide: "bottom" | "right"; to: NodeId; toSide: "top" | "left" }[] = [
  { from: "trigger", fromSide: "right", to: "fetch",   toSide: "left" },
  { from: "fetch",   fromSide: "right", to: "split",   toSide: "left" },
  { from: "split",   fromSide: "right", to: "swap",    toSide: "top" },
  { from: "split",   fromSide: "right", to: "webhook", toSide: "top" },
];

/* ─── Edge path builder ────────────────────────────────────────── */

function getHandle(pos: Pos, size: { w: number; h: number }, side: string): Pos {
  switch (side) {
    case "top":    return { x: pos.x + size.w / 2, y: pos.y };
    case "bottom": return { x: pos.x + size.w / 2, y: pos.y + size.h };
    case "left":   return { x: pos.x,               y: pos.y + size.h / 2 };
    case "right":  return { x: pos.x + size.w,       y: pos.y + size.h / 2 };
    default:       return pos;
  }
}

function buildPath(s: Pos, sSide: string, e: Pos, eSide: string): string {
  const r = 8;
  if (sSide === "right" && eSide === "left") {
    const midX = (s.x + e.x) / 2;
    if (Math.abs(s.y - e.y) < 2) return `M${s.x},${s.y} H${e.x}`;
    const dir = e.y > s.y ? 1 : -1;
    return `M${s.x},${s.y} H${midX - r} Q${midX},${s.y} ${midX},${s.y + dir * r} V${e.y - dir * r} Q${midX},${e.y} ${midX < e.x ? midX + r : midX - r},${e.y} H${e.x}`;
  }
  if (sSide === "right" && eSide === "top") {
    const midX = (s.x + e.x) / 2;
    return `M${s.x},${s.y} H${midX - r} Q${midX},${s.y} ${midX},${s.y + r} V${e.y - r} Q${midX},${e.y} ${e.x < midX ? midX - r : midX + r},${e.y} H${e.x}`;
  }
  return `M${s.x},${s.y} C${s.x},${s.y + (e.y - s.y) / 2} ${e.x},${e.y - (e.y - s.y) / 2} ${e.x},${e.y}`;
}

function canvasPoint(event: React.PointerEvent, canvas: HTMLElement): Pos {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * CANVAS_W,
    y: ((event.clientY - rect.top) / rect.height) * CANVAS_H,
  };
}

function clampPosition(pos: Pos, size: { w: number; h: number }): Pos {
  return {
    x: Math.max(0, Math.min(CANVAS_W - size.w, pos.x)),
    y: Math.max(0, Math.min(CANVAS_H - size.h, pos.y)),
  };
}

/* ─── Status ticker ─────────────────────────────────────────────── */

const STATUS_LINES = [
  { time: "2s ago", text: "Cron trigger queued a price check", color: "#f59e0b" },
  { time: "3s ago", text: "Price fetch returned SOL market data", color: "#3b82f6" },
  { time: "5s ago", text: "Condition matched the configured threshold", color: "#8b5cf6" },
  { time: "6s ago", text: "Jupiter quote prepared for wallet signing", color: "#10b981" },
  { time: "7s ago", text: "Webhook output delivered execution summary", color: "#ef4444" },
];

/* ─── Auto-cycle order ──────────────────────────────────────────── */

const NODE_ORDER: NodeId[] = ["trigger", "fetch", "split", "swap", "webhook"];

/* ═══════════════════════════════════════════════════════════════════
    PAGE
═══════════════════════════════════════════════════════════════════ */

export default function CloudLandingPage() {
  const [positions, setPositions] = useState<Record<NodeId, Pos>>(INITIAL_POSITIONS);
  const [hoverNode, setHoverNode] = useState<NodeId | null>(null);
  const [activeLine, setActiveLine] = useState(0);
  const [activeNode, setActiveNode] = useState<NodeId | null>(null);
  const [cycleIndex, setCycleIndex] = useState(0);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<DragState | null>(null);

  // Auto-cycle status log
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveLine((prev) => (prev + 1) % STATUS_LINES.length);
    }, 2200);
    return () => clearInterval(interval);
  }, []);

  // Auto-cycle node highlights
  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const schedule = (id: NodeId, i: number) => {
      const t = setTimeout(() => {
        setActiveNode(id);
        setCycleIndex(i);
        timers.delete(t);
      }, (i + 1) * 2500);
      timers.add(t);
    };
    NODE_ORDER.forEach(schedule);
    const total = (NODE_ORDER.length + 1) * 2500;
    const loop = setInterval(() => NODE_ORDER.forEach(schedule), total);
    return () => { timers.forEach(clearTimeout); clearInterval(loop); };
  }, []);

  const updatePos = useCallback((id: NodeId, x: number, y: number) => {
    setPositions(prev => ({ ...prev, [id]: { x, y } }));
  }, []);

  const handleNodePointerDown = useCallback((id: NodeId, event: React.PointerEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    event.preventDefault();
    event.stopPropagation();

    const point = canvasPoint(event, canvas);
    dragStateRef.current = {
      id,
      pointerId: event.pointerId,
      offsetX: point.x - positions[id].x,
      offsetY: point.y - positions[id].y,
    };
    setHoverNode(id);
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [positions]);

  const handleNodePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    const canvas = canvasRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId || !canvas) return;

    const point = canvasPoint(event, canvas);
    const next = clampPosition(
      {
        x: point.x - dragState.offsetX,
        y: point.y - dragState.offsetY,
      },
      NODE_DEFS[dragState.id],
    );
    updatePos(dragState.id, next.x, next.y);
  }, [updatePos]);

  const handleNodePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current?.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const relevantNode = hoverNode ?? activeNode;
  const activeConns = relevantNode
    ? CONNECTIONS.reduce<number[]>((acc, c, i) => {
        if (c.from === relevantNode || c.to === relevantNode) acc.push(i);
        return acc;
      }, [])
    : [];

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground font-bricolage selection:bg-primary/30 selection:text-primary-foreground overflow-x-hidden">
      {/* Background texture */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,oklch(0.35_0.12_260/0.06)_0%,transparent_55%)]" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.018] mix-blend-overlay" />
      </div>

      {/* ─── NAV ────────────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-border/40 bg-background/60 backdrop-blur-2xl">
        <nav className="mx-auto flex h-11 max-w-5xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary">
              <Cloud className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="font-bold text-sm tracking-tight">SolStudio Cloud</span>
          </Link>
          <div className="hidden md:flex items-center gap-5 text-[13px] text-muted-foreground">
            <a href={CLOUD_DOCS_URL} className="hover:text-foreground transition-colors">Docs</a>
            <Link href="/marketplace" className="hover:text-foreground transition-colors">Marketplace</Link>
            <a href={WEB_EDITOR_URL} className="hover:text-foreground transition-colors">Web Editor</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="inline-flex h-8 items-center rounded-md bg-primary px-3.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
              Dashboard <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          </div>
        </nav>
      </header>

      <main className="flex-1 relative z-10">

        {/* ═══ HERO ═════════════════════════════════════ */}
        <section className="relative pt-28 pb-4 md:pt-36 md:pb-8 lg:pt-44">
          <div className="mx-auto max-w-2xl px-5 flex flex-col items-center text-center">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
              className="mb-4 inline-flex items-center gap-2 rounded-full border border-border/40 bg-card/60 px-3 py-1 text-[11px] font-medium text-muted-foreground">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative rounded-full h-1.5 w-1.5 bg-emerald-400" />
              </span>
              Solana-native workflow automation
            </motion.div>
            <motion.h1 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.06 }}
              className="mb-3 text-[28px] font-extrabold tracking-tight sm:text-4xl md:text-[42px] leading-[1.1] text-foreground">
              Automate your Solana<br /><span className="text-muted-foreground">operations visually.</span>
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.12 }}
              className="mb-7 max-w-md text-sm text-muted-foreground leading-relaxed">
              Build powerful workflows for DeFi. Just drag, connect, deploy.
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.18 }}
              className="flex flex-col items-center gap-2.5 sm:flex-row">
              <Link href="/dashboard" className="inline-flex h-9 w-full sm:w-auto items-center justify-center rounded-lg bg-primary px-6 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-lg shadow-primary/15">
                Get Started <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
              <Link href="/marketplace" className="inline-flex h-9 w-full sm:w-auto items-center justify-center gap-2 rounded-lg border border-border bg-card px-6 text-[13px] font-medium text-foreground hover:bg-accent transition-colors">
                <Boxes className="h-3.5 w-3.5 text-muted-foreground" /> Browse Templates
              </Link>
            </motion.div>
          </div>
        </section>

        {/* ═══ WORKFLOW SHOWCASE (interactive) ═══════════ */}
        <section className="relative z-20 px-5 pb-20 pt-4 md:pt-8">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.3 }}
            className="mx-auto max-w-4xl">
            <div className="rounded-xl border border-border bg-card shadow-2xl shadow-black/50 overflow-hidden">
              {/* Top bar */}
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/50 bg-background/40">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/40" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/40" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500/40" />
                </div>
                <div className="flex items-center gap-3 text-[9px] font-mono text-muted-foreground">
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/15">
                    <Workflow className="w-2.5 h-2.5" /> workflow
                  </span>
                  <span className="hidden sm:flex items-center gap-1"><Timer className="w-2.5 h-2.5" /> runs</span>
                  <span className="hidden sm:flex items-center gap-1"><BarChart3 className="w-2.5 h-2.5" /> logs</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[8px] font-mono text-emerald-400 flex items-center gap-0.5">
                    <span className="h-1 w-1 rounded-full bg-emerald-400" /> live
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px]">
                {/* Canvas */}
                <div ref={canvasRef} id="cloud-canvas" className="relative border-r border-border/40 bg-background/30 overflow-hidden select-none" style={{ height: 360 }}>
                  {/* Dot grid */}
                  <div className="absolute inset-0 opacity-25" style={{
                    backgroundImage: "radial-gradient(circle, oklch(0.32 0.01 240) 0.5px, transparent 0.5px)",
                    backgroundSize: "16px 16px",
                  }} />

                  {/* SVG edges */}
                  <svg viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden>
                    {CONNECTIONS.map((conn, i) => {
                      const sH = getHandle(positions[conn.from], NODE_DEFS[conn.from], conn.fromSide);
                      const eH = getHandle(positions[conn.to], NODE_DEFS[conn.to], conn.toSide);
                      const d = buildPath(sH, conn.fromSide, eH, conn.toSide);
                      const active = activeConns.includes(i);
                      const color = NODE_DEFS[conn.from].color;

                      return (
                        <g key={i}>
                          <motion.path d={d} stroke={color} strokeWidth={active ? 2.5 : 1.5}
                            fill="none" opacity={active ? 0.6 : 0.2}
                            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                            transition={{ duration: 1, delay: 0.4 + i * 0.15, ease: "easeInOut" }}
                          />
                          <circle r={active ? 2.5 : 1.5} fill={color} opacity={active ? 0.7 : 0.35}>
                            <animateMotion dur={active ? "1.2s" : "2.5s"} repeatCount="indefinite" begin={0.4 + i * 0.15} path={d} />
                          </circle>
                          <circle cx={sH.x} cy={sH.y} r={active ? 4 : 3}
                            fill="var(--color-background)" stroke={color} strokeWidth={active ? 2 : 1.5} />
                          <circle cx={eH.x} cy={eH.y} r={active ? 4 : 3}
                            fill="var(--color-background)" stroke={color} strokeWidth={active ? 2 : 1.5} />
                        </g>
                      );
                    })}
                  </svg>

                  {/* Draggable nodes */}
                  {NODE_ORDER.map((id, i) => {
                    const n = NODE_DEFS[id];
                    const pos = positions[id];
                    const active = hoverNode === id || activeNode === id;
                    const pctX = (pos.x / CANVAS_W) * 100;
                    const pctY = (pos.y / CANVAS_H) * 100;
                    const pctW = (n.w / CANVAS_W) * 100;

                    return (
                      <motion.div key={id}
                        initial={{ opacity: 0, scale: 0.92 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.35, delay: 0.3 + i * 0.08 }}
                        onPointerDown={(event) => handleNodePointerDown(id, event)}
                        onPointerMove={handleNodePointerMove}
                        onPointerUp={handleNodePointerUp}
                        onPointerCancel={handleNodePointerUp}
                        onPointerEnter={() => setHoverNode(id)}
                        onPointerLeave={() => {
                          if (!dragStateRef.current) setHoverNode(null);
                        }}
                        className="absolute touch-none rounded-lg border bg-card/90 shadow-md backdrop-blur-sm cursor-grab active:cursor-grabbing transition-shadow duration-150"
                        style={{
                          left: `${pctX}%`,
                          top: `${pctY}%`,
                          width: `${pctW}%`,
                          borderLeftWidth: 3,
                          borderLeftColor: n.color,
                          borderColor: active ? n.color : undefined,
                          boxShadow: active ? `0 0 20px ${n.color}25, 0 4px 12px rgba(0,0,0,0.3)` : undefined,
                          zIndex: active ? 10 : 1,
                        }}
                      >
                        <div className="flex items-center gap-1.5 px-2 py-[4px] border-b border-border/40">
                          <div className="flex h-4 w-4 items-center justify-center rounded"
                            style={{ backgroundColor: `${n.color}1A`, color: n.color }}>
                            {n.icon}
                          </div>
                          <span className="text-[8px] font-semibold text-foreground tracking-wide">{n.label}</span>
                          {n.badge && (
                            <span className="ml-auto text-[7px] font-mono px-1 py-[1px] rounded"
                              style={{ color: n.color, backgroundColor: `${n.color}12` }}>{n.badge}</span>
                          )}
                        </div>
                        <div className="px-2 py-1.5">
                          <span className="text-[7px] font-mono text-muted-foreground">{n.sub}</span>
                        </div>
                      </motion.div>
                    );
                  })}

                  {/* Type badges */}
                  <div className="absolute bottom-2 left-3 flex gap-2">
                    {[
                      { label: "TRIGGER", color: "#f59e0b" },
                      { label: "ACTION", color: "#3b82f6" },
                      { label: "LOGIC", color: "#8b5cf6" },
                      { label: "OUTPUT", color: "#10b981" },
                    ].map((t) => (
                      <span key={t.label} className="text-[7px] font-semibold uppercase tracking-wider px-1.5 py-[1px] rounded"
                        style={{ color: t.color, backgroundColor: `${t.color}0D` }}>{t.label}</span>
                    ))}
                  </div>

                  {/* Hint */}
                  {(hoverNode === null && activeNode === null) && (
                    <div className="absolute bottom-2 right-3 text-[8px] text-muted-foreground font-mono opacity-35 whitespace-nowrap">
                      drag nodes to rearrange &middot; hover to inspect
                    </div>
                  )}
                </div>

                {/* Status panel */}
                <div className="hidden lg:block relative border-l border-border/40 bg-card/50">
                  <div className="px-3 py-2 border-b border-border/30">
                    <div className="flex items-center gap-1.5">
                      <Activity className="w-2.5 h-2.5 text-primary" />
                      <span className="text-[9px] font-semibold text-foreground">Execution Log</span>
                      <motion.span
                        animate={{ opacity: [0.4, 1, 0.4] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="ml-auto text-[7px] text-emerald-400 flex items-center gap-0.5"
                      >
                        <span className="h-1 w-1 rounded-full bg-emerald-400" /> running
                      </motion.span>
                    </div>
                  </div>
                  <div className="px-3 py-2 space-y-2 font-mono text-[8px]">
                      {STATUS_LINES.map((line, i) => (
                        <motion.div
                          key={i}
                          animate={{
                            opacity: i <= activeLine ? 1 : 0.3,
                            backgroundColor: i === activeLine ? "oklch(0.65 0.22 260 / 0.05)" : "transparent",
                          }}
                          transition={{ duration: 0.3 }}
                          className={`flex gap-2 items-start ${i === activeLine ? "-mx-1 px-1 rounded py-0.5" : ""}`}
                        >
                          <span className="text-muted-foreground/50 whitespace-nowrap">{line.time}</span>
                          <span className="flex items-start gap-1">
                            <span className="mt-[3px] h-1 w-1 rounded-full shrink-0" style={{ backgroundColor: line.color }} />
                            <span className={i === activeLine ? "text-foreground" : "text-muted-foreground"}>{line.text}</span>
                          </span>
                        </motion.div>
                      ))}
                  </div>
                  {/* Run stats */}
                  <div className="absolute bottom-0 left-0 right-0 border-t border-border/30 bg-background/30 px-3 py-2">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      {[
                        { val: "Sim", label: "preflight" },
                        { val: "Logs", label: "per node" },
                        { val: "Replay", label: "run view" },
                      ].map((s) => (
                        <div key={s.label}>
                          <div className="text-[9px] font-bold text-foreground">{s.val}</div>
                          <div className="text-[7px] text-muted-foreground">{s.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-1/2 h-16 bg-primary/6 blur-3xl rounded-full pointer-events-none" />
          </motion.div>
        </section>

        {/* ═══ HOW IT WORKS ═════════════════════════════ */}
        <section id="how-it-works" className="px-5 py-16 border-t border-border/40">
          <div className="mx-auto max-w-3xl">
            <motion.div initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.45 }}
              className="mb-10 text-center">
              <Label>How it works</Label>
              <h2 className="text-xl md:text-2xl font-bold tracking-tight text-foreground mb-2">Set up in minutes. Run forever.</h2>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">Three steps to automated Solana operations.</p>
            </motion.div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { step: "01", icon: <Workflow className="h-4 w-4" />, title: "Build Visually", desc: "Drag triggers, actions, and logic nodes onto the canvas. Wire them together to define your automation.", color: "#f59e0b" },
                { step: "02", icon: <Shield className="h-4 w-4" />, title: "Configure & Secure", desc: "Set parameters, connect wallets with AES-256 encryption, and define retry/fallback policies.", color: "#3b82f6" },
                { step: "03", icon: <Zap className="h-4 w-4" />, title: "Deploy & Monitor", desc: "Activate your workflow. Real-time logs, execution history, and alerts keep you in control 24/7.", color: "#10b981" },
              ].map((s, i) => (
                <motion.div key={s.step} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.08 }} className="rounded-lg border border-border bg-card p-5">
                  <div className="flex items-center gap-2.5 mb-4">
                    <span className="text-xl font-extrabold text-muted-foreground/10 leading-none">{s.step}</span>
                    <div className="h-px flex-1 bg-border/40" />
                  </div>
                  <div className="inline-flex p-1.5 rounded-md mb-3" style={{ backgroundColor: `${s.color}10`, color: s.color }}>{s.icon}</div>
                  <h3 className="text-[13px] font-semibold text-foreground mb-1">{s.title}</h3>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{s.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ FEATURES ═════════════════════════════════ */}
        <section id="features" className="px-5 py-16 bg-card/15 border-t border-border/40">
          <div className="mx-auto max-w-3xl">
            <motion.div initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.45 }}
              className="mb-10 text-center">
              <Label>Features</Label>
              <h2 className="text-xl md:text-2xl font-bold tracking-tight text-foreground mb-2">Built for serious operations.</h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">Enterprise-grade infrastructure for automated Solana workflows.</p>
            </motion.div>
            <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }}
              className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
              {[
                { icon: <Workflow className="h-4 w-4" />, title: "Visual Builder", desc: "Drag triggers, actions, logic, AI, and outputs across the Cloud node canvas." },
                { icon: <Wallet className="h-4 w-4" />, title: "Cloud Wallets", desc: "Encrypted wallet management. Swap, transfer, and manage tokens around the clock." },
                { icon: <Bot className="h-4 w-4" />, title: "AI Agents", desc: "Use OpenAI, Anthropic, or Gemini credentials for classification and JSON decisions." },
                { icon: <Shield className="h-4 w-4" />, title: "Enterprise Security", desc: "AES-256-GCM encryption, audit logging, and rate limiting. Keys never leave the server." },
                { icon: <Layers className="h-4 w-4" />, title: "Protocol Nodes", desc: "Jupiter, Pyth, Helius, Metaplex, SPL Token, Squads, and webhook nodes are built in." },
                { icon: <Plug className="h-4 w-4" />, title: "Credentials", desc: "Attach provider keys per node or fall back to server environment variables." },
                { icon: <Timer className="h-4 w-4" />, title: "Cron Triggers", desc: "Schedule workflows on cron expressions. Recurring swaps, rebalancing, or monitoring." },
                { icon: <BarChart3 className="h-4 w-4" />, title: "Execution Logs", desc: "Detailed run history with inputs, outputs, and error traces for every execution." },
                { icon: <Lock className="h-4 w-4" />, title: "Simulation Gates", desc: "Preflight wallet actions with estimated fees, warnings, blockers, and wallet deltas." },
              ].map((f) => (
                <motion.div key={f.title} variants={fadeUp}
                  whileHover={{ y: -2, transition: { duration: 0.12 } }}
                  className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/20">
                  <div className="text-foreground mb-2.5">{f.icon}</div>
                  <h3 className="text-[12px] font-semibold text-foreground mb-0.5">{f.title}</h3>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{f.desc}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ═══ INTEGRATIONS ═════════════════════════════ */}
        <section id="integrations" className="px-5 py-16 border-t border-border/40">
          <div className="mx-auto max-w-3xl">
            <motion.div initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.45 }}
              className="mb-10 text-center">
              <Label>Integrations</Label>
              <h2 className="text-xl md:text-2xl font-bold tracking-tight text-foreground mb-2">Powering real Solana workflows.</h2>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">Built-in nodes for the protocols and services you actually use.</p>
            </motion.div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {[
                { name: "Jupiter", tag: "Swap", color: "#10b981", desc: "Quotes and signed swaps" },
                { name: "Birdeye", tag: "Price", color: "#06b6d4", desc: "API-key price fetches" },
                { name: "Pyth", tag: "Oracle", color: "#f59e0b", desc: "Public price reads" },
                { name: "Switchboard", tag: "Oracle", color: "#a855f7", desc: "Credentialed feed APIs" },
                { name: "Helius", tag: "RPC", color: "#6366f1", desc: "DAS and token data" },
                { name: "Metaplex", tag: "NFT", color: "#ec4899", desc: "NFT asset lookup" },
                { name: "SPL Token", tag: "Token", color: "#22c55e", desc: "Token account watcher" },
                { name: "Squads", tag: "Ops", color: "#eab308", desc: "Approval proposals" },
                { name: "AI Providers", tag: "AI", color: "#10a37f", desc: "OpenAI, Anthropic, Gemini" },
                { name: "Webhooks", tag: "I/O", color: "#ef4444", desc: "Receive and send events" },
              ].map((p) => (
                <div key={p.name}
                  className="group rounded-lg border border-border bg-card px-4 py-4 transition-colors hover:border-primary/25">
                  <div className="flex items-center justify-between mb-3">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                    <span className="text-[8px] font-semibold uppercase tracking-wider px-1.5 py-[1px] rounded"
                      style={{ color: p.color, backgroundColor: `${p.color}0D` }}>{p.tag}</span>
                  </div>
                  <span className="text-[13px] font-semibold text-foreground group-hover:text-primary transition-colors">{p.name}</span>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{p.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ STATS ═══════════════════════════════════ */}
        <section className="px-5 py-12 border-y border-border/40">
          <div className="mx-auto max-w-2xl">
            <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }}
              className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { val: "16", label: "Node Types" },
                { val: "10", label: "Credential Paths" },
                { val: "3", label: "Run Modes" },
                { val: "6+", label: "Templates" },
              ].map((s) => (
                <motion.div key={s.label} variants={fadeUp} className="text-center">
                  <div className="text-xl font-extrabold text-foreground">{s.val}</div>
                  <div className="text-[11px] text-muted-foreground">{s.label}</div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ═══ WORKFLOW TEMPLATES ═══════════════════════ */}
        <section className="px-5 py-16">
          <div className="mx-auto max-w-3xl">
            <motion.div initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.45 }}
              className="mb-8 text-center">
              <Label>Templates</Label>
              <h2 className="text-xl md:text-2xl font-bold tracking-tight text-foreground mb-2">Start with a blueprint.</h2>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">Pre-built workflows ready to customize and deploy.</p>
            </motion.div>
            <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }}
              className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              {[
                { title: "Price-Guarded DCA", desc: "Fetch price, check limits, then prepare a guarded Jupiter swap", tags: ["Jupiter", "Cron"], color: "#3b82f6" },
                { title: "NFT Asset Watch", desc: "Read Metaplex/Helius asset metadata and post a webhook result", tags: ["NFT", "Helius"], color: "#ef4444" },
                { title: "Treasury Approval", desc: "Inspect token accounts and create a Squads-style approval handoff", tags: ["SPL", "Squads"], color: "#10b981" },
              ].map((t) => (
                <Link key={t.title} href={`/marketplace?q=${encodeURIComponent(t.title)}`}
                  className="group rounded-lg border border-border bg-card p-4 transition-all hover:border-primary/30 hover:shadow-sm">
                  <div className="flex items-center justify-between mb-2.5">
                    <Code2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[10px] text-primary font-medium flex items-center gap-0.5">
                      Use <ChevronRight className="h-2.5 w-2.5" />
                    </span>
                  </div>
                  <h3 className="text-[12px] font-semibold text-foreground mb-0.5">{t.title}</h3>
                  <p className="text-[11px] text-muted-foreground mb-2.5">{t.desc}</p>
                  <div className="flex flex-wrap gap-1">
                    {t.tags.map((tag) => (
                      <span key={tag} className="text-[8px] font-semibold uppercase tracking-wider px-1.5 py-[2px] rounded"
                        style={{ color: t.color, backgroundColor: `${t.color}0D` }}>{tag}</span>
                    ))}
                  </div>
                </Link>
              ))}
            </motion.div>
            <div className="mt-5 text-center">
              <Link href="/marketplace" className="text-[12px] text-primary font-medium hover:underline inline-flex items-center gap-0.5">
                Browse all templates <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </section>

        {/* ═══ CTA ════════════════════════════════════ */}
        <section className="px-5 py-20 relative">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,oklch(0.35_0.12_260/0.04)_0%,transparent_50%)] pointer-events-none" />
          <motion.div initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.45 }}
            className="mx-auto max-w-md text-center relative">
            <h2 className="text-xl md:text-2xl font-extrabold tracking-tight text-foreground mb-2">Stop watching charts.<br />Start automating.</h2>
            <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">The easiest way to automate Solana operations — no code, no servers, no babysitting.</p>
            <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
              <Link href="/dashboard" className="inline-flex h-9 items-center rounded-lg bg-primary px-5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-lg shadow-primary/15">
                Start Free <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
              <Link href="/marketplace" className="inline-flex h-9 items-center rounded-lg border border-border bg-card px-5 text-[13px] font-medium text-foreground hover:bg-accent transition-colors">
                Browse Templates
              </Link>
            </div>
          </motion.div>
        </section>
      </main>

      {/* ─── FOOTER ────────────────────────────────────────── */}
      <footer className="border-t border-border/40 bg-card/20 px-5 py-6 z-10">
        <div className="mx-auto max-w-3xl flex flex-col items-center justify-between gap-3 md:flex-row">
          <div className="flex items-center gap-1.5">
            <div className="flex h-4 w-4 items-center justify-center rounded bg-primary"><Cloud className="h-2.5 w-2.5 text-primary-foreground" /></div>
            <span className="font-semibold text-xs text-foreground">SolStudio Cloud</span>
          </div>
          <div className="flex gap-5 text-[11px] text-muted-foreground">
            <a href={WEB_EDITOR_URL} className="hover:text-foreground transition-colors">Web Editor</a>
            <a href={CLOUD_DOCS_URL} className="hover:text-foreground transition-colors">Docs</a>
            <a href="https://github.com/skartik-sk" className="hover:text-foreground transition-colors">GitHub</a>
            <a href="https://x.com/solstudiodotfun" className="hover:text-foreground transition-colors">X</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
