import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Photos/PDFs flow through the upload Server Action (FormData); raise the
    // default 1MB request-body cap to accommodate them.
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
