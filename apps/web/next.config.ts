import type { NextConfig } from "next";

// cacheComponents is OFF on purpose: every page is per-user data behind Supabase RLS, so nothing
// is cacheable; classic dynamic rendering (cookies() => dynamic route) is simpler and well documented.
/**
 * Content-Security-Policy (production only: next dev needs eval for fast refresh).
 * - script: own scripts + Next's inline bootstrap; 'wasm-unsafe-eval' for MediaPipe's WebAssembly (no JS eval).
 * - connect/img: Supabase (REST, Realtime websocket, Storage signed URLs); OSM tiles for the geofence map.
 * - workers/blob: MediaPipe + html5-qrcode; camera frames never leave the page except the upload to our own API.
 */
function csp(): string {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host : "*.supabase.co";
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: https://${supabase} https://tile.openstreetmap.org`,
    "font-src 'self' data:",
    `connect-src 'self' https://${supabase} wss://${supabase}`,
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Security headers on every response; CSP in production builds only.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // camera/geolocation are needed by enrollment + self-verify on our own origin only.
          { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          ...(process.env.NODE_ENV === "production" ? [{ key: "Content-Security-Policy", value: csp() }] : []),
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
