import type { NextConfig } from "next";
import { resolve } from "path";

const webSrc = resolve(__dirname, "../web/src");

const nextConfig: NextConfig = {
  output: "export",
  transpilePackages: [
    "@solflow/ui",
    "@solflow/ir",
    "@solflow/codegen",
    "@solflow/flow-nodes",
    "@solflow/audit",
    "@solflow/rust-parser",
    "@solflow/idl-import",
  ],
  webpack: (config, { isServer }) => {
    // Alias @/ → apps/web/src/* so web app's internal @/ imports resolve correctly
    // Also alias @/web as an alias for the same
    config.resolve.alias = {
      ...config.resolve.alias,
      "@": webSrc,
      "@/web": webSrc,
    };
    config.ignoreWarnings = [
      { module: /@opentelemetry\/instrumentation/ },
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

export default nextConfig;
