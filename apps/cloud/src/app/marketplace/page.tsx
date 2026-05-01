import { redirect } from "next/navigation";

export default async function MarketplaceAliasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = Array.isArray(params.q) ? params.q[0] : params.q;
  redirect(q ? `/templates?q=${encodeURIComponent(q)}` : "/templates");
}
