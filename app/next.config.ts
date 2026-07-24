import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow Convex generated types
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
