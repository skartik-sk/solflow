"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CLOUD_URL, EDITOR_HREF } from "../shared";
import "./Footer.css";

/*
 * Footer: link columns, a live status row read from the browser compiler's
 * own manifest, and a giant outlined wordmark cropped by the page's edge.
 */

const GITHUB = "https://github.com/skartik-sk/solflow";

const COLUMNS: { title: string; links: { label: string; href: string; external?: boolean }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Editor", href: EDITOR_HREF },
      { label: "Templates", href: "/marketplace" },
      { label: "Cloud", href: CLOUD_URL, external: true },
      { label: "CLI", href: "https://www.npmjs.com/package/@solstudio/cli", external: true },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Docs", href: "/docs" },
      { label: "CLI docs", href: "/docs/cli" },
      { label: "Launch film", href: "https://youtu.be/9htekrWTdWI", external: true },
      { label: "GitHub", href: GITHUB, external: true },
    ],
  },
];

type Status = { state: "checking" } | { state: "ok"; version: string; full: string } | { state: "down" };

/** "rustc 1.101.0-nightly (48f4b0553 2026-10-23)" → "1.101.0-nightly" */
function shortVersion(v: string) {
  return v.replace(/^rustc\s+/i, "").split(/\s+/)[0] ?? v;
}

function useCompilerStatus(): Status {
  const [status, setStatus] = useState<Status>({ state: "checking" });
  useEffect(() => {
    let alive = true;
    const ctl = new AbortController();
    const timer = window.setTimeout(() => ctl.abort(), 8000);
    fetch("/browser-compiler/v1/manifest.json", { signal: ctl.signal, cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((m: unknown) => {
        const v = m && typeof m === "object" && "rustcVersion" in m ? (m as { rustcVersion: unknown }).rustcVersion : null;
        if (typeof v !== "string" || !v.trim()) throw new Error("no rustcVersion");
        if (alive) setStatus({ state: "ok", version: shortVersion(v.trim()), full: v.trim() });
      })
      .catch(() => {
        if (alive) setStatus({ state: "down" });
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      alive = false;
      window.clearTimeout(timer);
      ctl.abort();
    };
  }, []);
  return status;
}

export function Footer() {
  const status = useCompilerStatus();
  const year = new Date().getFullYear();

  return (
    <footer className="sl-footer" aria-labelledby="sl-footer-title">
      <div className="sl-wrap">
        <div className="sl-footer__top">
          <div className="sl-footer__brand">
            <p id="sl-footer-title" className="sl-footer__name">
              SolStudio
            </p>
            <p className="sl-footer__line">Draw a Solana program. Get Anchor, Pinocchio or Quasar.</p>
          </div>

          <nav className="sl-footer__cols" aria-label="Footer">
            {COLUMNS.map((col) => (
              <div key={col.title} className="sl-footer__col">
                <p className="sl-footer__col-title">{col.title}</p>
                <ul>
                  {col.links.map((l) => (
                    <li key={l.label}>
                      {l.external ? (
                        <a href={l.href} target="_blank" rel="noreferrer">
                          {l.label}
                        </a>
                      ) : (
                        <Link href={l.href}>{l.label}</Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="sl-footer__bar">
          <p className="sl-footer__status" data-state={status.state} aria-live="polite" title={status.state === "ok" ? status.full : undefined}>
            <span className="sl-footer__dot" aria-hidden />
            {status.state === "ok" ? (
              <>
                Browser compiler · <span className="sl-footer__mono">rustc {status.version}</span>
              </>
            ) : status.state === "down" ? (
              "Browser compiler · status unavailable"
            ) : (
              "Browser compiler · checking"
            )}
          </p>
          <p className="sl-footer__copy">© {year} SolStudio</p>
        </div>
      </div>

      <div className="sl-footer__mark" aria-hidden>
        <span>SolStudio</span>
      </div>
    </footer>
  );
}
