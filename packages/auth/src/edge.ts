import type { NextRequest } from "next/server";

const AUTH_SESSION_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
];

export function hasAuthSessionCookie(req: NextRequest): boolean {
  for (const cookie of req.cookies.getAll()) {
    for (const name of AUTH_SESSION_COOKIE_NAMES) {
      if (cookie.name === name || cookie.name.startsWith(`${name}.`)) {
        return Boolean(cookie.value);
      }
    }
  }

  return false;
}
