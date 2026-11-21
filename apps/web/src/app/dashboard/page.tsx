import { redirect } from "next/navigation";
import { auth } from "@solflow/auth";
import { prisma } from "@solflow/db";
import { DashboardView, SignOutButton, type ProjectSummary } from "./dashboard-view";
import { toThumb } from "./thumbnail";

export const metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/auth/signin");
  }

  const rows = await prisma.project.findMany({
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
      flowData: true,
      _count: {
        select: {
          snapshots: true,
          deployments: true,
        },
      },
    },
  });

  // Reduce each graph to a tiny thumbnail here; flowData itself goes no further.
  const projects = rows.map(({ flowData, ...p }) => ({
    ...p,
    thumb: toThumb(flowData),
  })) as ProjectSummary[];

  const userName = session.user.name ?? session.user.email ?? "Builder";

  return (
    <DashboardView
      userName={userName}
      projects={projects}
      signOut={
        <form
          action={async () => {
            "use server";
            const { signOut } = await import("@solflow/auth");
            await signOut({ redirectTo: "/" });
          }}
        >
          <SignOutButton />
        </form>
      }
    />
  );
}
