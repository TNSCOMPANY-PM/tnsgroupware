import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "date-fns",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-select",
      "@radix-ui/react-tabs",
      "@radix-ui/react-context-menu",
      "@radix-ui/react-label",
      "@radix-ui/react-slot",
    ],
  },
  async headers() {
    return [
      {
        source: "/finance-current.json",
        headers: [{ key: "Cache-Control", value: "public, max-age=300, stale-while-revalidate=600" }],
      },
    ];
  },
};

export default nextConfig;
