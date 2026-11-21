"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { EDITOR_HREF, PRIMARY_LABEL } from "../shared";
import { HeroStage } from "./HeroStage";
import "./Hero.css";

/** #1 Hero: the promise in one line, two actions, then the editor doing it. */
export function Hero() {
  return (
    <section className="sl-hero">
      <div className="sl-hero__grid sl-grid-bg" aria-hidden />
      <div className="sl-wrap sl-hero__copy">
        <Link href="/docs" className="sl-hero__news">
          <span className="sl-hero__news-tag">New</span>
          <span className="sl-hero__news-long">Pinocchio and Quasar now compile in your browser</span>
          <span className="sl-hero__news-short">Pinocchio and Quasar, in your browser</span>
          <ArrowRight size={14} strokeWidth={2} aria-hidden />
        </Link>
        <h1 className="sl-h1 sl-hero__title">
          <span className="sl-hero__line">Draw a Solana program.</span>{" "}
          <span className="sl-hero__line sl-hero__dim">Ship it to devnet.</span>
        </h1>
        <p className="sl-lead sl-hero__sub">
          Wire up accounts and constraints on a canvas and get real Anchor, Pinocchio or Quasar code that compiles in your browser.
        </p>
        <div className="sl-hero__actions">
          <Link href={EDITOR_HREF} className="sl-btn sl-btn-primary">
            {PRIMARY_LABEL}
            <ArrowRight size={16} strokeWidth={2} aria-hidden />
          </Link>
          <Link href="/marketplace" className="sl-btn sl-btn-quiet">
            Browse templates
          </Link>
        </div>
        <p className="sl-label sl-hero__note">Free to use. Runs in your browser, nothing to install.</p>
      </div>

      <div className="sl-wrap sl-hero__shot">
        <div className="sl-bezel sl-hero__bezel">
          <HeroStage />
        </div>
      </div>
    </section>
  );
}
