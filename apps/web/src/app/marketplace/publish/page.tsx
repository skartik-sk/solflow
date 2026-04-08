// apps/web/src/app/marketplace/publish/page.tsx
// Publish a project as a marketplace template.
// Server Component: auth check + fetch user's projects.
// Renders <PublishForm> client component.

import React from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@solflow/auth";
import { prisma } from "@solflow/db";
import { Layers, ArrowLeft } from "lucide-react";
import { PublishForm } from "./publish-form";

export const metadata = { title: "Publish Template | SolStudio Marketplace" };
export const dynamic = "force-dynamic";

// ─── Local types (Prisma stub → any) ─────────────────────────────────────────
type ProjectSummary = {
  id: string;
  name: string;
  framework: string;
  updatedAt: Date;
  listing: { id: string; status: string } | null;
};

export default async function PublishPage() {
  const session = await auth();
  if (!session?.user?.id)
    redirect("/auth/signin?callbackUrl=/marketplace/publish");

  // Fetch user's projects that have flow data (can be published)
  const projects = (await prisma.project.findMany({
    where: {
      userId: session.user.id,
      // Only show projects that actually have flow data
      NOT: { flowData: { equals: undefined } },
    },
    select: {
      id: true,
      name: true,
      framework: true,
      updatedAt: true,
      listing: { select: { id: true, status: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  })) as ProjectSummary[];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            <span className="font-semibold">SolStudio</span>
          </Link>
          <Link
            href="/marketplace"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Marketplace
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">
            Publish a Template
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Share your Solana program flow with the community. Your flow data
            will be sanitized before publishing — programIds and personal wallet
            addresses are removed automatically.
          </p>
        </div>

        <PublishForm projects={projects} />
      </main>
    </div>
  );
}
