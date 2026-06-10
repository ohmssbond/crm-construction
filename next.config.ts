import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Uploads go browser→Supabase Storage directly (see UploadForm), so no large
  // payloads pass through Server Actions — the default body-size limit is fine.
};

export default nextConfig;
