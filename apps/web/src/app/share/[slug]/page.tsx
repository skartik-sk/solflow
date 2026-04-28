import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@solflow/db";
import type { Node, Edge } from "@xyflow/react";
import { FlowPreview } from "@/app/marketplace/[id]/flow-preview";
import {
  DEFAULT_OG_IMAGE_TYPE,
  absoluteUrl,
} from "@/lib/social-metadata";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const share = await prisma.projectShare.findFirst({
    where: { slug, revokedAt: null },
    select: { title: true, description: true },
  });
  if (!share) return { title: "Shared Graph Not Found | SolStudio" };

  const title = `${share.title} | SolStudio Shared Graph`;
  const description =
    share.description ??
    "Read-only SolStudio visual graph with sanitized project data.";
  const url = absoluteUrl(`/share/${slug}`);
  const image = absoluteUrl(`/share/${slug}/opengraph-image`);

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      type: "website",
      url,
      images: [
        {
          url: image,
          secureUrl: image,
          width: 1200,
          height: 630,
          alt: title,
          type: DEFAULT_OG_IMAGE_TYPE,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ url: image, alt: title }],
    },
  };
}

export default async function SharedGraphPage({ params }: PageProps) {
  const { slug } = await params;
  const share = await prisma.projectShare.findFirst({
    where: { slug, revokedAt: null },
    select: {
      title: true,
      description: true,
      flowData: true,
      auditSummary: true,
      createdAt: true,
    },
  });
  if (!share) notFound();

  const flow = share.flowData as { nodes?: Node[]; edges?: Edge[] };
  const nodes = flow.nodes ?? [];
  const edges = flow.edges ?? [];
  const audit = share.auditSummary as
    | { score?: number; summary?: Record<string, number>; findings?: unknown[] }
    | null;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/60 px-5 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <Link href="/" className="font-semibold">
            SolStudio
          </Link>
          <span className="text-xs text-muted-foreground">
            Read-only shared graph
          </span>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-5 px-5 py-6 lg:grid-cols-[1fr_320px]">
        <div className="min-h-[620px] overflow-hidden rounded-xl border border-border bg-card">
          <FlowPreview nodes={nodes} edges={edges} />
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Shared graph
            </p>
            <h1 className="mt-2 text-xl font-semibold">{share.title}</h1>
            {share.description && (
              <p className="mt-2 text-sm text-muted-foreground">
                {share.description}
              </p>
            )}
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Nodes</dt>
                <dd className="font-semibold">{nodes.length}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Edges</dt>
                <dd className="font-semibold">{edges.length}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Audit score</dt>
                <dd className="font-semibold">
                  {typeof audit?.score === "number" ? `${audit.score}/100` : "Not run"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Shared</dt>
                <dd className="font-semibold">
                  {share.createdAt.toISOString().slice(0, 10)}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
            This public view strips private keys, custom wallet pubkeys, and
            credential-like values before sharing.
          </div>
        </aside>
      </section>
    </main>
  );
}
