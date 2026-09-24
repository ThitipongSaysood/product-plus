import type { NextConfig } from "next";

const API_URL = process.env.API_URL ?? "http://localhost:4010";

const nextConfig: NextConfig = {
  experimental: {
    // The /api rewrite gives up after 30 s by default (next/dist/server/lib/router-utils/proxy-request.js).
    // Keyword AI calls take 14–92 s on a cold cli cache (measured 2026-09-24) and stop themselves at 150 s
    // (apps/api/src/jobs/suggest.ts), so the api's own error reaches the browser before this does.
    proxyTimeout: 180_000,
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;
