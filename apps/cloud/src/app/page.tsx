"use client";

import React, { useState, useEffect } from "react";
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

/* ─── Animation ─────────────────────────────────────────────────── */

const stagger = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.07 } } };
const fadeUp = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } } };

function Label({ children }: { children: React.ReactNode }) {
  return <span className="inline-block text-[11px] font-semibold text-primary uppercase tracking-[0.14em] mb-2.5">{children}</span>;
}

/* ─── Workflow node types for showcase ──────────────────────────── */

type WFNode = {
  id: string;
  label: string;
  sublabel: string;
  icon: React.ReactNode;
  color: string;
  x: number;
  y: number;
};

const WORKFLOW_NODES: WFNode[] = [
  { id: "trigger", label: "PRICE MONITOR", sublabel: "SOL/USDT < $148.50", icon: <Radio className="h-3 w-3" />, color: "#f59e0b", x: 8, y: 50 },
  { id: "swap", label: "JUPITER SWAP", sublabel: "100 SOL → USDC", icon: <Zap className="h-3 w-3" />, color: "#3b82f6", x: 32, y: 50 },
  { id: "split", label: "CONDITIONAL", sublabel: "amount > $10k?", icon: <GitBranch className="h-3 w-3" />, color: "#8b5cf6", x: 56, y: 50 },
  { id: "transfer", label: "WALLET SEND", sublabel: "→ Cold Storage", icon: <Wallet className="h-3 w-3" />, color: "#10b981", x: 80, y: 34 },
  { id: "alert", label: "DISCORD ALERT", sublabel: "Trade Executed", icon: <Activity className="h-3 w-3" />, color: "#ef4444", x: 80, y: 66 },
];

/* ─── Status ticker ─────────────────────────────────────────────── */

const STATUS_LINES = [
  { time: "2s ago", text: "SOL/USDT hit $147.82 — trigger fired", color: "#f59e0b" },
  { time: "3s ago", text: "Jupiter: swapped 50 SOL → 7,391 USDC", color: "#3b82f6" },
  { time: "5s ago", text: "Condition passed: amount $7,391 < $10k", color: "#8b5cf6" },
  { time: "6s ago", text: "Transferred 7,391 USDC → cold wallet", color: "#10b981" },
  { time: "7s ago", text: "Discord webhook: trade notification sent", color: "#ef4444" },
];

/* ═══════════════════════════════════════════════════════════════════
    PAGE
═══════════════════════════════════════════════════════════════════ */

export default function CloudLandingPage() {
  const [activeLine, setActiveLine] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveLine((prev) => (prev + 1) % STATUS_LINES.length);
    }, 2200);
    return () => clearInterval(interval);
  }, []);

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
            <a href="#how-it-works" className="hover:text-foreground transition-colors">How It Works</a>
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#integrations" className="hover:text-foreground transition-colors">Integrations</a>
            <a href={WEB_URL} className="hover:text-foreground transition-colors">Editor</a>
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
              <Link href="/templates" className="inline-flex h-9 w-full sm:w-auto items-center justify-center gap-2 rounded-lg border border-border bg-card px-6 text-[13px] font-medium text-foreground hover:bg-accent transition-colors">
                <Boxes className="h-3.5 w-3.5 text-muted-foreground" /> Browse Templates
              </Link>
            </motion.div>
          </div>
        </section>

        {/* ═══ WORKFLOW SHOWCASE ════════════════════════ */}
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
                {/* Workflow canvas */}
                <div className="relative border-r border-border/40 bg-background/30 overflow-hidden" style={{ minHeight: 320 }}>
                  {/* Dot grid */}
                  <div className="absolute inset-0 opacity-25" style={{
                    backgroundImage: "radial-gradient(circle, oklch(0.32 0.01 240) 0.5px, transparent 0.5px)",
                    backgroundSize: "16px 16px",
                  }} />

                  {/* Connection lines */}
                  <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden>
                    {/* trigger → swap */}
                    <motion.path
                      d="M 18% 58% C 24% 58%, 26% 58%, 32% 58%"
                      stroke="#f59e0b" strokeWidth={1.5} fill="none" opacity={0.25}
                      initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                      transition={{ duration: 0.8, delay: 0.5 }}
                    />
                    <circle r={2} fill="#f59e0b" opacity={0.5}>
                      <animateMotion dur="2.5s" repeatCount="indefinite" begin="0.5" path="M 18% 58% C 24% 58%, 26% 58%, 32% 58%" />
                    </circle>

                    {/* swap → split */}
                    <motion.path
                      d="M 42% 58% C 48% 58%, 50% 58%, 56% 58%"
                      stroke="#3b82f6" strokeWidth={1.5} fill="none" opacity={0.25}
                      initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                      transition={{ duration: 0.8, delay: 0.7 }}
                    />
                    <circle r={2} fill="#3b82f6" opacity={0.5}>
                      <animateMotion dur="2.5s" repeatCount="indefinite" begin="0.7" path="M 42% 58% C 48% 58%, 50% 58%, 56% 58%" />
                    </circle>

                    {/* split → transfer (up) */}
                    <motion.path
                      d="M 66% 50% C 72% 50%, 74% 42%, 80% 42%"
                      stroke="#8b5cf6" strokeWidth={1.5} fill="none" opacity={0.25}
                      initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                      transition={{ duration: 0.8, delay: 0.9 }}
                    />
                    <circle r={2} fill="#8b5cf6" opacity={0.5}>
                      <animateMotion dur="2.5s" repeatCount="indefinite" begin="0.9" path="M 66% 50% C 72% 50%, 74% 42%, 80% 42%" />
                    </circle>

                    {/* split → alert (down) */}
                    <motion.path
                      d="M 66% 66% C 72% 66%, 74% 74%, 80% 74%"
                      stroke="#8b5cf6" strokeWidth={1.5} fill="none" opacity={0.25}
                      initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                      transition={{ duration: 0.8, delay: 1.0 }}
                    />
                    <circle r={2} fill="#8b5cf6" opacity={0.5}>
                      <animateMotion dur="2.5s" repeatCount="indefinite" begin="1.0" path="M 66% 66% C 72% 66%, 74% 74%, 80% 74%" />
                    </circle>
                  </svg>

                  {/* Workflow nodes */}
                  {WORKFLOW_NODES.map((node, i) => (
                    <motion.div
                      key={node.id}
                      initial={{ opacity: 0, scale: 0.92 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.35, delay: 0.4 + i * 0.1 }}
                      className="absolute rounded-lg border bg-card/90 shadow-md backdrop-blur-sm"
                      style={{
                        left: `${node.x}%`,
                        top: `${node.y}%`,
                        transform: "translate(-50%, -50%)",
                        borderLeftWidth: 3,
                        borderLeftColor: node.color,
                        width: "16%",
                        minWidth: 120,
                      }}
                    >
                      <div className="flex items-center gap-1.5 px-2 py-[4px] border-b border-border/40">
                        <div className="flex h-4 w-4 items-center justify-center rounded"
                          style={{ backgroundColor: `${node.color}1A`, color: node.color }}>
                          {node.icon}
                        </div>
                        <span className="text-[8px] font-semibold text-foreground tracking-wide">{node.label}</span>
                      </div>
                      <div className="px-2 py-1.5">
                        <span className="text-[7px] font-mono text-muted-foreground">{node.sublabel}</span>
                      </div>
                    </motion.div>
                  ))}

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
                </div>

                {/* Status panel */}
                <div className="hidden lg:block border-l border-border/40 bg-card/50">
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
                            x: 0,
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
                        { val: "847ms", label: "avg run" },
                        { val: "99.7%", label: "uptime" },
                        { val: "1.2k", label: "runs/day" },
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
                { icon: <Workflow className="h-4 w-4" />, title: "Visual Builder", desc: "Drag-and-drop node editor with 20+ node types. Build complex automations without code." },
                { icon: <Wallet className="h-4 w-4" />, title: "Cloud Wallets", desc: "Encrypted wallet management. Swap, transfer, and manage tokens around the clock." },
                { icon: <Bot className="h-4 w-4" />, title: "AI Agents", desc: "Integrate LLMs to analyze on-chain data and make intelligent decisions automatically." },
                { icon: <Shield className="h-4 w-4" />, title: "Enterprise Security", desc: "AES-256-GCM encryption, audit logging, and rate limiting. Keys never leave the server." },
                { icon: <Layers className="h-4 w-4" />, title: "DeFi Integrations", desc: "Native support for Jupiter, Raydium, Orca, MarginFi, Kamino, and more." },
                { icon: <Plug className="h-4 w-4" />, title: "Plugin Architecture", desc: "Extend with custom nodes. Build integrations for any protocol or service." },
                { icon: <Timer className="h-4 w-4" />, title: "Cron Triggers", desc: "Schedule workflows on cron expressions. Recurring swaps, rebalancing, or monitoring." },
                { icon: <BarChart3 className="h-4 w-4" />, title: "Execution Logs", desc: "Detailed run history with inputs, outputs, and error traces for every execution." },
                { icon: <Lock className="h-4 w-4" />, title: "Role-Based Access", desc: "Team management with granular permissions. Control who can create, edit, or run workflows." },
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
              <h2 className="text-xl md:text-2xl font-bold tracking-tight text-foreground mb-2">Plugs into the Solana ecosystem.</h2>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">First-class support for the protocols and tools you already use.</p>
            </motion.div>
            <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }}
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
              {[
                { name: "Jupiter", tag: "DEX", color: "#10b981" },
                { name: "Raydium", tag: "AMM", color: "#8b5cf6" },
                { name: "Orca", tag: "DEX", color: "#3b82f6" },
                { name: "MarginFi", tag: "Lending", color: "#f59e0b" },
                { name: "Kamino", tag: "Lending", color: "#ef4444" },
                { name: "Birdeye", tag: "Data", color: "#06b6d4" },
                { name: "Helius", tag: "RPC", color: "#6366f1" },
                { name: "Discord", tag: "Notify", color: "#5865F2" },
              ].map((p) => (
                <motion.div key={p.name} variants={fadeUp}
                  className="group rounded-lg border border-border bg-card px-4 py-3.5 transition-all hover:border-primary/25">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
                    <span className="text-[8px] font-semibold uppercase tracking-wider px-1.5 py-[1px] rounded"
                      style={{ color: p.color, backgroundColor: `${p.color}0D` }}>{p.tag}</span>
                  </div>
                  <span className="text-[12px] font-semibold text-foreground group-hover:text-primary transition-colors">{p.name}</span>
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
              {[
                { val: "20+", label: "Node Types" },
                { val: "8+", label: "Protocols" },
                { val: "99.7%", label: "Uptime" },
                { val: "<1s", label: "Avg. Run" },
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
                { title: "DCA Trader", desc: "Dollar-cost average into any token on a schedule", tags: ["Jupiter", "Cron"], color: "#3b82f6" },
                { title: "Liquidation Guard", desc: "Monitor lending positions and auto-deleverage", tags: ["MarginFi", "Alert"], color: "#ef4444" },
                { title: "Yield Harvester", desc: "Auto-compound rewards across DeFi protocols", tags: ["Raydium", "Kamino"], color: "#10b981" },
              ].map((t) => (
                <Link key={t.title} href={`/templates?q=${encodeURIComponent(t.title)}`}
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
              <Link href="/templates" className="text-[12px] text-primary font-medium hover:underline inline-flex items-center gap-0.5">
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
              <Link href="/templates" className="inline-flex h-9 items-center rounded-lg border border-border bg-card px-5 text-[13px] font-medium text-foreground hover:bg-accent transition-colors">
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
            <a href={WEB_URL} className="hover:text-foreground transition-colors">Editor</a>
            <Link href="/docs" className="hover:text-foreground transition-colors">Docs</Link>
            <a href="https://github.com/skartik-sk" className="hover:text-foreground transition-colors">GitHub</a>
            <a href="https://x.com/solstudiodotfun" className="hover:text-foreground transition-colors">X</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
