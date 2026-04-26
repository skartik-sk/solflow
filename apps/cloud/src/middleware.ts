import { auth } from "@solflow/auth";
import { NextResponse } from "next/server";
import type { NextMiddleware, NextRequest } from "next/server";

const protectedPrefixes = [
  "/dashboard",
  "/editor",
  "/executions",
  "/wallets",
  "/workflows",
];

const middleware: NextMiddleware = auth((req: NextRequest & { auth: unknown }) => {
  const isAuthenticated = !!req.auth;
  const { pathname, search } = req.nextUrl;
  const isAuthPage = pathname.startsWith("/auth");
  const isProtectedRoute = protectedPrefixes.some((prefix) =>
    pathname.startsWith(prefix),
  );

  if (isProtectedRoute && !isAuthenticated) {
    const signInUrl = new URL("/auth/signin", req.url);
    signInUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
    return NextResponse.redirect(signInUrl);
  }

  if (isAuthPage && isAuthenticated) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}) as unknown as NextMiddleware;

export default middleware;

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/editor/:path*",
    "/executions/:path*",
    "/wallets/:path*",
    "/workflows/:path*",
    "/auth/:path*",
  ],
};

