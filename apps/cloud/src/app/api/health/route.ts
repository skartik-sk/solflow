import { NextResponse } from "next/server";
import { getCloudHealthReport } from "@/server/health";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const report = await getCloudHealthReport();
  const status = report.status === "ok" ? 200 : report.status === "degraded" ? 200 : 503;
  const detailedToken = process.env.CLOUD_HEALTH_DETAILS_TOKEN;
  const authHeader = request.headers.get("authorization");
  const canSeeDetails =
    process.env.NODE_ENV !== "production" ||
    (!!detailedToken && authHeader === `Bearer ${detailedToken}`);

  return NextResponse.json(canSeeDetails ? report : {
    status: report.status,
    service: report.service,
    timestamp: report.timestamp,
  }, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
