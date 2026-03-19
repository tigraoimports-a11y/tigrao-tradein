import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/reports/*": ["./node_modules/pdfkit/js/data/**/*"],
  },
};

export default nextConfig;
