// apps/web/src/app/marketplace/my-listings/page.tsx
// User's own marketplace listings — shows status, stats, edit/unpublish actions.
// Server Component: auth check + DB fetch.

import { redirect } from "next/navigation";
import { auth } from "@solflow/auth";
import { prisma } from "@solflow/db";
import { MyListingsView, type MyListing } from "@/components/marketplace/MyListingsView";

export const metadata = { title: "My Listings | SolStudio Marketplace" };
export const dynamic = "force-dynamic";

export default async function MyListingsPage() {
  const session = await auth();
  if (!session?.user?.id)
    redirect("/auth/signin?callbackUrl=/marketplace/my-listings");

  const listings = (await prisma.marketplaceListing.findMany({
    where: { authorId: session.user.id },
    select: {
      id: true,
      title: true,
      description: true,
      category: true,
      pricingModel: true,
      priceSOL: true,
      downloads: true,
      forks: true,
      rating: true,
      status: true,
      featured: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true,
      project: { select: { id: true, name: true } },
    },
    orderBy: { updatedAt: "desc" },
  })) as MyListing[];

  return <MyListingsView listings={listings} />;
}
