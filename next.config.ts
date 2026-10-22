import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // A página inicial é o protótipo original (public/estoura.html), fiel ao que foi gerado no Claude.
  async rewrites() {
    return [{ source: "/", destination: "/estoura.html" }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
