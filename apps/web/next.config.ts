// The core library ships as TypeScript source, so Next compiles it in-place.
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@toolfence/core"],
};

export default nextConfig;
