"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SolMark } from "@/components/ui-kit/cloud-mark";
import { CLOUD_DOCS_URL, WEB_EDITOR_URL } from "./shared";

const link =
  "rounded-md transition-colors duration-150 hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

export function Nav() {
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
