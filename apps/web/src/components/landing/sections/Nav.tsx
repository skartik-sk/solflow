"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { CLOUD_URL, EDITOR_HREF, PRIMARY_LABEL } from "../shared";
import "./Nav.css";

const LINKS = [
  // Same order as the app's SiteHeader (components/ui-kit/site-header.tsx)
  { label: "Templates", href: "/marketplace" },
  { label: "Docs", href: "/docs" },
  { label: "CLI", href: "/docs/cli" },
  { label: "Cloud", href: CLOUD_URL },
];

/** SolStudio's logo: the two linked blocks, white on the brand cyan (public/solstudio-logo-primary.png). */
export function Mark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <rect width="64" height="64" rx="15" fill="var(--accent)" />
      <rect x="15" y="15" width="17" height="17" rx="4.5" stroke="#fff" strokeWidth="5" />
      <path d="M23.5 32v9a5 5 0 0 0 5 5H33" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
      <rect x="33" y="33" width="17" height="17" rx="4.5" stroke="#fff" strokeWidth="5" />
    </svg>
  );
}

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // The sheet closes on Escape and when the page grows past the phone layout
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const wide = window.matchMedia("(min-width: 900px)");
    const onWide = () => wide.matches && setOpen(false);
    window.addEventListener("keydown", onKey);
    wide.addEventListener("change", onWide);
    return () => {
      window.removeEventListener("keydown", onKey);
      wide.removeEventListener("change", onWide);
    };
  }, [open]);

  return (
    <header className="sl-nav" data-scrolled={scrolled || open ? "1" : undefined}>
      <nav className="sl-wrap sl-nav-row" aria-label="Main">
        <Link href="/" className="sl-nav-brand" aria-label="SolStudio home">
          <Mark />
          <span>SolStudio</span>
        </Link>
        <ul className="sl-nav-links">
          {LINKS.map((l) => (
            <li key={l.label}>
              <a href={l.href}>{l.label}</a>
            </li>
          ))}
        </ul>
        <div className="sl-nav-actions">
          <a href="https://github.com/skartik-sk/solflow" className="sl-nav-quiet">GitHub</a>
          <Link href={EDITOR_HREF} className="sl-nav-quiet">Sign in</Link>
          <Link href={EDITOR_HREF} className="sl-btn sl-btn-primary sl-btn-sm">{PRIMARY_LABEL}</Link>
          <button
            type="button"
            className="sl-nav-toggle"
            aria-expanded={open}
            aria-controls="sl-nav-sheet"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={18} aria-hidden /> : <Menu size={18} aria-hidden />}
          </button>
        </div>
      </nav>
      <div id="sl-nav-sheet" className="sl-nav-sheet" data-open={open ? "1" : undefined}>
        <ul className="sl-wrap">
          {LINKS.map((l) => (
            <li key={l.label}>
              <a href={l.href} onClick={() => setOpen(false)}>{l.label}</a>
            </li>
          ))}
          <li>
            <a href="https://github.com/skartik-sk/solflow" onClick={() => setOpen(false)}>GitHub</a>
          </li>
          <li>
            <Link href={EDITOR_HREF} onClick={() => setOpen(false)}>Sign in</Link>
          </li>
        </ul>
      </div>
    </header>
  );
}
