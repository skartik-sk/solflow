import { prisma } from "@solflow/db";
import {
  MarketplaceIndexView,
  type CategoryFilter,
  type ListingSummary,
} from "@/components/marketplace/MarketplaceIndex";

export const metadata = { title: "Marketplace | SolStudio" };

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ category?: string; q?: string; page?: string }>;
}

export default async function MarketplacePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const category = (params.category ?? "All") as CategoryFilter;
  const q = params.q ?? "";
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const pageSize = 24;
  const skip = (page - 1) * pageSize;

  const whereClause = {
    status: "PUBLISHED" as const,
    ...(category !== "All" && {
      category: category as Exclude<CategoryFilter, "All">,
    }),
    ...(q && {
      OR: [
        { title: { contains: q, mode: "insensitive" as const } },
        { description: { contains: q, mode: "insensitive" as const } },
        { tags: { has: q } },
      ],
    }),
  };

  let listings: ListingSummary[] = [];
  let totalCount = 0;
  try {
    [listings, totalCount] = await Promise.all([
      prisma.marketplaceListing.findMany({
        where: whereClause,
        select: {
          id: true,
          title: true,
          description: true,
          longDescription: true,
          category: true,
          tags: true,
          thumbnailUrl: true,
          pricingModel: true,
          priceSOL: true,
          downloads: true,
          forks: true,
          rating: true,
          featured: true,
          author: { select: { id: true, name: true, image: true } },
          project: {
            select: {
              framework: true,
              generatedCode: true,
              compilations: {
                orderBy: { startedAt: "desc" },
                take: 1,
                select: { status: true },
              },
              auditReports: {
                orderBy: { createdAt: "desc" },
                take: 1,
                select: { score: true },
              },
              testRuns: {
                orderBy: { startedAt: "desc" },
                take: 1,
                select: { status: true },
              },
            },
          },
        },
        orderBy: [{ featured: "desc" }, { downloads: "desc" }],
        take: pageSize,
        skip,
      }) as Promise<ListingSummary[]>,
      prisma.marketplaceListing.count({ where: whereClause }),
    ]);
  } catch (error) {
    console.warn("Failed to fetch marketplace listings", error);
  }

  return (
    <MarketplaceIndexView
      listings={listings}
      totalCount={totalCount}
      page={page}
      pageSize={pageSize}
      category={category}
      q={q}
    />
  );
}
