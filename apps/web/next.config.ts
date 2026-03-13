import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@solflow/ui",
    "@solflow/ir",
    "@solflow/codegen",
    "@solflow/flow-nodes",
    "@solflow/auth",
  ],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  // Monaco editor requires this
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
    };
    return config;
  },
};

// Wrap with Sentry only when the DSN is configured.
// This keeps the build clean for local dev and open-source contributors
// who don't have a Sentry account set up.
async function buildConfig(): Promise<NextConfig> {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) {
    return nextConfig;
  }

  try {
    // @ts-ignore — @sentry/nextjs is an optional peer dependency
    const { withSentryConfig } = await import("@sentry/nextjs");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (withSentryConfig as any)(nextConfig, {
      // Suppresses Sentry CLI output during build
      silent: true,
      // Upload source maps to Sentry for readable stack traces
      widenClientFileUpload: true,
      // Automatically instrument server components
      autoInstrumentServerFunctions: true,
      // Disable the Sentry overlay in development
      hideSourceMaps: false,
      disableLogger: true,
    });
  } catch {
    // @sentry/nextjs not installed — return base config
    return nextConfig;
  }
}

export default buildConfig();
