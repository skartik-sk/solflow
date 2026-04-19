"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight, Code2, Workflow, Cpu, Box, Terminal, Database, Zap,
  ShieldAlert, GitBranch, Rocket, Eye, Puzzle, FileCode,
  ChevronRight, Lock, Package, LayoutGrid, Shield, Wallet, Sparkles,
} from "lucide-react";

/* ─── Animation ─────────────────────────────────────────────────── */

const stagger = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.06 } } };
const fadeUp = { hidden: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" as const } } };

/* ─── Canvas types ──────────────────────────────────────────────── */

type NodeId = "program" | "initialize" | "deposit" | "vault" | "constraint";
type Pos = { x: number; y: number };

const CANVAS_W = 640;
const CANVAS_H = 440;

const INITIAL_POSITIONS: Record<NodeId, Pos> = {
  program:    { x: 225, y: 8 },
  initialize: { x: 15,  y: 120 },
  deposit:    { x: 430, y: 120 },
  vault:      { x: 15,  y: 280 },
  constraint: { x: 340, y: 300 },
};

const NODE_SIZES: Record<NodeId, { w: number; h: number; color: string; label: string; badge?: string }> = {
  program:    { w: 190, h: 62,  color: "#4a47a3", label: "PROGRAM ROOT", badge: "anchor" },
  initialize: { w: 195, h: 112, color: "#2563eb", label: "INITIALIZE" },
  deposit:    { w: 180, h: 68,  color: "#2563eb", label: "DEPOSIT" },
  vault:      { w: 195, h: 85,  color: "#16a34a", label: "VAULT_STATE", badge: "account" },
  constraint: { w: 175, h: 55,  color: "#ea580c", label: "HAS_ONE", badge: "constraint" },
};

const CONNECTIONS: { from: NodeId; fromSide: "bottom" | "right"; to: NodeId; toSide: "top" | "left" }[] = [
  { from: "program",    fromSide: "bottom", to: "initialize", toSide: "top" },
  { from: "program",    fromSide: "bottom", to: "deposit",    toSide: "top" },
  { from: "initialize", fromSide: "right",  to: "vault",      toSide: "top" },
  { from: "vault",      fromSide: "right",  to: "constraint", toSide: "left" },
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
  if (sSide === "bottom" && eSide === "top") {
    const midY = (s.y + e.y) / 2;
    if (Math.abs(s.x - e.x) < 2) return `M${s.x},${s.y} V${e.y}`;
    const dir = e.x > s.x ? 1 : -1;
    return `M${s.x},${s.y} V${midY - r} Q${s.x},${midY} ${s.x + dir * r},${midY} H${e.x - dir * r} Q${e.x},${midY} ${e.x},${midY + r} V${e.y}`;
  }
  if (sSide === "right" && eSide === "top") {
    const midX = (s.x + e.x) / 2;
    return `M${s.x},${s.y} H${midX - r} Q${midX},${s.y} ${midX},${s.y + r} V${e.y - r} Q${midX},${e.y} ${e.x < midX ? midX - r : midX + r},${e.y} H${e.x}`;
  }
  if (sSide === "right" && eSide === "left") {
    const midX = (s.x + e.x) / 2;
    if (Math.abs(s.y - e.y) < 2) return `M${s.x},${s.y} H${e.x}`;
    const dir = e.y > s.y ? 1 : -1;
    return `M${s.x},${s.y} H${midX - r} Q${midX},${s.y} ${midX},${s.y + dir * r} V${e.y - dir * r} Q${midX},${e.y} ${midX < e.x ? midX + r : midX - r},${e.y} H${e.x}`;
  }
  return `M${s.x},${s.y} C${s.x},${s.y + (e.y - s.y) / 2} ${e.x},${e.y - (e.y - s.y) / 2} ${e.x},${e.y}`;
}

/* ─── Labels ───────────────────────────────────────────────────── */

function Label({ children }: { children: React.ReactNode }) {
  return <span className="inline-block text-[11px] font-semibold text-primary uppercase tracking-[0.14em] mb-2.5">{children}</span>;
}

/* ═══════════════════════════════════════════════════════════════════
    CODE ANIMATION STATES — cycles through edits per node
═════════════════════════════════════════════════════════════════ */

// Each node gets a "mutation" that appears in the code panel
const CODE_MUTATIONS: Record<NodeId, { line: string; delay: number }> = {
  program:    { line: '  pub fn withdraw(', delay: 2000 },
  initialize: { line: '    pub vault: Account<\'info, VaultState>,', delay: 3500 },
  deposit:    { line: '    pub amount: u64,', delay: 5000 },
  vault:      { line: '  pub total_deposits: u64,', delay: 6500 },
  constraint: { line: '  #[account(has_one = authority)]', delay: 8000 },
};

/* ═══════════════════════════════════════════════════════════════════
    PAGE
═══════════════════════════════════════════════════════════════════ */

export default function HomePage() {
  // Node positions (draggable)
  const [positions, setPositions] = useState<Record<NodeId, Pos>>(INITIAL_POSITIONS);
  const [hoverNode, setHoverNode] = useState<NodeId | null>(null);

  // Auto-cycling code mutation
  const [activeMutation, setActiveMutation] = useState<NodeId | null>(null);
  const [cycleIndex, setCycleIndex] = useState(0);

  const nodeOrder: NodeId[] = ["program", "initialize", "deposit", "vault", "constraint"];

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    // Schedule each mutation
    nodeOrder.forEach((id, i) => {
      const m = CODE_MUTATIONS[id];
      timers.push(setTimeout(() => {
        setActiveMutation(id);
        setCycleIndex(i);
      }, m.delay));
    });
    // After all mutations shown, loop
    const totalDuration = CODE_MUTATIONS.constraint.delay + 3000;
    const loopTimer = setInterval(() => {
      nodeOrder.forEach((id, i) => {
        const m = CODE_MUTATIONS[id];
        timers.push(setTimeout(() => {
          setActiveMutation(id);
          setCycleIndex(i);
        }, m.delay));
      });
    }, totalDuration);
    return () => { timers.forEach(clearTimeout); clearInterval(loopTimer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updatePos = useCallback((id: NodeId, x: number, y: number) => {
    setPositions(prev => ({ ...prev, [id]: { x, y } }));
  }, []);

  // Active connections based on hover or auto-cycle
  const relevantNode = hoverNode ?? activeMutation;
  const activeConns = relevantNode
    ? CONNECTIONS.reduce<number[]>((acc, c, i) => {
        if (c.from === relevantNode || c.to === relevantNode) acc.push(i);
        return acc;
      }, [])
    : [];

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground font-bricolage selection:bg-primary/30 selection:text-primary-foreground overflow-x-hidden">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(124,58,237,0.06)_0%,transparent_55%)]" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.02] mix-blend-overlay" />
      </div>

      {/* Nav */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-border/40 bg-background/60 backdrop-blur-2xl">
        <nav className="mx-auto flex h-11 max-w-5xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary"><Workflow className="h-3.5 w-3.5 text-primary-foreground" /></div>
            <span className="font-bold text-sm tracking-tight">SolStudio</span>
          </Link>
          <div className="hidden md:flex items-center gap-5 text-[13px] text-muted-foreground">
            <Link href="#how-it-works" className="hover:text-foreground transition-colors">How It Works</Link>
            <Link href="#features" className="hover:text-foreground transition-colors">Features</Link>
            <Link href="#marketplace" className="hover:text-foreground transition-colors">Marketplace</Link>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/auth/signin" className="inline-flex h-8 items-center rounded-md bg-primary px-3.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
              Start Building <ArrowRight className="ml-1 h-3 w-3" />
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
              Visual Development Environment for Solana
            </motion.div>
            <motion.h1 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.06 }}
              className="mb-3 text-[28px] font-extrabold tracking-tight sm:text-4xl md:text-[42px] leading-[1.1] text-foreground">
              Architect Solana programs<br /><span className="text-muted-foreground">without writing Rust.</span>
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.12 }}
              className="mb-7 max-w-md text-sm text-muted-foreground leading-relaxed">
              Connect nodes, define state, and wire up instructions visually.
              SolStudio generates production-ready Anchor, Pinocchio, or Quasar code in real-time.
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.18 }}
              className="flex flex-col items-center gap-2.5 sm:flex-row">
              <Link href="/auth/signin" className="inline-flex h-9 w-full sm:w-auto items-center justify-center rounded-lg bg-primary px-6 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-lg shadow-primary/15">
                Launch Editor <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
              <Link href="/marketplace" className="inline-flex h-9 w-full sm:w-auto items-center justify-center gap-2 rounded-lg border border-border bg-card px-6 text-[13px] font-medium text-foreground hover:bg-accent transition-colors">
                <Box className="h-3.5 w-3.5 text-muted-foreground" /> Browse Templates
              </Link>
            </motion.div>
          </div>
        </section>

        {/* ═══ EDITOR SHOWCASE (draggable) ══════════════ */}
        <section className="relative z-20 px-5 pb-20 pt-4 md:pt-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.3 }}
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
                    <Workflow className="w-2.5 h-2.5" /> canvas
                  </span>
                  <span className="hidden sm:flex items-center gap-1"><Code2 className="w-2.5 h-2.5" /> lib.rs</span>
                  <span className="hidden sm:flex items-center gap-1"><Terminal className="w-2.5 h-2.5" /> audit</span>
                </div>
                <div className="w-8" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px]">
                {/* Canvas */}
                <div className="relative border-r border-border/40 bg-background/30 overflow-hidden select-none" style={{ height: 380 }}>
                  {/* Dot grid */}
                  <div className="absolute inset-0 opacity-25" style={{
                    backgroundImage: "radial-gradient(circle, oklch(0.32 0.01 240) 0.5px, transparent 0.5px)",
                    backgroundSize: "16px 16px",
                  }} />

                  {/* SVG edges */}
                  <svg viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden>
                    {CONNECTIONS.map((conn, i) => {
                      const sH = getHandle(positions[conn.from], NODE_SIZES[conn.from], conn.fromSide);
                      const eH = getHandle(positions[conn.to], NODE_SIZES[conn.to], conn.toSide);
                      const d = buildPath(sH, conn.fromSide, eH, conn.toSide);
                      const active = activeConns.includes(i);
                      const color = NODE_SIZES[conn.from].color;

                      return (
                        <g key={i}>
                          <motion.path d={d} stroke={color} strokeWidth={active ? 2.5 : 1.5}
                            fill="none" opacity={active ? 0.55 : 0.2}
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

                  {/* Draggable Nodes */}
                  {(["program", "initialize", "deposit", "vault", "constraint"] as NodeId[]).map((id, i) => {
                    const n = NODE_SIZES[id];
                    const pos = positions[id];
                    const active = hoverNode === id || activeMutation === id;
                    const pctX = (pos.x / CANVAS_W) * 100;
                    const pctY = (pos.y / CANVAS_H) * 100;
                    const pctW = (n.w / CANVAS_W) * 100;

                    return (
                      <motion.div key={id}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.35, delay: 0.3 + i * 0.08 }}
                        drag
                        dragMomentum={false}
                        dragElastic={0}
                        onDrag={(_, info) => {
                          const container = document.getElementById("canvas-container");
                          if (!container) return;
                          const rect = container.getBoundingClientRect();
                          const scale = (CANVAS_W / rect.width) * 0.3;
                          const newX = pos.x + info.delta.x * scale;
                          const newY = pos.y + info.delta.y * scale;
                          updatePos(id,
                            Math.max(0, Math.min(CANVAS_W - n.w, newX)),
                            Math.max(0, Math.min(CANVAS_H - n.h, newY)),
                          );
                        }}
                        onMouseEnter={() => setHoverNode(id)}
                        onMouseLeave={() => setHoverNode(null)}
                        className="absolute rounded-xl border bg-card shadow-lg cursor-grab active:cursor-grabbing transition-shadow duration-150"
                        style={{
                          left: `${pctX}%`,
                          top: `${pctY}%`,
                          width: `${pctW}%`,
                          borderLeftWidth: 3,
                          borderLeftColor: n.color,
                          borderColor: active ? n.color : undefined,
                          boxShadow: active ? `0 0 24px ${n.color}25, 0 4px 12px rgba(0,0,0,0.3)` : undefined,
                          zIndex: active ? 10 : 1,
                        }}
                      >
                        <div className="flex items-center gap-1.5 px-2.5 py-[5px] border-b border-border/50">
                          <div className="flex h-4 w-4 items-center justify-center rounded"
                            style={{ backgroundColor: `${n.color}1A`, color: n.color }}
                          >
                            {id === "program" ? <Code2 className="h-2.5 w-2.5" /> :
                             id === "initialize" || id === "deposit" ? <Zap className="h-2.5 w-2.5" /> :
                             id === "vault" ? <Wallet className="h-2.5 w-2.5" /> :
                             <Shield className="h-2.5 w-2.5" />}
                          </div>
                          <span className="text-[9px] font-semibold text-foreground tracking-wide">{n.label}</span>
                          {n.badge && (
                            <span className="ml-auto text-[7px] font-mono px-1 py-[1px] rounded"
                              style={{ color: n.color, backgroundColor: `${n.color}12` }}>{n.badge}</span>
                          )}
                        </div>
                        <div className="px-2.5 py-1.5 text-[9px] space-y-[3px]">
                          <NodeBody id={id} active={active} />
                        </div>
                      </motion.div>
                    );
                  })}

                  {/* Hint */}
                  <AnimatePresence>
                    {hoverNode === null && activeMutation === null && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.35 }} exit={{ opacity: 0 }}
                        className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[8px] text-muted-foreground font-mono whitespace-nowrap">
                        drag nodes to rearrange &middot; hover to inspect
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Code panel */}
                <div className="hidden lg:block" id="canvas-container">
                  <CodePanel activeNode={hoverNode ?? activeMutation} />
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
              <h2 className="text-xl md:text-2xl font-bold tracking-tight text-foreground mb-2">From idea to deployed program.</h2>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">Three steps. No boilerplate. No guesswork.</p>
            </motion.div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { step: "01", icon: <LayoutGrid className="h-4 w-4" />, title: "Design Visually", desc: "Drag nodes onto an infinite canvas. Wire instructions, accounts, and constraints.", color: "#4a47a3" },
                { step: "02", icon: <Code2 className="h-4 w-4" />, title: "Generate Code", desc: "Real-time Anchor, Pinocchio, or Quasar code as you build. Deterministic and production-ready.", color: "#2563eb" },
                { step: "03", icon: <Rocket className="h-4 w-4" />, title: "Deploy Instantly", desc: "Compile, audit 40+ rules, deploy to devnet or mainnet — from the browser.", color: "#16a34a" },
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
              <h2 className="text-xl md:text-2xl font-bold tracking-tight text-foreground mb-2">Everything you need to ship.</h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">Production-grade tooling that enforces best practices while giving you full control.</p>
            </motion.div>
            <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }}
              className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
              {[
                { icon: <Cpu className="h-4 w-4" />, title: "Framework Agnostic", desc: "Anchor abstractions, raw Pinocchio, or Quasar — pick your level of control." },
                { icon: <ShieldAlert className="h-4 w-4" />, title: "Security Audit", desc: "40+ rules catch missing signers, unchecked accounts, rent bypasses." },
                { icon: <Database className="h-4 w-4" />, title: "PDA Constraints", desc: "Design complex seeds and derivation paths visually." },
                { icon: <Puzzle className="h-4 w-4" />, title: "Plugin System", desc: "SPL Token, Metaplex, Pyth — first-party integrations." },
                { icon: <GitBranch className="h-4 w-4" />, title: "Version History", desc: "Track every change. Revert, compare, and iterate." },
                { icon: <Eye className="h-4 w-4" />, title: "State Inspector", desc: "Deserialize and inspect on-chain account state in real-time." },
                { icon: <Package className="h-4 w-4" />, title: "SDK Generation", desc: "Auto-generate TypeScript SDKs from your visual program." },
                { icon: <Lock className="h-4 w-4" />, title: "Transaction Builder", desc: "Construct and simulate multi-instruction transactions." },
                { icon: <Sparkles className="h-4 w-4" />, title: "Template Marketplace", desc: "Fork battle-tested templates. Escrow, staking, NFT marketplace." },
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

        {/* ═══ STATS ═══════════════════════════════════ */}
        <section className="px-5 py-12 border-y border-border/40">
          <div className="mx-auto max-w-2xl">
            <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }}
              className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[{ val: "6+", label: "Templates" }, { val: "3", label: "Frameworks" }, { val: "10+", label: "Node Types" }, { val: "3+", label: "Plugins" }, { val: "20+", label: "Users" }].map((s) => (
                <motion.div key={s.label} variants={fadeUp} className="text-center">
                  <div className="text-xl font-extrabold text-foreground">{s.val}</div>
                  <div className="text-[11px] text-muted-foreground">{s.label}</div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ═══ MARKETPLACE ═════════════════════════════ */}
        <section id="marketplace" className="px-5 py-16">
          <div className="mx-auto max-w-3xl">
            <motion.div initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.45 }}
              className="mb-8 text-center">
              <Label>Marketplace</Label>
              <h2 className="text-xl md:text-2xl font-bold tracking-tight text-foreground mb-2">Don&apos;t start from scratch.</h2>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">Fork community-verified templates. Battle-tested and ready to deploy.</p>
            </motion.div>
            <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }}
              className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              {[
                { title: "Simple Vault", desc: "SOL deposit/withdraw with PDA seeds, bump, and events", tags: ["SPL", "PDA"], color: "#2563eb" },
                { title: "NFT Collection", desc: "Mint, manage, and verify NFTs on Solana", tags: ["NFT", "Metaplex"], color: "#7c3aed" },
                { title: "AMM", desc: "Automated market maker with liquidity pools and swaps", tags: ["DeFi", "Swap"], color: "#16a34a" },
              ].map((t) => (
                <Link key={t.title} href={`/marketplace?q=${encodeURIComponent(t.title)}`}
                  className="group rounded-lg border border-border bg-card p-4 transition-all hover:border-primary/30 hover:shadow-sm">
                  <div className="flex items-center justify-between mb-2.5">
                    <FileCode className="h-3.5 w-3.5 text-muted-foreground" />
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

        {/* ═══ TESTIMONIALS ════════════════════════════ */}
        <section className="px-5 py-16 border-t border-border/40 bg-card/10">
          <div className="mx-auto max-w-3xl">
            <motion.div initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.45 }}
              className="mb-8 text-center">
              <Label>Community</Label>
              <h2 className="text-xl md:text-2xl font-bold tracking-tight text-foreground">Trusted by Solana builders.</h2>
            </motion.div>
            <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }}
              className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              {[
                { quote: "The visual canvas completely changed how I prototype programs. What used to take days now takes hours.", name: "Alex K.", role: "Protocol Engineer" },
                { quote: "The security audit caught a missing signer check that would have been a critical vulnerability.", name: "Sarah M.", role: "DeFi Founder" },
                { quote: "Forking the escrow template saved our team two weeks. Battle-tested code from day one.", name: "David R.", role: "Web3 Builder" },
              ].map((t) => (
                <motion.div key={t.name} variants={fadeUp} className="rounded-lg border border-border bg-card p-4">
                  <p className="text-[11px] text-foreground/85 leading-relaxed mb-4">&ldquo;{t.quote}&rdquo;</p>
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-primary/15 flex items-center justify-center text-primary text-[10px] font-bold">{t.name[0]}</div>
                    <div>
                      <div className="text-[11px] font-semibold text-foreground">{t.name}</div>
                      <div className="text-[10px] text-muted-foreground">{t.role}</div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ═══ CTA ════════════════════════════════════ */}
        <section className="px-5 py-20 relative">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,rgba(124,58,237,0.04)_0%,transparent_50%)] pointer-events-none" />
          <motion.div initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.45 }}
            className="mx-auto max-w-md text-center relative">
            <h2 className="text-xl md:text-2xl font-extrabold tracking-tight text-foreground mb-2">Stop boilerplate. Start building.</h2>
            <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">The fastest way to design, generate, and deploy Solana programs.</p>
            <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
              <Link href="/auth/signin" className="inline-flex h-9 items-center rounded-lg bg-primary px-5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-lg shadow-primary/15">
                Start using SolStudio <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
              <Link href="/marketplace" className="inline-flex h-9 items-center rounded-lg border border-border bg-card px-5 text-[13px] font-medium text-foreground hover:bg-accent transition-colors">
                Browse Templates
              </Link>
            </div>
          </motion.div>
        </section>
      </main>

      <footer className="border-t border-border/40 bg-card/20 px-5 py-6 z-10">
        <div className="mx-auto max-w-3xl flex flex-col items-center justify-between gap-3 md:flex-row">
          <div className="flex items-center gap-1.5">
            <div className="flex h-4 w-4 items-center justify-center rounded bg-primary"><Workflow className="h-2.5 w-2.5 text-primary-foreground" /></div>
            <span className="font-semibold text-xs text-foreground">SolStudio</span>
          </div>
          <div className="flex gap-5 text-[11px] text-muted-foreground">
            <Link href="https://github.com" className="hover:text-foreground transition-colors">GitHub</Link>
            <Link href="https://twitter.com" className="hover:text-foreground transition-colors">X</Link>
            <Link href="/docs" className="hover:text-foreground transition-colors">Docs</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ─── Node body content ────────────────────────────────────────── */

function NodeBody({ id, active }: { id: NodeId; active: boolean }) {
  const R = ({ k, v }: { k: string; v: string }) => (
    <div className="flex justify-between items-center">
      <span className={active ? "text-primary" : "text-muted-foreground"}>{k}</span>
      <span className={`font-mono ${active ? "text-primary" : "text-foreground"}`}>{v}</span>
    </div>
  );
  switch (id) {
    case "program": return <><R k="name" v="vault_program" /><R k="version" v="0.1.0" /></>;
    case "initialize": return <>
      <R k="context" v="Initialize" />
      <div className="pt-[2px] mt-[2px] border-t border-border/30">
        <span className="text-[7px] font-semibold text-muted-foreground uppercase tracking-wider">Accounts</span>
      </div>
      <R k="signer" v="auth" /><R k="init, mut" v="vault" />
    </>;
    case "deposit": return <><R k="amount" v="u64" /><R k="signer" v="auth" /></>;
    case "vault": return <><R k="authority" v="Pubkey" /><R k="balance" v="u64" /><R k="bump" v="u8" /></>;
    case "constraint": return <><R k="target" v="authority" /></>;
  }
}

/* ─── Code panel with per-node animations ──────────────────────── */

function CodePanel({ activeNode }: { activeNode: NodeId | null }) {
  const hl = (id: NodeId) => activeNode === id;
  const showMutation = (id: NodeId) => activeNode === id;

  return (
    <div className="px-3 py-2 font-mono text-[8px] leading-[1.5] text-muted-foreground bg-card/80 h-full overflow-hidden">
      <div className="flex items-center gap-1.5 mb-1.5 pb-1.5 border-b border-border/30">
        <Code2 className="w-2.5 h-2.5 text-primary" />
        <span className="text-foreground text-[9px]">lib.rs</span>
        <motion.span animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 2, repeat: Infinity }}
          className="ml-auto text-[7px] text-emerald-400 flex items-center gap-0.5">
          <span className="h-1 w-1 rounded-full bg-emerald-400" /> live
        </motion.span>
      </div>
      <div className="space-y-0 whitespace-pre-wrap">
        <div className="text-muted-foreground/25">{"// Generated by SolStudio"}</div>
        <div><span className="text-purple-400">use</span> anchor_lang::prelude::*;</div>
        <div><span className="text-purple-400">declare_id!</span>(<span className="text-emerald-300">"Fg6Pa...sLnS"</span>);</div>
        <div />
        <div><span className="text-purple-400">#[program]</span></div>
        <div><span className="text-purple-400">pub mod</span> <span className="text-foreground">vault_program</span> {"{"}</div>

        {/* initialize */}
        <div className={hl("initialize") ? "bg-primary/10 -mx-1 px-1 rounded" : ""}>
          {"  "}<span className="text-purple-400">pub fn</span> <span className="text-blue-300">initialize</span>(ctx: Context&lt;<span className="text-foreground">Initialize</span>&gt;) -&gt; Result&lt;()&gt; {"{"} Ok(()) {"}"}</div>

        {/* deposit */}
        <div className={hl("deposit") ? "bg-primary/10 -mx-1 px-1 rounded" : ""}>
          {"  "}<span className="text-purple-400">pub fn</span> <span className="text-blue-300">deposit</span>(ctx: Context&lt;<span className="text-foreground">Deposit</span>&gt;, </div>
        <AnimatePresence>
          {showMutation("deposit") && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }} className="overflow-hidden">
              <div className="bg-emerald-500/10 -mx-1 px-1 rounded">
                {"    "}amount: <span className="text-orange-300">u64</span>) -&gt; Result&lt;()&gt; {"{"} Ok(()) {"}"}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {!showMutation("deposit") && (
        <div className={hl("deposit") ? "bg-primary/10 -mx-1 px-1 rounded" : ""}>
          {"    "}amount: <span className="text-orange-300">u64</span>) -&gt; Result&lt;()&gt; {"{"} Ok(()) {"}"}</div>
        )}

        {/* withdraw — auto-mutation from program node */}
        <AnimatePresence>
          {showMutation("program") && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }} className="overflow-hidden">
              <div className="bg-emerald-500/10 -mx-1 px-1 rounded">
                {"  "}<span className="text-purple-400">pub fn</span> <span className="text-blue-300">withdraw</span>(ctx: Context&lt;<span className="text-foreground">Withdraw</span>&gt;, amount: <span className="text-orange-300">u64</span>) -&gt; Result&lt;()&gt; {"{"} Ok(()) {"}"}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div>{"}"}</div>
        <div />

        <div><span className="text-purple-400">#[derive(Accounts)]</span></div>
        <div className={hl("vault") ? "bg-primary/10 -mx-1 px-1 rounded" : ""}>
          <span className="text-purple-400">pub struct</span> <span className="text-foreground">Initialize</span>&lt;&#39;info&gt; {"{"}</div>
        <div className={hl("vault") ? "bg-primary/10 -mx-1 px-1 rounded" : ""}>
          {"  "}#[account(init, payer = auth)]</div>
        <div className={hl("vault") ? "bg-primary/10 -mx-1 px-1 rounded" : ""}>
          {"  "}<span className="text-purple-400">pub</span> vault: Account&lt;&#39;info, <span className="text-foreground">VaultState</span>&gt;,</div>

        {/* has_one constraint mutation */}
        <AnimatePresence>
          {showMutation("constraint") && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }} className="overflow-hidden">
              <div className="bg-emerald-500/10 -mx-1 px-1 rounded">
                {"  "}#[account(<span className="text-orange-300">has_one</span> = authority)]
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div>{"  "}<span className="text-purple-400">pub</span> auth: Signer&lt;&#39;info&gt;,</div>
        <div>{"  "}<span className="text-purple-400">pub</span> system_program: Program&lt;&#39;info, System&gt;,</div>
        <div>{"}"}</div>
        <div />

        {/* VaultState struct */}
        <div className={hl("vault") ? "bg-primary/10 -mx-1 px-1 rounded" : ""}>
          <span className="text-purple-400">pub struct</span> <span className="text-foreground">VaultState</span> {"{"}</div>
        {/* Auto-mutation: total_deposits field */}
        <AnimatePresence>
          {showMutation("vault") && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }} className="overflow-hidden">
              <div className="bg-emerald-500/10 -mx-1 px-1 rounded">
                {"  "}<span className="text-purple-400">pub</span> total_deposits: <span className="text-orange-300">u64</span>,
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div>{"  "}<span className="text-purple-400">pub</span> authority: Pubkey,</div>
        <div>{"  "}<span className="text-purple-400">pub</span> balance: <span className="text-orange-300">u64</span>,</div>
        <div>{"  "}<span className="text-purple-400">pub</span> bump: <span className="text-orange-300">u8</span>,</div>
        <div>{"}"}</div>
      </div>
    </div>
  );
}
