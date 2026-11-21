"use client";

// AppShell — shared navigation bar and page layout wrapper.

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { SolMark } from "@/components/ui-kit/cloud-mark";
import { focusRing } from "@/components/ui-kit/cloud-ui";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/wallets", label: "Wallets" },
  { href: "/credentials", label: "Credentials" },
  { href: "/executions", label: "Runs" },
];

const STUDIO_URL = process.env.NEXT_PUBLIC_STUDIO_URL ?? "https://solstudio.fun";
const CLOUD_DOCS_URL = `${STUDIO_URL}/docs/cloud`;
const WEB_EDITOR_URL = `${STUDIO_URL}/dashboard`;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Determine active nav item
  const activeHref =
    NAV_ITEMS.find((item) =>
      item.href === "/marketplace"
        ? pathname?.startsWith("/marketplace") || pathname?.startsWith("/templates")
        : pathname?.startsWith(item.href),
    )?.href ?? "/dashboard";

  const navLink = (item: (typeof NAV_ITEMS)[number]) => {
    const active = activeHref === item.href;
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={`inline-flex h-8 shrink-0 items-center rounded-[8px] px-2.5 text-[13.5px] transition-colors duration-150 ${focusRing} ${
          active ? "bg-white/[0.05] font-medium text-foreground" : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
        }`}
      >
        {item.label}
      </Link>
    );
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-7 px-4 sm:px-6">
          <Link href="/" className={`flex shrink-0 items-center gap-2.5 rounded-md text-[15px] font-semibold tracking-[-0.02em] ${focusRing}`}>
            <SolMark size={24} />
            <span>
              SolStudio <span className="font-normal text-muted-foreground">Cloud</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-0.5 md:flex" aria-label="App">
            {NAV_ITEMS.map(navLink)}
          </nav>

          <div className="ml-auto flex items-center gap-1.5 text-[13px]">
            <a href={WEB_EDITOR_URL} className={`hidden h-8 items-center gap-1 rounded-[8px] px-2.5 text-muted-foreground transition-colors duration-150 hover:bg-white/[0.04] hover:text-foreground sm:inline-flex ${focusRing}`}>
              Web Editor
              <ArrowUpRight className="h-3 w-3" aria-hidden />
            </a>
            <a href={CLOUD_DOCS_URL} className={`inline-flex h-8 items-center rounded-[8px] px-2.5 text-muted-foreground transition-colors duration-150 hover:bg-white/[0.04] hover:text-foreground ${focusRing}`}>
              Docs
            </a>
          </div>
        </div>

        {/* Phones: the same links as a scrolling row */}
        <nav
          className="flex gap-0.5 overflow-x-auto border-t border-white/[0.05] px-3 py-1.5 text-[13px] [scrollbar-width:none] md:hidden"
          aria-label="App"
        >
          {NAV_ITEMS.map(navLink)}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-12 pt-6 sm:px-6">{children}</main>
    </div>
  );
}
