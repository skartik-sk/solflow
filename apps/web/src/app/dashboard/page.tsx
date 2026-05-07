import { redirect } from "next/navigation";
import React from "react";
import { auth } from "@solflow/auth";
import { prisma } from "@solflow/db";
import Link from "next/link";
import {
  Code2,
  Workflow,
  Clock,
  GitBranch,
  Layers,
  Zap,
  LogOut,
} from "lucide-react";
import { DashboardActions } from "./dashboard-actions";

// ─── Types ───────────────────────────────────────────────────────────

type ProjectSummary = {
  id: string;
  name: string;
  description: string | null;
  framework: "ANCHOR" | "PINOCCHIO" | "QUASAR";
  status: "DRAFT" | "COMPILED" | "TESTED" | "DEPLOYED" | "ARCHIVED";
  createdAt: Date;
  updatedAt: Date;
  _count: { snapshots: number; deployments: number };
};

export const metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/auth/signin");
  }

  const projects = (await prisma.project.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      framework: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          snapshots: true,
          deployments: true,
        },
      },
    },
  })) as ProjectSummary[];

  const userName = session.user.name ?? session.user.email ?? "Builder";
  const userInitial = userName.charAt(0).toUpperCase();

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* ─── Topbar ────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
              <Workflow className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold tracking-tight">SolStudio</span>
          </Link>

          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <Link
              href="/dashboard"
              className="font-medium text-foreground transition-colors"
            >
              Projects
            </Link>
            <Link
              href="/marketplace"
              className="hover:text-foreground transition-colors"
            >
              Marketplace
            </Link>
            <Link
              href="/docs"
              className="hover:text-foreground transition-colors"
            >
              Docs
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
              {userInitial}
            </div>
            <form
              action={async () => {
                "use server";
                const { signOut } = await import("@solflow/auth");
                await signOut({ redirectTo: "/" });
              }}
            >
              <button
                type="submit"
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* ─── Main ──────────────────────────────────────────────────── */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
        {/* Page header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Welcome back, {userName.split(" ")[0]}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {projects.length === 0
                ? "Start building your first Solana program."
                : `You have ${projects.length} project${projects.length === 1 ? "" : "s"}.`}
            </p>
          </div>

          <DashboardActions />
        </div>

        {/* Stats row */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            icon={<Layers className="h-4 w-4" />}
            label="Total projects"
            value={String(projects.length)}
          />
          <StatCard
            icon={<GitBranch className="h-4 w-4" />}
            label="Deployments"
            value={String(
              projects.reduce((sum, p) => sum + p._count.deployments, 0)
            )}
          />
          <StatCard
            icon={<Code2 className="h-4 w-4" />}
            label="Anchor projects"
            value={String(
              projects.filter((p) => p.framework === "ANCHOR").length
            )}
          />
          <StatCard
            icon={<Zap className="h-4 w-4" />}
            label="Pinocchio projects"
            value={String(
              projects.filter((p) => p.framework === "PINOCCHIO").length
            )}
          />
          <StatCard
            icon={<Zap className="h-4 w-4" />}
            label="Quasar projects"
            value={String(
              projects.filter((p) => p.framework === "QUASAR").length
            )}
          />
        </div>

        {/* Project grid */}
        {projects.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function ProjectCard({ project }: { project: ProjectSummary }) {
  const statusColor: Record<ProjectSummary["status"], string> = {
    DRAFT: "text-muted-foreground",
    COMPILED: "text-blue-400",
    TESTED: "text-emerald-400",
    DEPLOYED: "text-green-400",
    ARCHIVED: "text-muted-foreground/50",
  };

  const frameworkBg: Record<ProjectSummary["framework"], string> = {
    ANCHOR:
      "bg-blue-500/10 text-blue-400 border border-blue-500/20",
    PINOCCHIO:
      "bg-violet-500/10 text-violet-400 border border-violet-500/20",
    QUASAR:
      "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  };

  const timeAgo = formatTimeAgo(project.updatedAt);

  return (
    <div className="group relative flex flex-col rounded-xl border border-border bg-card p-5 transition-all hover:border-border/80 hover:shadow-lg hover:shadow-black/20">
      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="truncate font-semibold leading-tight">
            {project.name}
          </h3>
          {project.description && (
            <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
              {project.description}
            </p>
          )}
        </div>
        <span
          className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${frameworkBg[project.framework]}`}
        >
          {project.framework === "ANCHOR" ? "Anchor" : project.framework === "PINOCCHIO" ? "Pinocchio" : "Quasar"}
        </span>
      </div>

      {/* Meta */}
      <div className="mt-auto flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <span
            className={`flex items-center gap-1 capitalize ${statusColor[project.status]}`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {project.status.toLowerCase()}
          </span>
          <span className="flex items-center gap-1">
            <GitBranch className="h-3 w-3" />
            {project._count.snapshots}v
          </span>
        </div>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {timeAgo}
        </span>
      </div>

      {/* Actions overlay */}
      <div className="absolute right-3 top-3 opacity-0 transition-opacity group-hover:opacity-100">
        <DashboardActions projectId={project.id} projectName={project.name} compact />
      </div>

      {/* Clickable overlay to open editor */}
      <Link
        href={`/editor/${project.id}`}
        className="absolute inset-0 rounded-xl"
        aria-label={`Open ${project.name}`}
      />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 py-20 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-card">
        <Code2 className="h-7 w-7 text-muted-foreground" />
      </div>
      <h2 className="mb-1 text-lg font-semibold">No projects yet</h2>
      <p className="mb-6 max-w-xs text-sm text-muted-foreground">
        Create your first Solana program or start from a marketplace template.
      </p>
      <div className="flex items-center gap-3">
        <DashboardActions />
        <Link
          href="/marketplace"
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-accent transition-colors"
        >
          Browse templates
        </Link>
      </div>
    </div>
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
