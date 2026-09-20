import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root explicitly — this project's parent directories
  // (up to the user's home folder) contain unrelated lockfiles that would
  // otherwise confuse Turbopack's auto-detection.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
