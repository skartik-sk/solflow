import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth, { type NextAuthResult } from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { prisma } from "@solflow/db";
import { SolanaWalletProvider } from "./providers/solana-wallet";

const AUTH_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const OAUTH_FLOW_COOKIE_MAX_AGE_SECONDS = 15 * 60;

function getHostname(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

function isSolStudioHost(hostname: string): boolean {
  return hostname === "solstudio.fun" || hostname.endsWith(".solstudio.fun");
}

function getSharedAuthCookieDomain(): string | undefined {
  const explicitDomain = process.env.AUTH_COOKIE_DOMAIN?.trim();
  if (explicitDomain) {
    return explicitDomain;
  }

  const configuredHosts = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_WEB_URL,
    process.env.NEXT_PUBLIC_CLOUD_URL,
    process.env.AUTH_URL,
    process.env.NEXTAUTH_URL,
  ]
    .map(getHostname)
    .filter((hostname): hostname is string => Boolean(hostname));

  if (configuredHosts.some(isSolStudioHost)) {
    return ".solstudio.fun";
  }

  return undefined;
}

const sharedAuthCookieDomain = getSharedAuthCookieDomain();
const useSecureCookies =
  process.env.AUTH_URL?.startsWith("https://") ||
  process.env.NEXTAUTH_URL?.startsWith("https://") ||
  Boolean(sharedAuthCookieDomain);

const cookiePrefix = useSecureCookies ? "__Secure-" : "";
const sharedCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: useSecureCookies,
  ...(sharedAuthCookieDomain ? { domain: sharedAuthCookieDomain } : {}),
};

const sharedAuthCookieConfig = sharedAuthCookieDomain
  ? {
      cookies: {
        sessionToken: {
          name: `${cookiePrefix}authjs.session-token`,
          options: {
            ...sharedCookieOptions,
            maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
          },
        },
        callbackUrl: {
          name: `${cookiePrefix}authjs.callback-url`,
          options: sharedCookieOptions,
        },
        pkceCodeVerifier: {
          name: `${cookiePrefix}authjs.pkce.code_verifier`,
          options: {
            ...sharedCookieOptions,
            maxAge: OAUTH_FLOW_COOKIE_MAX_AGE_SECONDS,
          },
        },
        state: {
          name: `${cookiePrefix}authjs.state`,
          options: {
            ...sharedCookieOptions,
            maxAge: OAUTH_FLOW_COOKIE_MAX_AGE_SECONDS,
          },
        },
        nonce: {
          name: `${cookiePrefix}authjs.nonce`,
          options: sharedCookieOptions,
        },
      },
    }
  : {};

const result: NextAuthResult = NextAuth({
  adapter: PrismaAdapter(prisma),
  trustHost: true,
  useSecureCookies,
  ...sharedAuthCookieConfig,
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID!,
      clientSecret: process.env.AUTH_GITHUB_SECRET!,
    }),
    SolanaWalletProvider,
  ],
  session: {
    strategy: "jwt",
    maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
  },
  callbacks: {
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) {
        return `${baseUrl}${url}`;
      }

      try {
        const parsedUrl = new URL(url);
        if (isSolStudioHost(parsedUrl.hostname.toLowerCase())) {
          return parsedUrl.toString();
        }
      } catch {
        // Fall through to the current app origin for malformed callback URLs.
      }

      return baseUrl;
    },
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        // @ts-expect-error – extended user type
        token.walletAddress = user.walletAddress ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.userId as string;
      // @ts-expect-error – extended session type
      session.user.walletAddress = (token.walletAddress as string) ?? null;
      return session;
    },
  },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
});

export const { handlers, auth, signIn, signOut } = result;
