import type { NextConfig } from "next";

const floatingBrowserEmbedOrigins = [
  "https://explorer.solana.com",
  "https://www.anchor-lang.com",
  "https://anchor-lang.com",
  "https://docs.solanalabs.com",
  "https://docs.anza.xyz",
  "https://faucet.solana.com",
];

const frameSrc = ["'self'", ...floatingBrowserEmbedOrigins].join(" ");

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'self'",
      "form-action 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https: wss: ws:",
      "worker-src 'self' blob:",
      `frame-src ${frameSrc}`,
      "manifest-src 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  transpilePackages: [
    "@solflow/ui",
    "@solflow/ir",
    "@solflow/codegen",
    "@solflow/flow-nodes",
    "@solflow/auth",
  ],
  // Keep Prisma out of the webpack bundle so its native query-engine binary
  // stays in node_modules and is found at runtime on Vercel serverless.
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  // Monaco editor requires this
  webpack: (config, { isServer }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
    };
    config.ignoreWarnings = [
      { module: /@opentelemetry\/instrumentation/ },
      { module: /bullmq/ }
    ];
    if (!isServer) {

      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
        crypto: false,
      };
    }
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
