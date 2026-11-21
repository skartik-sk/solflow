import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@solflow/db";
import type { Node, Edge } from "@xyflow/react";
import { SharedGraphView } from "@/components/marketplace/SharedGraph";
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
    <SharedGraphView
      title={share.title}
      description={share.description}
      createdAt={share.createdAt}
      nodes={nodes}
      edges={edges}
      audit={audit}
    />
  );
}
