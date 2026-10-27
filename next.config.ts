import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.ER_NEXT_DIST_DIR || ".next"
};

export default nextConfig;
