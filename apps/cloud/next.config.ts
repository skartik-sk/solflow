import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@solflow/ui",
    "@solflow/cloud-nodes",
    "@solflow/cloud-engine",
    "@solflow/cloud-wallet",
    "@solflow/auth",
    "@solflow/db",
  ],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  webpack: (config, { isServer }) => {
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
