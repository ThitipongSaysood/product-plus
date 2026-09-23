import type { NextConfig } from "next";

const API_URL = process.env.API_URL ?? "http://localhost:4010";

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;
