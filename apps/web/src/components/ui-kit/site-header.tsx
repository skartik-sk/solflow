import Link from "next/link";
import type { ReactNode } from "react";
import { SolMark } from "./dashboard-mark";

/**
 * The one header for every web page outside the editor: dashboard, marketplace,
 * docs and share. Same height, logo, links and order everywhere; only the
 * right-hand `actions` change per page. The landing's Nav (components/landing)
 * mirrors these links and sizes in its own CSS.
 */

export type SiteSection = "projects" | "templates" | "docs" | "cli";

const CLOUD_URL = process.env.NEXT_PUBLIC_CLOUD_URL ?? "https://cloud.solstudio.fun";

const LINKS: { key: SiteSection | "cloud"; label: string; href: string; appOnly?: boolean }[] = [
  { key: "projects", label: "Projects", href: "/dashboard", appOnly: true },
  { key: "templates", label: "Templates", href: "/marketplace" },
  { key: "docs", label: "Docs", href: "/docs" },
  { key: "cli", label: "CLI", href: "/docs/cli" },
  { key: "cloud", label: "Cloud", href: CLOUD_URL },
];

const focus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export const headerPrimaryBtn = `inline-flex h-8 items-center gap-1.5 rounded-[9px] bg-primary px-3 text-[13px] font-semibold text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] transition-[filter,transform] duration-150 ease-out hover:brightness-110 active:scale-[0.97] ${focus}`;
export const headerQuietLink = `hidden h-8 items-center rounded-[8px] px-2.5 text-[13px] text-muted-foreground transition-colors duration-150 hover:bg-white/[0.04] hover:text-foreground sm:inline-flex ${focus}`;

export function SiteHeader({
  active,
  inApp = false,
  actions,
  leading,
  max = "max-w-[1200px]",
}: {
  /** Highlights the current section. */
  active?: SiteSection;
  /** Show "Projects" (signed-in areas such as the dashboard). */
  inApp?: boolean;
  /** Right side; defaults to GitHub + "Open the editor". */
  actions?: ReactNode;
  /** Before the logo, e.g. the docs drawer button on phones. */
  leading?: ReactNode;
  max?: string;
}) {
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-background/85 backdrop-blur-xl">
      <div className={`mx-auto flex h-14 ${max} items-center gap-7 px-4 sm:px-6`}>
        <div className="flex shrink-0 items-center gap-2">
          {leading}
          <Link
            href="/"
            aria-label="SolStudio home"
            className={`flex items-center gap-2.5 rounded-md text-[15px] font-semibold tracking-[-0.02em] text-foreground ${focus}`}
          >
            <SolMark size={24} />
            <span>SolStudio</span>
          </Link>
        </div>

        <nav aria-label="Main" className="hidden items-center gap-0.5 md:flex">
          {LINKS.filter((l) => inApp || !l.appOnly).map((l) => {
            const current = l.key === active;
            return (
              <Link
                key={l.key}
                href={l.href}
                aria-current={current ? "page" : undefined}
                className={`inline-flex h-8 items-center rounded-[8px] px-2.5 text-[13.5px] transition-colors duration-150 ${
                  current ? "bg-white/[0.05] font-medium text-foreground" : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                } ${focus}`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {actions ?? (
            <>
              <a href="https://github.com/skartik-sk/solflow" className={headerQuietLink}>
                GitHub
              </a>
              <Link href="/dashboard" className={headerPrimaryBtn}>
                Open the editor
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
