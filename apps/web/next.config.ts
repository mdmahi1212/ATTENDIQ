import type { NextConfig } from "next";

// cacheComponents is OFF on purpose: every page is per-user data behind Supabase RLS, so nothing
// is cacheable; classic dynamic rendering (cookies() => dynamic route) is simpler and well documented.
const nextConfig: NextConfig = {
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
