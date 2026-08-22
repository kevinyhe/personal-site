import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Two dev servers plus a production build all sharing one .next corrupt each
  // other's cache — it shows up as routes hard-404ing in dev while the same
  // build prerenders them fine. Set NEXT_DIST_DIR to give a session its own.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
