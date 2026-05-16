import { handleCloudCliRequest } from "@/server/cli-api/handlers";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ segments?: string[] }>;
};

async function handler(request: Request, context: RouteContext) {
  const params = await context.params;
  return handleCloudCliRequest(request, params.segments ?? []);
}

export { handler as GET, handler as POST, handler as PATCH, handler as DELETE };
