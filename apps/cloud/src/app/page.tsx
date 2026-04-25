import { Zap, ArrowRight, Shield, Workflow, Bot, Wallet } from "lucide-react";
import Link from "next/link";

export default function CloudLandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-6 w-6 text-primary" />
          <span className="text-lg font-semibold font-heading">SolStudio Cloud</span>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Dashboard
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-6 py-24 max-w-5xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent text-accent-foreground text-xs mb-6">
          <Zap className="h-3 w-3" /> Solana-native workflow automation
        </div>
        <h1 className="text-5xl font-bold tracking-tight mb-6 font-heading">
          Automate your Solana
          <br />
          <span className="text-primary">operations visually</span>
        </h1>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto mb-10">
          Build powerful workflows for DeFi trading, token management, on-chain monitoring, and more
          with a drag-and-drop node editor. No coding required.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
          >
            Get Started <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/templates"
            className="inline-flex items-center gap-2 px-6 py-3 bg-secondary text-secondary-foreground rounded-lg font-medium hover:bg-secondary/80 transition-colors"
          >
            Browse Templates
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-16 max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              icon: Workflow,
              title: "Visual Workflow Builder",
              desc: "Drag-and-drop nodes to build complex automations. Connect triggers, actions, transforms, and AI agents.",
            },
            {
              icon: Wallet,
              title: "Cloud Wallets",
              desc: "Encrypted wallet management for automated transactions. Swap, transfer, and manage tokens 24/7.",
            },
            {
              icon: Bot,
              title: "AI-Powered Agents",
              desc: "Integrate LLMs to analyze on-chain data, make intelligent decisions, and execute actions automatically.",
            },
            {
              icon: Shield,
              title: "Enterprise Security",
              desc: "AES-256-GCM encryption, audit logging, and rate limiting. Your keys never leave the server.",
            },
            {
              icon: Zap,
              title: "DeFi Integrations",
              desc: "Native support for Jupiter, Raydium, Orca, MarginFi, Kamino, Birdeye, and more protocols.",
            },
            {
              icon: Workflow,
              title: "Extensible Nodes",
              desc: "Plugin architecture makes it easy to add new nodes. Build custom integrations for any protocol.",
            },
          ].map((feature) => (
            <div
              key={feature.title}
              className="p-6 rounded-xl border border-border bg-card hover:border-primary/30 transition-colors"
            >
              <feature.icon className="h-8 w-8 text-primary mb-4" />
              <h3 className="font-semibold mb-2 font-heading">{feature.title}</h3>
              <p className="text-sm text-muted-foreground">{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-6 text-center text-sm text-muted-foreground">
        SolStudio Cloud &mdash; Solana Workflow Automation
      </footer>
    </div>
  );
}
