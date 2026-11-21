"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CloudStage } from "../CloudScene";

export function Hero() {
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
