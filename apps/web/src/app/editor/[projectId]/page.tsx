// Editor page — server component shell.
// Fetches project data, hands to the client EditorShell.

import { redirect, notFound } from "next/navigation";
import { auth } from "@solflow/auth";
import { prisma } from "@solflow/db";
import { EditorShell } from "./editor-shell";

interface Props {
  params: Promise<{ projectId: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { projectId } = await params;
  const project = await prisma.project.findFirst({
    where: { id: projectId },
    select: { name: true },
  });
  return { title: project?.name ?? "Editor" };
}

export default async function EditorPage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin");
  }

  const { projectId } = await params;

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: session.user.id },
    select: {
      id: true,
      name: true,
      framework: true,
      flowData: true,
    },
  });

  if (!project) {
    notFound();
  }

  return (
    <EditorShell
      projectId={project.id}
      projectName={project.name}
      framework={project.framework.toLowerCase() as "anchor" | "pinocchio" | "quasar"}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      flowData={project.flowData as any}
    />
  );
}
