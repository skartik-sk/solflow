import { auth } from "@solflow/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { NextMiddleware } from "next/server";

const middleware: NextMiddleware = auth((req: NextRequest & { auth: unknown }) => {
  const isAuthenticated = !!req.auth;
  const { pathname } = req.nextUrl;

  const isAuthPage = pathname.startsWith("/auth");
  const isProtectedRoute =
    pathname.startsWith("/editor") ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/api/trpc");

  if (isProtectedRoute && !isAuthenticated) {
    return NextResponse.redirect(new URL("/auth/signin", req.url));
  }

  if (isAuthPage && isAuthenticated) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}) as unknown as NextMiddleware;

export default middleware;

export const config = {
  matcher: [
    "/editor/:path*",
    "/dashboard/:path*",
    "/auth/:path*",
    "/api/trpc/:path*",
  ],
};
