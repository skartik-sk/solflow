import { hasAuthSessionCookie } from "@solflow/auth/edge";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export default function middleware(req: NextRequest) {
  const isAuthenticated = hasAuthSessionCookie(req);
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
}

export const config = {
  matcher: [
    "/editor/:path*",
    "/dashboard/:path*",
    "/auth/:path*",
    "/api/trpc/:path*",
  ],
};
