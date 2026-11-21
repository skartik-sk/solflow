"use client";

import Link from "next/link";
import { SolMark } from "@/components/ui-kit/cloud-mark";
import { CLOUD_DOCS_URL, GITHUB_URL, WEB_EDITOR_URL, WEB_URL, X_URL } from "./shared";
import "./Footer.css";

/*
 * Footer, after the main site's: brand and link columns, a rule, a small row
 * with the year and the way back to solstudio.fun, and a giant outlined
 * wordmark cut by the page's edge. No live status: the queue's health is not
 * advertised here.
 */

type FLink = { label: string; href: string; external?: boolean };

const COLUMNS: { title: string; links: FLink[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Dashboard", href: "/dashboard" },
      { label: "Workflows", href: "/workflows" },
      { label: "Templates", href: "/templates" },
      { label: "Marketplace", href: "/marketplace" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Docs", href: CLOUD_DOCS_URL, external: true },
      { label: "Web Editor", href: WEB_EDITOR_URL, external: true },
      { label: "GitHub", href: GITHUB_URL, external: true },
      { label: "X", href: X_URL, external: true },
    ],
  },
];

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="sl-foot" aria-labelledby="sl-foot-title">
      <div className="sl-wrap">
        <div className="ft-top">
          <div className="ft-brand">
            <p id="sl-foot-title" className="ft-name">
              <SolMark size={22} />
              <span>
                SolStudio <span className="ft-name__muted">Cloud</span>
              </span>
            </p>
            <p className="ft-line">Solana workflows that run on a schedule, a webhook or a button.</p>
          </div>

          <nav className="ft-cols" aria-label="Footer">
            {COLUMNS.map((col) => (
              <div key={col.title} className="ft-col">
                <p className="ft-col__title">{col.title}</p>
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

        <div className="ft-bar">
          <p>© {year} SolStudio</p>
          <p className="ft-bar__links">
            <span>Part of</span>
            <a href={WEB_URL}>solstudio.fun</a>
            <span aria-hidden>·</span>
            <a href={CLOUD_DOCS_URL}>Cloud docs</a>
          </p>
        </div>
      </div>

      <div className="ft-mark" aria-hidden>
        <span>SolStudio Cloud</span>
      </div>
    </footer>
  );
}
