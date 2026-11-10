import type { NextConfig } from "next";

const YEAR = 60 * 60 * 24 * 365;
const WEEK = 60 * 60 * 24 * 7;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Static artwork in /public is served with `max-age=0` by default, which makes every
  // visit re-ask the server for each card. Let browsers and the CDN keep them instead.
  async headers() {
    return [
      {
        // Card URLs carry ?v=… (see CARD_ASSET_VERSION), so they can be cached "forever".
        source: "/cards/:path*",
        headers: [{ key: "Cache-Control", value: `public, max-age=${YEAR}, immutable` }],
      },
      {
        source: "/ornament/:path*",
        headers: [{ key: "Cache-Control", value: `public, max-age=${WEEK}` }],
      },
      {
        source: "/icons/:path*",
        headers: [{ key: "Cache-Control", value: `public, max-age=${WEEK}` }],
      },
    ];
  },
};

export default nextConfig;
