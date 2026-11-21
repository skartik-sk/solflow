"use client";

import React from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  ChevronRight,
  Clock,
  GitBranch,
  Hand,
  Play,
  Satellite,
  ArrowRightLeft,
  Webhook,
} from "lucide-react";
import { LandingRoot } from "@/components/landing/LandingRoot";
import { CloudStage, MiniPreflight, MiniReplay, MiniSecrets } from "@/components/landing/CloudScene";
import { SolMark } from "@/components/ui-kit/cloud-mark";

const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? "https://solstudio.fun";
const WEB_EDITOR_URL = `${WEB_URL}/dashboard`;
const CLOUD_DOCS_URL = `${WEB_URL}/docs/cloud`;

/*
 * Cloud landing. Tokens and buttons come from landing.css (copied from the web
 * landing, scoped under .sl). The hero scene is the web landing's Cloud stage.
 * Every node and provider named here is a real node in packages/cloud-nodes.
 */

const card = "rounded-[18px] bg-[var(--s1)] shadow-[var(--hi),0_0_0_1px_var(--line)]";
const eyebrow = "text-[13px] font-medium text-[var(--accent)]";
const h2 = "text-[clamp(24px,2.6vw,32px)] font-[550] leading-[1.12] tracking-[-0.03em] text-balance";
const body = "text-[14.5px] leading-[1.6] text-[var(--text-2)]";
const link =
  "rounded-md transition-colors duration-150 hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

export default function CloudLandingPage() {
  return (
    <LandingRoot className="flex min-h-screen flex-col">
      <Nav />
      <main className="flex-1">
        <Hero />
        <Triggers />
        <Integrations />
        <Safety />
        <Runs />
        <Templates />
        <Closing />
      </main>
      <Footer />
    </LandingRoot>
  );
}

/* ─── Nav ─────────────────────────────────────────────────────────── */

function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[rgba(8,9,11,0.8)] backdrop-blur-xl">
      <nav className="sl-wrap flex h-14 items-center gap-6" aria-label="Main">
        <Link href="/" className={`flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em] ${link}`}>
          <SolMark size={24} />
          <span>
            SolStudio <span className="font-normal text-[var(--text-2)]">Cloud</span>
          </span>
        </Link>
        <div className="hidden items-center gap-5 text-[13.5px] text-[var(--text-2)] md:flex">
          <a href={CLOUD_DOCS_URL} className={link}>Docs</a>
          <Link href="/marketplace" className={link}>Marketplace</Link>
          <a href={WEB_EDITOR_URL} className={link}>Web Editor</a>
        </div>
        <Link href="/dashboard" className="sl-btn sl-btn-primary sl-btn-sm ml-auto">
          Dashboard
          <ArrowRight size={14} strokeWidth={2} aria-hidden />
        </Link>
      </nav>
    </header>
  );
}

/* ─── Hero ────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="relative pb-16 pt-14 md:pb-20 md:pt-20" aria-labelledby="hero-title">
      <div className="sl-grid-bg pointer-events-none absolute inset-x-0 top-0 h-[520px]" aria-hidden />
      <div className="sl-wrap relative">
        <div className="grid gap-6 md:grid-cols-[minmax(0,640px)_auto] md:items-end md:justify-between">
          <div className="grid gap-4">
            <span className="inline-flex h-7 items-center gap-2 justify-self-start rounded-full bg-[var(--s2)] px-3 text-[12.5px] font-medium text-[var(--text-2)] shadow-[0_0_0_1px_var(--line)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--ok)]" aria-hidden />
              Solana-native workflow automation
            </span>
            <h1 id="hero-title" className="text-[clamp(32px,4.2vw,48px)] font-[580] leading-[1.06] tracking-[-0.035em] text-balance">
              Automate your Solana operations on a canvas
            </h1>
            <p className="max-w-[560px] text-[16px] leading-[1.6] text-[var(--text-2)]">
              Wire cron, webhook and manual triggers to nodes for Jupiter, Pyth, Helius, Metaplex, Squads and Jito. Then let it run.
            </p>
          </div>
          <div className="grid gap-2.5 md:justify-items-end">
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <Link href="/dashboard" className="sl-btn sl-btn-primary">
                Get started
                <ArrowRight size={16} strokeWidth={2} aria-hidden />
              </Link>
              <Link href="/marketplace" className="sl-btn sl-btn-quiet">
                Browse templates
              </Link>
            </div>
            <p className="text-[12.5px] text-[var(--text-3)]">Sign in with GitHub or Google. Start on devnet.</p>
          </div>
        </div>

        <div className="sl-cloud mt-10 md:mt-12">
          <div className="sl-bezel cl-bezel">
            <CloudStage />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Triggers: three real ways to start a run ────────────────────── */

function Triggers() {
  return (
    <section className="border-t border-[var(--line)] py-16 md:py-20" aria-labelledby="triggers-title">
      <div className="sl-wrap">
        <div className="mb-8 grid gap-3 md:grid-cols-[1.1fr_1fr] md:items-end md:gap-16">
          <div>
            <p className={eyebrow}>Triggers</p>
            <h2 id="triggers-title" className={`${h2} mt-2`}>A schedule, a webhook or a button</h2>
          </div>
          <p className={body}>Every workflow starts from one trigger node. Runs queue on the server, so nothing depends on your browser staying open.</p>
        </div>

        <div className={`${card} grid overflow-hidden md:grid-cols-3`}>
          <TriggerCol icon={<Clock size={16} strokeWidth={1.75} />} name="Cron Trigger" note="Five-field cron with a timezone">
            <div className="flex items-center justify-between rounded-[10px] bg-[var(--bg)] px-3 py-2.5 shadow-[0_0_0_1px_var(--line)]">
              <span className="font-mono text-[13px] text-[var(--text)]">*/5 * * * *</span>
              <span className="text-[12px] text-[var(--text-3)]">UTC</span>
            </div>
            <ul className="mt-3 grid gap-1.5 font-mono text-[12px] text-[var(--text-2)]">
              {["12:05", "12:10", "12:15"].map((t, i) => (
                <li key={t} className="flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 rounded-full ${i === 0 ? "bg-[var(--accent)]" : "bg-[var(--s4)]"}`} />
                  <span>{t}</span>
                  <span className="text-[var(--text-3)]">{i === 0 ? "next run" : ""}</span>
                </li>
              ))}
            </ul>
          </TriggerCol>
          <TriggerCol icon={<Webhook size={16} strokeWidth={1.75} />} name="Webhook Trigger" note="POST a JSON body to the workflow's URL">
            <div className="rounded-[10px] bg-[var(--bg)] px-3 py-2.5 shadow-[0_0_0_1px_var(--line)]">
              <span className="mr-2 rounded bg-[var(--accent-soft)] px-1.5 py-0.5 font-mono text-[11px] font-medium text-[var(--accent)]">POST</span>
              <span className="break-all font-mono text-[12px] text-[var(--text-2)]">/api/webhook/wallet-watch</span>
            </div>
            <pre className="mt-3 overflow-hidden font-mono text-[12px] leading-[1.6] text-[var(--text-2)]">
              {`{ "wallet": "7xKX…9fQ2",\n  "type": "SWAP" }`}
            </pre>
          </TriggerCol>
          <TriggerCol icon={<Hand size={16} strokeWidth={1.75} />} name="Manual Trigger" note="Run once from the editor while you build">
            <span className="inline-flex h-9 items-center gap-2 rounded-[10px] bg-[var(--s3)] px-3.5 text-[13px] font-medium shadow-[var(--hi),0_0_0_1px_var(--line-2)]">
              <Play size={14} strokeWidth={2} aria-hidden />
              Run once
            </span>
            <div className="mt-3 flex items-center gap-2 text-[12.5px] text-[var(--text-2)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--ok)]" />
              Completed in 1.2 s, output in the run panel
            </div>
          </TriggerCol>
        </div>
      </div>
    </section>
  );
}

function TriggerCol({ icon, name, note, children }: { icon: React.ReactNode; name: string; note: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col border-[var(--line)] p-5 max-md:border-b max-md:last:border-b-0 md:border-r md:last:border-r-0 md:p-6">
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[rgba(74,222,128,0.12)] text-[var(--ok)]">{icon}</span>
        <span className="text-[14px] font-[550]">{name}</span>
      </div>
      <p className="mb-4 mt-1.5 text-[13px] text-[var(--text-3)]">{note}</p>
      {children}
    </div>
  );
}

/* ─── Integrations: the real node catalogue, by provider ──────────── */

const PROVIDERS: { name: string; does: string; nodes: string[]; count: number }[] = [
  { name: "Jupiter", does: "Prices, tokens and swaps", nodes: ["Jupiter Price", "Jupiter Direct Swap", "Jupiter Swap Order", "Jupiter Portfolio", "Jupiter Token Search"], count: 10 },
  { name: "Pyth", does: "Oracle prices", nodes: ["Pyth Price", "Pyth Latest Prices", "Pyth Feed Search"], count: 3 },
  { name: "Helius", does: "RPC, history and webhooks", nodes: ["Helius RPC", "Helius Wallet Activity", "Helius Parse Transaction", "Helius Webhook Create"], count: 8 },
  { name: "Metaplex", does: "Digital assets (DAS)", nodes: ["Metaplex Get Asset", "Metaplex Assets by Owner", "Metaplex Search Assets", "Metaplex Asset Proof"], count: 8 },
  { name: "Squads", does: "Multisig approvals", nodes: ["Squads Proposal"], count: 1 },
  { name: "Jito", does: "Bundles and tips", nodes: ["Jito Send Bundle", "Jito Bundle Status", "Jito Tip Floor", "Jito Tip Accounts"], count: 4 },
];

function Integrations() {
  return (
    <section className="py-16 md:py-20" aria-labelledby="integrations-title">
      <div className="sl-wrap grid gap-8 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-14">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <p className={eyebrow}>Integrations</p>
          <h2 id="integrations-title" className={`${h2} mt-2`}>Nodes for the protocols you already use</h2>
          <p className={`${body} mt-3`}>
            Plus Telegram, Discord and Dialect alerts, Switchboard prices, token transfers, an AI Agent node and a Custom API node.
          </p>
        </div>

        <div className={`${card} overflow-hidden`}>
          {PROVIDERS.map((p) => (
            <div
              key={p.name}
              className="grid gap-x-6 gap-y-2.5 border-b border-[var(--line)] px-5 py-4 last:border-b-0 sm:grid-cols-[150px_minmax(0,1fr)_auto] sm:items-center"
            >
              <div>
                <div className="text-[15px] font-[550] tracking-[-0.01em]">{p.name}</div>
                <div className="text-[12.5px] text-[var(--text-3)]">{p.does}</div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {p.nodes.map((n) => (
                  <span
                    key={n}
                    className="inline-flex h-7 items-center rounded-[8px] bg-[var(--s2)] pl-2.5 pr-2 text-[12px] text-[var(--text-2)] shadow-[inset_2px_0_0_var(--n-instruction),0_0_0_1px_var(--line)]"
                  >
                    {n.replace(`${p.name} `, "")}
                  </span>
                ))}
              </div>
              <div className="font-mono text-[12px] text-[var(--text-3)] sm:text-right">
                {p.count} node{p.count === 1 ? "" : "s"}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Safety ──────────────────────────────────────────────────────── */

function Safety() {
  const points = [
    { t: "Simulation first", d: "A wallet action simulates before it can sign." },
    { t: "Spend and slippage caps", d: "Limits live in the workflow's settings, not in your head." },
    { t: "Manual approval", d: "On by default for new workflows; switch it off when you trust the graph." },
  ];
  return (
    <section className="border-t border-[var(--line)] bg-[linear-gradient(180deg,var(--s1),transparent_70%)] py-16 md:py-20" aria-labelledby="safety-title">
      <div className="sl-wrap grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center lg:gap-16">
        <div>
          <p className={eyebrow}>Safety</p>
          <h2 id="safety-title" className={`${h2} mt-2`}>Limits before anything signs</h2>
          <dl className="mt-6 grid gap-0">
            {points.map((p) => (
              <div key={p.t} className="grid grid-cols-[140px_minmax(0,1fr)] gap-4 border-t border-[var(--line)] py-3 text-[14px]">
                <dt className="font-[550]">{p.t}</dt>
                <dd className="text-[var(--text-2)]">{p.d}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="sl-cloud grid gap-3 sm:grid-cols-2">
          <div>
            <MiniPreflight />
            <p className="mt-2.5 text-[13px] text-[var(--text-3)]">Workflow settings</p>
          </div>
          <div>
            <MiniSecrets />
            <p className="mt-2.5 text-[13px] text-[var(--text-3)]">Encrypted credentials and wallets</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Runs and replay ─────────────────────────────────────────────── */

const STEPS = [
  { icon: <Clock size={14} strokeWidth={1.75} />, cat: "var(--ok)", node: "Cron Trigger", out: "fired 12:05:00 UTC", ms: "0" },
  { icon: <Satellite size={14} strokeWidth={1.75} />, cat: "var(--n-instruction)", node: "Pyth Price", out: "SOL/USD 138.42", ms: "212" },
  { icon: <GitBranch size={14} strokeWidth={1.75} />, cat: "var(--n-event)", node: "If / Else", out: "price < 140 → true", ms: "3" },
  { icon: <ArrowRightLeft size={14} strokeWidth={1.75} />, cat: "var(--n-instruction)", node: "Jupiter Direct Swap", out: "25 USDC → 0.1806 SOL", ms: "1,840" },
  { icon: <Bell size={14} strokeWidth={1.75} />, cat: "var(--n-instruction)", node: "Telegram Message", out: "sent", ms: "301" },
];

function Runs() {
  return (
    <section className="py-16 md:py-20" aria-labelledby="runs-title">
      <div className="sl-wrap grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-center lg:gap-16">
        <div className={`${card} overflow-hidden`} aria-hidden>
          <div className="flex h-11 items-center justify-between border-b border-[var(--line)] px-4 text-[13px]">
            <span className="flex items-center gap-2">
              <span className="font-mono text-[12px] text-[var(--text)]">#1284</span>
              <span className="text-[var(--text-3)]">SOL dip buyer</span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-[12px] text-[var(--ok)]">
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              Success · 2.4 s
            </span>
          </div>
          <ol>
            {STEPS.map((s, i) => (
              <li key={s.node} className="relative grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5">
                {i < STEPS.length - 1 && <span className="absolute left-[29px] top-[34px] h-[calc(100%-22px)] w-px bg-[var(--line-2)]" />}
                <span className="relative flex h-7 w-7 items-center justify-center rounded-[8px] bg-[var(--s2)] shadow-[0_0_0_1px_var(--line)]" style={{ color: s.cat }}>
                  {s.icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium">{s.node}</span>
                  <span className="block truncate font-mono text-[12px] text-[var(--text-3)]">{s.out}</span>
                </span>
                <span className="font-mono text-[12px] tabular-nums text-[var(--text-3)]">{s.ms} ms</span>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <p className={eyebrow}>Executions</p>
          <h2 id="runs-title" className={`${h2} mt-2`}>Every run is logged, and can be replayed</h2>
          <p className={`${body} mt-3`}>
            Each run keeps its trigger data and every node&apos;s output. Replay sends the same input through the graph again, so you can fix a node and check it against the run that failed.
          </p>
          <div className="sl-cloud mt-6 max-w-[380px]">
            <MiniReplay />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Templates (existing three, linked into the marketplace) ─────── */

const TEMPLATES = [
  { title: "Price-Guarded DCA", desc: "Fetch price, check limits, then prepare a guarded Jupiter swap", tags: ["Jupiter", "Cron"] },
  { title: "NFT Asset Watch", desc: "Read Metaplex/Helius asset metadata and post a webhook result", tags: ["NFT", "Helius"] },
  { title: "Treasury Approval", desc: "Inspect token accounts and create a Squads-style approval handoff", tags: ["SPL", "Squads"] },
];

function Templates() {
  return (
    <section className="border-t border-[var(--line)] py-16 md:py-20" aria-labelledby="templates-title">
      <div className="sl-wrap">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className={eyebrow}>Templates</p>
            <h2 id="templates-title" className={`${h2} mt-2`}>Start from a working graph</h2>
          </div>
          <Link href="/marketplace" className={`inline-flex items-center gap-1 text-[14px] font-medium text-[var(--text-2)] ${link}`}>
            Browse all templates
            <ChevronRight size={16} strokeWidth={1.75} aria-hidden />
          </Link>
        </div>
        <ul className={`${card} grid overflow-hidden md:grid-cols-3`}>
          {TEMPLATES.map((t) => (
            <li key={t.title} className="border-[var(--line)] max-md:border-b max-md:last:border-b-0 md:border-r md:last:border-r-0">
              <Link
                href={`/marketplace?q=${encodeURIComponent(t.title)}`}
                className="group flex h-full flex-col p-5 transition-colors duration-150 hover:bg-[var(--s2)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                <span className="flex items-center justify-between">
                  <span className="text-[15px] font-[550] tracking-[-0.01em]">{t.title}</span>
                  <ArrowUpRight size={16} strokeWidth={1.75} className="text-[var(--text-3)] transition-[color,transform] duration-150 group-hover:-translate-y-px group-hover:translate-x-px group-hover:text-[var(--accent)]" aria-hidden />
                </span>
                <span className="mt-1.5 text-[13.5px] leading-[1.55] text-[var(--text-2)]">{t.desc}</span>
                <span className="mt-4 flex gap-1.5">
                  {t.tags.map((tag) => (
                    <span key={tag} className="rounded-[6px] bg-[var(--s3)] px-2 py-0.5 text-[11.5px] text-[var(--text-2)]">
                      {tag}
                    </span>
                  ))}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ─── Closing ─────────────────────────────────────────────────────── */

function Closing() {
  return (
    <section className="pb-16 md:pb-20" aria-labelledby="closing-title">
      <div className="sl-wrap">
        <div className={`${card} relative overflow-hidden px-6 py-12 text-center md:py-16`}>
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.06)_1px,transparent_1.2px)] bg-[length:20px_20px] [mask-image:radial-gradient(ellipse_60%_70%_at_50%_50%,#000,transparent)]"
            aria-hidden
          />
          <div className="relative">
            <p className="font-mono text-[12.5px] text-[var(--text-3)]">*/5 * * * *</p>
            <h2 id="closing-title" className={`${h2} mx-auto mt-3 max-w-[18ch]`}>
              Stop watching charts. Start automating.
            </h2>
            <p className={`${body} mx-auto mt-3 max-w-[44ch]`}>Build the workflow once. Cloud runs it on schedule and keeps the record.</p>
            <div className="mt-7 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
              <Link href="/dashboard" className="sl-btn sl-btn-primary">
                Start free
                <ArrowRight size={16} strokeWidth={2} aria-hidden />
              </Link>
              <Link href="/marketplace" className="sl-btn sl-btn-quiet">
                Browse templates
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Footer ──────────────────────────────────────────────────────── */

function Footer() {
  return (
    <footer className="border-t border-[var(--line)]">
      <div className="sl-wrap flex flex-col gap-4 py-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2 text-[13.5px] font-semibold">
          <SolMark size={18} />
          <span>
            SolStudio <span className="font-normal text-[var(--text-2)]">Cloud</span>
          </span>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-[var(--text-2)]">
          <a href={WEB_EDITOR_URL} className={link}>Web Editor</a>
          <a href={CLOUD_DOCS_URL} className={link}>Docs</a>
          <a href="https://github.com/skartik-sk/solflow" className={link}>GitHub</a>
          <a href="https://x.com/solstudiodotfun" className={link}>X</a>
        </div>
      </div>
    </footer>
  );
}
