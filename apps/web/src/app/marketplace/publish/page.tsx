// apps/web/src/app/marketplace/publish/page.tsx
// Publish a project as a marketplace template.
// Server Component: auth check + fetch user's projects.
// Renders <PublishForm> client component.

import React from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@solflow/auth";
import { prisma } from "@solflow/db";
import { MarketHeader, btnGhost } from "@/components/marketplace/parts";
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
      <MarketHeader
        max="max-w-[1040px]"
        crumbs={[{ label: "Marketplace", href: "/marketplace" }, { label: "Publish" }]}
      >
        <Link href="/marketplace/my-listings" className={btnGhost}>
          My listings
        </Link>
      </MarketHeader>

      <main className="mx-auto max-w-[1040px] px-4 pb-20 pt-8 sm:px-6 sm:pt-10">
        <div className="mb-6">
          <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.03em]">Publish a template</h1>
          <p className="mt-1 max-w-xl text-[13.5px] text-muted-foreground">
            Program IDs and personal wallet addresses are removed from the flow before it goes public.
          </p>
        </div>

        <PublishForm projects={projects} />
      </main>
    </div>
  );
}
