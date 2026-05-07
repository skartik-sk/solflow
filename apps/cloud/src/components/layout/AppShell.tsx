"use client";

// AppShell — shared navigation bar and page layout wrapper.

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

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

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-20">
        <div className="mx-auto flex h-12 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-sm font-bold tracking-tight">
              SolStudio <span className="text-primary">Cloud</span>
            </Link>
            <div className="hidden md:flex items-center gap-4 text-xs text-muted-foreground">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`transition-colors ${
                    activeHref === item.href
                      ? "text-foreground font-medium"
                      : "hover:text-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="hidden items-center gap-3 text-xs text-muted-foreground md:flex">
            <a href={WEB_EDITOR_URL} className="hover:text-foreground transition-colors">
              Web Editor
            </a>
            <a href={CLOUD_DOCS_URL} className="hover:text-foreground transition-colors">
              Docs
            </a>
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
