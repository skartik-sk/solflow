import React from "react";
import Link from "next/link";
import { Anchor, ArrowUpRight, GitBranch, LogOut, Orbit, Rocket, Zap } from "lucide-react";
import { SolMark } from "@/components/ui-kit/dashboard-mark";
import { GraphToCode } from "@/components/ui-kit/dashboard-graph-to-code";
import { DashboardActions } from "./dashboard-actions";
import type { Thumb, ThumbKind } from "./thumbnail";

// ─── Types ───────────────────────────────────────────────────────────

export type ProjectSummary = {
  id: string;
  name: string;
  description: string | null;
  framework: "ANCHOR" | "PINOCCHIO" | "QUASAR";
  status: "DRAFT" | "COMPILED" | "TESTED" | "DEPLOYED" | "ARCHIVED";
  createdAt: Date;
  updatedAt: Date;
  _count: { snapshots: number; deployments: number };
  /** The graph reduced on the server (thumbnail.ts); null when flowData is empty or invalid. */
  thumb: Thumb | null;
};

const FRAMEWORK: Record<ProjectSummary["framework"], { name: string; Icon: typeof Anchor }> = {
  ANCHOR: { name: "Anchor", Icon: Anchor },
  PINOCCHIO: { name: "Pinocchio", Icon: Zap },
  QUASAR: { name: "Quasar", Icon: Orbit },
};

const STATUS: Record<ProjectSummary["status"], string> = {
  DRAFT: "text-muted-foreground",
  COMPILED: "text-primary",
  TESTED: "text-emerald-400",
  DEPLOYED: "text-emerald-400",
  ARCHIVED: "text-muted-foreground/60",
};

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

// ─── View ────────────────────────────────────────────────────────────

/** The dashboard's markup. page.tsx does auth and the query, then renders this. */
export function DashboardView({
  userName,
  projects,
  signOut,
}: {
  userName: string;
  projects: ProjectSummary[];
  /** The sign-out form (a server action), rendered in the header. */
  signOut: React.ReactNode;
}) {
  const userInitial = userName.charAt(0).toUpperCase();
  const deployments = projects.reduce((sum, p) => sum + p._count.deployments, 0);
  const count = (fw: ProjectSummary["framework"]) => projects.filter((p) => p.framework === fw).length;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* ─── Topbar ────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-12 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" className={`flex items-center gap-2 rounded-md text-[14px] font-semibold tracking-[-0.01em] ${focusRing}`}>
            <SolMark size={22} />
            SolStudio
          </Link>

          <nav className="hidden items-center gap-1 text-[13px] md:flex" aria-label="App">
            <Link href="/dashboard" aria-current="page" className={`rounded-md px-2.5 py-1.5 font-medium text-foreground ${focusRing}`}>
              Projects
            </Link>
            <Link href="/marketplace" className={`rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors duration-150 hover:text-foreground ${focusRing}`}>
              Marketplace
            </Link>
            <Link href="/docs" className={`rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors duration-150 hover:text-foreground ${focusRing}`}>
              Docs
            </Link>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary"
              title={userName}
              aria-hidden
            >
              {userInitial}
            </span>
            {signOut}
          </div>
        </div>
      </header>

      {/* ─── Main ──────────────────────────────────────────────────── */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-12 pt-6 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[20px] font-semibold leading-tight tracking-[-0.02em]">Projects</h1>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Welcome back, {userName.split(" ")[0]}.
            </p>
          </div>
          {projects.length > 0 && (
            <div className="flex items-center gap-2">
              <Link
                href="/marketplace"
                className={`inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-white/[0.08] bg-card px-3.5 text-[13px] font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-colors duration-150 hover:bg-accent active:scale-[0.97] ${focusRing}`}
              >
                Browse templates
              </Link>
              <DashboardActions />
            </div>
          )}
        </div>

        {/* Stats strip */}
        {projects.length > 0 && (
        <dl className="mt-5 grid grid-cols-2 overflow-hidden rounded-[14px] border border-white/[0.07] bg-card shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:grid-cols-5">
          <Stat label="Projects" value={projects.length} />
          <Stat label="Deployments" value={deployments} />
          <Stat label="Anchor" value={count("ANCHOR")} />
          <Stat label="Pinocchio" value={count("PINOCCHIO")} />
          <Stat label="Quasar" value={count("QUASAR")} />
        </dl>
        )}

        {projects.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <li key={project.id}>
                <ProjectCard project={project} />
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="-mb-px -mr-px border-b border-r border-white/[0.07] px-4 py-3">
      <dt className="text-[12px] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-[18px] font-semibold tabular-nums tracking-[-0.02em]">{value}</dd>
    </div>
  );
}

function ProjectCard({ project }: { project: ProjectSummary }) {
  const fw = FRAMEWORK[project.framework];

  return (
    <div className="group relative flex h-full flex-col rounded-[14px] border border-white/[0.07] bg-card shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-[border-color,transform] duration-150 ease-out hover:z-10 hover:-translate-y-px hover:border-white/[0.13] focus-within:z-10">
      {/* Thumbnail: the project's framework on the editor's dotted canvas */}
      <div className="relative h-24 overflow-hidden rounded-t-[13px] border-b border-white/[0.07] bg-[#0b0c0f]">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.08)_1px,transparent_1.2px)] bg-[length:18px_18px] bg-[position:9px_9px]"
        />
        {project.thumb ? (
          <MiniGraph thumb={project.thumb} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-white/[0.1] bg-popover text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_10px_24px_-12px_rgba(0,0,0,0.8)] transition-colors duration-150 group-hover:text-primary">
              <fw.Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
            </span>
          </div>
        )}
        <span className="absolute left-3 top-3 inline-flex h-5 items-center gap-1 rounded-md border border-white/[0.09] bg-background/70 px-1.5 text-[11px] font-medium text-foreground/85 backdrop-blur-sm">
          {fw.name}
        </span>
      </div>

      <div className="flex flex-1 flex-col px-3.5 pb-3 pt-3">
        <h3 className="truncate text-[14px] font-medium leading-snug tracking-[-0.01em]">{project.name}</h3>
        {project.description && (
          <p className="mt-0.5 line-clamp-1 text-[12px] text-muted-foreground">{project.description}</p>
        )}

        <div className="mt-auto flex items-center gap-3 pt-3 text-[12px] text-muted-foreground">
          <span className={`flex items-center gap-1.5 capitalize ${STATUS[project.status]}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
            {project.status.toLowerCase()}
          </span>
          <span className="flex items-center gap-1 tabular-nums" title="Versions">
            <GitBranch className="h-3 w-3" aria-hidden />
            {project._count.snapshots}v
          </span>
          {project._count.deployments > 0 && (
            <span className="flex items-center gap-1 tabular-nums" title="Deployments">
              <Rocket className="h-3 w-3" aria-hidden />
              {project._count.deployments}
            </span>
          )}
          <time className="ml-auto tabular-nums" dateTime={project.updatedAt.toISOString()}>
            {formatTimeAgo(project.updatedAt)}
          </time>
        </div>
      </div>

      {/* Clickable overlay to open editor */}
      <Link
        href={`/editor/${project.id}`}
        className={`absolute inset-0 rounded-[14px] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary`}
        aria-label={`Open ${project.name}`}
      />

      {/* Actions overlay */}
      <div className="absolute right-2.5 top-2.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
        <DashboardActions projectId={project.id} projectName={project.name} compact />
      </div>
    </div>
  );
}

// The editor's node colours (landing.css --n-*); content only, never UI chrome.
const NODE_COLOR: Record<ThumbKind, string> = {
  program: "#8b8cf8",
  instruction: "#38bdf8",
  account: "#4ade80",
  state: "#f5a524",
  constraint: "#fb7a4a",
  error: "#f05252",
  event: "#c084fc",
  other: "#a3a7b0",
};

/** The project's own graph, drawn small: one pill per node in its type's colour. */
function MiniGraph({ thumb }: { thumb: Thumb }) {
  const W = 320;
  const H = 96;
  const NW = 26;
  const NH = 10;
  const pad = 14;
  // Fit the graph's box into the thumbnail, aspect kept, centred
  const availW = W - pad * 2 - NW;
  const availH = H - pad * 2 - NH;
  const scale = Math.min(availW / (thumb.w || 1), availH / (thumb.h || 1));
  const ox = pad + (availW - thumb.w * scale) / 2;
  const oy = pad + (availH - thumb.h * scale) / 2;
  const pts = thumb.nodes.map((n) => ({ ...n, px: ox + n.x * scale, py: oy + n.y * scale }));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid meet" aria-hidden>
      {thumb.edges.map(([a, b], i) => {
        const p = pts[a];
        const q = pts[b];
        if (!p || !q) return null;
        const x1 = p.px + NW / 2;
        const y1 = p.py + NH / 2;
        const x2 = q.px + NW / 2;
        const y2 = q.py + NH / 2;
        const dy = (y2 - y1) / 2;
        return (
          <path
            key={i}
            d={`M${x1} ${y1} C${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`}
            fill="none"
            stroke="rgba(255,255,255,0.16)"
            strokeWidth={1}
          />
        );
      })}
      {pts.map((n, i) => (
        <g key={i}>
          <rect x={n.px} y={n.py} width={NW} height={NH} rx={3} fill="#14161a" stroke="rgba(255,255,255,0.12)" strokeWidth={0.75} />
          <rect x={n.px} y={n.py} width={NW} height={NH} rx={3} fill={NODE_COLOR[n.t]} fillOpacity={0.16} />
          <rect x={n.px} y={n.py + 1.5} width={2} height={NH - 3} rx={1} fill={NODE_COLOR[n.t]} />
          <rect x={n.px + 6} y={n.py + 4} width={NW - 12} height={2} rx={1} fill="rgba(255,255,255,0.28)" />
        </g>
      ))}
    </svg>
  );
}

function EmptyState() {
  return (
    <div className="mt-5 grid overflow-hidden rounded-[18px] border border-white/[0.07] bg-card shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] md:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      <div className="flex flex-col justify-center gap-4 p-6 md:p-8">
        <div>
          <h2 className="text-[17px] font-semibold tracking-[-0.02em]">No projects yet</h2>
          <p className="mt-1 max-w-[30ch] text-[13px] leading-relaxed text-muted-foreground">
            Draw the accounts and instructions. SolStudio writes the Rust.
          </p>
        </div>
        <div className="flex flex-wrap items-stretch gap-2 [&>button]:h-9">
          <DashboardActions />
          <Link
            href="/marketplace"
            className={`inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-white/[0.08] bg-popover px-3.5 text-[13px] font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-colors duration-150 hover:bg-accent active:scale-[0.97] ${focusRing}`}
          >
            Browse templates
            <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          </Link>
        </div>
      </div>
      <div className="min-w-0 border-t border-white/[0.07] md:border-l md:border-t-0">
        <GraphToCode />
      </div>
    </div>
  );
}

/** The header's sign-out button; page.tsx wraps it in the sign-out server action form. */
export function SignOutButton() {
  return (
    <button
      type="submit"
      className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.97]"
    >
      <LogOut className="h-3.5 w-3.5" aria-hidden />
      Sign out
    </button>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
